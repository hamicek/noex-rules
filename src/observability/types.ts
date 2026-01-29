/**
 * Typy pro observability vrstvu - Prometheus metriky a OpenTelemetry tracing.
 */

/** Konfigurace Prometheus metrik */
export interface MetricsConfig {
  /** Povolit sběr metrik (default: false) */
  enabled?: boolean;

  /** Přidat per-rule labels (rule_id, rule_name) k metrikám (default: false) */
  perRuleMetrics?: boolean;

  /** Maximální počet rule labelů pro ochranu proti vysoké kardinalitě (default: 100) */
  maxLabeledRules?: number;

  /** Custom histogram bucket boundaries v sekundách */
  histogramBuckets?: number[];

  /** Prefix pro všechny metriky (default: 'noex_rules') */
  prefix?: string;
}

/** Konfigurace OpenTelemetry tracingu */
export interface OpenTelemetryConfig {
  /** Povolit OpenTelemetry tracing (default: false) */
  enabled?: boolean;

  /** Název služby pro OTel tracer */
  serviceName?: string;

  /** Tracovat i vyhodnocení podmínek - vyšší overhead (default: false) */
  traceConditions?: boolean;
}

// ---------------------------------------------------------------------------
// Interní typy pro výměnu dat mezi MetricsCollector a PrometheusFormatter
// ---------------------------------------------------------------------------

/** Key-value páry labelů metriky */
export type MetricLabels = Record<string, string>;

/** Hodnota s přiřazenými labely */
export interface LabeledValue {
  labels: MetricLabels;
  value: number;
}

/** Counter metrika (monotónně rostoucí čítač) */
export interface CounterMetric {
  name: string;
  help: string;
  values: LabeledValue[];
}

/** Gauge metrika (aktuální hodnota v čase) */
export interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}

/** Vzorek histogramu pro jednu sadu labelů */
export interface HistogramSample {
  labels: MetricLabels;
  count: number;
  sum: number;
  /** Kumulativní počty pro každý bucket boundary (paralelní k buckets poli) */
  bucketCounts: number[];
}

/** Histogram metrika */
export interface HistogramMetric {
  name: string;
  help: string;
  /** Boundary hodnoty bucketů seřazené vzestupně */
  buckets: number[];
  samples: HistogramSample[];
}

// ---------------------------------------------------------------------------
// Konstanty
// ---------------------------------------------------------------------------

/** Default histogram bucket boundaries v sekundách (vhodné pro latenci pravidel) */
export const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/** Default prefix pro všechny metriky */
export const DEFAULT_METRICS_PREFIX = 'noex_rules';

/** Default maximální počet per-rule labelů */
export const DEFAULT_MAX_LABELED_RULES = 100;
