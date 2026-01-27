import { describe, it, expect, beforeEach } from 'vitest';
import {
  AbsenceMatcher,
  type AbsenceMatch,
  type AbsenceInstance,
  eventMatchesAbsenceMatcher,
  isAbsenceInstanceExpired,
  calculateAbsenceExpiresAt,
  isAbsenceInstanceWaiting
} from '../../../src/patterns/absence';
import type { Event } from '../../../src/types/event';
import type { AbsencePattern, EventMatcher } from '../../../src/types/temporal';

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

function createPattern(overrides: Partial<AbsencePattern> = {}): AbsencePattern {
  return {
    type: 'absence',
    after: { topic: 'order.created' },
    expected: { topic: 'payment.received' },
    within: '15m',
    ...overrides
  };
}

describe('AbsenceMatcher', () => {
  let matcher: AbsenceMatcher;
  let currentTime: number;
  let matches: AbsenceMatch[];
  let cancelledInstances: { instance: AbsenceInstance; event: Event }[];

  beforeEach(() => {
    currentTime = 1000000;
    matches = [];
    cancelledInstances = [];
    matcher = new AbsenceMatcher({
      onMatch: (m) => { matches.push(m); },
      onCancel: (inst, evt) => { cancelledInstances.push({ instance: inst, event: evt }); },
      now: () => currentTime
    });
  });

  describe('addPattern() and removePattern()', () => {
    it('adds a valid absence pattern', () => {
      const pattern = createPattern();

      matcher.addPattern('p1', pattern);

      expect(matcher.getInstancesForPattern('p1')).toEqual([]);
    });

    it('throws error for non-absence pattern type', () => {
      const pattern = { type: 'sequence', events: [{ topic: 'x' }], within: '1m' } as any;

      expect(() => matcher.addPattern('p1', pattern)).toThrow('Expected absence pattern');
    });

    it('removes pattern and cleans up instances', async () => {
      const pattern = createPattern();

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

  describe('Basic absence detection', () => {
    beforeEach(() => {
      matcher.addPattern('payment-timeout', createPattern());
    });

    it('creates instance when after event arrives', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      expect(matcher.size).toBe(1);
      expect(matches).toHaveLength(0);

      const instances = matcher.getActiveInstances();
      expect(instances[0].state).toBe('waiting');
    });

    it('cancels instance when expected event arrives in time', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matcher.size).toBe(0);
      expect(matches).toHaveLength(0);
      expect(cancelledInstances).toHaveLength(1);
      expect(cancelledInstances[0].instance.state).toBe('cancelled');
    });

    it('matches (via handleTimeout) when expected event does not arrive', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      const instances = matcher.getActiveInstances();
      expect(instances).toHaveLength(1);

      const match = await matcher.handleTimeout(instances[0].id);

      expect(match).toBeDefined();
      expect(match!.instanceId).toBe(instances[0].id);
      expect(matches).toHaveLength(1);
      expect(matcher.size).toBe(0);
    });

    it('does not create instance for unrelated events', async () => {
      await matcher.processEvent(createEvent({ topic: 'user.registered' }));
      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matcher.size).toBe(0);
    });

    it('ignores expected event when no instance is waiting', async () => {
      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matcher.size).toBe(0);
      expect(cancelledInstances).toHaveLength(0);
    });
  });

  describe('groupBy', () => {
    beforeEach(() => {
      matcher.addPattern('payment-timeout', createPattern({
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

    it('cancels only the correct group when expected event arrives', async () => {
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

      expect(matcher.size).toBe(1);
      expect(cancelledInstances).toHaveLength(1);
      expect(cancelledInstances[0].instance.groupKey).toBe('order-1');

      const remaining = matcher.getActiveInstances();
      expect(remaining[0].groupKey).toBe('order-2');
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

    it('matches correct group on timeout', async () => {
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-2' }
      }));

      const instances = matcher.getActiveInstances();
      const order1Instance = instances.find(i => i.groupKey === 'order-1')!;

      const match = await matcher.handleTimeout(order1Instance.id);

      expect(match).toBeDefined();
      expect(match!.groupKey).toBe('order-1');
      expect(matcher.size).toBe(1);
    });

    it('handles nested groupBy paths', async () => {
      matcher.reset();
      matcher.addPattern('nested', createPattern({
        groupBy: 'order.id'
      }));

      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { order: { id: 'nested-123' } }
      }));

      expect(matcher.size).toBe(1);
      const instances = matcher.getActiveInstances();
      expect(instances[0].groupKey).toBe('nested-123');
    });
  });

  describe('Event filters', () => {
    it('respects filter on after event', async () => {
      matcher.addPattern('filtered', createPattern({
        after: { topic: 'order.created', filter: { type: 'premium' } },
        expected: { topic: 'payment.received' }
      }));

      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { type: 'standard' }
      }));
      expect(matcher.size).toBe(0);

      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { type: 'premium' }
      }));
      expect(matcher.size).toBe(1);
    });

    it('respects filter on expected event', async () => {
      matcher.addPattern('filtered', createPattern({
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received', filter: { status: 'confirmed' } }
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      // Payment with wrong status - should NOT cancel
      await matcher.processEvent(createEvent({
        topic: 'payment.received',
        data: { status: 'pending' }
      }));
      expect(matcher.size).toBe(1);
      expect(cancelledInstances).toHaveLength(0);

      // Payment with correct status - should cancel
      await matcher.processEvent(createEvent({
        topic: 'payment.received',
        data: { status: 'confirmed' }
      }));
      expect(matcher.size).toBe(0);
      expect(cancelledInstances).toHaveLength(1);
    });
  });

  describe('Time window', () => {
    beforeEach(() => {
      matcher.addPattern('timeout', createPattern({
        within: '5m'
      }));
    });

    it('sets correct expiration time', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      const instances = matcher.getActiveInstances();
      expect(instances[0].expiresAt).toBe(currentTime + 5 * 60 * 1000);
    });

    it('auto-completes expired instance during processEvent', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      // Advance time past expiration
      currentTime += 6 * 60 * 1000;

      // Process any event to trigger expiration check
      await matcher.processEvent(createEvent({ topic: 'some.event' }));

      expect(matcher.size).toBe(0);
      expect(matches).toHaveLength(1);
    });

    it('cancels within time window', async () => {
      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      // Advance time but stay within window
      currentTime += 4 * 60 * 1000;

      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(cancelledInstances).toHaveLength(1);
      expect(matches).toHaveLength(0);
    });
  });

  describe('handleTimeout()', () => {
    it('returns undefined for non-existent instance', async () => {
      const result = await matcher.handleTimeout('non-existent');
      expect(result).toBeUndefined();
    });

    it('returns undefined for already cancelled instance', async () => {
      matcher.addPattern('p1', createPattern());
      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      const instances = matcher.getActiveInstances();
      const instanceId = instances[0].id;

      // Cancel the instance
      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      // Try to timeout already-removed instance
      const result = await matcher.handleTimeout(instanceId);
      expect(result).toBeUndefined();
    });

    it('includes trigger event in match', async () => {
      matcher.addPattern('p1', createPattern());

      const triggerEvent = createEvent({
        topic: 'order.created',
        data: { orderId: '123', amount: 100 }
      });
      await matcher.processEvent(triggerEvent);

      const instances = matcher.getActiveInstances();
      const match = await matcher.handleTimeout(instances[0].id);

      expect(match!.triggerEvent.id).toBe(triggerEvent.id);
      expect(match!.triggerEvent.data).toEqual({ orderId: '123', amount: 100 });
    });
  });

  describe('Topic wildcards', () => {
    it('supports wildcard in after event topic', async () => {
      matcher.addPattern('wildcard', createPattern({
        after: { topic: 'order.*' },
        expected: { topic: 'payment.received' }
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);
    });

    it('supports wildcard in expected event topic', async () => {
      matcher.addPattern('wildcard', createPattern({
        after: { topic: 'order.created' },
        expected: { topic: 'payment.*' }
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      await matcher.processEvent(createEvent({ topic: 'payment.confirmed' }));
      expect(matcher.size).toBe(0);
      expect(cancelledInstances).toHaveLength(1);
    });
  });

  describe('Multiple patterns', () => {
    it('processes events for multiple patterns', async () => {
      matcher.addPattern('p1', createPattern({
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' }
      }));
      matcher.addPattern('p2', createPattern({
        after: { topic: 'order.created' },
        expected: { topic: 'order.shipped' }
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      expect(matcher.size).toBe(2);
    });

    it('cancels only matching patterns', async () => {
      matcher.addPattern('payment', createPattern({
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' }
      }));
      matcher.addPattern('shipping', createPattern({
        after: { topic: 'order.created' },
        expected: { topic: 'order.shipped' }
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(2);

      await matcher.processEvent(createEvent({ topic: 'payment.received' }));

      expect(matcher.size).toBe(1);
      expect(cancelledInstances).toHaveLength(1);
    });
  });

  describe('clear() and reset()', () => {
    it('clear() removes all instances but keeps patterns', async () => {
      matcher.addPattern('p1', createPattern());

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      matcher.clear();

      expect(matcher.size).toBe(0);
      // Pattern still exists, can create new instance
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);
    });

    it('reset() removes all instances and patterns', async () => {
      matcher.addPattern('p1', createPattern());

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(1);

      matcher.reset();

      expect(matcher.size).toBe(0);
      // Pattern no longer exists
      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      expect(matcher.size).toBe(0);
    });
  });

  describe('getInstancesForPattern()', () => {
    it('returns instances for specific pattern', async () => {
      matcher.addPattern('p1', createPattern({
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' }
      }));
      matcher.addPattern('p2', createPattern({
        after: { topic: 'user.registered' },
        expected: { topic: 'user.verified' }
      }));

      await matcher.processEvent(createEvent({ topic: 'order.created' }));
      await matcher.processEvent(createEvent({ topic: 'user.registered' }));

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
    it('returns instance by id', async () => {
      matcher.addPattern('p1', createPattern());
      await matcher.processEvent(createEvent({ topic: 'order.created' }));

      const instances = matcher.getActiveInstances();
      const instance = matcher.getInstance(instances[0].id);

      expect(instance).toBeDefined();
      expect(instance!.id).toBe(instances[0].id);
    });

    it('returns undefined for non-existent instance', () => {
      const instance = matcher.getInstance('non-existent');
      expect(instance).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('handles after and expected being the same event (self-absence)', async () => {
      matcher.addPattern('self', createPattern({
        after: { topic: 'heartbeat', filter: { type: 'start' } },
        expected: { topic: 'heartbeat', filter: { type: 'ping' } },
        within: '1m'
      }));

      await matcher.processEvent(createEvent({
        topic: 'heartbeat',
        data: { type: 'start' }
      }));
      expect(matcher.size).toBe(1);

      await matcher.processEvent(createEvent({
        topic: 'heartbeat',
        data: { type: 'ping' }
      }));
      expect(matcher.size).toBe(0);
      expect(cancelledInstances).toHaveLength(1);
    });

    it('creates new instance after previous one was cancelled', async () => {
      matcher.addPattern('p1', createPattern({ groupBy: 'orderId' }));

      // First order
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      expect(matcher.size).toBe(1);

      // Payment cancels first instance
      await matcher.processEvent(createEvent({
        topic: 'payment.received',
        data: { orderId: 'order-1' }
      }));
      expect(matcher.size).toBe(0);

      // New order for same orderId
      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: { orderId: 'order-1' }
      }));
      expect(matcher.size).toBe(1);
    });

    it('handles missing groupBy field gracefully', async () => {
      matcher.addPattern('p1', createPattern({ groupBy: 'orderId' }));

      await matcher.processEvent(createEvent({
        topic: 'order.created',
        data: {} // Missing orderId
      }));

      expect(matcher.size).toBe(1);
      const instances = matcher.getActiveInstances();
      expect(instances[0].groupKey).toBe('');
    });
  });
});

describe('Pure functions', () => {
  describe('eventMatchesAbsenceMatcher()', () => {
    it('matches event with topic', () => {
      const event = createEvent({ topic: 'order.created' });
      const matcher: EventMatcher = { topic: 'order.created' };

      expect(eventMatchesAbsenceMatcher(event, matcher)).toBe(true);
    });

    it('matches event with wildcard topic', () => {
      const event = createEvent({ topic: 'order.created' });
      const matcher: EventMatcher = { topic: 'order.*' };

      expect(eventMatchesAbsenceMatcher(event, matcher)).toBe(true);
    });

    it('does not match different topic', () => {
      const event = createEvent({ topic: 'order.created' });
      const matcher: EventMatcher = { topic: 'payment.received' };

      expect(eventMatchesAbsenceMatcher(event, matcher)).toBe(false);
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

      expect(eventMatchesAbsenceMatcher(event, matcher)).toBe(true);
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

      expect(eventMatchesAbsenceMatcher(event, matcher)).toBe(false);
    });
  });

  describe('isAbsenceInstanceExpired()', () => {
    it('returns true when now exceeds expiresAt', () => {
      expect(isAbsenceInstanceExpired(1000, 1001)).toBe(true);
    });

    it('returns false when now equals expiresAt', () => {
      expect(isAbsenceInstanceExpired(1000, 1000)).toBe(false);
    });

    it('returns false when now is before expiresAt', () => {
      expect(isAbsenceInstanceExpired(1000, 999)).toBe(false);
    });
  });

  describe('calculateAbsenceExpiresAt()', () => {
    it('calculates expiration time with number duration', () => {
      expect(calculateAbsenceExpiresAt(1000, 5000)).toBe(6000);
    });

    it('calculates expiration time with string duration', () => {
      expect(calculateAbsenceExpiresAt(1000, '15m')).toBe(1000 + 15 * 60 * 1000);
    });

    it('handles various duration formats', () => {
      expect(calculateAbsenceExpiresAt(0, '1s')).toBe(1000);
      expect(calculateAbsenceExpiresAt(0, '1h')).toBe(60 * 60 * 1000);
      expect(calculateAbsenceExpiresAt(0, '1d')).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('isAbsenceInstanceWaiting()', () => {
    it('returns true for waiting instance', () => {
      const instance: AbsenceInstance = {
        id: 'test',
        pattern: createPattern(),
        state: 'waiting',
        triggerEvent: createEvent(),
        startedAt: 0,
        expiresAt: 1000
      };

      expect(isAbsenceInstanceWaiting(instance)).toBe(true);
    });

    it('returns false for completed instance', () => {
      const instance: AbsenceInstance = {
        id: 'test',
        pattern: createPattern(),
        state: 'completed',
        triggerEvent: createEvent(),
        startedAt: 0,
        expiresAt: 1000
      };

      expect(isAbsenceInstanceWaiting(instance)).toBe(false);
    });

    it('returns false for cancelled instance', () => {
      const instance: AbsenceInstance = {
        id: 'test',
        pattern: createPattern(),
        state: 'cancelled',
        triggerEvent: createEvent(),
        startedAt: 0,
        expiresAt: 1000
      };

      expect(isAbsenceInstanceWaiting(instance)).toBe(false);
    });
  });
});
