import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RuleEngineServer } from '../../src/api/server';
import type { RuleInput } from '../../src/types/rule';
import type { AuditEntry } from '../../src/audit/types';

/**
 * Parse SSE data lines from a raw SSE response body.
 * Returns parsed JSON objects from `data: {...}\n\n` frames.
 */
function parseSSEDataLines(raw: string): AuditEntry[] {
  return raw
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as AuditEntry);
}

/**
 * Open an SSE stream, execute an action while connected, then close.
 * Returns all raw text received during the connection lifetime.
 */
async function captureSSEStream(
  url: string,
  action: () => void | Promise<void>,
  settleMs = 100,
): Promise<string> {
  const controller = new AbortController();
  const chunks: string[] = [];

  const response = await fetch(url, { signal: controller.signal });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const readLoop = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // AbortError — expected
    }
  })();

  // let the connection initialise
  await sleep(50);

  await action();

  // let events propagate to the stream
  await sleep(settleMs);

  controller.abort();
  await readLoop;

  return chunks.join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const firingRule: RuleInput = {
  id: 'sse-fire-rule',
  name: 'SSE Fire Rule',
  priority: 10,
  enabled: true,
  tags: ['sse'],
  trigger: { type: 'event', topic: 'sse.trigger' },
  conditions: [],
  actions: [{ type: 'set_fact', key: 'sse:executed', value: true }],
};

const skippingRule: RuleInput = {
  id: 'sse-skip-rule',
  name: 'SSE Skip Rule',
  priority: 5,
  enabled: true,
  tags: ['sse'],
  trigger: { type: 'event', topic: 'sse.trigger' },
  conditions: [
    { source: { type: 'event', field: 'amount' }, operator: 'gt', value: 99999 },
  ],
  actions: [{ type: 'set_fact', key: 'sse:never', value: true }],
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Audit SSE Integration', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await RuleEngineServer.start({
      server: { port: 0, host: '127.0.0.1', logger: false, swagger: false },
      engineConfig: {
        name: 'sse-audit-test',
        audit: { adapter: new MemoryAdapter(), flushIntervalMs: 0 },
      },
    });
    baseUrl = `${server.address}/api/v1`;

    const engine = server.getEngine();
    engine.registerRule(firingRule);
    engine.registerRule(skippingRule);
  });

  afterAll(async () => {
    await server.stop();
  });

  // -------------------------------------------------------------------------
  // Connection & headers
  // -------------------------------------------------------------------------

  describe('connection establishment', () => {
    it('responds with SSE content-type and keep-alive headers', async () => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/audit/stream`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('connection')).toBe('keep-alive');

      controller.abort();
    });

    it('sends connection confirmation comment', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream`,
        () => {},
        10,
      );

      expect(raw).toMatch(/: connected:\S+/);
    });

    it('sends filter description comment when filter is provided', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream?categories=rule_execution&types=rule_executed,rule_failed`,
        () => {},
        10,
      );

      expect(raw).toContain('filter:');
      expect(raw).toContain('categories=rule_execution');
      expect(raw).toContain('types=rule_executed,rule_failed');
    });
  });

  // -------------------------------------------------------------------------
  // Real-time streaming (no filter)
  // -------------------------------------------------------------------------

  describe('unfiltered stream', () => {
    it('receives fact_created events in real-time', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream`,
        () => {
          server.getEngine().setFact('sse:temp', 42);
        },
      );

      const entries = parseSSEDataLines(raw);
      const factEntry = entries.find((e) => e.type === 'fact_created');

      expect(factEntry).toBeDefined();
      expect(factEntry!.details).toMatchObject({ key: 'sse:temp', value: 42 });
    });

    it('receives multiple sequential events', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream`,
        async () => {
          const engine = server.getEngine();
          await engine.setFact('seq:a', 1);
          await engine.setFact('seq:b', 2);
          await engine.emit('sse.trigger', { amount: 200 });
        },
      );

      const entries = parseSSEDataLines(raw);
      const types = entries.map((e) => e.type);

      expect(types).toContain('fact_created');
      expect(types).toContain('event_emitted');
      expect(types).toContain('rule_executed');
      expect(types).toContain('rule_skipped');
    });

    it('formats entries with all required fields', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream`,
        () => {
          server.getEngine().setFact('sse:format-check', 'ok');
        },
      );

      const entries = parseSSEDataLines(raw);
      const entry = entries.find((e) => e.type === 'fact_created');

      expect(entry).toBeDefined();
      expect(entry!.id).toBeTypeOf('string');
      expect(entry!.timestamp).toBeTypeOf('number');
      expect(entry!.category).toBe('fact_change');
      expect(entry!.type).toBe('fact_created');
      expect(entry!.summary).toBeTypeOf('string');
      expect(entry!.source).toBe('rule-engine');
      expect(entry!.details).toBeTypeOf('object');
    });
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  describe('category filter', () => {
    it('receives only matching categories', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream?categories=fact_change`,
        async () => {
          const engine = server.getEngine();
          engine.registerRule({
            id: 'sse-cat-tmp',
            name: 'Temp',
            priority: 0,
            enabled: true,
            tags: [],
            trigger: { type: 'event', topic: 'never' },
            conditions: [],
            actions: [],
          });
          await engine.setFact('sse:cat-filter', true);
        },
      );

      const entries = parseSSEDataLines(raw);

      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.category).toBe('fact_change');
      }
      expect(entries.some((e) => e.type === 'fact_created')).toBe(true);
    });
  });

  describe('type filter', () => {
    it('receives only specified event types', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream?types=rule_executed,rule_skipped`,
        async () => {
          await server.getEngine().emit('sse.trigger', { amount: 500 });
        },
      );

      const entries = parseSSEDataLines(raw);

      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(['rule_executed', 'rule_skipped']).toContain(e.type);
      }
    });
  });

  describe('ruleId filter', () => {
    it('receives entries for specified rule only', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream?ruleIds=sse-fire-rule`,
        async () => {
          await server.getEngine().emit('sse.trigger', { amount: 300 });
        },
      );

      const entries = parseSSEDataLines(raw);

      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.ruleId).toBe('sse-fire-rule');
      }
    });
  });

  describe('source filter', () => {
    it('receives entries from specified source only', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream?sources=rule-engine`,
        async () => {
          await server.getEngine().setFact('sse:source-filter', 'v');
        },
      );

      const entries = parseSSEDataLines(raw);

      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.source).toBe('rule-engine');
      }
    });
  });

  describe('combined filters', () => {
    it('applies AND logic across filter dimensions', async () => {
      const raw = await captureSSEStream(
        `${baseUrl}/audit/stream?categories=rule_execution&ruleIds=sse-fire-rule`,
        async () => {
          const engine = server.getEngine();
          await engine.setFact('sse:combo', 1);
          await engine.emit('sse.trigger', { amount: 100 });
        },
      );

      const entries = parseSSEDataLines(raw);

      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.category).toBe('rule_execution');
        expect(e.ruleId).toBe('sse-fire-rule');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent connections
  // -------------------------------------------------------------------------

  describe('concurrent connections', () => {
    it('delivers events to multiple independent streams', async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      const chunks1: string[] = [];
      const chunks2: string[] = [];

      const startReader = async (
        url: string,
        controller: AbortController,
        chunks: string[],
      ) => {
        const res = await fetch(url, { signal: controller.signal });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(decoder.decode(value, { stream: true }));
          }
        } catch {
          // aborted
        }
      };

      const loop1 = startReader(
        `${baseUrl}/audit/stream?categories=fact_change`,
        controller1,
        chunks1,
      );
      const loop2 = startReader(
        `${baseUrl}/audit/stream?categories=rule_execution`,
        controller2,
        chunks2,
      );

      await sleep(50);

      const engine = server.getEngine();
      await engine.setFact('sse:concurrent', 99);
      await engine.emit('sse.trigger', { amount: 50 });

      await sleep(100);

      controller1.abort();
      controller2.abort();
      await Promise.all([loop1, loop2]);

      const entries1 = parseSSEDataLines(chunks1.join(''));
      const entries2 = parseSSEDataLines(chunks2.join(''));

      // stream 1 — only fact_change
      expect(entries1.length).toBeGreaterThan(0);
      for (const e of entries1) {
        expect(e.category).toBe('fact_change');
      }

      // stream 2 — only rule_execution
      expect(entries2.length).toBeGreaterThan(0);
      for (const e of entries2) {
        expect(e.category).toBe('rule_execution');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Stream stats
  // -------------------------------------------------------------------------

  describe('stream stats', () => {
    it('reflects active connection count', async () => {
      const controller = new AbortController();

      const response = await fetch(`${baseUrl}/audit/stream`, {
        signal: controller.signal,
      });

      // give time for connection to register
      await sleep(50);

      const statsRes = await fetch(`${baseUrl}/audit/stream/stats`);
      const stats = await statsRes.json();

      expect(stats.activeConnections).toBeGreaterThanOrEqual(1);

      controller.abort();
      // consume the body to avoid leaks
      try { await response.text(); } catch { /* aborted */ }

      // allow cleanup
      await sleep(50);
    });

    it('tracks totalEntriesSent', async () => {
      // reset: open and close a short-lived stream to initialize the manager
      const initCtrl = new AbortController();
      const initRes = await fetch(`${baseUrl}/audit/stream`, {
        signal: initCtrl.signal,
      });
      await sleep(50);
      initCtrl.abort();
      try { await initRes.text(); } catch { /* ok */ }
      await sleep(50);

      const beforeStats = await (
        await fetch(`${baseUrl}/audit/stream/stats`)
      ).json();

      // open a stream and trigger events
      await captureSSEStream(`${baseUrl}/audit/stream`, async () => {
        await server.getEngine().setFact('sse:stats-count', 1);
      });

      const afterStats = await (
        await fetch(`${baseUrl}/audit/stream/stats`)
      ).json();

      expect(afterStats.totalEntriesSent).toBeGreaterThan(
        beforeStats.totalEntriesSent,
      );
    });

    it('tracks totalEntriesFiltered', async () => {
      const beforeStats = await (
        await fetch(`${baseUrl}/audit/stream/stats`)
      ).json();

      // filtered stream that won't match fact_change events
      await captureSSEStream(
        `${baseUrl}/audit/stream?categories=system`,
        async () => {
          await server.getEngine().setFact('sse:filtered-check', 'x');
        },
      );

      const afterStats = await (
        await fetch(`${baseUrl}/audit/stream/stats`)
      ).json();

      expect(afterStats.totalEntriesFiltered).toBeGreaterThan(
        beforeStats.totalEntriesFiltered,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns 503 when audit is not configured', async () => {
      const plainServer = await RuleEngineServer.start({
        server: { port: 0, host: '127.0.0.1', logger: false, swagger: false },
      });

      const controller = new AbortController();
      try {
        const response = await fetch(
          `${plainServer.address}/api/v1/audit/stream`,
          { signal: controller.signal },
        );
        expect(response.status).toBe(503);
      } finally {
        controller.abort();
        await plainServer.stop();
      }
    });

    it('handles rapid connect/disconnect without errors', async () => {
      const controllers = Array.from({ length: 5 }, () => new AbortController());
      const responses = await Promise.all(
        controllers.map((c) =>
          fetch(`${baseUrl}/audit/stream`, { signal: c.signal }),
        ),
      );

      await sleep(30);

      controllers.forEach((c) => c.abort());

      // consume bodies
      await Promise.allSettled(responses.map((r) => r.text()));

      // server should still be healthy
      const healthRes = await fetch(`${baseUrl}/audit/stats`);
      expect(healthRes.status).toBe(200);
    });
  });
});
