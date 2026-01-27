import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TemporalProcessor, type PatternMatch } from '../../../src/core/temporal-processor';
import { EventStore } from '../../../src/core/event-store';
import { TimerManager } from '../../../src/core/timer-manager';
import type { Event } from '../../../src/types/event';
import type { Rule } from '../../../src/types/rule';
import type { SequencePattern, AbsencePattern, CountPattern, AggregatePattern } from '../../../src/types/temporal';

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

function createSequenceRule(
  id: string,
  pattern: SequencePattern,
  enabled = true
): Rule {
  return {
    id,
    name: `Sequence Rule ${id}`,
    priority: 100,
    enabled,
    version: 1,
    tags: [],
    trigger: { type: 'temporal', pattern },
    conditions: [],
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createAbsenceRule(
  id: string,
  pattern: AbsencePattern,
  enabled = true
): Rule {
  return {
    id,
    name: `Absence Rule ${id}`,
    priority: 100,
    enabled,
    version: 1,
    tags: [],
    trigger: { type: 'temporal', pattern },
    conditions: [],
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createCountRule(
  id: string,
  pattern: CountPattern,
  enabled = true
): Rule {
  return {
    id,
    name: `Count Rule ${id}`,
    priority: 100,
    enabled,
    version: 1,
    tags: [],
    trigger: { type: 'temporal', pattern },
    conditions: [],
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createAggregateRule(
  id: string,
  pattern: AggregatePattern,
  enabled = true
): Rule {
  return {
    id,
    name: `Aggregate Rule ${id}`,
    priority: 100,
    enabled,
    version: 1,
    tags: [],
    trigger: { type: 'temporal', pattern },
    conditions: [],
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

describe('TemporalProcessor', () => {
  let processor: TemporalProcessor;
  let eventStore: EventStore;
  let timerManager: TimerManager;
  let originalDateNow: () => number;
  let currentTime: number;

  beforeEach(async () => {
    originalDateNow = Date.now;
    currentTime = 1000000;
    Date.now = () => currentTime;

    eventStore = await EventStore.start();
    timerManager = await TimerManager.start();
    processor = await TemporalProcessor.start(eventStore, timerManager);
  });

  afterEach(async () => {
    Date.now = originalDateNow;
    processor.clear();
    await timerManager.stop();
  });

  describe('registerRule() and unregisterRule()', () => {
    it('registers rule with temporal trigger', () => {
      const rule = createSequenceRule('rule-1', {
        type: 'sequence',
        events: [{ topic: 'order.created' }],
        within: '5m'
      });

      processor.registerRule(rule);

      expect(processor.getInstancesForRule('rule-1')).toEqual([]);
    });

    it('throws error for non-temporal trigger', () => {
      const rule: Rule = {
        id: 'rule-1',
        name: 'Non-temporal',
        priority: 100,
        enabled: true,
        version: 1,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      expect(() => processor.registerRule(rule)).toThrow('does not have a temporal trigger');
    });

    it('unregisters rule and cleans up instances', async () => {
      const rule = createSequenceRule('rule-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m'
      });

      processor.registerRule(rule);
      await processor.processEvent(createEvent({ topic: 'order.created' }));
      expect(processor.size).toBe(1);

      processor.unregisterRule('rule-1');

      expect(processor.size).toBe(0);
    });
  });

  describe('Sequence Pattern', () => {
    it('matches simple two-event sequence', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'order.created' }));
      expect(matches).toHaveLength(0);
      expect(processor.size).toBe(1);

      await processor.processEvent(createEvent({ topic: 'payment.received' }));
      expect(matches).toHaveLength(1);
      expect(matches[0].ruleId).toBe('seq-1');
      expect(matches[0].matchedEvents).toHaveLength(2);
      expect(processor.size).toBe(0);
    });

    it('matches three-event sequence in order', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.initiated' },
          { topic: 'payment.confirmed' }
        ],
        within: '10m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'order.created' }));
      await processor.processEvent(createEvent({ topic: 'payment.initiated' }));
      expect(matches).toHaveLength(0);

      await processor.processEvent(createEvent({ topic: 'payment.confirmed' }));
      expect(matches).toHaveLength(1);
    });

    it('does not match events out of order', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'payment.received' }));
      await processor.processEvent(createEvent({ topic: 'order.created' }));

      expect(matches).toHaveLength(0);
    });

    it('respects groupBy for separate sequences', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m',
        groupBy: 'orderId'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      await processor.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-2' }
      }));

      expect(processor.size).toBe(2);

      await processor.processEvent(createEvent({
        topic: 'payment.received',
        data: { orderId: 'order-1' }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].groupKey).toBe('order-1');
      expect(processor.size).toBe(1);
    });

    it('expires sequence on strict mode with intervening event', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m',
        strict: true
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'order.created' }));
      await processor.processEvent(createEvent({ topic: 'order.cancelled' }));
      await processor.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matches).toHaveLength(0);
      expect(processor.size).toBe(0);
    });

    it('matches single-event sequence immediately', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [{ topic: 'alert.triggered' }],
        within: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'alert.triggered' }));

      expect(matches).toHaveLength(1);
      expect(processor.size).toBe(0);
    });

    it('applies event filter in sequence', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.status', filter: { status: 'pending' } },
          { topic: 'order.status', filter: { status: 'confirmed' } }
        ],
        within: '5m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'pending' }
      }));
      await processor.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'cancelled' }
      }));

      expect(matches).toHaveLength(0);

      await processor.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'confirmed' }
      }));

      expect(matches).toHaveLength(1);
    });
  });

  describe('Absence Pattern', () => {
    it('triggers on timeout when expected event not received', async () => {
      const rule = createAbsenceRule('abs-1', {
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' },
        within: '15m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'order.created' }));
      expect(processor.size).toBe(1);
      expect(matches).toHaveLength(0);

      const instances = processor.getActiveInstances();
      const match = await processor.handleTimeout(instances[0].id);

      expect(match).toBeDefined();
      expect(match!.ruleId).toBe('abs-1');
      expect(processor.size).toBe(0);
    });

    it('does not trigger when expected event received in time', async () => {
      const rule = createAbsenceRule('abs-1', {
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' },
        within: '15m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'order.created' }));
      await processor.processEvent(createEvent({ topic: 'payment.received' }));

      expect(processor.size).toBe(0);
      expect(matches).toHaveLength(0);
    });

    it('respects groupBy for separate absence tracking', async () => {
      const rule = createAbsenceRule('abs-1', {
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' },
        within: '15m',
        groupBy: 'orderId'
      });

      processor.registerRule(rule);

      await processor.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      await processor.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-2' }
      }));

      expect(processor.size).toBe(2);

      await processor.processEvent(createEvent({
        topic: 'payment.received',
        data: { orderId: 'order-1' }
      }));

      expect(processor.size).toBe(1);
      const remaining = processor.getActiveInstances();
      expect(remaining[0].groupKey).toBe('order-2');
    });

    it('does not create instance for expected event first', async () => {
      const rule = createAbsenceRule('abs-1', {
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' },
        within: '15m'
      });

      processor.registerRule(rule);

      await processor.processEvent(createEvent({ topic: 'payment.received' }));

      expect(processor.size).toBe(0);
    });
  });

  describe('Count Pattern', () => {
    it('matches when threshold is met', async () => {
      const rule = createCountRule('cnt-1', {
        type: 'count',
        event: { topic: 'api.error' },
        threshold: 3,
        comparison: 'gte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      const event1 = createEvent({ topic: 'api.error', timestamp: currentTime - 30000 });
      const event2 = createEvent({ topic: 'api.error', timestamp: currentTime - 20000 });
      const event3 = createEvent({ topic: 'api.error', timestamp: currentTime - 10000 });

      eventStore.store(event1);
      eventStore.store(event2);

      await processor.processEvent(event3);

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(3);
    });

    it('does not match below threshold', async () => {
      const rule = createCountRule('cnt-1', {
        type: 'count',
        event: { topic: 'api.error' },
        threshold: 5,
        comparison: 'gte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      const event1 = createEvent({ topic: 'api.error', timestamp: currentTime - 30000 });
      const event2 = createEvent({ topic: 'api.error', timestamp: currentTime - 10000 });

      eventStore.store(event1);
      await processor.processEvent(event2);

      expect(matches).toHaveLength(0);
    });

    it('supports lte comparison', async () => {
      const rule = createCountRule('cnt-1', {
        type: 'count',
        event: { topic: 'api.success' },
        threshold: 2,
        comparison: 'lte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      const event = createEvent({ topic: 'api.success', timestamp: currentTime - 10000 });
      eventStore.store(event);
      await processor.processEvent(createEvent({ topic: 'api.success' }));

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(2);
    });

    it('supports eq comparison', async () => {
      const rule = createCountRule('cnt-1', {
        type: 'count',
        event: { topic: 'api.call' },
        threshold: 2,
        comparison: 'eq',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      const event1 = createEvent({ topic: 'api.call', timestamp: currentTime - 10000 });
      eventStore.store(event1);
      await processor.processEvent(createEvent({ topic: 'api.call' }));

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(2);
    });

    it('respects groupBy for separate counting', async () => {
      const rule = createCountRule('cnt-1', {
        type: 'count',
        event: { topic: 'login.failed' },
        threshold: 2,
        comparison: 'gte',
        window: '1m',
        groupBy: 'userId'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      const user1Event1 = createEvent({
        topic: 'login.failed',
        data: { userId: 'user-1' },
        timestamp: currentTime - 30000
      });
      const user1Event2 = createEvent({
        topic: 'login.failed',
        data: { userId: 'user-1' },
        timestamp: currentTime - 10000
      });
      const user2Event1 = createEvent({
        topic: 'login.failed',
        data: { userId: 'user-2' },
        timestamp: currentTime - 20000
      });

      eventStore.store(user1Event1);
      eventStore.store(user2Event1);
      await processor.processEvent(user1Event2);

      expect(matches).toHaveLength(1);
      expect(matches[0].groupKey).toBe('user-1');
    });

    it('applies event filter', async () => {
      const rule = createCountRule('cnt-1', {
        type: 'count',
        event: { topic: 'api.error', filter: { code: 500 } },
        threshold: 2,
        comparison: 'gte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      const error500 = createEvent({
        topic: 'api.error',
        data: { code: 500 },
        timestamp: currentTime - 10000
      });
      const error404 = createEvent({
        topic: 'api.error',
        data: { code: 404 },
        timestamp: currentTime - 5000
      });

      eventStore.store(error500);
      eventStore.store(error404);
      await processor.processEvent(createEvent({
        topic: 'api.error',
        data: { code: 500 }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(2);
    });

    it('only counts events within time window', async () => {
      const rule = createCountRule('cnt-1', {
        type: 'count',
        event: { topic: 'api.error' },
        threshold: 3,
        comparison: 'gte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      const oldEvent = createEvent({
        topic: 'api.error',
        timestamp: currentTime - 120000 // 2 min ago, outside window
      });
      const recentEvent = createEvent({
        topic: 'api.error',
        timestamp: currentTime - 30000
      });

      eventStore.store(oldEvent);
      eventStore.store(recentEvent);
      await processor.processEvent(createEvent({ topic: 'api.error' }));

      expect(matches).toHaveLength(0);
    });
  });

  describe('Aggregate Pattern', () => {
    it('matches when sum exceeds threshold', async () => {
      const rule = createAggregateRule('agg-1', {
        type: 'aggregate',
        event: { topic: 'order.placed' },
        field: 'amount',
        function: 'sum',
        threshold: 1000,
        comparison: 'gte',
        window: '1h'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      eventStore.store(createEvent({
        topic: 'order.placed',
        data: { amount: 500 },
        timestamp: currentTime - 60000
      }));
      eventStore.store(createEvent({
        topic: 'order.placed',
        data: { amount: 300 },
        timestamp: currentTime - 30000
      }));
      await processor.processEvent(createEvent({
        topic: 'order.placed',
        data: { amount: 250 }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].aggregateValue).toBe(1050);
    });

    it('calculates average correctly', async () => {
      const rule = createAggregateRule('agg-1', {
        type: 'aggregate',
        event: { topic: 'response.time' },
        field: 'ms',
        function: 'avg',
        threshold: 100,
        comparison: 'gte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      eventStore.store(createEvent({
        topic: 'response.time',
        data: { ms: 80 },
        timestamp: currentTime - 30000
      }));
      eventStore.store(createEvent({
        topic: 'response.time',
        data: { ms: 120 },
        timestamp: currentTime - 20000
      }));
      await processor.processEvent(createEvent({
        topic: 'response.time',
        data: { ms: 110 }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].aggregateValue).toBeCloseTo(103.33, 1);
    });

    it('finds minimum value', async () => {
      const rule = createAggregateRule('agg-1', {
        type: 'aggregate',
        event: { topic: 'stock.price' },
        field: 'price',
        function: 'min',
        threshold: 50,
        comparison: 'lte',
        window: '1h'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      eventStore.store(createEvent({
        topic: 'stock.price',
        data: { price: 100 },
        timestamp: currentTime - 60000
      }));
      eventStore.store(createEvent({
        topic: 'stock.price',
        data: { price: 45 },
        timestamp: currentTime - 30000
      }));
      await processor.processEvent(createEvent({
        topic: 'stock.price',
        data: { price: 80 }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].aggregateValue).toBe(45);
    });

    it('finds maximum value', async () => {
      const rule = createAggregateRule('agg-1', {
        type: 'aggregate',
        event: { topic: 'cpu.usage' },
        field: 'percent',
        function: 'max',
        threshold: 90,
        comparison: 'gte',
        window: '5m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      eventStore.store(createEvent({
        topic: 'cpu.usage',
        data: { percent: 75 },
        timestamp: currentTime - 60000
      }));
      eventStore.store(createEvent({
        topic: 'cpu.usage',
        data: { percent: 95 },
        timestamp: currentTime - 30000
      }));
      await processor.processEvent(createEvent({
        topic: 'cpu.usage',
        data: { percent: 85 }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].aggregateValue).toBe(95);
    });

    it('counts events with count function', async () => {
      const rule = createAggregateRule('agg-1', {
        type: 'aggregate',
        event: { topic: 'page.view' },
        field: 'sessionId',
        function: 'count',
        threshold: 3,
        comparison: 'gte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      eventStore.store(createEvent({
        topic: 'page.view',
        data: { sessionId: 'abc' },
        timestamp: currentTime - 30000
      }));
      eventStore.store(createEvent({
        topic: 'page.view',
        data: { sessionId: 'abc' },
        timestamp: currentTime - 20000
      }));
      await processor.processEvent(createEvent({
        topic: 'page.view',
        data: { sessionId: 'abc' }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].aggregateValue).toBe(3);
    });

    it('respects groupBy for separate aggregation', async () => {
      const rule = createAggregateRule('agg-1', {
        type: 'aggregate',
        event: { topic: 'purchase' },
        field: 'amount',
        function: 'sum',
        threshold: 100,
        comparison: 'gte',
        window: '1h',
        groupBy: 'customerId'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      eventStore.store(createEvent({
        topic: 'purchase',
        data: { customerId: 'cust-1', amount: 50 },
        timestamp: currentTime - 60000
      }));
      eventStore.store(createEvent({
        topic: 'purchase',
        data: { customerId: 'cust-2', amount: 80 },
        timestamp: currentTime - 30000
      }));
      await processor.processEvent(createEvent({
        topic: 'purchase',
        data: { customerId: 'cust-1', amount: 60 }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].groupKey).toBe('cust-1');
      expect(matches[0].aggregateValue).toBe(110);
    });

    it('ignores non-numeric values', async () => {
      const rule = createAggregateRule('agg-1', {
        type: 'aggregate',
        event: { topic: 'data' },
        field: 'value',
        function: 'sum',
        threshold: 10,
        comparison: 'gte',
        window: '1m'
      });

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      eventStore.store(createEvent({
        topic: 'data',
        data: { value: 'not a number' },
        timestamp: currentTime - 30000
      }));
      eventStore.store(createEvent({
        topic: 'data',
        data: { value: 15 },
        timestamp: currentTime - 20000
      }));
      await processor.processEvent(createEvent({
        topic: 'data',
        data: { value: null }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].aggregateValue).toBe(15);
    });
  });

  describe('Disabled rules', () => {
    it('does not process events for disabled rules', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [{ topic: 'order.created' }],
        within: '5m'
      }, false);

      processor.registerRule(rule);
      const matches: PatternMatch[] = [];
      processor.onMatch(m => { matches.push(m); });

      await processor.processEvent(createEvent({ topic: 'order.created' }));

      expect(matches).toHaveLength(0);
      expect(processor.size).toBe(0);
    });
  });

  describe('clear()', () => {
    it('removes all active instances', async () => {
      const rule = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m'
      });

      processor.registerRule(rule);
      await processor.processEvent(createEvent({ topic: 'order.created' }));
      await processor.processEvent(createEvent({ topic: 'order.created' }));

      expect(processor.size).toBeGreaterThan(0);

      processor.clear();

      expect(processor.size).toBe(0);
    });
  });

  describe('getActiveInstances()', () => {
    it('returns all active pattern instances', async () => {
      const rule1 = createSequenceRule('seq-1', {
        type: 'sequence',
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m'
      });
      const rule2 = createAbsenceRule('abs-1', {
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' },
        within: '15m'
      });

      processor.registerRule(rule1);
      processor.registerRule(rule2);

      await processor.processEvent(createEvent({ topic: 'order.created' }));

      const instances = processor.getActiveInstances();
      expect(instances).toHaveLength(2);
    });
  });
});
