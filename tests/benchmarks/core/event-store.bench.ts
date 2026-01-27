import { bench, describe } from 'vitest';
import { EventStore } from '../../../src/core/event-store.js';
import {
  generateEvents,
  generateCorrelatedEventGroups,
  generateTimeRangeEvents,
  generateHighFrequencyEvents
} from '../fixtures/index.js';

describe('EventStore', () => {
  describe('store() - write operations', () => {
    bench('store() - 100 events', () => {
      const store = new EventStore({ maxEvents: 50000 });
      const events = generateEvents(100);
      for (const event of events) {
        store.store(event);
      }
    });

    bench('store() - 1,000 events', () => {
      const store = new EventStore({ maxEvents: 50000 });
      const events = generateEvents(1000);
      for (const event of events) {
        store.store(event);
      }
    });

    bench('store() - with correlation', () => {
      const store = new EventStore({ maxEvents: 50000 });
      const events = generateEvents(100, { correlationGroups: 10 });
      for (const event of events) {
        store.store(event);
      }
    });
  });

  describe('get() - read by ID', () => {
    const store = new EventStore({ maxEvents: 50000 });
    const events = generateEvents(10000);
    for (const event of events) {
      store.store(event);
    }

    bench('get() - existing event (10k store)', () => {
      for (let i = 0; i < 100; i++) {
        const randomIndex = Math.floor(Math.random() * events.length);
        store.get(events[randomIndex].id);
      }
    });

    bench('get() - non-existing event', () => {
      for (let i = 0; i < 100; i++) {
        store.get(`non-existing-event-id-${i}`);
      }
    });
  });

  describe('getByCorrelation() - correlation queries', () => {
    const store = new EventStore({ maxEvents: 50000 });
    const groups = generateCorrelatedEventGroups(
      100,
      50,
      ['order.created', 'payment.completed', 'shipping.dispatched']
    );
    const correlationIds: string[] = [];
    for (const group of groups) {
      for (const event of group) {
        store.store(event);
        if (event.correlationId && !correlationIds.includes(event.correlationId)) {
          correlationIds.push(event.correlationId);
        }
      }
    }

    bench('getByCorrelation() - existing group', () => {
      for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * correlationIds.length);
        store.getByCorrelation(correlationIds[randomIndex]);
      }
    });

    bench('getByCorrelation() - non-existing', () => {
      for (let i = 0; i < 10; i++) {
        store.getByCorrelation(`non-existing-correlation-${i}`);
      }
    });
  });

  describe('getInTimeRange() - time-based queries', () => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const store = new EventStore({ maxEvents: 50000 });
    const events = generateTimeRangeEvents(10000, dayAgo, now, 'order.created');
    for (const event of events) {
      store.store(event);
    }

    bench('getInTimeRange() - last hour', () => {
      store.getInTimeRange('order.created', now - 60 * 60 * 1000, now);
    });

    bench('getInTimeRange() - last 6 hours', () => {
      store.getInTimeRange('order.created', now - 6 * 60 * 60 * 1000, now);
    });

    bench('getInTimeRange() - full day', () => {
      store.getInTimeRange('order.created', dayAgo, now);
    });

    bench('getInTimeRange() - narrow window (5 min)', () => {
      store.getInTimeRange('order.created', now - 5 * 60 * 1000, now);
    });

    bench('getInTimeRange() - non-matching topic', () => {
      store.getInTimeRange('non.existing.topic', now - 60 * 60 * 1000, now);
    });
  });

  describe('countInWindow() - window counting', () => {
    const store = new EventStore({ maxEvents: 50000 });
    const events = generateHighFrequencyEvents(5000, 'user.logged_in', 100);
    for (const event of events) {
      store.store(event);
    }

    bench('countInWindow() - 1 minute', () => {
      store.countInWindow('user.logged_in', 60 * 1000);
    });

    bench('countInWindow() - 1 hour', () => {
      store.countInWindow('user.logged_in', 60 * 60 * 1000);
    });
  });

  describe('prune() - cleanup operations', () => {
    bench('prune() - remove 50% of events', () => {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const store = new EventStore({ maxEvents: 50000 });
      const events = generateTimeRangeEvents(5000, dayAgo, now);
      for (const event of events) {
        store.store(event);
      }
      store.prune(12 * 60 * 60 * 1000); // 12 hours
    });
  });

  describe('auto-prune - triggered by maxEvents', () => {
    bench('store() with auto-prune (maxEvents=1000, storing 1500)', () => {
      const store = new EventStore({ maxEvents: 1000 });
      const events = generateEvents(1500);
      for (const event of events) {
        store.store(event);
      }
    });

    bench('store() with auto-prune (maxEvents=5000, storing 7500)', () => {
      const store = new EventStore({ maxEvents: 5000 });
      const events = generateEvents(7500);
      for (const event of events) {
        store.store(event);
      }
    });
  });

  describe('scalability - varying store sizes', () => {
    const scales = [100, 1000, 10000] as const;
    const now = Date.now();
    const stores = new Map<number, { store: EventStore; events: ReturnType<typeof generateEvents> }>();

    for (const scale of scales) {
      const store = new EventStore({ maxEvents: scale * 2 });
      const events = generateTimeRangeEvents(scale, now - 24 * 60 * 60 * 1000, now, 'order.created');
      for (const event of events) {
        store.store(event);
      }
      stores.set(scale, { store, events });
    }

    bench('get() - 100 events', () => {
      const { store, events } = stores.get(100)!;
      for (let i = 0; i < 50; i++) {
        store.get(events[i % events.length].id);
      }
    });

    bench('get() - 1,000 events', () => {
      const { store, events } = stores.get(1000)!;
      for (let i = 0; i < 50; i++) {
        store.get(events[Math.floor(Math.random() * events.length)].id);
      }
    });

    bench('get() - 10,000 events', () => {
      const { store, events } = stores.get(10000)!;
      for (let i = 0; i < 50; i++) {
        store.get(events[Math.floor(Math.random() * events.length)].id);
      }
    });

    bench('getInTimeRange() - 100 events', () => {
      stores.get(100)!.store.getInTimeRange('order.created', now - 60 * 60 * 1000, now);
    });

    bench('getInTimeRange() - 1,000 events', () => {
      stores.get(1000)!.store.getInTimeRange('order.created', now - 60 * 60 * 1000, now);
    });

    bench('getInTimeRange() - 10,000 events', () => {
      stores.get(10000)!.store.getInTimeRange('order.created', now - 60 * 60 * 1000, now);
    });
  });

  describe('multi-topic operations', () => {
    const topics = ['order.created', 'order.completed', 'payment.completed', 'shipping.dispatched'];
    const store = new EventStore({ maxEvents: 50000 });
    for (const topic of topics) {
      const events = generateEvents(2500, { topic, topicDistribution: [topic] });
      for (const event of events) {
        store.store(event);
      }
    }

    bench('getInTimeRange() - single topic from 4-topic store (10k total)', () => {
      const now = Date.now();
      store.getInTimeRange('order.created', now - 60 * 60 * 1000, now);
    });

    bench('countInWindow() - single topic from 4-topic store (10k total)', () => {
      store.countInWindow('payment.completed', 60 * 60 * 1000);
    });
  });

  describe('high-frequency event processing', () => {
    bench('store high-frequency events (100 events, 10ms intervals)', () => {
      const store = new EventStore({ maxEvents: 50000 });
      const events = generateHighFrequencyEvents(100, 'metrics.collected', 10);
      for (const event of events) {
        store.store(event);
      }
    });

    bench('store high-frequency events (1000 events, 1ms intervals)', () => {
      const store = new EventStore({ maxEvents: 50000 });
      const events = generateHighFrequencyEvents(1000, 'metrics.collected', 1);
      for (const event of events) {
        store.store(event);
      }
    });
  });
});
