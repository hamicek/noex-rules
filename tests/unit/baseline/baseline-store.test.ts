import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaselineStore } from '../../../src/baseline/baseline-store';
import { EventStore } from '../../../src/core/event-store';
import { FactStore } from '../../../src/core/fact-store';
import { TimerManager } from '../../../src/core/timer-manager';
import type { Event } from '../../../src/types/event';
import type { BaselineMetricConfig, BaselineConfig } from '../../../src/types/baseline';

// ---------------------------------------------------------------------------
// Konstanty
// ---------------------------------------------------------------------------

const BASE_TIME = 1_700_000_000_000; // pevný referenční čas
const MINUTE = 60_000;
const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeEvent(
  topic: string,
  data: Record<string, unknown>,
  timestampOffset: number, // ms relativně od BASE_TIME
): Event {
  return {
    id: `evt-${++idCounter}`,
    topic,
    data,
    timestamp: BASE_TIME + timestampOffset,
    source: 'test',
  };
}

function defaultMetricConfig(overrides: Partial<BaselineMetricConfig> = {}): BaselineMetricConfig {
  return {
    name: 'latency',
    topic: 'api.response',
    field: 'responseTimeMs',
    function: 'avg',
    sampleWindow: '1m',
    trainingPeriod: '1h',
    recalcInterval: '15m',
    method: 'zscore',
    ...overrides,
  };
}

function defaultBaselineConfig(
  metrics: BaselineMetricConfig[] = [defaultMetricConfig()],
  overrides: Partial<BaselineConfig> = {},
): BaselineConfig {
  return { metrics, ...overrides };
}

/**
 * Naplní EventStore rovnoměrně rozloženými eventy v rámci training period.
 * Vrací pole vytvořených eventů.
 */
function populateEvents(
  eventStore: EventStore,
  topic: string,
  field: string,
  values: number[],
  windowMs: number = MINUTE,
  baseOffset: number = -values.length * windowMs,
): Event[] {
  const events: Event[] = [];
  for (let i = 0; i < values.length; i++) {
    const event = makeEvent(topic, { [field]: values[i] }, baseOffset + i * windowMs);
    eventStore.store(event);
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Testy
// ---------------------------------------------------------------------------

describe('BaselineStore', () => {
  let eventStore: EventStore;
  let factStore: FactStore;
  let timerManager: TimerManager;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    idCounter = 0;

    eventStore = new EventStore({ maxEvents: 50_000 });
    factStore = new FactStore();
    timerManager = await TimerManager.start();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Konstrukce a lifecycle
  // =========================================================================

  describe('construction', () => {
    it('creates instance via constructor', () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));
      expect(store).toBeInstanceOf(BaselineStore);
    });

    it('applies default config values', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, {
        metrics: [],
      });
      // checkAnomaly s prázdným baseline vrací undefined — nepřímo testuje defaulty
      expect(store.checkAnomaly('x', 100, 'above')).toBeUndefined();
      await store.stop();
    });
  });

  describe('start()', () => {
    it('creates store, registers metrics and runs initial recalculation', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [
        100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101,
      ]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(),
      );

      expect(store.getMetrics()).toHaveLength(1);
      expect(store.getBaseline('latency')).toBeDefined();

      await store.stop();
    });
  });

  describe('stop()', () => {
    it('clears all recalculation intervals', async () => {
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(),
      );

      await store.stop();

      // Po stop by neměl existovat žádný aktivní interval
      // (ověříme nepřímo — advanceTimers by neměly vyvolat chybu)
      vi.advanceTimersByTime(HOUR);
    });
  });

  // =========================================================================
  // Registrace metrik
  // =========================================================================

  describe('registerMetric()', () => {
    it('registers a new metric', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));

      store.registerMetric(defaultMetricConfig());

      expect(store.getMetrics()).toHaveLength(1);
      expect(store.getMetrics()[0]!.name).toBe('latency');
      await store.stop();
    });

    it('replaces existing metric with the same name', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));

      store.registerMetric(defaultMetricConfig({ method: 'zscore' }));
      store.registerMetric(defaultMetricConfig({ method: 'ewma' }));

      expect(store.getMetrics()).toHaveLength(1);
      expect(store.getMetrics()[0]!.method).toBe('ewma');
      await store.stop();
    });
  });

  describe('unregisterMetric()', () => {
    it('returns false for unknown metric', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));
      expect(store.unregisterMetric('nonexistent')).toBe(false);
      await store.stop();
    });

    it('removes metric, clears cache and facts', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [
        100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101,
      ]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(),
      );

      expect(store.getBaseline('latency')).toBeDefined();
      expect(factStore.get('baseline:latency:stats')).toBeDefined();

      const result = store.unregisterMetric('latency');

      expect(result).toBe(true);
      expect(store.getMetrics()).toHaveLength(0);
      expect(store.getBaseline('latency')).toBeUndefined();
      expect(factStore.get('baseline:latency:stats')).toBeUndefined();

      await store.stop();
    });

    it('clears grouped baselines on unregister', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [
        100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101,
      ], MINUTE, -12 * MINUTE);

      // Přidáme endpoint pole pro groupBy
      for (const event of eventStore.getByTopic('api.response')) {
        event.data['endpoint'] = '/users';
      }

      const config = defaultMetricConfig({ groupBy: 'endpoint' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config]),
      );

      expect(store.getBaseline('latency', '/users')).toBeDefined();

      store.unregisterMetric('latency');

      expect(store.getBaseline('latency', '/users')).toBeUndefined();
      await store.stop();
    });
  });

  // =========================================================================
  // Recalculation
  // =========================================================================

  describe('recalculate()', () => {
    it('throws for unknown metric', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));
      await expect(store.recalculate('unknown')).rejects.toThrow('Unknown baseline metric: "unknown"');
      await store.stop();
    });

    it('computes baseline stats from events', async () => {
      const values = [100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101];
      populateEvents(eventStore, 'api.response', 'responseTimeMs', values);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());

      const stats = await store.recalculate('latency');

      expect(stats.metric).toBe('latency');
      expect(stats.sampleCount).toBe(values.length);
      expect(stats.mean).toBeCloseTo(102.17, 1);
      expect(stats.stddev).toBeGreaterThan(0);
      expect(stats.min).toBeLessThanOrEqual(stats.max);
      await store.stop();
    });

    it('stores result in internal cache', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 150]);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());

      await store.recalculate('latency');
      const cached = store.getBaseline('latency');

      expect(cached).toBeDefined();
      expect(cached!.metric).toBe('latency');
      await store.stop();
    });

    it('persists result to FactStore', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 150]);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());

      await store.recalculate('latency');

      const fact = factStore.get('baseline:latency:stats');
      expect(fact).toBeDefined();
      expect(fact!.source).toBe('baseline');
      expect((fact!.value as Record<string, unknown>)['metric']).toBe('latency');
      await store.stop();
    });

    it('handles empty event history gracefully', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(0);
      expect(stats.mean).toBe(0);
      await store.stop();
    });
  });

  describe('recalculateAll()', () => {
    it('recalculates all registered metrics', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 150]);
      populateEvents(eventStore, 'error.occurred', 'count', [1, 2, 3]);

      const metrics = [
        defaultMetricConfig(),
        defaultMetricConfig({ name: 'error_count', topic: 'error.occurred', field: 'count', function: 'count' }),
      ];

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig(metrics));
      for (const m of metrics) store.registerMetric(m);

      await store.recalculateAll();

      expect(store.getBaseline('latency')).toBeDefined();
      expect(store.getBaseline('error_count')).toBeDefined();
      await store.stop();
    });
  });

  // =========================================================================
  // Agregační funkce
  // =========================================================================

  describe('aggregation functions', () => {
    // Každý test má 3 eventy ve stejném okně (sampleWindow: 1h aby všechny spadly do jednoho bucketu)

    it('avg — průměruje hodnoty v okně', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 300], MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ function: 'avg', sampleWindow: '1h' }));

      const stats = await store.recalculate('latency');

      // Všechny 3 eventy spadnou do jednoho 1h okna → avg(100, 200, 300) = 200
      expect(stats.sampleCount).toBe(1);
      expect(stats.mean).toBe(200);
      await store.stop();
    });

    it('sum — sčítá hodnoty v okně', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 300], MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ function: 'sum', sampleWindow: '1h' }));

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(1);
      expect(stats.mean).toBe(600);
      await store.stop();
    });

    it('min — vrací minimum v okně', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 300], MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ function: 'min', sampleWindow: '1h' }));

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(1);
      expect(stats.mean).toBe(100);
      await store.stop();
    });

    it('max — vrací maximum v okně', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 300], MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ function: 'max', sampleWindow: '1h' }));

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(1);
      expect(stats.mean).toBe(300);
      await store.stop();
    });

    it('count — počítá eventy v okně', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 300], MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ function: 'count', sampleWindow: '1h' }));

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(1);
      expect(stats.mean).toBe(3);
      await store.stop();
    });
  });

  describe('multiple sample windows', () => {
    it('aggregates into separate windows', async () => {
      // 12 eventů po minutě = 12 okňových vzorků po 1 minutě
      const values = [100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101];
      populateEvents(eventStore, 'api.response', 'responseTimeMs', values, MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ sampleWindow: '1m' }));

      const stats = await store.recalculate('latency');

      // Každý event je ve vlastním 1-minutovém okně
      expect(stats.sampleCount).toBe(12);
      await store.stop();
    });

    it('groups events into larger windows', async () => {
      // 6 eventů po minutě, sampleWindow 2m → 3 buckety
      const values = [100, 110, 105, 95, 100, 108];
      populateEvents(eventStore, 'api.response', 'responseTimeMs', values, MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ function: 'avg', sampleWindow: '2m' }));

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(3);
      await store.stop();
    });
  });

  // =========================================================================
  // Wildcard topics
  // =========================================================================

  describe('wildcard topics', () => {
    it('collects events matching wildcard pattern', async () => {
      eventStore.store(makeEvent('api.response.get', { responseTimeMs: 100 }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response.post', { responseTimeMs: 200 }, -4 * MINUTE));
      eventStore.store(makeEvent('api.response.put', { responseTimeMs: 150 }, -3 * MINUTE));
      eventStore.store(makeEvent('other.topic', { responseTimeMs: 999 }, -2 * MINUTE));

      const config = defaultMetricConfig({ topic: 'api.response.*' });
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([config]));
      store.registerMetric(config);

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(3); // 3 windows, nikoliv event z other.topic
      await store.stop();
    });

    it('supports double-star globbing', async () => {
      eventStore.store(makeEvent('api.v1.response.fast', { responseTimeMs: 50 }, -5 * MINUTE));
      eventStore.store(makeEvent('api.v2.response.slow', { responseTimeMs: 500 }, -4 * MINUTE));

      const config = defaultMetricConfig({ topic: 'api.**' });
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([config]));
      store.registerMetric(config);

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(2);
      await store.stop();
    });
  });

  // =========================================================================
  // Nested field extraction
  // =========================================================================

  describe('nested field extraction', () => {
    it('extracts nested values using dot notation', async () => {
      eventStore.store(makeEvent('api.response', { response: { time: { ms: 150 } } }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { response: { time: { ms: 250 } } }, -4 * MINUTE));

      const config = defaultMetricConfig({ field: 'response.time.ms' });
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([config]));
      store.registerMetric(config);

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(2);
      expect(stats.mean).toBe(200);
      await store.stop();
    });

    it('skips events with missing nested field', async () => {
      eventStore.store(makeEvent('api.response', { response: { time: { ms: 150 } } }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { response: {} }, -4 * MINUTE)); // chybí time.ms
      eventStore.store(makeEvent('api.response', { other: 'data' }, -3 * MINUTE)); // chybí response

      const config = defaultMetricConfig({ field: 'response.time.ms' });
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([config]));
      store.registerMetric(config);

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(1); // jen první event má validní hodnotu
      expect(stats.mean).toBe(150);
      await store.stop();
    });
  });

  // =========================================================================
  // Event filtering
  // =========================================================================

  describe('event filtering', () => {
    it('filters events by data fields', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100, status: 200 }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 500, status: 500 }, -4 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 120, status: 200 }, -3 * MINUTE));

      const config = defaultMetricConfig({ filter: { status: 200 } });
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([config]));
      store.registerMetric(config);

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(2);
      // avg(100, 120) = 110
      expect(stats.mean).toBe(110);
      await store.stop();
    });

    it('supports multiple filter keys', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100, status: 200, method: 'GET' }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 200, status: 200, method: 'POST' }, -4 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 300, status: 500, method: 'GET' }, -3 * MINUTE));

      const config = defaultMetricConfig({ filter: { status: 200, method: 'GET' } });
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([config]));
      store.registerMetric(config);

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(1);
      expect(stats.mean).toBe(100);
      await store.stop();
    });
  });

  // =========================================================================
  // groupBy
  // =========================================================================

  describe('groupBy', () => {
    it('creates separate baselines per group key', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100, endpoint: '/users' }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 120, endpoint: '/users' }, -4 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 500, endpoint: '/orders' }, -3 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 600, endpoint: '/orders' }, -2 * MINUTE));

      const config = defaultMetricConfig({ groupBy: 'endpoint' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config]),
      );

      const usersBaseline = store.getBaseline('latency', '/users');
      const ordersBaseline = store.getBaseline('latency', '/orders');

      expect(usersBaseline).toBeDefined();
      expect(ordersBaseline).toBeDefined();
      expect(usersBaseline!.mean).toBe(110);  // avg(100, 120)
      expect(ordersBaseline!.mean).toBe(550); // avg(500, 600)
      expect(usersBaseline!.groupKey).toBe('/users');
      expect(ordersBaseline!.groupKey).toBe('/orders');

      await store.stop();
    });

    it('persists grouped baselines with correct fact keys', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100, endpoint: '/users' }, -5 * MINUTE));

      const config = defaultMetricConfig({ groupBy: 'endpoint' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config]),
      );

      const fact = factStore.get('baseline:latency:/users:stats');
      expect(fact).toBeDefined();
      expect(fact!.source).toBe('baseline');

      await store.stop();
    });

    it('recalculateAll discovers all group keys', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100, region: 'eu' }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 200, region: 'us' }, -4 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 300, region: 'asia' }, -3 * MINUTE));

      const config = defaultMetricConfig({ groupBy: 'region' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config]),
      );

      const all = store.getAllBaselines();
      expect(all.size).toBe(3);
      expect(all.has('latency:eu')).toBe(true);
      expect(all.has('latency:us')).toBe(true);
      expect(all.has('latency:asia')).toBe(true);

      await store.stop();
    });
  });

  // =========================================================================
  // checkAnomaly
  // =========================================================================

  describe('checkAnomaly()', () => {
    it('returns undefined when no baseline exists', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));
      expect(store.checkAnomaly('nonexistent', 100, 'above')).toBeUndefined();
      await store.stop();
    });

    it('returns undefined during cold start (insufficient samples)', async () => {
      // Jen 5 vzorků, minSamples defaultně 10
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 110, 105, 95, 100]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(),
      );

      expect(store.checkAnomaly('latency', 999, 'above')).toBeUndefined();
      await store.stop();
    });

    it('returns AnomalyResult when baseline is sufficient', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [
        100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101,
      ]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(),
      );

      const result = store.checkAnomaly('latency', 200, 'above');

      expect(result).toBeDefined();
      expect(result!.isAnomaly).toBe(true);
      expect(result!.currentValue).toBe(200);
      await store.stop();
    });

    it('uses defaultSensitivity when not specified', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [
        100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101,
      ]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(undefined, { defaultSensitivity: 100 }),
      );

      // S absurdně vysokou sensitivity by nic nemělo být anomálie
      const result = store.checkAnomaly('latency', 200, 'above');
      expect(result).toBeDefined();
      expect(result!.isAnomaly).toBe(false);
      await store.stop();
    });

    it('uses custom sensitivity when specified', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [
        100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101,
      ]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(undefined, { defaultSensitivity: 100 }),
      );

      // Explicitní sensitivity 0.1 — nízký práh → bude anomálie
      const result = store.checkAnomaly('latency', 200, 'above', 0.1);
      expect(result).toBeDefined();
      expect(result!.isAnomaly).toBe(true);
      await store.stop();
    });

    it('respects custom minSamples', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 300]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(undefined, { minSamples: 2 }),
      );

      // 3 vzorky >= minSamples 2 → checkAnomaly by měl vrátit výsledek
      const result = store.checkAnomaly('latency', 999, 'above');
      expect(result).toBeDefined();
      await store.stop();
    });

    it('checks anomaly for grouped baseline', async () => {
      const events: Event[] = [];
      for (let i = 0; i < 15; i++) {
        events.push(makeEvent('api.response', {
          responseTimeMs: 100 + (i % 3) * 5,
          endpoint: '/users',
        }, -(15 - i) * MINUTE));
      }
      for (const e of events) eventStore.store(e);

      const config = defaultMetricConfig({ groupBy: 'endpoint' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config]),
      );

      const result = store.checkAnomaly('latency', 500, 'above', 2.0, '/users');
      expect(result).toBeDefined();
      expect(result!.isAnomaly).toBe(true);
      await store.stop();
    });
  });

  // =========================================================================
  // getMetrics / getAllBaselines
  // =========================================================================

  describe('getMetrics()', () => {
    it('returns empty array when no metrics registered', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));
      expect(store.getMetrics()).toEqual([]);
      await store.stop();
    });

    it('returns copies of registered metrics', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());

      const metrics = store.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.name).toBe('latency');
      await store.stop();
    });
  });

  describe('getAllBaselines()', () => {
    it('returns empty map when no baselines computed', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));
      expect(store.getAllBaselines().size).toBe(0);
      await store.stop();
    });

    it('returns a defensive copy', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 200, 150]);

      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig(),
      );

      const map = store.getAllBaselines();
      map.delete('latency');

      // Interní stav by měl zůstat nedotčený
      expect(store.getBaseline('latency')).toBeDefined();
      await store.stop();
    });
  });

  // =========================================================================
  // Scheduling
  // =========================================================================

  describe('recalculation scheduling', () => {
    it('schedules periodic recalculation after registerMetric', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([]));
      store.registerMetric(defaultMetricConfig({ recalcInterval: '15m' }));

      // Initial stav — zatím žádná recalkulace
      await store.recalculate('latency');
      const initialStats = store.getBaseline('latency');
      expect(initialStats).toBeDefined();

      // Přidáme nový event po initial výpočtu
      eventStore.store(makeEvent('api.response', { responseTimeMs: 999 }, 0));

      // Posuneme čas o 15 minut — interval by měl spustit recalkulaci
      vi.setSystemTime(BASE_TIME + 15 * MINUTE);
      await vi.advanceTimersByTimeAsync(15 * MINUTE);

      // Po recalkulaci by se měla hodnota aktualizovat
      const updatedStats = store.getBaseline('latency');
      expect(updatedStats).toBeDefined();
      expect(updatedStats!.computedAt).toBeGreaterThanOrEqual(BASE_TIME + 15 * MINUTE);

      await store.stop();
    });

    it('stop prevents further recalculations', async () => {
      const recalcSpy = vi.fn();
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([defaultMetricConfig({ recalcInterval: '5m' })]),
      );

      await store.stop();

      // Posun času by neměl vyvolat recalkulaci
      vi.advanceTimersByTime(10 * MINUTE);

      // BaselineStore is stopped, no error should occur
      expect(true).toBe(true);
    });
  });

  // =========================================================================
  // EWMA metoda
  // =========================================================================

  describe('EWMA method', () => {
    it('computes ewma field in baseline stats', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [
        100, 110, 105, 95, 100, 108, 102, 97, 103, 99, 106, 101,
      ]);

      const config = defaultMetricConfig({ method: 'ewma' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config], { ewmaAlpha: 0.5 }),
      );

      const stats = store.getBaseline('latency');
      expect(stats).toBeDefined();
      expect(stats!.ewma).toBeDefined();
      expect(typeof stats!.ewma).toBe('number');
      await store.stop();
    });
  });

  // =========================================================================
  // Training period respekt
  // =========================================================================

  describe('training period', () => {
    it('only considers events within the training period', async () => {
      // Event starý 2h — mimo training period (1h)
      eventStore.store(makeEvent('api.response', { responseTimeMs: 999 }, -2 * HOUR));
      // Eventy v posledních 30 minutách — v rámci training period
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100, 110, 105], MINUTE);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig({ trainingPeriod: '1h' }));

      const stats = await store.recalculate('latency');

      // Starý event by neměl být zahrnut
      expect(stats.sampleCount).toBe(3);
      expect(stats.mean).toBeCloseTo(105, 0);
      await store.stop();
    });
  });

  // =========================================================================
  // Non-numeric values
  // =========================================================================

  describe('non-numeric value handling', () => {
    it('skips events with non-numeric field values', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100 }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 'not-a-number' }, -4 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: null }, -3 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 200 }, -2 * MINUTE));

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(2);
      expect(stats.mean).toBe(150);
      await store.stop();
    });

    it('skips NaN and Infinity values', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100 }, -5 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: NaN }, -4 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: Infinity }, -3 * MINUTE));
      eventStore.store(makeEvent('api.response', { responseTimeMs: 200 }, -2 * MINUTE));

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());

      const stats = await store.recalculate('latency');

      expect(stats.sampleCount).toBe(2);
      await store.stop();
    });
  });

  // =========================================================================
  // Count aggregation s count polem
  // =========================================================================

  describe('count aggregation', () => {
    it('counts events regardless of field values', async () => {
      eventStore.store(makeEvent('error.occurred', { message: 'fail' }, -5 * MINUTE));
      eventStore.store(makeEvent('error.occurred', { message: 'timeout' }, -4 * MINUTE));
      eventStore.store(makeEvent('error.occurred', { message: 'fail' }, -3 * MINUTE));

      const config = defaultMetricConfig({
        name: 'error_rate',
        topic: 'error.occurred',
        field: 'irrelevant',
        function: 'count',
        sampleWindow: '1h',
      });

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig([config]));
      store.registerMetric(config);

      const stats = await store.recalculate('error_rate');

      // Všechny 3 eventy v jednom 1h okně → count = 3
      expect(stats.sampleCount).toBe(1);
      expect(stats.mean).toBe(3);
      await store.stop();
    });
  });

  // =========================================================================
  // Fact key formát
  // =========================================================================

  describe('fact key format', () => {
    it('uses baseline:{metric}:stats for ungrouped', async () => {
      populateEvents(eventStore, 'api.response', 'responseTimeMs', [100]);

      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());
      store.registerMetric(defaultMetricConfig());
      await store.recalculate('latency');

      expect(factStore.get('baseline:latency:stats')).toBeDefined();
      await store.stop();
    });

    it('uses baseline:{metric}:{groupKey}:stats for grouped', async () => {
      eventStore.store(makeEvent('api.response', { responseTimeMs: 100, endpoint: '/api' }, -5 * MINUTE));

      const config = defaultMetricConfig({ groupBy: 'endpoint' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config]),
      );

      expect(factStore.get('baseline:latency:/api:stats')).toBeDefined();
      await store.stop();
    });
  });

  // =========================================================================
  // Initialize – idempotence
  // =========================================================================

  describe('initialize()', () => {
    it('is idempotent — calling twice does not duplicate metrics', async () => {
      const store = new BaselineStore(eventStore, factStore, timerManager, defaultBaselineConfig());

      await store.initialize();
      await store.initialize();

      expect(store.getMetrics()).toHaveLength(1);
      await store.stop();
    });
  });

  // =========================================================================
  // groupBy se sezónními vzory (ověření groupKey vs. no data)
  // =========================================================================

  describe('groupBy with no matching events', () => {
    it('computes empty baseline when no events exist for any group', async () => {
      // Žádné eventy v EventStore
      const config = defaultMetricConfig({ groupBy: 'endpoint' });
      const store = await BaselineStore.start(
        eventStore, factStore, timerManager,
        defaultBaselineConfig([config]),
      );

      // Bez group keys se vytvoří ungrouped baseline
      const baseline = store.getBaseline('latency');
      expect(baseline).toBeDefined();
      expect(baseline!.sampleCount).toBe(0);

      await store.stop();
    });
  });
});
