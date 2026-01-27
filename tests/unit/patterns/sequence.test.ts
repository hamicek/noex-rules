import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SequenceMatcher,
  type SequenceMatch,
  type SequenceInstance,
  eventMatchesMatcher,
  isSequenceComplete,
  getNextMatcherIndex,
  isInstanceExpired,
  calculateExpiresAt
} from '../../../src/patterns/sequence';
import type { Event } from '../../../src/types/event';
import type { SequencePattern, EventMatcher } from '../../../src/types/temporal';

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

function createPattern(overrides: Partial<SequencePattern> = {}): SequencePattern {
  return {
    type: 'sequence',
    events: [{ topic: 'test.event' }],
    within: '5m',
    ...overrides
  };
}

describe('SequenceMatcher', () => {
  let matcher: SequenceMatcher;
  let currentTime: number;
  let matches: SequenceMatch[];

  beforeEach(() => {
    currentTime = 1000000;
    matches = [];
    matcher = new SequenceMatcher({
      onMatch: (m) => { matches.push(m); },
      now: () => currentTime
    });
  });

  describe('addPattern() and removePattern()', () => {
    it('adds a valid sequence pattern', () => {
      const pattern = createPattern({
        events: [{ topic: 'order.created' }]
      });

      matcher.addPattern('p1', pattern);

      expect(matcher.getInstancesForPattern('p1')).toEqual([]);
    });

    it('throws error for non-sequence pattern type', () => {
      const pattern = { type: 'count', event: { topic: 'x' }, threshold: 1, comparison: 'gte', window: '1m' } as any;

      expect(() => matcher.addPattern('p1', pattern)).toThrow('Expected sequence pattern');
    });

    it('throws error for empty events array', () => {
      const pattern = createPattern({ events: [] });

      expect(() => matcher.addPattern('p1', pattern)).toThrow('at least one event');
    });

    it('removes pattern and cleans up instances', async () => {
      const pattern = createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ]
      });

      matcher.addPattern('p1', pattern);
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
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

  describe('Two-event sequence', () => {
    beforeEach(() => {
      matcher.addPattern('seq1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m'
      }));
    });

    it('matches when events arrive in order', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matches).toHaveLength(0);
      expect(matcher.size).toBe(1);

      await matcher.processEvent(createEvent({ topic: 'payment.received' }));
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedEvents).toHaveLength(2);
      expect(matcher.size).toBe(0);
    });

    it('does not match when events arrive out of order', async () => {
      await matcher.processEvent(createEvent({ topic: 'payment.received' }));
      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      expect(matches).toHaveLength(0);
    });

    it('does not match unrelated events', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      await matcher.processEvent(createEvent({ topic: 'unrelated.event' }));
      await matcher.processEvent(createEvent({ topic: 'another.event' }));

      expect(matches).toHaveLength(0);
      expect(matcher.size).toBe(1);
    });
  });

  describe('Three-event sequence', () => {
    beforeEach(() => {
      matcher.addPattern('seq1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.initiated' },
          { topic: 'payment.confirmed' }
        ],
        within: '10m'
      }));
    });

    it('matches three events in order', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      await matcher.processEvent(createEvent({ topic: 'payment.initiated' }));
      expect(matches).toHaveLength(0);

      await matcher.processEvent(createEvent({ topic: 'payment.confirmed' }));
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedEvents).toHaveLength(3);
    });

    it('does not match when middle event is missing', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      await matcher.processEvent(createEvent({ topic: 'payment.confirmed' }));

      expect(matches).toHaveLength(0);
    });
  });

  describe('Single-event sequence', () => {
    it('matches immediately', async () => {
      matcher.addPattern('seq1', createPattern({
        events: [{ topic: 'alert.triggered' }],
        within: '1m'
      }));

      await matcher.processEvent(createEvent({ topic: 'alert.triggered' }));

      expect(matches).toHaveLength(1);
      expect(matcher.size).toBe(0);
    });
  });

  describe('groupBy', () => {
    beforeEach(() => {
      matcher.addPattern('seq1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m',
        groupBy: 'orderId'
      }));
    });

    it('creates separate instances for different groups', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-2' }
      }));

      expect(matcher.size).toBe(2);
    });

    it('matches only the correct group', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-2' }
      }));

      await matcher.processEvent(createEvent({
        topic: 'payment.received',
        data: { orderId: 'order-1' }
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].groupKey).toBe('order-1');
      expect(matcher.size).toBe(1);
    });

    it('does not create duplicate instances for same group', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));

      expect(matcher.size).toBe(1);
    });
  });

  describe('strict mode', () => {
    beforeEach(() => {
      matcher.addPattern('seq1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m',
        strict: true
      }));
    });

    it('expires sequence on intervening event', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      await matcher.processEvent(createEvent({ topic: 'order.cancelled' }));
      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matches).toHaveLength(0);
      expect(matcher.size).toBe(0);
    });

    it('matches when no intervening events', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matches).toHaveLength(1);
    });
  });

  describe('event filter', () => {
    beforeEach(() => {
      matcher.addPattern('seq1', createPattern({
        events: [
          { topic: 'order.status', filter: { status: 'pending' } },
          { topic: 'order.status', filter: { status: 'confirmed' } }
        ],
        within: '5m'
      }));
    });

    it('matches events with correct filter', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'pending' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'confirmed' }
      }));

      expect(matches).toHaveLength(1);
    });

    it('ignores events with wrong filter value', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'pending' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'cancelled' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.status',
        data: { status: 'confirmed' }
      }));

      expect(matches).toHaveLength(1);
    });
  });

  describe('time window expiration', () => {
    beforeEach(() => {
      matcher.addPattern('seq1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        within: '5m'
      }));
    });

    it('expires instance after time window', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      // Advance time past expiration
      currentTime += 6 * 60 * 1000; // 6 minutes

      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matches).toHaveLength(0);
      expect(matcher.size).toBe(0);
    });

    it('matches within time window', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      // Advance time but stay within window
      currentTime += 4 * 60 * 1000; // 4 minutes

      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matches).toHaveLength(1);
    });
  });

  describe('handleTimeout()', () => {
    it('expires instance on timeout', async () => {
      const expiredInstances: SequenceInstance[] = [];
      matcher = new SequenceMatcher({
        onMatch: (m) => { matches.push(m); },
        onExpire: (inst) => { expiredInstances.push(inst); },
        now: () => currentTime
      });

      matcher.addPattern('seq1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ]
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      const instances = matcher.getActiveInstances();
      expect(instances).toHaveLength(1);

      const result = await matcher.handleTimeout(instances[0].id);

      expect(result).toBe(true);
      expect(matcher.size).toBe(0);
      expect(expiredInstances).toHaveLength(1);
    });

    it('returns false for non-existent instance', async () => {
      const result = await matcher.handleTimeout('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('multiple patterns', () => {
    it('processes events for multiple patterns', async () => {
      matcher.addPattern('p1', createPattern({
        events: [{ topic: 'order.created' }]
      }));
      matcher.addPattern('p2', createPattern({
        events: [{ topic: 'order.created' }]
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      expect(matches).toHaveLength(2);
    });
  });

  describe('clear() and reset()', () => {
    it('clear() removes all instances but keeps patterns', async () => {
      matcher.addPattern('p1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ]
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      matcher.clear();

      expect(matcher.size).toBe(0);
      // Pattern still exists, can create new instance
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);
    });

    it('reset() removes all instances and patterns', async () => {
      matcher.addPattern('p1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ]
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      matcher.reset();

      expect(matcher.size).toBe(0);
      // Pattern no longer exists
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(0);
    });
  });

  describe('getActiveInstances()', () => {
    it('returns all active instances', async () => {
      matcher.addPattern('p1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ],
        groupBy: 'orderId'
      }));

      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-2' }
      }));

      const instances = matcher.getActiveInstances();
      expect(instances).toHaveLength(2);
    });
  });

  describe('getInstancesForPattern()', () => {
    it('returns instances for specific pattern', async () => {
      matcher.addPattern('p1', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'payment.received' }
        ]
      }));
      matcher.addPattern('p2', createPattern({
        events: [
          { topic: 'order.created' },
          { topic: 'order.shipped' }
        ]
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));

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
});

describe('Pure functions', () => {
  describe('eventMatchesMatcher()', () => {
    it('matches event with topic', () => {
      const event = createEvent({ topic: 'order.created' });
      const matcher: EventMatcher = { topic: 'order.created' };

      expect(eventMatchesMatcher(event, matcher)).toBe(true);
    });

    it('matches event with wildcard topic', () => {
      const event = createEvent({ topic: 'order.created' });
      const matcher: EventMatcher = { topic: 'order.*' };

      expect(eventMatchesMatcher(event, matcher)).toBe(true);
    });

    it('does not match different topic', () => {
      const event = createEvent({ topic: 'order.created' });
      const matcher: EventMatcher = { topic: 'payment.received' };

      expect(eventMatchesMatcher(event, matcher)).toBe(false);
    });

    it('matches event with filter', () => {
      const event = createEvent({
        topic: 'order.status',
        data: { status: 'pending' }
      });
      const matcher: EventMatcher = {
        topic: 'order.status',
        filter: { status: 'pending' }
      };

      expect(eventMatchesMatcher(event, matcher)).toBe(true);
    });

    it('does not match when filter fails', () => {
      const event = createEvent({
        topic: 'order.status',
        data: { status: 'confirmed' }
      });
      const matcher: EventMatcher = {
        topic: 'order.status',
        filter: { status: 'pending' }
      };

      expect(eventMatchesMatcher(event, matcher)).toBe(false);
    });
  });

  describe('isSequenceComplete()', () => {
    it('returns true when matched count equals events length', () => {
      const pattern = createPattern({
        events: [{ topic: 'a' }, { topic: 'b' }]
      });

      expect(isSequenceComplete(2, pattern)).toBe(true);
    });

    it('returns false when matched count is less', () => {
      const pattern = createPattern({
        events: [{ topic: 'a' }, { topic: 'b' }]
      });

      expect(isSequenceComplete(1, pattern)).toBe(false);
    });
  });

  describe('getNextMatcherIndex()', () => {
    it('returns matched count as next index', () => {
      expect(getNextMatcherIndex(0)).toBe(0);
      expect(getNextMatcherIndex(1)).toBe(1);
      expect(getNextMatcherIndex(5)).toBe(5);
    });
  });

  describe('isInstanceExpired()', () => {
    it('returns true when now exceeds expiresAt', () => {
      expect(isInstanceExpired(1000, 1001)).toBe(true);
    });

    it('returns false when now equals expiresAt', () => {
      expect(isInstanceExpired(1000, 1000)).toBe(false);
    });

    it('returns false when now is before expiresAt', () => {
      expect(isInstanceExpired(1000, 999)).toBe(false);
    });
  });

  describe('calculateExpiresAt()', () => {
    it('calculates expiration time with number duration', () => {
      expect(calculateExpiresAt(1000, 5000)).toBe(6000);
    });

    it('calculates expiration time with string duration', () => {
      expect(calculateExpiresAt(1000, '5m')).toBe(1000 + 5 * 60 * 1000);
    });
  });
});
