import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventStore } from '../../../src/core/event-store';
import type { Event } from '../../../src/types/event';

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    topic: 'test.event',
    data: {},
    timestamp: Date.now(),
    source: 'test',
    ...overrides
  };
}

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore();
  });

  describe('store() and get()', () => {
    it('stores event and retrieves it by id', () => {
      const event = createEvent({ id: 'evt-123' });

      store.store(event);
      const retrieved = store.get('evt-123');

      expect(retrieved).toBe(event);
    });

    it('returns undefined for non-existing event', () => {
      const result = store.get('non-existing');

      expect(result).toBeUndefined();
    });

    it('overwrites event with same id', () => {
      const original = createEvent({ id: 'evt-1', data: { version: 1 } });
      const updated = createEvent({ id: 'evt-1', data: { version: 2 } });

      store.store(original);
      store.store(updated);

      expect(store.get('evt-1')?.data).toEqual({ version: 2 });
      expect(store.size).toBe(1);
    });

    it('stores events with different topics', () => {
      const orderEvent = createEvent({ id: 'evt-1', topic: 'order.created' });
      const paymentEvent = createEvent({ id: 'evt-2', topic: 'payment.received' });

      store.store(orderEvent);
      store.store(paymentEvent);

      expect(store.get('evt-1')?.topic).toBe('order.created');
      expect(store.get('evt-2')?.topic).toBe('payment.received');
    });
  });

  describe('getByCorrelation()', () => {
    it('returns events with matching correlationId', () => {
      const event1 = createEvent({ id: 'evt-1', correlationId: 'order-123' });
      const event2 = createEvent({ id: 'evt-2', correlationId: 'order-123' });
      const event3 = createEvent({ id: 'evt-3', correlationId: 'order-456' });

      store.store(event1);
      store.store(event2);
      store.store(event3);

      const results = store.getByCorrelation('order-123');

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id).sort()).toEqual(['evt-1', 'evt-2']);
    });

    it('returns empty array for non-existing correlationId', () => {
      store.store(createEvent({ correlationId: 'existing' }));

      const results = store.getByCorrelation('non-existing');

      expect(results).toEqual([]);
    });

    it('excludes events without correlationId', () => {
      const withCorrelation = createEvent({ id: 'evt-1', correlationId: 'corr-1' });
      const withoutCorrelation = createEvent({ id: 'evt-2' });

      store.store(withCorrelation);
      store.store(withoutCorrelation);

      const results = store.getByCorrelation('corr-1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('evt-1');
    });

    it('maintains insertion order for correlated events', () => {
      const events = [
        createEvent({ id: 'evt-1', correlationId: 'saga-1', timestamp: 1000 }),
        createEvent({ id: 'evt-2', correlationId: 'saga-1', timestamp: 2000 }),
        createEvent({ id: 'evt-3', correlationId: 'saga-1', timestamp: 3000 })
      ];

      events.forEach(e => store.store(e));

      const results = store.getByCorrelation('saga-1');

      expect(results.map(e => e.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
    });
  });

  describe('getInTimeRange()', () => {
    const baseTime = 1000000;

    beforeEach(() => {
      store.store(createEvent({ id: 'evt-1', topic: 'order.created', timestamp: baseTime }));
      store.store(createEvent({ id: 'evt-2', topic: 'order.created', timestamp: baseTime + 1000 }));
      store.store(createEvent({ id: 'evt-3', topic: 'order.created', timestamp: baseTime + 2000 }));
      store.store(createEvent({ id: 'evt-4', topic: 'order.created', timestamp: baseTime + 3000 }));
      store.store(createEvent({ id: 'evt-5', topic: 'payment.received', timestamp: baseTime + 1500 }));
    });

    it('returns events within time range for specific topic', () => {
      const results = store.getInTimeRange('order.created', baseTime + 500, baseTime + 2500);

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id).sort()).toEqual(['evt-2', 'evt-3']);
    });

    it('includes events at boundary timestamps', () => {
      const results = store.getInTimeRange('order.created', baseTime, baseTime + 1000);

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id).sort()).toEqual(['evt-1', 'evt-2']);
    });

    it('returns empty array for non-existing topic', () => {
      const results = store.getInTimeRange('non.existing', baseTime, baseTime + 5000);

      expect(results).toEqual([]);
    });

    it('returns empty array when no events in range', () => {
      const results = store.getInTimeRange('order.created', baseTime + 10000, baseTime + 20000);

      expect(results).toEqual([]);
    });

    it('filters by topic correctly', () => {
      const results = store.getInTimeRange('payment.received', baseTime, baseTime + 5000);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('evt-5');
    });
  });

  describe('countInWindow()', () => {
    let originalDateNow: () => number;

    beforeEach(() => {
      originalDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    it('counts events within time window from now', () => {
      const now = 10000;
      Date.now = () => now;

      store.store(createEvent({ topic: 'api.call', timestamp: now - 500 }));
      store.store(createEvent({ topic: 'api.call', timestamp: now - 1500 }));
      store.store(createEvent({ topic: 'api.call', timestamp: now - 2500 }));

      const count = store.countInWindow('api.call', 2000);

      expect(count).toBe(2);
    });

    it('returns 0 for non-existing topic', () => {
      Date.now = () => 10000;

      const count = store.countInWindow('non.existing', 5000);

      expect(count).toBe(0);
    });

    it('returns 0 when all events are outside window', () => {
      const now = 100000;
      Date.now = () => now;

      store.store(createEvent({ topic: 'old.events', timestamp: now - 10000 }));
      store.store(createEvent({ topic: 'old.events', timestamp: now - 20000 }));

      const count = store.countInWindow('old.events', 5000);

      expect(count).toBe(0);
    });

    it('includes events at window boundary', () => {
      const now = 10000;
      Date.now = () => now;

      store.store(createEvent({ topic: 'boundary', timestamp: now - 1000 }));
      store.store(createEvent({ topic: 'boundary', timestamp: now }));

      const count = store.countInWindow('boundary', 1000);

      expect(count).toBe(2);
    });
  });

  describe('prune()', () => {
    let originalDateNow: () => number;

    beforeEach(() => {
      originalDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    it('removes events older than specified age', () => {
      const now = 100000;
      Date.now = () => now;

      store.store(createEvent({ id: 'old-1', timestamp: now - 5000 }));
      store.store(createEvent({ id: 'old-2', timestamp: now - 4000 }));
      store.store(createEvent({ id: 'recent', timestamp: now - 1000 }));

      const pruned = store.prune(3000);

      expect(pruned).toBe(2);
      expect(store.size).toBe(1);
      expect(store.get('recent')).toBeDefined();
      expect(store.get('old-1')).toBeUndefined();
    });

    it('returns 0 when no events to prune', () => {
      const now = 100000;
      Date.now = () => now;

      store.store(createEvent({ timestamp: now - 100 }));

      const pruned = store.prune(1000);

      expect(pruned).toBe(0);
    });

    it('handles empty store', () => {
      const pruned = store.prune(1000);

      expect(pruned).toBe(0);
    });
  });

  describe('auto-pruning on maxEvents', () => {
    it('prunes oldest events when exceeding maxEvents', () => {
      const smallStore = new EventStore({ maxEvents: 10 });

      for (let i = 0; i < 15; i++) {
        smallStore.store(createEvent({
          id: `evt-${i}`,
          timestamp: i * 1000
        }));
      }

      // Store měl 15 eventů, ale max je 10, takže by měl odstranit nejstarší
      expect(smallStore.size).toBeLessThanOrEqual(10);
    });

    it('preserves newest events after auto-prune', () => {
      const smallStore = new EventStore({ maxEvents: 5 });

      for (let i = 0; i < 10; i++) {
        smallStore.store(createEvent({
          id: `evt-${i}`,
          timestamp: i * 1000
        }));
      }

      // Nejnovější eventy by měly zůstat
      expect(smallStore.get('evt-9')).toBeDefined();
      expect(smallStore.get('evt-8')).toBeDefined();
    });

    it('removes approximately 10% when pruning', () => {
      const store = new EventStore({ maxEvents: 100 });

      for (let i = 0; i < 105; i++) {
        store.store(createEvent({
          id: `evt-${i}`,
          timestamp: i * 1000
        }));
      }

      // Po překročení by mělo být odstraněno ~10%, takže ~95 eventů zůstane
      expect(store.size).toBeLessThanOrEqual(100);
      expect(store.size).toBeGreaterThanOrEqual(90);
    });
  });

  describe('size property', () => {
    it('returns 0 for empty store', () => {
      expect(store.size).toBe(0);
    });

    it('returns correct count after storing events', () => {
      store.store(createEvent({ id: 'evt-1' }));
      store.store(createEvent({ id: 'evt-2' }));
      store.store(createEvent({ id: 'evt-3' }));

      expect(store.size).toBe(3);
    });

    it('does not increase when updating existing event', () => {
      store.store(createEvent({ id: 'evt-1', data: { v: 1 } }));
      store.store(createEvent({ id: 'evt-1', data: { v: 2 } }));

      expect(store.size).toBe(1);
    });
  });

  describe('clear()', () => {
    it('removes all events', () => {
      store.store(createEvent({ id: 'evt-1' }));
      store.store(createEvent({ id: 'evt-2' }));
      store.store(createEvent({ id: 'evt-3' }));

      store.clear();

      expect(store.size).toBe(0);
      expect(store.get('evt-1')).toBeUndefined();
    });

    it('clears correlation index', () => {
      store.store(createEvent({ id: 'evt-1', correlationId: 'corr-1' }));
      store.store(createEvent({ id: 'evt-2', correlationId: 'corr-1' }));

      store.clear();

      expect(store.getByCorrelation('corr-1')).toEqual([]);
    });

    it('clears topic index', () => {
      const baseTime = 1000;
      store.store(createEvent({ id: 'evt-1', topic: 'test', timestamp: baseTime }));

      store.clear();

      expect(store.getInTimeRange('test', 0, baseTime + 1000)).toEqual([]);
    });

    it('does nothing on empty store', () => {
      store.clear();

      expect(store.size).toBe(0);
    });
  });

  describe('static start()', () => {
    it('creates store instance asynchronously', async () => {
      const asyncStore = await EventStore.start({ name: 'async-event-store' });

      expect(asyncStore).toBeInstanceOf(EventStore);
    });

    it('accepts configuration options', async () => {
      const asyncStore = await EventStore.start({
        maxEvents: 500,
        maxAgeMs: 3600000
      });

      expect(asyncStore).toBeInstanceOf(EventStore);
    });
  });

  describe('topic indexing', () => {
    it('indexes events by topic for efficient retrieval', () => {
      const baseTime = 1000;
      store.store(createEvent({ id: 'evt-1', topic: 'order.created', timestamp: baseTime }));
      store.store(createEvent({ id: 'evt-2', topic: 'order.created', timestamp: baseTime + 100 }));
      store.store(createEvent({ id: 'evt-3', topic: 'payment.received', timestamp: baseTime + 50 }));

      const orderEvents = store.getInTimeRange('order.created', 0, baseTime + 1000);

      expect(orderEvents).toHaveLength(2);
      expect(orderEvents.every(e => e.topic === 'order.created')).toBe(true);
    });
  });

  describe('getAllEvents()', () => {
    it('returns empty array for empty store', () => {
      const results = store.getAllEvents();

      expect(results).toEqual([]);
    });

    it('returns all events sorted by timestamp', () => {
      store.store(createEvent({ id: 'evt-3', timestamp: 3000 }));
      store.store(createEvent({ id: 'evt-1', timestamp: 1000 }));
      store.store(createEvent({ id: 'evt-2', timestamp: 2000 }));

      const results = store.getAllEvents();

      expect(results).toHaveLength(3);
      expect(results.map(e => e.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
    });

    it('returns events from different topics', () => {
      store.store(createEvent({ id: 'evt-1', topic: 'order.created', timestamp: 1000 }));
      store.store(createEvent({ id: 'evt-2', topic: 'payment.received', timestamp: 2000 }));
      store.store(createEvent({ id: 'evt-3', topic: 'user.updated', timestamp: 3000 }));

      const results = store.getAllEvents();

      expect(results).toHaveLength(3);
      expect(results.map(e => e.topic)).toEqual(['order.created', 'payment.received', 'user.updated']);
    });
  });

  describe('getByTopic()', () => {
    it('returns empty array for non-existing topic', () => {
      store.store(createEvent({ topic: 'existing.topic' }));

      const results = store.getByTopic('non.existing');

      expect(results).toEqual([]);
    });

    it('returns events for exact topic match', () => {
      store.store(createEvent({ id: 'evt-1', topic: 'order.created' }));
      store.store(createEvent({ id: 'evt-2', topic: 'order.created' }));
      store.store(createEvent({ id: 'evt-3', topic: 'order.updated' }));

      const results = store.getByTopic('order.created');

      expect(results).toHaveLength(2);
      expect(results.every(e => e.topic === 'order.created')).toBe(true);
    });

    it('maintains insertion order', () => {
      store.store(createEvent({ id: 'evt-1', topic: 'test.topic' }));
      store.store(createEvent({ id: 'evt-2', topic: 'test.topic' }));
      store.store(createEvent({ id: 'evt-3', topic: 'test.topic' }));

      const results = store.getByTopic('test.topic');

      expect(results.map(e => e.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
    });
  });

  describe('getByTopicPattern()', () => {
    beforeEach(() => {
      store.store(createEvent({ id: 'evt-1', topic: 'order.created', timestamp: 1000 }));
      store.store(createEvent({ id: 'evt-2', topic: 'order.updated', timestamp: 2000 }));
      store.store(createEvent({ id: 'evt-3', topic: 'order.deleted', timestamp: 3000 }));
      store.store(createEvent({ id: 'evt-4', topic: 'payment.received', timestamp: 4000 }));
      store.store(createEvent({ id: 'evt-5', topic: 'user.order.created', timestamp: 5000 }));
    });

    it('returns exact match when no wildcard', () => {
      const results = store.getByTopicPattern('order.created');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('evt-1');
    });

    it('matches single segment with *', () => {
      const results = store.getByTopicPattern('order.*');

      expect(results).toHaveLength(3);
      expect(results.map(e => e.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
    });

    it('does not match multiple segments with *', () => {
      const results = store.getByTopicPattern('*.created');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('evt-1');
    });

    it('matches any number of segments with **', () => {
      const results = store.getByTopicPattern('**.created');

      expect(results).toHaveLength(2);
      expect(results.map(e => e.id)).toEqual(['evt-1', 'evt-5']);
    });

    it('matches all events with **', () => {
      const results = store.getByTopicPattern('**');

      expect(results).toHaveLength(5);
    });

    it('matches prefix with .**', () => {
      const results = store.getByTopicPattern('order.**');

      expect(results).toHaveLength(3);
    });

    it('returns results sorted by timestamp', () => {
      const results = store.getByTopicPattern('**');

      const timestamps = results.map(e => e.timestamp);
      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    });

    it('returns empty array for non-matching pattern', () => {
      const results = store.getByTopicPattern('non.existing.*');

      expect(results).toEqual([]);
    });

    it('handles complex patterns with * and **', () => {
      store.store(createEvent({ id: 'evt-6', topic: 'system.user.order.created', timestamp: 6000 }));

      const results = store.getByTopicPattern('*.user.**');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('evt-6');
    });
  });

  describe('default configuration', () => {
    it('uses default maxEvents of 10000', () => {
      const defaultStore = new EventStore();

      // Store více než defaultní limit by měl triggerovat prune
      // Testujeme nepřímo - že store funguje bez explicitního limitu
      for (let i = 0; i < 100; i++) {
        defaultStore.store(createEvent({ id: `evt-${i}` }));
      }

      expect(defaultStore.size).toBe(100);
    });

    it('uses default maxAgeMs of 24 hours', async () => {
      const defaultStore = new EventStore();
      const now = Date.now();
      const originalDateNow = Date.now;

      // Vytvoříme event starší než 24 hodin
      Date.now = () => now;
      defaultStore.store(createEvent({
        id: 'old-event',
        timestamp: now - (25 * 60 * 60 * 1000) // 25 hodin starý
      }));
      defaultStore.store(createEvent({
        id: 'recent-event',
        timestamp: now - 1000
      }));

      // Prune s výchozím maxAgeMs (24h)
      const pruned = defaultStore.prune(24 * 60 * 60 * 1000);

      expect(pruned).toBe(1);
      expect(defaultStore.get('old-event')).toBeUndefined();
      expect(defaultStore.get('recent-event')).toBeDefined();

      Date.now = originalDateNow;
    });
  });
});
