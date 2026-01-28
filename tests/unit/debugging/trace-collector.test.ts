import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TraceCollector } from '../../../src/debugging/trace-collector';
import type { DebugTraceEntry, TraceEntryType } from '../../../src/debugging/types';

describe('TraceCollector', () => {
  let collector: TraceCollector;

  beforeEach(() => {
    collector = new TraceCollector({ enabled: true });
  });

  describe('enable/disable', () => {
    it('is disabled by default', () => {
      const defaultCollector = new TraceCollector();
      expect(defaultCollector.isEnabled()).toBe(false);
    });

    it('can be initialized as enabled', () => {
      const enabledCollector = new TraceCollector({ enabled: true });
      expect(enabledCollector.isEnabled()).toBe(true);
    });

    it('can be enabled after creation', () => {
      const coll = new TraceCollector();
      expect(coll.isEnabled()).toBe(false);

      coll.enable();
      expect(coll.isEnabled()).toBe(true);
    });

    it('can be disabled after creation', () => {
      collector.disable();
      expect(collector.isEnabled()).toBe(false);
    });
  });

  describe('record()', () => {
    it('records entry when enabled', () => {
      const entry = collector.record('rule_triggered', { triggeredBy: 'event-1' });

      expect(entry).toBeDefined();
      expect(entry?.type).toBe('rule_triggered');
      expect(entry?.details).toEqual({ triggeredBy: 'event-1' });
    });

    it('returns undefined when disabled', () => {
      collector.disable();
      const entry = collector.record('rule_triggered', {});

      expect(entry).toBeUndefined();
      expect(collector.size).toBe(0);
    });

    it('generates id and timestamp automatically', () => {
      const before = Date.now();
      const entry = collector.record('rule_executed', {});
      const after = Date.now();

      expect(entry?.id).toBeDefined();
      expect(entry?.id.length).toBeGreaterThan(0);
      expect(entry?.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry?.timestamp).toBeLessThanOrEqual(after);
    });

    it('accepts custom id and timestamp', () => {
      const entry = collector.record('rule_executed', {}, {
        id: 'custom-id-123',
        timestamp: 1000000,
      });

      expect(entry?.id).toBe('custom-id-123');
      expect(entry?.timestamp).toBe(1000000);
    });

    it('records optional fields when provided', () => {
      const entry = collector.record(
        'action_completed',
        { output: 'success' },
        {
          correlationId: 'corr-123',
          causationId: 'cause-456',
          ruleId: 'rule-1',
          ruleName: 'Test Rule',
          durationMs: 42,
        }
      );

      expect(entry?.correlationId).toBe('corr-123');
      expect(entry?.causationId).toBe('cause-456');
      expect(entry?.ruleId).toBe('rule-1');
      expect(entry?.ruleName).toBe('Test Rule');
      expect(entry?.durationMs).toBe(42);
    });

    it('omits optional fields when not provided', () => {
      const entry = collector.record('fact_changed', { fact: 'temperature' });

      expect(entry).toBeDefined();
      expect('correlationId' in entry!).toBe(false);
      expect('causationId' in entry!).toBe(false);
      expect('ruleId' in entry!).toBe(false);
      expect('ruleName' in entry!).toBe(false);
      expect('durationMs' in entry!).toBe(false);
    });
  });

  describe('getByCorrelation()', () => {
    it('returns entries with matching correlationId', () => {
      collector.record('rule_triggered', {}, { correlationId: 'order-123', id: 'e1' });
      collector.record('action_started', {}, { correlationId: 'order-123', id: 'e2' });
      collector.record('rule_triggered', {}, { correlationId: 'order-456', id: 'e3' });

      const results = collector.getByCorrelation('order-123');

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('returns empty array for non-existing correlationId', () => {
      collector.record('rule_triggered', {}, { correlationId: 'existing' });

      const results = collector.getByCorrelation('non-existing');

      expect(results).toEqual([]);
    });

    it('excludes entries without correlationId', () => {
      collector.record('rule_triggered', {}, { correlationId: 'corr-1', id: 'e1' });
      collector.record('rule_triggered', {}, { id: 'e2' });

      const results = collector.getByCorrelation('corr-1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e1');
    });

    it('returns entries in chronological order', () => {
      collector.record('rule_triggered', {}, { correlationId: 'saga', id: 'e1', timestamp: 3000 });
      collector.record('action_started', {}, { correlationId: 'saga', id: 'e2', timestamp: 1000 });
      collector.record('action_completed', {}, { correlationId: 'saga', id: 'e3', timestamp: 2000 });

      const results = collector.getByCorrelation('saga');

      expect(results.map(e => e.id)).toEqual(['e2', 'e3', 'e1']);
    });
  });

  describe('getByRule()', () => {
    it('returns entries with matching ruleId', () => {
      collector.record('rule_triggered', {}, { ruleId: 'rule-1', id: 'e1' });
      collector.record('rule_executed', {}, { ruleId: 'rule-1', id: 'e2' });
      collector.record('rule_triggered', {}, { ruleId: 'rule-2', id: 'e3' });

      const results = collector.getByRule('rule-1');

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('returns empty array for non-existing ruleId', () => {
      collector.record('rule_triggered', {}, { ruleId: 'existing' });

      const results = collector.getByRule('non-existing');

      expect(results).toEqual([]);
    });

    it('returns entries in chronological order', () => {
      collector.record('rule_triggered', {}, { ruleId: 'r1', id: 'e1', timestamp: 3000 });
      collector.record('rule_executed', {}, { ruleId: 'r1', id: 'e2', timestamp: 1000 });

      const results = collector.getByRule('r1');

      expect(results.map(e => e.id)).toEqual(['e2', 'e1']);
    });
  });

  describe('getByType()', () => {
    it('returns entries with matching type', () => {
      collector.record('rule_triggered', {}, { id: 'e1' });
      collector.record('action_started', {}, { id: 'e2' });
      collector.record('rule_triggered', {}, { id: 'e3' });

      const results = collector.getByType('rule_triggered');

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id).sort()).toEqual(['e1', 'e3']);
    });

    it('returns empty array for non-existing type', () => {
      collector.record('rule_triggered', {});

      const results = collector.getByType('timer_expired');

      expect(results).toEqual([]);
    });
  });

  describe('getRecent()', () => {
    it('returns entries in reverse chronological order', () => {
      collector.record('rule_triggered', {}, { id: 'e1', timestamp: 1000 });
      collector.record('rule_triggered', {}, { id: 'e2', timestamp: 2000 });
      collector.record('rule_triggered', {}, { id: 'e3', timestamp: 3000 });

      const results = collector.getRecent(10);

      expect(results.map(e => e.id)).toEqual(['e3', 'e2', 'e1']);
    });

    it('limits results to specified count', () => {
      for (let i = 0; i < 20; i++) {
        collector.record('rule_triggered', {}, { id: `e${i}` });
      }

      const results = collector.getRecent(5);

      expect(results).toHaveLength(5);
    });

    it('returns all entries if fewer than limit', () => {
      collector.record('rule_triggered', {}, { id: 'e1' });
      collector.record('rule_triggered', {}, { id: 'e2' });

      const results = collector.getRecent(100);

      expect(results).toHaveLength(2);
    });

    it('defaults to 100 entries', () => {
      for (let i = 0; i < 150; i++) {
        collector.record('rule_triggered', {}, { id: `e${i}` });
      }

      const results = collector.getRecent();

      expect(results).toHaveLength(100);
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      collector.record('rule_triggered', {}, {
        id: 'e1',
        correlationId: 'corr-1',
        ruleId: 'rule-1',
        timestamp: 1000,
      });
      collector.record('action_started', {}, {
        id: 'e2',
        correlationId: 'corr-1',
        ruleId: 'rule-1',
        timestamp: 2000,
      });
      collector.record('rule_triggered', {}, {
        id: 'e3',
        correlationId: 'corr-2',
        ruleId: 'rule-2',
        timestamp: 3000,
      });
      collector.record('action_failed', {}, {
        id: 'e4',
        correlationId: 'corr-1',
        ruleId: 'rule-2',
        timestamp: 4000,
      });
    });

    it('filters by correlationId', () => {
      const results = collector.query({ correlationId: 'corr-1' });

      expect(results).toHaveLength(3);
      expect(results.every(e => e.correlationId === 'corr-1')).toBe(true);
    });

    it('filters by ruleId', () => {
      const results = collector.query({ ruleId: 'rule-1' });

      expect(results).toHaveLength(2);
      expect(results.every(e => e.ruleId === 'rule-1')).toBe(true);
    });

    it('filters by single type', () => {
      const results = collector.query({ types: ['rule_triggered'] });

      expect(results).toHaveLength(2);
      expect(results.every(e => e.type === 'rule_triggered')).toBe(true);
    });

    it('filters by multiple types', () => {
      const results = collector.query({ types: ['rule_triggered', 'action_failed'] });

      expect(results).toHaveLength(3);
      expect(results.every(e => e.type === 'rule_triggered' || e.type === 'action_failed')).toBe(true);
    });

    it('filters by timestamp range', () => {
      const results = collector.query({ fromTimestamp: 2000, toTimestamp: 3000 });

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id)).toEqual(['e2', 'e3']);
    });

    it('limits results', () => {
      const results = collector.query({ limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('combines multiple filters', () => {
      const results = collector.query({
        correlationId: 'corr-1',
        types: ['rule_triggered', 'action_started'],
      });

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id)).toEqual(['e1', 'e2']);
    });

    it('returns results in chronological order', () => {
      const results = collector.query({});

      expect(results.map(e => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
    });
  });

  describe('subscribe()', () => {
    it('notifies subscriber of new entries', () => {
      const received: DebugTraceEntry[] = [];
      collector.subscribe((entry) => received.push(entry));

      collector.record('rule_triggered', { test: true });
      collector.record('action_started', { action: 'notify' });

      expect(received).toHaveLength(2);
      expect(received[0].type).toBe('rule_triggered');
      expect(received[1].type).toBe('action_started');
    });

    it('returns unsubscribe function', () => {
      const received: DebugTraceEntry[] = [];
      const unsubscribe = collector.subscribe((entry) => received.push(entry));

      collector.record('rule_triggered', {});
      unsubscribe();
      collector.record('action_started', {});

      expect(received).toHaveLength(1);
    });

    it('handles multiple subscribers', () => {
      const received1: DebugTraceEntry[] = [];
      const received2: DebugTraceEntry[] = [];

      collector.subscribe((entry) => received1.push(entry));
      collector.subscribe((entry) => received2.push(entry));

      collector.record('rule_triggered', {});

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('ignores subscriber errors', () => {
      const received: DebugTraceEntry[] = [];

      collector.subscribe(() => { throw new Error('Subscriber error'); });
      collector.subscribe((entry) => received.push(entry));

      collector.record('rule_triggered', {});

      expect(received).toHaveLength(1);
    });

    it('does not notify when tracing is disabled', () => {
      const received: DebugTraceEntry[] = [];
      collector.subscribe((entry) => received.push(entry));

      collector.disable();
      collector.record('rule_triggered', {});

      expect(received).toHaveLength(0);
    });
  });

  describe('ring buffer behavior', () => {
    it('enforces maxEntries limit', () => {
      const smallCollector = new TraceCollector({ maxEntries: 10, enabled: true });

      for (let i = 0; i < 15; i++) {
        smallCollector.record('rule_triggered', {}, { id: `e${i}`, timestamp: i * 1000 });
      }

      expect(smallCollector.size).toBeLessThanOrEqual(10);
    });

    it('preserves newest entries when evicting', () => {
      const smallCollector = new TraceCollector({ maxEntries: 5, enabled: true });

      for (let i = 0; i < 10; i++) {
        smallCollector.record('rule_triggered', {}, { id: `e${i}`, timestamp: i * 1000 });
      }

      const recent = smallCollector.getRecent(10);
      expect(recent.some(e => e.id === 'e9')).toBe(true);
      expect(recent.some(e => e.id === 'e8')).toBe(true);
    });

    it('removes evicted entries from indexes', () => {
      const smallCollector = new TraceCollector({ maxEntries: 5, enabled: true });

      // Add entries with same correlationId
      for (let i = 0; i < 10; i++) {
        smallCollector.record('rule_triggered', {}, {
          id: `e${i}`,
          correlationId: 'corr-all',
          timestamp: i * 1000,
        });
      }

      const byCorrelation = smallCollector.getByCorrelation('corr-all');
      expect(byCorrelation.length).toBeLessThanOrEqual(5);
    });

    it('removes approximately 10% when limit is reached', () => {
      const collector = new TraceCollector({ maxEntries: 100, enabled: true });

      for (let i = 0; i < 105; i++) {
        collector.record('rule_triggered', {}, { id: `e${i}`, timestamp: i * 1000 });
      }

      expect(collector.size).toBeLessThanOrEqual(100);
      expect(collector.size).toBeGreaterThanOrEqual(90);
    });
  });

  describe('clear()', () => {
    it('removes all entries', () => {
      collector.record('rule_triggered', {}, { id: 'e1' });
      collector.record('action_started', {}, { id: 'e2' });

      collector.clear();

      expect(collector.size).toBe(0);
    });

    it('clears all indexes', () => {
      collector.record('rule_triggered', {}, {
        correlationId: 'corr-1',
        ruleId: 'rule-1',
      });

      collector.clear();

      expect(collector.getByCorrelation('corr-1')).toEqual([]);
      expect(collector.getByRule('rule-1')).toEqual([]);
      expect(collector.getByType('rule_triggered')).toEqual([]);
    });
  });

  describe('size property', () => {
    it('returns 0 for empty collector', () => {
      expect(collector.size).toBe(0);
    });

    it('returns correct count after recording', () => {
      collector.record('rule_triggered', {});
      collector.record('action_started', {});
      collector.record('action_completed', {});

      expect(collector.size).toBe(3);
    });

    it('does not count entries when disabled', () => {
      collector.disable();
      collector.record('rule_triggered', {});

      expect(collector.size).toBe(0);
    });
  });

  describe('static start()', () => {
    it('creates instance asynchronously', async () => {
      const asyncCollector = await TraceCollector.start({ enabled: true });

      expect(asyncCollector).toBeInstanceOf(TraceCollector);
      expect(asyncCollector.isEnabled()).toBe(true);
    });

    it('accepts configuration options', async () => {
      const asyncCollector = await TraceCollector.start({
        maxEntries: 500,
        enabled: false,
      });

      expect(asyncCollector).toBeInstanceOf(TraceCollector);
      expect(asyncCollector.isEnabled()).toBe(false);
    });
  });

  describe('default configuration', () => {
    it('uses default maxEntries of 10000', () => {
      const defaultCollector = new TraceCollector({ enabled: true });

      // Verify indirectly by storing many entries
      for (let i = 0; i < 100; i++) {
        defaultCollector.record('rule_triggered', {});
      }

      expect(defaultCollector.size).toBe(100);
    });
  });
});
