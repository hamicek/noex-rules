import type {
  BaselineMetricConfig,
  BaselineConfig,
  BaselineStats,
  BaselineComparison,
  BaselineAggregation,
  AnomalyResult,
} from '../types/baseline.js';
import type { EventStore } from '../core/event-store.js';
import type { FactStore } from '../core/fact-store.js';
import type { TimerManager } from '../core/timer-manager.js';
import type { Event } from '../types/event.js';
import { parseDuration } from '../utils/duration-parser.js';
import { computeBaselineStats, checkAnomaly as checkAnomalyPure } from './statistics.js';

// ---------------------------------------------------------------------------
// Resolved config s výchozími hodnotami
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  metrics: BaselineMetricConfig[];
  defaultSensitivity: number;
  ewmaAlpha: number;
  minSamples: number;
}

// ---------------------------------------------------------------------------
// BaselineStore
// ---------------------------------------------------------------------------

/**
 * Orchestrátor pro výpočet a správu baseline statistik.
 *
 * Sbírá metriky z EventStore, počítá statistiky, ukládá výsledky do FactStore
 * a periodicky přepočítává přes interní scheduling.
 */
export class BaselineStore {
  private readonly eventStore: EventStore;
  private readonly factStore: FactStore;
  private readonly timerManager: TimerManager;
  private readonly cfg: ResolvedConfig;

  private readonly metrics: Map<string, BaselineMetricConfig> = new Map();
  private readonly baselines: Map<string, BaselineStats> = new Map();
  private readonly intervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(
    eventStore: EventStore,
    factStore: FactStore,
    timerManager: TimerManager,
    config: BaselineConfig,
  ) {
    this.eventStore = eventStore;
    this.factStore = factStore;
    this.timerManager = timerManager;
    this.cfg = {
      metrics: config.metrics,
      defaultSensitivity: config.defaultSensitivity ?? 2.0,
      ewmaAlpha: config.ewmaAlpha ?? 0.3,
      minSamples: config.minSamples ?? 10,
    };
  }

  static async start(
    eventStore: EventStore,
    factStore: FactStore,
    timerManager: TimerManager,
    config: BaselineConfig,
  ): Promise<BaselineStore> {
    const store = new BaselineStore(eventStore, factStore, timerManager, config);
    await store.initialize();
    return store;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    for (const metric of this.cfg.metrics) {
      this.registerMetric(metric);
    }
    await this.recalculateAll();
  }

  async stop(): Promise<void> {
    for (const handle of this.intervals.values()) {
      clearInterval(handle);
    }
    this.intervals.clear();
  }

  // ---------------------------------------------------------------------------
  // Metric registration
  // ---------------------------------------------------------------------------

  registerMetric(config: BaselineMetricConfig): void {
    if (this.metrics.has(config.name)) {
      this.unregisterMetric(config.name);
    }
    this.metrics.set(config.name, config);
    this.scheduleRecalculation(config);
  }

  unregisterMetric(name: string): boolean {
    if (!this.metrics.has(name)) return false;

    this.metrics.delete(name);

    const handle = this.intervals.get(name);
    if (handle) {
      clearInterval(handle);
      this.intervals.delete(name);
    }

    // Vyčistit cache – přímý klíč i groupované klíče (name:groupKey)
    for (const key of [...this.baselines.keys()]) {
      if (key === name || key.startsWith(`${name}:`)) {
        this.baselines.delete(key);
      }
    }

    // Vyčistit fakty
    this.factStore.delete(this.buildFactKey(name));
    for (const fact of this.factStore.query(`baseline:${name}:*`)) {
      this.factStore.delete(fact.key);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Recalculation
  // ---------------------------------------------------------------------------

  async recalculate(metricName: string, groupKey?: string): Promise<BaselineStats> {
    const metric = this.metrics.get(metricName);
    if (!metric) {
      throw new Error(`Unknown baseline metric: "${metricName}"`);
    }

    const now = Date.now();
    const trainingMs = parseDuration(metric.trainingPeriod);
    const from = now - trainingMs;

    const values = this.collectValues(metric, from, now, groupKey);

    const stats = computeBaselineStats(values, {
      metric: metricName,
      method: metric.method,
      ewmaAlpha: this.cfg.ewmaAlpha,
      dataFrom: from,
      dataTo: now,
      ...(groupKey !== undefined && { groupKey }),
    });

    const cacheKey = this.buildCacheKey(metricName, groupKey);
    this.baselines.set(cacheKey, stats);

    const factKey = this.buildFactKey(metricName, groupKey);
    this.factStore.set(factKey, stats, 'baseline');

    return stats;
  }

  async recalculateAll(): Promise<void> {
    for (const metric of this.metrics.values()) {
      if (metric.groupBy) {
        const groupKeys = this.discoverGroupKeys(metric);
        for (const gk of groupKeys) {
          await this.recalculate(metric.name, gk);
        }
        // Pokud nejsou žádné group keys, přesto provedeme výpočet bez groupKey
        if (groupKeys.length === 0) {
          await this.recalculate(metric.name);
        }
      } else {
        await this.recalculate(metric.name);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  getBaseline(metricName: string, groupKey?: string): BaselineStats | undefined {
    return this.baselines.get(this.buildCacheKey(metricName, groupKey));
  }

  checkAnomaly(
    metricName: string,
    value: number,
    comparison: BaselineComparison,
    sensitivity?: number,
    groupKey?: string,
  ): AnomalyResult | undefined {
    const stats = this.getBaseline(metricName, groupKey);
    if (!stats) return undefined;
    if (stats.sampleCount < this.cfg.minSamples) return undefined;

    return checkAnomalyPure(
      value,
      stats,
      comparison,
      sensitivity ?? this.cfg.defaultSensitivity,
    );
  }

  getMetrics(): BaselineMetricConfig[] {
    return [...this.metrics.values()];
  }

  getAllBaselines(): Map<string, BaselineStats> {
    return new Map(this.baselines);
  }

  // ---------------------------------------------------------------------------
  // Private — scheduling
  // ---------------------------------------------------------------------------

  private scheduleRecalculation(metric: BaselineMetricConfig): void {
    const intervalMs = parseDuration(metric.recalcInterval);
    const handle = setInterval(() => {
      void this.recalculateMetricSafe(metric.name);
    }, intervalMs);

    // Neblokovat ukončení procesu
    if (typeof handle === 'object' && 'unref' in handle) {
      (handle as NodeJS.Timeout).unref();
    }

    this.intervals.set(metric.name, handle);
  }

  private async recalculateMetricSafe(metricName: string): Promise<void> {
    try {
      const metric = this.metrics.get(metricName);
      if (!metric) return;

      if (metric.groupBy) {
        const groupKeys = this.discoverGroupKeys(metric);
        for (const gk of groupKeys) {
          await this.recalculate(metricName, gk);
        }
      } else {
        await this.recalculate(metricName);
      }
    } catch {
      // Tiché selhání v pozadí — recalc se pokusí znovu při dalším intervalu
    }
  }

  // ---------------------------------------------------------------------------
  // Private — data collection
  // ---------------------------------------------------------------------------

  private collectValues(
    metric: BaselineMetricConfig,
    from: number,
    to: number,
    groupKey?: string,
  ): number[] {
    let events = this.getEventsInRange(metric.topic, from, to);

    if (metric.filter) {
      events = events.filter(e => this.matchesFilter(e, metric.filter!));
    }

    if (groupKey && metric.groupBy) {
      events = events.filter(e => this.extractField(e.data, metric.groupBy!) === groupKey);
    }

    if (events.length === 0) return [];

    const windowMs = parseDuration(metric.sampleWindow);
    return this.aggregateWindows(events, metric.field, metric.function, windowMs, from);
  }

  private aggregateWindows(
    events: Event[],
    field: string,
    fn: BaselineAggregation,
    windowMs: number,
    from: number,
  ): number[] {
    const buckets = new Map<number, number[]>();

    for (const event of events) {
      const idx = Math.floor((event.timestamp - from) / windowMs);

      let bucket = buckets.get(idx);
      if (!bucket) {
        bucket = [];
        buckets.set(idx, bucket);
      }

      if (fn === 'count') {
        bucket.push(1);
      } else {
        const val = this.extractField(event.data, field);
        if (typeof val === 'number' && Number.isFinite(val)) {
          bucket.push(val);
        }
      }
    }

    const result: number[] = [];
    for (const values of buckets.values()) {
      if (values.length > 0) {
        result.push(this.aggregate(values, fn));
      }
    }
    return result;
  }

  private aggregate(values: number[], fn: BaselineAggregation): number {
    switch (fn) {
      case 'count':
        return values.length;
      case 'sum': {
        let s = 0;
        for (const v of values) s += v;
        return s;
      }
      case 'avg': {
        let s = 0;
        for (const v of values) s += v;
        return s / values.length;
      }
      case 'min': {
        let m = values[0]!;
        for (let i = 1; i < values.length; i++) {
          if (values[i]! < m) m = values[i]!;
        }
        return m;
      }
      case 'max': {
        let m = values[0]!;
        for (let i = 1; i < values.length; i++) {
          if (values[i]! > m) m = values[i]!;
        }
        return m;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — event querying
  // ---------------------------------------------------------------------------

  private getEventsInRange(topic: string, from: number, to: number): Event[] {
    if (topic.includes('*')) {
      return this.eventStore
        .getByTopicPattern(topic)
        .filter(e => e.timestamp >= from && e.timestamp <= to);
    }
    return this.eventStore.getInTimeRange(topic, from, to);
  }

  // ---------------------------------------------------------------------------
  // Private — field extraction & filtering
  // ---------------------------------------------------------------------------

  private extractField(data: Record<string, unknown>, field: string): unknown {
    const parts = field.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private matchesFilter(event: Event, filter: Record<string, unknown>): boolean {
    for (const [key, expected] of Object.entries(filter)) {
      if (this.extractField(event.data, key) !== expected) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Private — groupBy discovery
  // ---------------------------------------------------------------------------

  private discoverGroupKeys(metric: BaselineMetricConfig): string[] {
    if (!metric.groupBy) return [];

    const now = Date.now();
    const trainingMs = parseDuration(metric.trainingPeriod);
    const events = this.getEventsInRange(metric.topic, now - trainingMs, now);

    const keys = new Set<string>();
    for (const event of events) {
      const val = this.extractField(event.data, metric.groupBy);
      if (typeof val === 'string') {
        keys.add(val);
      }
    }
    return [...keys];
  }

  // ---------------------------------------------------------------------------
  // Private — key builders
  // ---------------------------------------------------------------------------

  private buildCacheKey(metricName: string, groupKey?: string): string {
    return groupKey ? `${metricName}:${groupKey}` : metricName;
  }

  private buildFactKey(metricName: string, groupKey?: string): string {
    return groupKey
      ? `baseline:${metricName}:${groupKey}:stats`
      : `baseline:${metricName}:stats`;
  }
}
