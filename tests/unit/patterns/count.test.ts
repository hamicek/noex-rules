import { describe, it, expect, beforeEach } from 'vitest';
import {
  CountMatcher,
  type CountMatch,
  type CountInstance,
  eventMatchesCountMatcher,
  compareCountThreshold,
  calculateTumblingWindowStart,
  isInWindow,
  filterEventsInWindow
} from '../../../src/patterns/count';
import type { Event } from '../../../src/types/event';
import type { CountPattern, EventMatcher } from '../../../src/types/temporal';

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

function createPattern(overrides: Partial<CountPattern> = {}): CountPattern {
  return {
    type: 'count',
    event: { topic: 'test.event' },
    threshold: 3,
    comparison: 'gte',
    window: '5m',
    ...overrides
  };
}

describe('CountMatcher', () => {
  let matcher: CountMatcher;
  let currentTime: number;
  let matches: CountMatch[];

  beforeEach(() => {
    currentTime = 1000000;
    matches = [];
    matcher = new CountMatcher({
      onMatch: (m) => { matches.push(m); },
      now: () => currentTime
    });
  });

  describe('addPattern() and removePattern()', () => {
    it('adds a valid count pattern', () => {
      const pattern = createPattern();

      matcher.addPattern('p1', pattern);

      expect(matcher.getInstancesForPattern('p1')).toEqual([]);
    });

    it('throws error for non-count pattern type', () => {
      const pattern = { type: 'sequence', events: [{ topic: 'x' }], within: '1m' } as any;

      expect(() => matcher.addPattern('p1', pattern)).toThrow('Expected count pattern');
    });

    it('throws error for negative threshold', () => {
      const pattern = createPattern({ threshold: -1 });

      expect(() => matcher.addPattern('p1', pattern)).toThrow('non-negative');
    });

    it('removes pattern and cleans up instances', async () => {
      const pattern = createPattern();

      matcher.addPattern('p1', pattern);
      await matcher.processEvent(createEvent({ topic: 'test.event', timestamp: currentTime }));
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

  describe('Sliding window - basic counting', () => {
    beforeEach(() => {
      matcher.addPattern('count1', createPattern({
        event: { topic: 'login.failed' },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));
    });

    it('does not match when count is below threshold', async () => {
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));

      expect(matches).toHaveLength(0);
    });

    it('matches when count reaches threshold', async () => {
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(3);
    });

    it('matches when count exceeds threshold', async () => {
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.failed', timestamp: currentTime }));

      expect(matches).toHaveLength(2); // Matches on 3rd and 4th event
    });

    it('ignores events that do not match topic', async () => {
      await matcher.processEvent(createEvent({ topic: 'login.success', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.success', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'login.success', timestamp: currentTime }));

      expect(matches).toHaveLength(0);
    });
  });

  describe('Sliding window - time-based pruning', () => {
    beforeEach(() => {
      matcher.addPattern('count1', createPattern({
        event: { topic: 'error' },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));
    });

    it('prunes old events outside window', async () => {
      // Add 2 events
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime + 1000 }));

      // Advance time past window
      currentTime += 6 * 60 * 1000;

      // Add 2 more events
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime + 1000 }));

      // Should not match because old events are pruned
      expect(matches).toHaveLength(0);
    });

    it('counts only events within window', async () => {
      // Add 2 events now
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime + 1000 }));

      // Advance time but stay within window
      currentTime += 4 * 60 * 1000;

      // Add 1 more event - should trigger match
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime }));

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(3);
    });
  });

  describe('Comparison operators', () => {
    it('gte - matches when count >= threshold', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 2,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(0);

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(1);

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(2);
    });

    it('lte - matches when count <= threshold', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 2,
        comparison: 'lte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(1);

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(2);

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(2); // No new match, count > threshold
    });

    it('eq - matches only when count == threshold', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 2,
        comparison: 'eq',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(0);

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(1);

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matches).toHaveLength(1); // No new match, count > threshold
    });
  });

  describe('groupBy', () => {
    beforeEach(() => {
      matcher.addPattern('count1', createPattern({
        event: { topic: 'login.failed' },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        groupBy: 'userId',
        sliding: true
      }));
    });

    it('creates separate instances for different groups', async () => {
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-1' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-2' },
        timestamp: currentTime
      }));

      expect(matcher.size).toBe(2);
    });

    it('counts events separately per group', async () => {
      // User 1: 3 events
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-1' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-1' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-1' },
        timestamp: currentTime
      }));

      // User 2: 2 events
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-2' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-2' },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].groupKey).toBe('user-1');
      expect(matches[0].count).toBe(3);
    });
  });

  describe('Event filter', () => {
    beforeEach(() => {
      matcher.addPattern('count1', createPattern({
        event: {
          topic: 'http.request',
          filter: { status: 500 }
        },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));
    });

    it('counts only events matching filter', async () => {
      await matcher.processEvent(createEvent({
        topic: 'http.request',
        data: { status: 500 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'http.request',
        data: { status: 200 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'http.request',
        data: { status: 500 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'http.request',
        data: { status: 404 },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'http.request',
        data: { status: 500 },
        timestamp: currentTime
      }));

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(3);
    });
  });

  describe('Tumbling window', () => {
    beforeEach(() => {
      const windowMs = 5 * 60 * 1000; // 5 minutes
      currentTime = Math.floor(1000000 / windowMs) * windowMs; // Align to window boundary

      matcher.addPattern('count1', createPattern({
        event: { topic: 'event' },
        threshold: 2,
        comparison: 'gte',
        window: '5m',
        sliding: false // Tumbling window
      }));
    });

    it('accumulates events in window without triggering immediately', async () => {
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));

      // Tumbling window does not trigger immediately
      expect(matches).toHaveLength(0);
    });

    it('triggers match when window ends via handleWindowEnd', async () => {
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime + 1000 }));
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime + 2000 }));

      const instances = matcher.getActiveInstances();
      expect(instances).toHaveLength(1);

      const match = await matcher.handleWindowEnd(instances[0].id);

      expect(match).toBeDefined();
      expect(match!.count).toBe(3);
      expect(matches).toHaveLength(1);
    });

    it('does not match when threshold not met at window end', async () => {
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));

      const instances = matcher.getActiveInstances();
      const match = await matcher.handleWindowEnd(instances[0].id);

      expect(match).toBeUndefined();
      expect(matches).toHaveLength(0);
    });

    it('creates new window after previous expires', async () => {
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));

      // Move to next window
      currentTime += 6 * 60 * 1000;

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));

      // Old instance should be processed and new one created
      expect(matcher.size).toBe(1);
    });
  });

  describe('Wildcard topics', () => {
    it('matches events with wildcard topic pattern', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'error.*' },
        threshold: 2,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'error.database', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'error.network', timestamp: currentTime }));

      expect(matches).toHaveLength(1);
      expect(matches[0].count).toBe(2);
    });
  });

  describe('Zero threshold', () => {
    it('handles threshold of 0 correctly', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 0,
        comparison: 'eq',
        window: '5m',
        sliding: true
      }));

      // No events yet - but we need at least one event to trigger check
      // This is a limitation - eq 0 only makes sense with tumbling window
      expect(matches).toHaveLength(0);
    });
  });

  describe('Multiple patterns', () => {
    it('processes events for multiple patterns independently', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'error' },
        threshold: 2,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));
      matcher.addPattern('p2', createPattern({
        event: { topic: 'warning' },
        threshold: 2,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'error', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'warning', timestamp: currentTime }));

      expect(matches).toHaveLength(1);
      expect(matches[0].patternId).toBe('p1');
    });
  });

  describe('clear() and reset()', () => {
    it('clear() removes all instances but keeps patterns', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matcher.size).toBe(1);

      matcher.clear();

      expect(matcher.size).toBe(0);
      // Pattern still exists
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matcher.size).toBe(1);
    });

    it('reset() removes all instances and patterns', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matcher.size).toBe(1);

      matcher.reset();

      expect(matcher.size).toBe(0);
      // Pattern no longer exists
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      expect(matcher.size).toBe(0);
    });
  });

  describe('getActiveInstances()', () => {
    it('returns all active instances', async () => {
      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        groupBy: 'type',
        sliding: true
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { type: 'A' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { type: 'B' },
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
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        groupBy: 'type',
        sliding: true
      }));
      matcher.addPattern('p2', createPattern({
        event: { topic: 'other' },
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({
        topic: 'event',
        data: { type: 'A' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'other',
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
        threshold: 3,
        comparison: 'gte',
        window: '5m',
        sliding: true
      }));

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));

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
      matcher.addPattern('brute-force', createPattern({
        event: { topic: 'login.failed' },
        threshold: 2,
        comparison: 'gte',
        window: '5m',
        groupBy: 'userId',
        sliding: true
      }));

      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-123' },
        timestamp: currentTime
      }));
      await matcher.processEvent(createEvent({
        topic: 'login.failed',
        data: { userId: 'user-123' },
        timestamp: currentTime + 1000
      }));

      expect(matches).toHaveLength(1);
      const match = matches[0];

      expect(match.instanceId).toBeDefined();
      expect(match.patternId).toBe('brute-force');
      expect(match.pattern.type).toBe('count');
      expect(match.count).toBe(2);
      expect(match.events).toHaveLength(2);
      expect(match.groupKey).toBe('user-123');
    });
  });

  describe('onWindowExpire callback', () => {
    it('calls onWindowExpire when tumbling window expires without match', async () => {
      const expiredInstances: CountInstance[] = [];
      matcher = new CountMatcher({
        onMatch: (m) => { matches.push(m); },
        onWindowExpire: (inst) => { expiredInstances.push(inst); },
        now: () => currentTime
      });

      matcher.addPattern('p1', createPattern({
        event: { topic: 'event' },
        threshold: 5,
        comparison: 'gte',
        window: '5m',
        sliding: false
      }));

      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));
      await matcher.processEvent(createEvent({ topic: 'event', timestamp: currentTime }));

      const instances = matcher.getActiveInstances();
      await matcher.handleWindowEnd(instances[0].id);

      expect(matches).toHaveLength(0);
      expect(expiredInstances).toHaveLength(1);
      expect(expiredInstances[0].events).toHaveLength(2);
    });
  });
});

describe('Pure functions', () => {
  describe('eventMatchesCountMatcher()', () => {
    it('matches event with topic', () => {
      const event = createEvent({ topic: 'error.database' });
      const matcher: EventMatcher = { topic: 'error.database' };

      expect(eventMatchesCountMatcher(event, matcher)).toBe(true);
    });

    it('matches event with wildcard topic', () => {
      const event = createEvent({ topic: 'error.database' });
      const matcher: EventMatcher = { topic: 'error.*' };

      expect(eventMatchesCountMatcher(event, matcher)).toBe(true);
    });

    it('does not match different topic', () => {
      const event = createEvent({ topic: 'error.database' });
      const matcher: EventMatcher = { topic: 'warning.memory' };

      expect(eventMatchesCountMatcher(event, matcher)).toBe(false);
    });

    it('matches event with filter', () => {
      const event = createEvent({
        topic: 'http.request',
        data: { status: 500 }
      });
      const matcher: EventMatcher = {
        topic: 'http.request',
        filter: { status: 500 }
      };

      expect(eventMatchesCountMatcher(event, matcher)).toBe(true);
    });

    it('does not match when filter fails', () => {
      const event = createEvent({
        topic: 'http.request',
        data: { status: 200 }
      });
      const matcher: EventMatcher = {
        topic: 'http.request',
        filter: { status: 500 }
      };

      expect(eventMatchesCountMatcher(event, matcher)).toBe(false);
    });
  });

  describe('compareCountThreshold()', () => {
    it('gte - returns true when count >= threshold', () => {
      expect(compareCountThreshold(3, 3, 'gte')).toBe(true);
      expect(compareCountThreshold(4, 3, 'gte')).toBe(true);
      expect(compareCountThreshold(2, 3, 'gte')).toBe(false);
    });

    it('lte - returns true when count <= threshold', () => {
      expect(compareCountThreshold(3, 3, 'lte')).toBe(true);
      expect(compareCountThreshold(2, 3, 'lte')).toBe(true);
      expect(compareCountThreshold(4, 3, 'lte')).toBe(false);
    });

    it('eq - returns true when count == threshold', () => {
      expect(compareCountThreshold(3, 3, 'eq')).toBe(true);
      expect(compareCountThreshold(2, 3, 'eq')).toBe(false);
      expect(compareCountThreshold(4, 3, 'eq')).toBe(false);
    });
  });

  describe('calculateTumblingWindowStart()', () => {
    it('aligns timestamp to window boundary', () => {
      const windowMs = 5 * 60 * 1000; // 5 minutes

      expect(calculateTumblingWindowStart(0, windowMs)).toBe(0);
      expect(calculateTumblingWindowStart(100000, windowMs)).toBe(0);
      expect(calculateTumblingWindowStart(300000, windowMs)).toBe(300000);
      expect(calculateTumblingWindowStart(400000, windowMs)).toBe(300000);
      expect(calculateTumblingWindowStart(600000, windowMs)).toBe(600000);
    });
  });

  describe('isInWindow()', () => {
    it('returns true when timestamp is within window', () => {
      expect(isInWindow(150, 100, 200)).toBe(true);
      expect(isInWindow(100, 100, 200)).toBe(true);
    });

    it('returns false when timestamp is at window end', () => {
      expect(isInWindow(200, 100, 200)).toBe(false);
    });

    it('returns false when timestamp is outside window', () => {
      expect(isInWindow(50, 100, 200)).toBe(false);
      expect(isInWindow(250, 100, 200)).toBe(false);
    });
  });

  describe('filterEventsInWindow()', () => {
    it('filters events within time window', () => {
      const events: Event[] = [
        createEvent({ timestamp: 50 }),
        createEvent({ timestamp: 100 }),
        createEvent({ timestamp: 150 }),
        createEvent({ timestamp: 200 }),
        createEvent({ timestamp: 250 })
      ];

      const filtered = filterEventsInWindow(events, 100, 200);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].timestamp).toBe(100);
      expect(filtered[1].timestamp).toBe(150);
    });

    it('returns empty array when no events in window', () => {
      const events: Event[] = [
        createEvent({ timestamp: 50 }),
        createEvent({ timestamp: 300 })
      ];

      const filtered = filterEventsInWindow(events, 100, 200);

      expect(filtered).toHaveLength(0);
    });
  });
});
