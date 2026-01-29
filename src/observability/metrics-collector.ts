/**
 * Produkční MetricsCollector pro sběr Prometheus metrik z TraceCollector streamu.
 *
 * Subscribuje se na TraceCollector (stejný vzor jako Profiler) a v reálném čase
 * agreguje countery, histogramy a gauges. Gauges se čtou lazy při scrape time
 * přes callback na EngineStats.
 */

import type { TraceCollector } from '../debugging/trace-collector.js';
import type { DebugTraceEntry } from '../debugging/types.js';
import type { EngineStats } from '../types/index.js';
import type {
  MetricsConfig,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  MetricLabels,
} from './types.js';
import {
  DEFAULT_HISTOGRAM_BUCKETS,
  DEFAULT_MAX_LABELED_RULES,
} from './types.js';

// ---------------------------------------------------------------------------
// Interní typy
// ---------------------------------------------------------------------------

interface InternalCounter {
  help: string;
  values: Map<string, { labels: MetricLabels; value: number }>;
}

interface InternalHistogram {
  help: string;
  buckets: number[];
  samples: Map<string, {
    labels: MetricLabels;
    count: number;
    sum: number;
    bucketCounts: number[];
  }>;
}

/**
 * Serializace labelů do stabilního klíče pro Map lookup.
 * Klíč je deterministický díky lexikografickému řazení.
 */
function labelsKey(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join(',');
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

export class MetricsCollector {
  private readonly perRuleMetrics: boolean;
  private readonly maxLabeledRules: number;
  private readonly buckets: number[];
  private readonly traceCollector: TraceCollector;
  private readonly statsProvider: () => EngineStats;

  private readonly counters = new Map<string, InternalCounter>();
  private readonly histograms = new Map<string, InternalHistogram>();
  private readonly trackedRules = new Set<string>();

  private unsubscribe: (() => void) | null = null;

  constructor(
    traceCollector: TraceCollector,
    statsProvider: () => EngineStats,
    config: MetricsConfig = {},
  ) {
    this.traceCollector = traceCollector;
    this.statsProvider = statsProvider;
    this.perRuleMetrics = config.perRuleMetrics ?? false;
    this.maxLabeledRules = config.maxLabeledRules ?? DEFAULT_MAX_LABELED_RULES;
    this.buckets = config.histogramBuckets
      ? [...config.histogramBuckets].sort((a, b) => a - b)
      : [...DEFAULT_HISTOGRAM_BUCKETS];

    // Auto-enable tracing pokud ještě není zapnutý
    if (!traceCollector.isEnabled()) {
      traceCollector.enable();
    }

    this.initializeMetrics();
    this.subscribe();
  }

  // -------------------------------------------------------------------------
  // Veřejné API
  // -------------------------------------------------------------------------

  /** Vrátí snapshot všech counter metrik */
  getCounters(): CounterMetric[] {
    const result: CounterMetric[] = [];
    for (const [name, counter] of this.counters) {
      result.push({
        name,
        help: counter.help,
        values: Array.from(counter.values.values()),
      });
    }
    return result;
  }

  /** Vrátí gauge metriky čtené lazy z aktuálního stavu enginu */
  getGauges(): GaugeMetric[] {
    const stats = this.statsProvider();
    const gauges: GaugeMetric[] = [
      { name: 'active_rules', help: 'Number of currently active rules', value: stats.rulesCount },
      { name: 'active_facts', help: 'Number of currently active facts', value: stats.factsCount },
      { name: 'active_timers', help: 'Number of currently active timers', value: stats.timersCount },
    ];

    if (stats.tracing) {
      const utilization = stats.tracing.maxEntries > 0
        ? stats.tracing.entriesCount / stats.tracing.maxEntries
        : 0;
      gauges.push({
        name: 'trace_buffer_utilization',
        help: 'Trace buffer utilization ratio (0-1)',
        value: utilization,
      });
    }

    return gauges;
  }

  /** Vrátí snapshot všech histogram metrik */
  getHistograms(): HistogramMetric[] {
    const result: HistogramMetric[] = [];
    for (const [name, histogram] of this.histograms) {
      result.push({
        name,
        help: histogram.help,
        buckets: histogram.buckets,
        samples: Array.from(histogram.samples.values()),
      });
    }
    return result;
  }

  /** Odpojí subscriber od TraceCollectoru */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /** Vyresetuje veškerá nasbíraná data (zachovává subscription) */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.values.clear();
    }
    for (const histogram of this.histograms.values()) {
      histogram.samples.clear();
    }
    this.trackedRules.clear();
  }

  // -------------------------------------------------------------------------
  // Inicializace metrik
  // -------------------------------------------------------------------------

  private initializeMetrics(): void {
    // Counters
    this.createCounter('rules_triggered_total', 'Total number of rules triggered');
    this.createCounter('rules_executed_total', 'Total number of rules executed');
    this.createCounter('rules_skipped_total', 'Total number of rules skipped (conditions not met)');
    this.createCounter('rules_failed_total', 'Total number of rule executions that failed');
    this.createCounter('events_processed_total', 'Total number of events processed');
    this.createCounter('facts_changed_total', 'Total number of fact changes');
    this.createCounter('actions_executed_total', 'Total number of actions executed successfully');
    this.createCounter('actions_failed_total', 'Total number of actions that failed');
    this.createCounter('conditions_evaluated_total', 'Total number of conditions evaluated');

    // Histograms
    this.createHistogram('evaluation_duration_seconds', 'Duration of rule evaluations in seconds');
    this.createHistogram('condition_duration_seconds', 'Duration of condition evaluations in seconds');
    this.createHistogram('action_duration_seconds', 'Duration of action executions in seconds');
  }

  private createCounter(name: string, help: string): void {
    this.counters.set(name, { help, values: new Map() });
  }

  private createHistogram(name: string, help: string): void {
    this.histograms.set(name, {
      help,
      buckets: this.buckets,
      samples: new Map(),
    });
  }

  // -------------------------------------------------------------------------
  // Subscription & zpracování trace entries
  // -------------------------------------------------------------------------

  private subscribe(): void {
    this.unsubscribe = this.traceCollector.subscribe((entry) => {
      this.processEntry(entry);
    });
  }

  private processEntry(entry: DebugTraceEntry): void {
    switch (entry.type) {
      case 'rule_triggered':
        this.incrementCounter('rules_triggered_total', this.ruleLabelsWithName(entry));
        break;

      case 'rule_executed':
        this.incrementCounter('rules_executed_total', this.ruleLabelsWithName(entry));
        if (entry.durationMs !== undefined) {
          this.observeHistogram(
            'evaluation_duration_seconds',
            entry.durationMs / 1000,
            this.ruleIdLabels(entry),
          );
        }
        break;

      case 'rule_skipped':
        this.incrementCounter('rules_skipped_total', this.ruleIdLabels(entry));
        if (entry.durationMs !== undefined) {
          this.observeHistogram(
            'evaluation_duration_seconds',
            entry.durationMs / 1000,
            this.ruleIdLabels(entry),
          );
        }
        break;

      case 'action_failed': {
        const actionType = entry.details['actionType'] as string | undefined;
        this.incrementCounter(
          'actions_failed_total',
          actionType ? { action_type: actionType } : {},
        );
        this.incrementCounter('rules_failed_total', this.ruleIdLabels(entry));
        if (entry.durationMs !== undefined) {
          this.observeHistogram(
            'action_duration_seconds',
            entry.durationMs / 1000,
            actionType ? { action_type: actionType } : {},
          );
        }
        break;
      }

      case 'event_emitted':
        this.incrementCounter('events_processed_total', {});
        break;

      case 'fact_changed': {
        const operation = entry.details['operation'] as string | undefined;
        this.incrementCounter(
          'facts_changed_total',
          operation ? { operation } : {},
        );
        break;
      }

      case 'action_completed': {
        const actionType = entry.details['actionType'] as string | undefined;
        this.incrementCounter(
          'actions_executed_total',
          actionType ? { action_type: actionType } : {},
        );
        if (entry.durationMs !== undefined) {
          this.observeHistogram(
            'action_duration_seconds',
            entry.durationMs / 1000,
            actionType ? { action_type: actionType } : {},
          );
        }
        break;
      }

      case 'condition_evaluated': {
        const passed = entry.details['passed'] as boolean;
        this.incrementCounter(
          'conditions_evaluated_total',
          { result: passed ? 'pass' : 'fail' },
        );
        if (entry.durationMs !== undefined) {
          this.observeHistogram('condition_duration_seconds', entry.durationMs / 1000, {});
        }
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Label helpers
  // -------------------------------------------------------------------------

  /** Per-rule labels s rule_id + rule_name (pro triggered, executed) */
  private ruleLabelsWithName(entry: DebugTraceEntry): MetricLabels {
    if (!this.perRuleMetrics || !entry.ruleId) return {};
    if (!this.canTrackRule(entry.ruleId)) return {};
    const labels: MetricLabels = { rule_id: entry.ruleId };
    if (entry.ruleName) labels['rule_name'] = entry.ruleName;
    return labels;
  }

  /** Per-rule labels jen s rule_id (pro skipped, failed, histogram) */
  private ruleIdLabels(entry: DebugTraceEntry): MetricLabels {
    if (!this.perRuleMetrics || !entry.ruleId) return {};
    if (!this.canTrackRule(entry.ruleId)) return {};
    return { rule_id: entry.ruleId };
  }

  /** Kontrola kardinalitního limitu pro per-rule metriky */
  private canTrackRule(ruleId: string): boolean {
    if (this.trackedRules.has(ruleId)) return true;
    if (this.trackedRules.size >= this.maxLabeledRules) return false;
    this.trackedRules.add(ruleId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Counter & histogram operace
  // -------------------------------------------------------------------------

  private incrementCounter(name: string, labels: MetricLabels): void {
    const counter = this.counters.get(name);
    if (!counter) return;

    const key = labelsKey(labels);
    const existing = counter.values.get(key);
    if (existing) {
      existing.value++;
    } else {
      counter.values.set(key, { labels, value: 1 });
    }
  }

  private observeHistogram(name: string, value: number, labels: MetricLabels): void {
    const histogram = this.histograms.get(name);
    if (!histogram) return;

    const key = labelsKey(labels);
    let sample = histogram.samples.get(key);
    if (!sample) {
      sample = {
        labels,
        count: 0,
        sum: 0,
        bucketCounts: new Array<number>(histogram.buckets.length).fill(0),
      };
      histogram.samples.set(key, sample);
    }

    sample.count++;
    sample.sum += value;

    // Kumulativní bucket counts — inkrementuje všechny buckety kde value <= boundary
    for (let i = 0; i < histogram.buckets.length; i++) {
      if (value <= histogram.buckets[i]!) {
        sample.bucketCounts[i]!++;
      }
    }
  }
}
