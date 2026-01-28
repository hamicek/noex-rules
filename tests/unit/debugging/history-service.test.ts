import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryService, type HistoryQuery } from '../../../src/debugging/history-service';
import { EventStore } from '../../../src/core/event-store';
import { TraceCollector } from '../../../src/debugging/trace-collector';
import type { Event } from '../../../src/types/event';

describe('HistoryService', () => {
  let eventStore: EventStore;
  let traceCollector: TraceCollector;
  let historyService: HistoryService;

  beforeEach(() => {
    eventStore = new EventStore();
    traceCollector = new TraceCollector({ enabled: true });
    historyService = new HistoryService(eventStore, traceCollector);
  });

  const createEvent = (overrides: Partial<Event> = {}): Event => ({
    id: `event-${Math.random().toString(36).slice(2)}`,
    topic: 'test.topic',
    data: {},
    timestamp: Date.now(),
    source: 'test',
    ...overrides,
  });

  describe('query()', () => {
    it('returns empty result when no events', () => {
      const result = historyService.query({});

      expect(result.events).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('filters by correlationId', () => {
      const event1 = createEvent({ correlationId: 'corr-1' });
      const event2 = createEvent({ correlationId: 'corr-1' });
      const event3 = createEvent({ correlationId: 'corr-2' });

      eventStore.store(event1);
      eventStore.store(event2);
      eventStore.store(event3);

      const result = historyService.query({ correlationId: 'corr-1' });

      expect(result.events).toHaveLength(2);
      expect(result.events.every(e => e.correlationId === 'corr-1')).toBe(true);
    });

    it('filters by topic with exact match', () => {
      const event1 = createEvent({ topic: 'order.created', timestamp: 1000 });
      const event2 = createEvent({ topic: 'order.created', timestamp: 2000 });
      const event3 = createEvent({ topic: 'payment.received', timestamp: 3000 });

      eventStore.store(event1);
      eventStore.store(event2);
      eventStore.store(event3);

      const result = historyService.query({ topic: 'order.created', from: 0, to: Date.now() });

      expect(result.events).toHaveLength(2);
      expect(result.events.every(e => e.topic === 'order.created')).toBe(true);
    });

    it('filters by time range', () => {
      const event1 = createEvent({ topic: 'test', timestamp: 1000 });
      const event2 = createEvent({ topic: 'test', timestamp: 2000 });
      const event3 = createEvent({ topic: 'test', timestamp: 3000 });

      eventStore.store(event1);
      eventStore.store(event2);
      eventStore.store(event3);

      const result = historyService.query({ topic: 'test', from: 1500, to: 2500 });

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.timestamp).toBe(2000);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        eventStore.store(createEvent({ correlationId: 'corr-1', timestamp: i * 100 }));
      }

      const result = historyService.query({ correlationId: 'corr-1', limit: 5 });

      expect(result.events).toHaveLength(5);
      expect(result.totalCount).toBe(10);
    });

    it('returns events sorted by timestamp ascending', () => {
      const event1 = createEvent({ correlationId: 'corr-1', timestamp: 3000 });
      const event2 = createEvent({ correlationId: 'corr-1', timestamp: 1000 });
      const event3 = createEvent({ correlationId: 'corr-1', timestamp: 2000 });

      eventStore.store(event1);
      eventStore.store(event2);
      eventStore.store(event3);

      const result = historyService.query({ correlationId: 'corr-1' });

      expect(result.events.map(e => e.timestamp)).toEqual([1000, 2000, 3000]);
    });

    it('enriches events with context when includeContext is true', () => {
      const event = createEvent({ id: 'event-1', correlationId: 'corr-1' });
      eventStore.store(event);

      traceCollector.record('rule_executed', { eventId: 'event-1' }, {
        correlationId: 'corr-1',
        causationId: 'event-1',
        ruleId: 'rule-1',
        ruleName: 'Test Rule',
        durationMs: 10,
      });

      const result = historyService.query({ correlationId: 'corr-1', includeContext: true });

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.traceEntries).toBeDefined();
      expect(result.events[0]?.triggeredRules).toHaveLength(1);
      expect(result.events[0]?.triggeredRules?.[0]).toMatchObject({
        ruleId: 'rule-1',
        ruleName: 'Test Rule',
        executed: true,
        durationMs: 10,
      });
    });

    it('includes caused events in context', () => {
      const parentEvent = createEvent({ id: 'parent-1', correlationId: 'corr-1' });
      const childEvent = createEvent({
        id: 'child-1',
        correlationId: 'corr-1',
        causationId: 'parent-1',
      });

      eventStore.store(parentEvent);
      eventStore.store(childEvent);

      const result = historyService.query({ correlationId: 'corr-1', includeContext: true });

      const parent = result.events.find(e => e.id === 'parent-1');
      expect(parent?.causedEvents).toHaveLength(1);
      expect(parent?.causedEvents?.[0]?.id).toBe('child-1');
    });

    it('reports query execution time', () => {
      const result = historyService.query({});

      expect(typeof result.queryTimeMs).toBe('number');
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getCorrelationTimeline()', () => {
    it('returns empty array when no data for correlation', () => {
      const timeline = historyService.getCorrelationTimeline('non-existent');

      expect(timeline).toEqual([]);
    });

    it('includes both events and traces', () => {
      const event = createEvent({ id: 'event-1', correlationId: 'corr-1', timestamp: 1000 });
      eventStore.store(event);

      traceCollector.record('rule_triggered', {}, {
        correlationId: 'corr-1',
        timestamp: 1001,
      });

      const timeline = historyService.getCorrelationTimeline('corr-1');

      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.type).toBe('event');
      expect(timeline[1]?.type).toBe('trace');
    });

    it('sorts timeline entries by timestamp', () => {
      const event1 = createEvent({ correlationId: 'corr-1', timestamp: 1000 });
      const event2 = createEvent({ correlationId: 'corr-1', timestamp: 3000 });
      eventStore.store(event1);
      eventStore.store(event2);

      traceCollector.record('rule_triggered', {}, {
        correlationId: 'corr-1',
        timestamp: 2000,
      });

      const timeline = historyService.getCorrelationTimeline('corr-1');

      expect(timeline.map(e => e.timestamp)).toEqual([1000, 2000, 3000]);
    });

    it('calculates depth based on causation chain', () => {
      const rootEvent = createEvent({
        id: 'root',
        correlationId: 'corr-1',
        timestamp: 1000,
      });
      const childEvent = createEvent({
        id: 'child',
        correlationId: 'corr-1',
        causationId: 'root',
        timestamp: 2000,
      });
      const grandchildEvent = createEvent({
        id: 'grandchild',
        correlationId: 'corr-1',
        causationId: 'child',
        timestamp: 3000,
      });

      eventStore.store(rootEvent);
      eventStore.store(childEvent);
      eventStore.store(grandchildEvent);

      const timeline = historyService.getCorrelationTimeline('corr-1');

      expect(timeline.find(e => (e.entry as Event).id === 'root')?.depth).toBe(0);
      expect(timeline.find(e => (e.entry as Event).id === 'child')?.depth).toBe(1);
      expect(timeline.find(e => (e.entry as Event).id === 'grandchild')?.depth).toBe(2);
    });

    it('includes parentId for each entry', () => {
      const rootEvent = createEvent({
        id: 'root',
        correlationId: 'corr-1',
        timestamp: 1000,
      });
      const childEvent = createEvent({
        id: 'child',
        correlationId: 'corr-1',
        causationId: 'root',
        timestamp: 2000,
      });

      eventStore.store(rootEvent);
      eventStore.store(childEvent);

      const timeline = historyService.getCorrelationTimeline('corr-1');

      const rootEntry = timeline.find(e => (e.entry as Event).id === 'root');
      const childEntry = timeline.find(e => (e.entry as Event).id === 'child');

      expect(rootEntry?.parentId).toBeUndefined();
      expect(childEntry?.parentId).toBe('root');
    });
  });

  describe('exportTrace()', () => {
    it('exports to JSON format', () => {
      const event = createEvent({
        id: 'event-1',
        correlationId: 'corr-1',
        timestamp: 1000,
      });
      eventStore.store(event);

      const exported = historyService.exportTrace('corr-1', 'json');
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].entry.id).toBe('event-1');
    });

    it('exports to Mermaid sequence diagram format', () => {
      const event = createEvent({
        id: 'event-1',
        topic: 'order.created',
        source: 'api',
        correlationId: 'corr-1',
        timestamp: 1000,
      });
      eventStore.store(event);

      traceCollector.record('rule_executed', {}, {
        correlationId: 'corr-1',
        ruleId: 'rule-1',
        durationMs: 5,
        timestamp: 1001,
      });

      const mermaid = historyService.exportTrace('corr-1', 'mermaid');

      expect(mermaid).toContain('sequenceDiagram');
      expect(mermaid).toContain('title Correlation: corr-1');
      expect(mermaid).toContain('participant');
    });

    it('returns empty array in JSON for non-existent correlation', () => {
      const exported = historyService.exportTrace('non-existent', 'json');
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual([]);
    });

    it('sanitizes participant IDs in Mermaid output', () => {
      const event = createEvent({
        topic: 'order.created',
        source: 'my-api:8080',
        correlationId: 'corr-1',
      });
      eventStore.store(event);

      const mermaid = historyService.exportTrace('corr-1', 'mermaid');

      expect(mermaid).not.toContain(':8080');
      expect(mermaid).toContain('my_api_8080');
    });
  });

  describe('getEventWithContext()', () => {
    it('returns undefined for non-existent event', () => {
      const result = historyService.getEventWithContext('non-existent');

      expect(result).toBeUndefined();
    });

    it('returns event with trace entries', () => {
      const event = createEvent({ id: 'event-1', correlationId: 'corr-1' });
      eventStore.store(event);

      traceCollector.record('rule_executed', {}, {
        correlationId: 'corr-1',
        causationId: 'event-1',
        ruleId: 'rule-1',
      });

      const result = historyService.getEventWithContext('event-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('event-1');
      expect(result?.traceEntries).toHaveLength(1);
    });

    it('includes triggered rules information', () => {
      const event = createEvent({ id: 'event-1', correlationId: 'corr-1' });
      eventStore.store(event);

      traceCollector.record('rule_executed', {}, {
        correlationId: 'corr-1',
        causationId: 'event-1',
        ruleId: 'rule-1',
        ruleName: 'My Rule',
        durationMs: 15,
      });

      traceCollector.record('rule_skipped', {}, {
        correlationId: 'corr-1',
        causationId: 'event-1',
        ruleId: 'rule-2',
        ruleName: 'Skipped Rule',
      });

      const result = historyService.getEventWithContext('event-1');

      expect(result?.triggeredRules).toHaveLength(2);
      expect(result?.triggeredRules?.[0]).toMatchObject({
        ruleId: 'rule-1',
        ruleName: 'My Rule',
        executed: true,
        durationMs: 15,
      });
      expect(result?.triggeredRules?.[1]).toMatchObject({
        ruleId: 'rule-2',
        ruleName: 'Skipped Rule',
        executed: false,
      });
    });
  });

  describe('getCausationChain()', () => {
    it('returns empty array for non-existent event', () => {
      const chain = historyService.getCausationChain('non-existent');

      expect(chain).toEqual([]);
    });

    it('returns single event when no parent', () => {
      const event = createEvent({ id: 'event-1' });
      eventStore.store(event);

      const chain = historyService.getCausationChain('event-1');

      expect(chain).toHaveLength(1);
      expect(chain[0]?.id).toBe('event-1');
    });

    it('returns full causation chain from root to target', () => {
      const root = createEvent({ id: 'root' });
      const middle = createEvent({ id: 'middle', causationId: 'root' });
      const leaf = createEvent({ id: 'leaf', causationId: 'middle' });

      eventStore.store(root);
      eventStore.store(middle);
      eventStore.store(leaf);

      const chain = historyService.getCausationChain('leaf');

      expect(chain).toHaveLength(3);
      expect(chain.map(e => e.id)).toEqual(['root', 'middle', 'leaf']);
    });

    it('stops at missing parent', () => {
      const middle = createEvent({ id: 'middle', causationId: 'missing-root' });
      const leaf = createEvent({ id: 'leaf', causationId: 'middle' });

      eventStore.store(middle);
      eventStore.store(leaf);

      const chain = historyService.getCausationChain('leaf');

      expect(chain).toHaveLength(2);
      expect(chain.map(e => e.id)).toEqual(['middle', 'leaf']);
    });
  });

  describe('topic wildcard matching', () => {
    it('matches single wildcard (*)', () => {
      const event1 = createEvent({ topic: 'order.created', correlationId: 'corr-1', timestamp: 1000 });
      const event2 = createEvent({ topic: 'order.updated', correlationId: 'corr-1', timestamp: 2000 });
      const event3 = createEvent({ topic: 'payment.received', correlationId: 'corr-1', timestamp: 3000 });

      eventStore.store(event1);
      eventStore.store(event2);
      eventStore.store(event3);

      const result = historyService.query({
        correlationId: 'corr-1',
        topic: 'order.*',
      });

      expect(result.events).toHaveLength(2);
      expect(result.events.every(e => e.topic.startsWith('order.'))).toBe(true);
    });

    it('matches double wildcard (**)', () => {
      const event1 = createEvent({ topic: 'a.b.c', correlationId: 'corr-1', timestamp: 1000 });
      const event2 = createEvent({ topic: 'a.x', correlationId: 'corr-1', timestamp: 2000 });
      const event3 = createEvent({ topic: 'b.c', correlationId: 'corr-1', timestamp: 3000 });

      eventStore.store(event1);
      eventStore.store(event2);
      eventStore.store(event3);

      const result = historyService.query({
        correlationId: 'corr-1',
        topic: 'a.**',
      });

      expect(result.events).toHaveLength(2);
      expect(result.events.every(e => e.topic.startsWith('a.'))).toBe(true);
    });
  });
});
