import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebugSSEManager, type DebugSSEClient } from '../../../../src/api/notifications/debug-sse-manager';
import { TraceCollector } from '../../../../src/debugging/trace-collector';
import type { DebugTraceEntry, TraceEntryType } from '../../../../src/debugging/types';

function createMockReply(): {
  reply: DebugSSEClient['reply'];
  writtenData: string[];
  headers: Record<string, unknown>;
  ended: boolean;
} {
  const writtenData: string[] = [];
  let headers: Record<string, unknown> = {};
  let ended = false;
  const closeHandlers: Array<() => void> = [];

  const reply = {
    raw: {
      writeHead: vi.fn((status: number, hdrs: Record<string, unknown>) => {
        headers = hdrs;
      }),
      write: vi.fn((data: string) => {
        if (ended) throw new Error('Write after end');
        writtenData.push(data);
        return true;
      }),
      end: vi.fn(() => {
        ended = true;
      }),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandlers.push(handler);
        }
      }),
      get writableEnded() {
        return ended;
      }
    },
    triggerClose: () => {
      closeHandlers.forEach((h) => h());
    }
  } as unknown as DebugSSEClient['reply'] & { triggerClose: () => void };

  return { reply, writtenData, headers, ended };
}

describe('DebugSSEManager', () => {
  let debugSSE: DebugSSEManager;
  let traceCollector: TraceCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    traceCollector = new TraceCollector({ enabled: true });
    debugSSE = new DebugSSEManager({ heartbeatInterval: 1000 });
  });

  afterEach(() => {
    debugSSE.stop();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates manager with default heartbeat interval', () => {
      const manager = new DebugSSEManager();
      expect(manager.connectionCount).toBe(0);
      manager.stop();
    });

    it('creates manager with custom heartbeat interval', () => {
      const manager = new DebugSSEManager({ heartbeatInterval: 5000 });
      expect(manager.connectionCount).toBe(0);
      manager.stop();
    });
  });

  describe('start/stop', () => {
    it('starts heartbeat timer and subscribes to trace collector', () => {
      debugSSE.start(traceCollector);
      const { reply, writtenData } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      vi.advanceTimersByTime(1000);

      expect(writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
    });

    it('broadcasts trace entries from collector', () => {
      debugSSE.start(traceCollector);
      const { reply, writtenData } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      traceCollector.record('rule_executed', { actionsCount: 1 }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule'
      });

      expect(writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
    });

    it('does not start heartbeat twice', () => {
      debugSSE.start(traceCollector);
      debugSSE.start(traceCollector);

      const { reply, writtenData } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      vi.advanceTimersByTime(1000);

      const heartbeats = writtenData.filter((d) => d.includes('heartbeat'));
      expect(heartbeats.length).toBe(1);
    });

    it('stops heartbeat timer and unsubscribes', () => {
      debugSSE.start(traceCollector);
      const { reply, writtenData } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      debugSSE.stop();

      vi.advanceTimersByTime(2000);

      const heartbeats = writtenData.filter((d) => d.includes('heartbeat'));
      expect(heartbeats.length).toBe(0);
    });

    it('stops receiving trace entries after stop', () => {
      debugSSE.start(traceCollector);
      const { reply, writtenData } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      const initialLength = writtenData.length;

      debugSSE.stop();

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(writtenData.length).toBe(initialLength);
    });

    it('closes all connections on stop', () => {
      debugSSE.start(traceCollector);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      debugSSE.addConnection('conn-1', mock1.reply);
      debugSSE.addConnection('conn-2', mock2.reply);

      expect(debugSSE.connectionCount).toBe(2);

      debugSSE.stop();

      expect(debugSSE.connectionCount).toBe(0);
      expect(mock1.reply.raw.end).toHaveBeenCalled();
      expect(mock2.reply.raw.end).toHaveBeenCalled();
    });
  });

  describe('addConnection', () => {
    it('adds connection with SSE headers', () => {
      const { reply } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      expect(reply.raw.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
    });

    it('sends connection confirmation comment', () => {
      const { reply, writtenData } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      expect(writtenData.length).toBeGreaterThanOrEqual(1);
      expect(writtenData[0]).toContain(': connected:conn-1');
    });

    it('sends filter description comment when filter provided', () => {
      const { reply, writtenData } = createMockReply();
      debugSSE.addConnection('conn-1', reply, {
        types: ['rule_executed', 'action_failed'],
        minDurationMs: 100
      });

      expect(writtenData.some((d) => d.includes('filter:'))).toBe(true);
      expect(writtenData.some((d) => d.includes('types=rule_executed,action_failed'))).toBe(true);
      expect(writtenData.some((d) => d.includes('minDurationMs=100'))).toBe(true);
    });

    it('uses empty filter when no filter specified', () => {
      const { reply } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      const connections = debugSSE.getConnections();
      expect(connections[0].filter).toEqual({});
    });

    it('uses provided filter', () => {
      const { reply } = createMockReply();
      debugSSE.addConnection('conn-1', reply, {
        types: ['rule_executed'],
        ruleIds: ['rule-1', 'rule-2']
      });

      const connections = debugSSE.getConnections();
      expect(connections[0].filter).toEqual({
        types: ['rule_executed'],
        ruleIds: ['rule-1', 'rule-2']
      });
    });

    it('increments connection count', () => {
      expect(debugSSE.connectionCount).toBe(0);

      const { reply: reply1 } = createMockReply();
      debugSSE.addConnection('conn-1', reply1);
      expect(debugSSE.connectionCount).toBe(1);

      const { reply: reply2 } = createMockReply();
      debugSSE.addConnection('conn-2', reply2);
      expect(debugSSE.connectionCount).toBe(2);
    });

    it('registers close handler for automatic cleanup', () => {
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply);

      expect(debugSSE.connectionCount).toBe(1);

      (mock.reply as unknown as { triggerClose: () => void }).triggerClose();

      expect(debugSSE.connectionCount).toBe(0);
    });
  });

  describe('removeConnection', () => {
    it('removes existing connection', () => {
      const { reply } = createMockReply();
      debugSSE.addConnection('conn-1', reply);
      expect(debugSSE.connectionCount).toBe(1);

      debugSSE.removeConnection('conn-1');
      expect(debugSSE.connectionCount).toBe(0);
    });

    it('ends the connection stream', () => {
      const { reply } = createMockReply();
      debugSSE.addConnection('conn-1', reply);

      debugSSE.removeConnection('conn-1');

      expect(reply.raw.end).toHaveBeenCalled();
    });

    it('does nothing for non-existent connection', () => {
      debugSSE.removeConnection('non-existent');
      expect(debugSSE.connectionCount).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('sends trace entry to all clients without filter', () => {
      debugSSE.start(traceCollector);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      debugSSE.addConnection('conn-1', mock1.reply);
      debugSSE.addConnection('conn-2', mock2.reply);

      traceCollector.record('rule_executed', { actionsCount: 1 }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule'
      });

      expect(mock1.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
      expect(mock2.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
    });

    it('filters by entry type', () => {
      debugSSE.start(traceCollector);
      const mockExecuted = createMockReply();
      const mockFailed = createMockReply();

      debugSSE.addConnection('conn-executed', mockExecuted.reply, { types: ['rule_executed'] });
      debugSSE.addConnection('conn-failed', mockFailed.reply, { types: ['action_failed'] });

      traceCollector.record('rule_executed', { actionsCount: 1 }, { ruleId: 'rule-1' });

      expect(mockExecuted.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
      expect(mockFailed.writtenData.some((d) => d.includes('rule_executed'))).toBe(false);
    });

    it('filters by rule ID', () => {
      debugSSE.start(traceCollector);
      const mockRule1 = createMockReply();
      const mockRule2 = createMockReply();

      debugSSE.addConnection('conn-rule1', mockRule1.reply, { ruleIds: ['rule-1'] });
      debugSSE.addConnection('conn-rule2', mockRule2.reply, { ruleIds: ['rule-2'] });

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(mockRule1.writtenData.some((d) => d.includes('rule-1'))).toBe(true);
      expect(mockRule2.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('filters by correlation ID', () => {
      debugSSE.start(traceCollector);
      const mockCorr1 = createMockReply();
      const mockCorr2 = createMockReply();

      debugSSE.addConnection('conn-corr1', mockCorr1.reply, { correlationIds: ['corr-1'] });
      debugSSE.addConnection('conn-corr2', mockCorr2.reply, { correlationIds: ['corr-2'] });

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', correlationId: 'corr-1' });

      expect(mockCorr1.writtenData.some((d) => d.includes('corr-1'))).toBe(true);
      expect(mockCorr2.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('filters by minimum duration', () => {
      debugSSE.start(traceCollector);
      const mockFast = createMockReply();
      const mockSlow = createMockReply();

      debugSSE.addConnection('conn-fast', mockFast.reply, { minDurationMs: 0 });
      debugSSE.addConnection('conn-slow', mockSlow.reply, { minDurationMs: 100 });

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 50 });

      expect(mockFast.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
      expect(mockSlow.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('passes entries that meet minimum duration', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();

      debugSSE.addConnection('conn-1', mock.reply, { minDurationMs: 100 });

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 150 });

      expect(mock.writtenData.some((d) => d.includes('rule_executed'))).toBe(true);
    });

    it('combines multiple filters with AND logic', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();

      debugSSE.addConnection('conn-1', mock.reply, {
        types: ['rule_executed'],
        ruleIds: ['rule-1'],
        minDurationMs: 50
      });

      // This should match - correct type, rule, and duration
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 100 });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);

      // This should not match - wrong type
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', durationMs: 100 });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);

      // This should not match - wrong rule
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-2', durationMs: 100 });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);

      // This should not match - too fast
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });
      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);
    });

    it('increments totalEntriesSent counter', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply);

      const initialStats = debugSSE.getStats();
      expect(initialStats.totalEntriesSent).toBe(0);

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      const stats = debugSSE.getStats();
      expect(stats.totalEntriesSent).toBe(1);
    });

    it('increments totalEntriesFiltered counter', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply, { types: ['action_failed'] });

      const initialStats = debugSSE.getStats();
      expect(initialStats.totalEntriesFiltered).toBe(0);

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      const stats = debugSSE.getStats();
      expect(stats.totalEntriesFiltered).toBe(1);
    });

    it('counts entries per client', () => {
      debugSSE.start(traceCollector);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      debugSSE.addConnection('conn-1', mock1.reply);
      debugSSE.addConnection('conn-2', mock2.reply);

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      const stats = debugSSE.getStats();
      expect(stats.totalEntriesSent).toBe(2);
    });

    it('formats trace entry data correctly', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply);

      traceCollector.record('rule_executed', { actionsCount: 3 }, {
        ruleId: 'rule-123',
        ruleName: 'Test Rule',
        correlationId: 'corr-456',
        durationMs: 42
      });

      const dataLines = mock.writtenData.filter((d) => d.startsWith('data:'));
      expect(dataLines.length).toBe(1);

      const data = JSON.parse(dataLines[0].replace('data: ', '').trim());
      expect(data.type).toBe('rule_executed');
      expect(data.ruleId).toBe('rule-123');
      expect(data.ruleName).toBe('Test Rule');
      expect(data.correlationId).toBe('corr-456');
      expect(data.durationMs).toBe(42);
      expect(data.details.actionsCount).toBe(3);
    });

    it('removes dead connections during broadcast', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply);

      mock.reply.raw.end();

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(debugSSE.connectionCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      debugSSE.start(traceCollector);
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      debugSSE.addConnection('conn-1', mock1.reply);
      debugSSE.addConnection('conn-2', mock2.reply, { types: ['action_failed'] });

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      const stats = debugSSE.getStats();
      expect(stats).toEqual({
        activeConnections: 2,
        totalEntriesSent: 1,
        totalEntriesFiltered: 1
      });
    });
  });

  describe('getConnections', () => {
    it('returns list of active connections', () => {
      vi.useRealTimers();
      const beforeConnect = Date.now();

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      debugSSE.addConnection('conn-1', mock1.reply, { types: ['rule_executed'] });
      debugSSE.addConnection('conn-2', mock2.reply, { ruleIds: ['rule-1', 'rule-2'] });

      const afterConnect = Date.now();
      const connections = debugSSE.getConnections();

      expect(connections).toHaveLength(2);
      expect(connections[0]).toMatchObject({
        id: 'conn-1',
        filter: { types: ['rule_executed'] }
      });
      expect(connections[0].connectedAt).toBeGreaterThanOrEqual(beforeConnect);
      expect(connections[0].connectedAt).toBeLessThanOrEqual(afterConnect);

      expect(connections[1]).toMatchObject({
        id: 'conn-2',
        filter: { ruleIds: ['rule-1', 'rule-2'] }
      });

      vi.useFakeTimers();
    });
  });

  describe('heartbeat', () => {
    it('sends heartbeat to all connections', () => {
      debugSSE.start(traceCollector);

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      debugSSE.addConnection('conn-1', mock1.reply);
      debugSSE.addConnection('conn-2', mock2.reply);

      vi.advanceTimersByTime(1000);

      expect(mock1.writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
      expect(mock2.writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
    });

    it('removes dead connections during heartbeat', () => {
      debugSSE.start(traceCollector);

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      debugSSE.addConnection('conn-1', mock1.reply);
      debugSSE.addConnection('conn-2', mock2.reply);

      mock1.reply.raw.end();

      vi.advanceTimersByTime(1000);

      expect(debugSSE.connectionCount).toBe(1);
      const connections = debugSSE.getConnections();
      expect(connections[0].id).toBe('conn-2');
    });
  });

  describe('filter matching edge cases', () => {
    it('excludes entries without ruleId when filtering by ruleIds', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply, { ruleIds: ['rule-1'] });

      traceCollector.record('fact_changed', { factKey: 'test' }, {});

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('excludes entries without correlationId when filtering by correlationIds', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply, { correlationIds: ['corr-1'] });

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('excludes entries without duration when filtering by minDurationMs', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply, { minDurationMs: 10 });

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1' });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(0);
    });

    it('allows any ruleId when ruleIds filter is empty array', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply, { ruleIds: [] });

      traceCollector.record('rule_executed', {}, { ruleId: 'any-rule' });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(1);
    });

    it('allows any type when types filter is empty array', () => {
      debugSSE.start(traceCollector);
      const mock = createMockReply();
      debugSSE.addConnection('conn-1', mock.reply, { types: [] });

      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' });
      traceCollector.record('action_failed', { error: 'test' }, { ruleId: 'rule-1' });

      expect(mock.writtenData.filter((d) => d.startsWith('data:')).length).toBe(2);
    });
  });
});
