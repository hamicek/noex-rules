import { describe, it, expect, beforeEach } from 'vitest';
import {
  AggregateMatcher,
  type AggregateMatch,
  type AggregateInstance,
  eventMatchesAggregateMatcher,
  compareAggregateThreshold,
  computeAggregate,
  isValidAggregateFunction,
  extractNumericValues,
  calculateAggregateTumblingWindowStart,
  isInAggregateWindow,
  filterEventsInAggregateWindow,
  AGGREGATE_FUNCTIONS
} from '../../../src/patterns/aggregate';
import type { Event } from '../../../src/types/event';
import type { AggregatePattern, EventMatcher } from '../../../src/types/temporal';

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

function createPattern(overrides: Partial<AggregatePattern> = {}): AggregatePattern {
  return {
    type: 'aggregate',
    event: { topic: 'order.paid' },
    field: 'amount',
    function: 'sum',
    threshold: 1000,
    comparison: 'gte',
    window: '5m',
    ...overrides
  };
}

describe('AggregateMatcher', () => {
  let matcher: AggregateMatcher;
  let currentTime: number;
  let matches: AggregateMatch[];

  beforeEach(() => {
    currentTime = 1000000;
    matches = [];
    matcher = new AggregateMatcher({
      onMatch: (m) => { matches.push(m); },
      now: () => currentTime
    });
  });

  describe('addPattern() and removePattern()', () => {
    it('adds a valid aggregate pattern', () => {
      const pattern = createPattern();

      matcher.addPattern('p1', pattern);

      expect(matcher.getInstancesForPattern('p1')).toEqual([]);
    });

    it('throws error for non-aggregate pattern type', () => {
      const pattern = { type: 'sequence', events: [{ topic: 'x' }], within: '1m' } as any;

      expect(() => matcher.addPattern('p1', pattern)).toThrow('Expected aggregate pattern');
    });

    it('throws error for missing field', () => {
      const pattern = createPattern({ field: '' });

      expect(() => matcher.addPattern('p1', pattern)).toThrow('Field must be specified');
    });

    it('throws error for invalid aggregate function', () => {
      const pattern = createPattern({ function: 'invalid' as any });

      expect(() => matcher.addPattern('p1', pattern)).toThrow('Invalid aggregate function');
    });

    it('removes pattern and cleans up instances', async () => {
      const pattern = createPattern();

      matcher.addPattern('p1', pattern);
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 100 },
        timestamp: currentTime
      }));
      expect(matcher.size).toBe(1);

      const removed = matcher.removePattern('p1');

      expect(removed).toBe(true);
      expect(matcher.size).toBe(0);
    });

    it('returns false when removing non-existent pattern', () => {
      const removed = matcher.removePattern('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Sliding window - SUM aggregation', () => {
    beforeEach(() => {
      matcher.addPattern('revenue', createPattern({
        event: { topic: 'order.paid' },
        field: 'amount',
        function: 'sum',
        threshold: 1000,
        comparison: 'gte',
        window: '5m'
      }));
    });

    it('does not match when sum is below threshold', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 400 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(0);
    });

    it('matches when sum reaches threshold', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 400 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(1000);
    });

    it('matches when sum exceeds threshold', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 1500 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(1500);
    });

    it('ignores events that do not match topic', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { amount: 5000 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(0);
    });

    it('ignores events with non-numeric field values', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 'not-a-number' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: null },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: {},
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(0);
    });
  });

  describe('Sliding window - AVG aggregation', () => {
    beforeEach(() => {
      matcher.addPattern('avg-order', createPattern({
        event: { topic: 'order.paid' },
        field: 'amount',
        function: 'avg',
        threshold: 500,
        comparison: 'gte',
        window: '5m'
      }));
    });

    it('calculates average correctly', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 400 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 600 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(500);
    });

    it('does not match when average is below threshold', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 100 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 200 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(0);
    });
  });

  describe('Sliding window - MIN aggregation', () => {
    beforeEach(() => {
      matcher.addPattern('min-check', createPattern({
        event: { topic: 'sensor.reading' },
        field: 'temperature',
        function: 'min',
        threshold: -10,
        comparison: 'lte',
        window: '5m'
      }));
    });

    it('finds minimum value correctly', async () => {
      await matcher.processEvent(createEvent({
        topic: 'sensor.reading',
        data: { temperature: 20 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(0);

      await matcher.processEvent(createEvent({
        topic: 'sensor.reading',
        data: { temperature: -5 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(0); // min=-5, threshold=-10, -5 > -10

      await matcher.processEvent(createEvent({
        topic: 'sensor.reading',
        data: { temperature: -15 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(-15);
    });
  });

  describe('Sliding window - MAX aggregation', () => {
    beforeEach(() => {
      matcher.addPattern('max-check', createPattern({
        event: { topic: 'sensor.reading' },
        field: 'temperature',
        function: 'max',
        threshold: 100,
        comparison: 'gte',
        window: '5m'
      }));
    });

    it('finds maximum value correctly', async () => {
      await matcher.processEvent(createEvent({
        topic: 'sensor.reading',
        data: { temperature: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(0);

      await matcher.processEvent(createEvent({
        topic: 'sensor.reading',
        data: { temperature: 105 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(105);

      // Additional event keeps max at 105
      await matcher.processEvent(createEvent({
        topic: 'sensor.reading',
        data: { temperature: 80 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(2); // Triggers again as max still >= threshold
    });
  });

  describe('Sliding window - COUNT aggregation', () => {
    beforeEach(() => {
      matcher.addPattern('count-check', createPattern({
        event: { topic: 'user.action' },
        field: 'actionId',
        function: 'count',
        threshold: 3,
        comparison: 'gte',
        window: '5m'
      }));
    });

    it('counts events correctly', async () => {
      await matcher.processEvent(createEvent({
        topic: 'user.action',
        data: { actionId: 1 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'user.action',
        data: { actionId: 2 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'user.action',
        data: { actionId: 3 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(3);
    });

    it('does not count events without numeric values', async () => {
      await matcher.processEvent(createEvent({
        topic: 'user.action',
        data: { actionId: 'a' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'user.action',
        data: { actionId: 'b' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'user.action',
        data: { actionId: 'c' },
        timestamp: currentTime
      }));

      // count function counts only numeric values extracted from field
      // Since actionId values are strings, count is 0 which is < threshold 3
      expect(matches).toHaveLength(0);
    });
  });

  describe('Sliding window - time-based pruning', () => {
    beforeEach(() => {
      matcher.addPattern('revenue', createPattern({
        event: { topic: 'order.paid' },
        field: 'amount',
        function: 'sum',
        threshold: 1000,
        comparison: 'gte',
        window: '5m'
      }));
    });

    it('prunes old events outside window', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 600 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime + 1000
      }));

      // Advance time past window
      currentTime += 6 * 60 * 1000;

      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 200 },
        timestamp: currentTime
      }));

      // Should not match because old events are pruned
      expect(matches).toHaveLength(0);
    });

    it('keeps events within window', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 600 },
        timestamp: currentTime
      }));

      // Advance time but stay within window
      currentTime += 4 * 60 * 1000;

      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 500 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(1100);
    });
  });

  describe('Comparison operators', () => {
    it('gte - matches when value >= threshold', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 100,
        comparison: 'gte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(0);

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(1);
    });

    it('lte - matches when value <= threshold', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 100,
        comparison: 'lte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(1);

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(2);

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(2); // No new match, sum > threshold
    });

    it('eq - matches only when value == threshold', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 100,
        comparison: 'eq',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(0);

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(1);

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 50 },
        timestamp: currentTime
      }));
      expect(matches).toHaveLength(1); // No new match, sum > threshold
    });
  });

  describe('groupBy', () => {
    beforeEach(() => {
      matcher.addPattern('revenue-by-region', createPattern({
        event: { topic: 'order.paid' },
        field: 'amount',
        function: 'sum',
        threshold: 500,
        comparison: 'gte',
        window: '5m',
        groupBy: 'region'
      }));
    });

    it('creates separate instances for different groups', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 100, region: 'east' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 100, region: 'west' },
        timestamp: currentTime
      }));

      expect(matcher.size).toBe(2);
    });

    it('aggregates values separately per group', async () => {
      // East region: 600
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300, region: 'east' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300, region: 'east' },
        timestamp: currentTime
      }));

      // West region: 400
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 200, region: 'west' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 200, region: 'west' },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].groupKey).toBe('east');
      expect(matches[0].value).toBe(600);
    });
  });

  describe('Event filter', () => {
    beforeEach(() => {
      matcher.addPattern('premium-revenue', createPattern({
        event: {
          topic: 'order.paid',
          filter: { tier: 'premium' }
        },
        field: 'amount',
        function: 'sum',
        threshold: 500,
        comparison: 'gte',
        window: '5m'
      }));
    });

    it('aggregates only events matching filter', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300, tier: 'premium' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 1000, tier: 'basic' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300, tier: 'premium' },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(600);
    });
  });

  describe('Tumbling window', () => {
    beforeEach(() => {
      const windowMs = 5 * 60 * 1000; // 5 minutes
      currentTime = Math.floor(1000000 / windowMs) * windowMs; // Align to window boundary

      matcher.addPattern('hourly-revenue', createPattern({
        event: { topic: 'order.paid' },
        field: 'amount',
        function: 'sum',
        threshold: 500,
        comparison: 'gte',
        window: '5m'
      } as AggregatePattern & { sliding: boolean }));

      // Re-create with sliding: false
      matcher.reset();
      matcher.addPattern('hourly-revenue', {
        ...createPattern({
          event: { topic: 'order.paid' },
          field: 'amount',
          function: 'sum',
          threshold: 500,
          comparison: 'gte',
          window: '5m'
        }),
        sliding: false
      } as any);
    });

    it('accumulates events in window without triggering immediately', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime
      }));

      // Tumbling window does not trigger immediately
      expect(matches).toHaveLength(0);
    });

    it('triggers match when window ends via handleWindowEnd', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300 },
        timestamp: currentTime + 1000
      }));

      const instances = matcher.getActiveInstances();
      expect(instances).toHaveLength(1);

      const match = await matcher.handleWindowEnd(instances[0].id);

      expect(match).toBeDefined();
      expect(match!.value).toBe(600);
      expect(matches).toHaveLength(1);
    });

    it('does not match when threshold not met at window end', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 100 },
        timestamp: currentTime
      }));

      const instances = matcher.getActiveInstances();
      const match = await matcher.handleWindowEnd(instances[0].id);

      expect(match).toBeUndefined();
      expect(matches).toHaveLength(0);
    });
  });

  describe('Nested field access', () => {
    beforeEach(() => {
      matcher.addPattern('nested-sum', createPattern({
        event: { topic: 'transaction' },
        field: 'payment.amount',
        function: 'sum',
        threshold: 1000,
        comparison: 'gte',
        window: '5m'
      }));
    });

    it('extracts values from nested fields', async () => {
      await matcher.processEvent(createEvent({
        topic: 'transaction',
        data: { payment: { amount: 500 } },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'transaction',
        data: { payment: { amount: 600 } },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(1100);
    });
  });

  describe('Wildcard topics', () => {
    it('matches events with wildcard topic pattern', async () => {
      matcher.addPattern('all-errors', createPattern({
        event: { topic: 'error.*' },
        field: 'severity',
        function: 'max',
        threshold: 5,
        comparison: 'gte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'error.database',
        data: { severity: 3 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'error.network',
        data: { severity: 7 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].value).toBe(7);
    });
  });

  describe('Multiple patterns', () => {
    it('processes events for multiple patterns independently', async () => {
      matcher.addPattern('sum-check', createPattern({
        event: { topic: 'metric' },
        field: 'value',
        function: 'sum',
        threshold: 100,
        comparison: 'gte',
        window: '5m'
      }));
      matcher.addPattern('avg-check', createPattern({
        event: { topic: 'metric' },
        field: 'value',
        function: 'avg',
        threshold: 50,
        comparison: 'gte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'metric',
        data: { value: 60 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'metric',
        data: { value: 60 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(3); // sum=60 (avg match), sum=120 (sum+avg match)
    });
  });

  describe('clear() and reset()', () => {
    it('clear() removes all instances but keeps patterns', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 1000,
        comparison: 'gte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100 },
        timestamp: currentTime
      }));
      expect(matcher.size).toBe(1);

      matcher.clear();

      expect(matcher.size).toBe(0);
      // Pattern still exists
      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100 },
        timestamp: currentTime
      }));
      expect(matcher.size).toBe(1);
    });

    it('reset() removes all instances and patterns', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 1000,
        comparison: 'gte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100 },
        timestamp: currentTime
      }));
      expect(matcher.size).toBe(1);

      matcher.reset();

      expect(matcher.size).toBe(0);
      // Pattern no longer exists
      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100 },
        timestamp: currentTime
      }));
      expect(matcher.size).toBe(0);
    });
  });

  describe('getActiveInstances()', () => {
    it('returns all active instances', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 10000,
        comparison: 'gte',
        window: '5m',
        groupBy: 'type'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100, type: 'A' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100, type: 'B' },
        timestamp: currentTime
      }));

      const instances = matcher.getActiveInstances();
      expect(instances).toHaveLength(2);
    });
  });

  describe('getInstancesForPattern()', () => {
    it('returns instances for specific pattern', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 10000,
        comparison: 'gte',
        window: '5m',
        groupBy: 'type'
      }));
      matcher.addPattern('p2', createPattern({
        event: { topic: 'other' },
        field: 'value',
        function: 'sum',
        threshold: 10000,
        comparison: 'gte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100, type: 'A' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'other',
        data: { value: 100 },
        timestamp: currentTime
      }));

      const p1Instances = matcher.getInstancesForPattern('p1');
      const p2Instances = matcher.getInstancesForPattern('p2');

      expect(p1Instances).toHaveLength(1);
      expect(p2Instances).toHaveLength(1);
    });

    it('returns empty array for non-existent pattern', () => {
      const instances = matcher.getInstancesForPattern('non-existent');
      expect(instances).toEqual([]);
    });
  });

  describe('getInstance()', () => {
    it('returns instance by ID', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        field: 'value',
        function: 'sum',
        threshold: 10000,
        comparison: 'gte',
        window: '5m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100 },
        timestamp: currentTime
      }));

      const instances = matcher.getActiveInstances();
      const instance = matcher.getInstance(instances[0].id);

      expect(instance).toBeDefined();
      expect(instance!.id).toBe(instances[0].id);
    });

    it('returns undefined for non-existent ID', () => {
      const instance = matcher.getInstance('non-existent');
      expect(instance).toBeUndefined();
    });
  });

  describe('Match result structure', () => {
    it('includes all required fields in match result', async () => {
      matcher.addPattern('revenue-tracker', createPattern({
        event: { topic: 'order.paid' },
        field: 'amount',
        function: 'sum',
        threshold: 500,
        comparison: 'gte',
        window: '5m',
        groupBy: 'region'
      }));

      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300, region: 'europe' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.paid',
        data: { amount: 300, region: 'europe' },
        timestamp: currentTime + 1000
      }));

      expect(matches).toHaveLength(1);
      const match = matches[0];

      expect(match.instanceId).toBeDefined();
      expect(match.patternId).toBe('revenue-tracker');
      expect(match.pattern.type).toBe('aggregate');
      expect(match.pattern.function).toBe('sum');
      expect(match.value).toBe(600);
      expect(match.events).toHaveLength(2);
      expect(match.groupKey).toBe('europe');
    });
  });

  describe('onWindowExpire callback', () => {
    it('calls onWindowExpire when tumbling window expires without match', async () => {
      const expiredInstances: AggregateInstance[] = [];
      matcher = new AggregateMatcher({
        onMatch: (m) => { matches.push(m); },
        onWindowExpire: (inst) => { expiredInstances.push(inst); },
        now: () => currentTime
      });

      matcher.addPattern('p1', {
        ...createPattern({
          event: { topic: 'event' },
          field: 'value',
          function: 'sum',
          threshold: 10000,
          comparison: 'gte',
          window: '5m'
        }),
        sliding: false
      } as any);

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { value: 100 },
        timestamp: currentTime
      }));

      const instances = matcher.getActiveInstances();
      await matcher.handleWindowEnd(instances[0].id);

      expect(matches).toHaveLength(0);
      expect(expiredInstances).toHaveLength(1);
      expect(expiredInstances[0].events).toHaveLength(1);
    });
  });
});

describe('Pure functions', () => {
  describe('AGGREGATE_FUNCTIONS', () => {
    it('contains all supported functions', () => {
      expect(AGGREGATE_FUNCTIONS).toContain('sum');
      expect(AGGREGATE_FUNCTIONS).toContain('avg');
      expect(AGGREGATE_FUNCTIONS).toContain('min');
      expect(AGGREGATE_FUNCTIONS).toContain('max');
      expect(AGGREGATE_FUNCTIONS).toContain('count');
      expect(AGGREGATE_FUNCTIONS).toHaveLength(5);
    });
  });

  describe('isValidAggregateFunction()', () => {
    it('returns true for valid functions', () => {
      expect(isValidAggregateFunction('sum')).toBe(true);
      expect(isValidAggregateFunction('avg')).toBe(true);
      expect(isValidAggregateFunction('min')).toBe(true);
      expect(isValidAggregateFunction('max')).toBe(true);
      expect(isValidAggregateFunction('count')).toBe(true);
    });

    it('returns false for invalid functions', () => {
      expect(isValidAggregateFunction('median')).toBe(false);
      expect(isValidAggregateFunction('mode')).toBe(false);
      expect(isValidAggregateFunction('')).toBe(false);
    });
  });

  describe('computeAggregate()', () => {
    describe('sum', () => {
      it('returns sum of values', () => {
        expect(computeAggregate([1, 2, 3, 4, 5], 'sum')).toBe(15);
      });

      it('returns 0 for empty array', () => {
        expect(computeAggregate([], 'sum')).toBe(0);
      });

      it('handles negative values', () => {
        expect(computeAggregate([-1, -2, 3], 'sum')).toBe(0);
      });

      it('handles decimal values', () => {
        expect(computeAggregate([1.5, 2.5, 3.0], 'sum')).toBe(7);
      });
    });

    describe('avg', () => {
      it('returns average of values', () => {
        expect(computeAggregate([2, 4, 6], 'avg')).toBe(4);
      });

      it('returns 0 for empty array', () => {
        expect(computeAggregate([], 'avg')).toBe(0);
      });

      it('handles single value', () => {
        expect(computeAggregate([42], 'avg')).toBe(42);
      });
    });

    describe('min', () => {
      it('returns minimum value', () => {
        expect(computeAggregate([5, 2, 8, 1, 9], 'min')).toBe(1);
      });

      it('returns Infinity for empty array', () => {
        expect(computeAggregate([], 'min')).toBe(Infinity);
      });

      it('handles negative values', () => {
        expect(computeAggregate([-5, -2, -8], 'min')).toBe(-8);
      });
    });

    describe('max', () => {
      it('returns maximum value', () => {
        expect(computeAggregate([5, 2, 8, 1, 9], 'max')).toBe(9);
      });

      it('returns -Infinity for empty array', () => {
        expect(computeAggregate([], 'max')).toBe(-Infinity);
      });

      it('handles negative values', () => {
        expect(computeAggregate([-5, -2, -8], 'max')).toBe(-2);
      });
    });

    describe('count', () => {
      it('returns count of values', () => {
        expect(computeAggregate([1, 2, 3, 4, 5], 'count')).toBe(5);
      });

      it('returns 0 for empty array', () => {
        expect(computeAggregate([], 'count')).toBe(0);
      });
    });
  });

  describe('eventMatchesAggregateMatcher()', () => {
    it('matches event with topic', () => {
      const event = createEvent({ topic: 'order.paid' });
      const matcher: EventMatcher = { topic: 'order.paid' };

      expect(eventMatchesAggregateMatcher(event, matcher)).toBe(true);
    });

    it('matches event with wildcard topic', () => {
      const event = createEvent({ topic: 'order.paid' });
      const matcher: EventMatcher = { topic: 'order.*' };

      expect(eventMatchesAggregateMatcher(event, matcher)).toBe(true);
    });

    it('does not match different topic', () => {
      const event = createEvent({ topic: 'order.paid' });
      const matcher: EventMatcher = { topic: 'payment.received' };

      expect(eventMatchesAggregateMatcher(event, matcher)).toBe(false);
    });

    it('matches event with filter', () => {
      const event = createEvent({
        topic: 'order.paid',
        data: { tier: 'premium' }
      });
      const matcher: EventMatcher = {
        topic: 'order.paid',
        filter: { tier: 'premium' }
      };

      expect(eventMatchesAggregateMatcher(event, matcher)).toBe(true);
    });

    it('does not match when filter fails', () => {
      const event = createEvent({
        topic: 'order.paid',
        data: { tier: 'basic' }
      });
      const matcher: EventMatcher = {
        topic: 'order.paid',
        filter: { tier: 'premium' }
      };

      expect(eventMatchesAggregateMatcher(event, matcher)).toBe(false);
    });
  });

  describe('compareAggregateThreshold()', () => {
    it('gte - returns true when value >= threshold', () => {
      expect(compareAggregateThreshold(100, 100, 'gte')).toBe(true);
      expect(compareAggregateThreshold(150, 100, 'gte')).toBe(true);
      expect(compareAggregateThreshold(50, 100, 'gte')).toBe(false);
    });

    it('lte - returns true when value <= threshold', () => {
      expect(compareAggregateThreshold(100, 100, 'lte')).toBe(true);
      expect(compareAggregateThreshold(50, 100, 'lte')).toBe(true);
      expect(compareAggregateThreshold(150, 100, 'lte')).toBe(false);
    });

    it('eq - returns true when value == threshold', () => {
      expect(compareAggregateThreshold(100, 100, 'eq')).toBe(true);
      expect(compareAggregateThreshold(50, 100, 'eq')).toBe(false);
      expect(compareAggregateThreshold(150, 100, 'eq')).toBe(false);
    });
  });

  describe('extractNumericValues()', () => {
    it('extracts numeric values from events', () => {
      const events: Event[] = [
        createEvent({ data: { amount: 100 } }),
        createEvent({ data: { amount: 200 } }),
        createEvent({ data: { amount: 300 } })
      ];

      expect(extractNumericValues(events, 'amount')).toEqual([100, 200, 300]);
    });

    it('filters out non-numeric values', () => {
      const events: Event[] = [
        createEvent({ data: { amount: 100 } }),
        createEvent({ data: { amount: 'not-a-number' } }),
        createEvent({ data: { amount: null } }),
        createEvent({ data: { amount: 200 } }),
        createEvent({ data: {} })
      ];

      expect(extractNumericValues(events, 'amount')).toEqual([100, 200]);
    });

    it('returns empty array when no numeric values', () => {
      const events: Event[] = [
        createEvent({ data: { amount: 'a' } }),
        createEvent({ data: { amount: 'b' } })
      ];

      expect(extractNumericValues(events, 'amount')).toEqual([]);
    });
  });

  describe('calculateAggregateTumblingWindowStart()', () => {
    it('aligns timestamp to window boundary', () => {
      const windowMs = 5 * 60 * 1000; // 5 minutes

      expect(calculateAggregateTumblingWindowStart(0, windowMs)).toBe(0);
      expect(calculateAggregateTumblingWindowStart(100000, windowMs)).toBe(0);
      expect(calculateAggregateTumblingWindowStart(300000, windowMs)).toBe(300000);
      expect(calculateAggregateTumblingWindowStart(400000, windowMs)).toBe(300000);
      expect(calculateAggregateTumblingWindowStart(600000, windowMs)).toBe(600000);
    });
  });

  describe('isInAggregateWindow()', () => {
    it('returns true when timestamp is within window', () => {
      expect(isInAggregateWindow(150, 100, 200)).toBe(true);
      expect(isInAggregateWindow(100, 100, 200)).toBe(true);
    });

    it('returns false when timestamp is at window end', () => {
      expect(isInAggregateWindow(200, 100, 200)).toBe(false);
    });

    it('returns false when timestamp is outside window', () => {
      expect(isInAggregateWindow(50, 100, 200)).toBe(false);
      expect(isInAggregateWindow(250, 100, 200)).toBe(false);
    });
  });

  describe('filterEventsInAggregateWindow()', () => {
    it('filters events within time window', () => {
      const events: Event[] = [
        createEvent({ timestamp: 50 }),
        createEvent({ timestamp: 100 }),
        createEvent({ timestamp: 150 }),
        createEvent({ timestamp: 200 }),
        createEvent({ timestamp: 250 })
      ];

      const filtered = filterEventsInAggregateWindow(events, 100, 200);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].timestamp).toBe(100);
      expect(filtered[1].timestamp).toBe(150);
    });

    it('returns empty array when no events in window', () => {
      const events: Event[] = [
        createEvent({ timestamp: 50 }),
        createEvent({ timestamp: 300 })
      ];

      const filtered = filterEventsInAggregateWindow(events, 100, 200);

      expect(filtered).toHaveLength(0);
    });
  });
});
