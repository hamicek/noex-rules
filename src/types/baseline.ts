/** Metoda výpočtu baseline */
export type BaselineMethod = 'moving_average' | 'ewma' | 'zscore' | 'percentile';

/** Typ porovnání anomálie */
export type BaselineComparison =
  | 'above'              // value > mean + sensitivity * stddev
  | 'below'              // value < mean - sensitivity * stddev
  | 'outside'            // |value - mean| > sensitivity * stddev
  | 'above_percentile'   // value > Nth percentile
  | 'below_percentile';  // value < Nth percentile

/** Sezónní perioda */
export type SeasonalPeriod = 'hourly' | 'daily' | 'weekly' | 'none';

/** Agregační funkce pro vzorkování metriky */
export type BaselineAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** Konfigurace metriky pro baseline */
export interface BaselineMetricConfig {
  name: string;                     // Unikátní jméno metriky
  topic: string;                    // Event topic (podporuje wildcards)
  field: string;                    // Pole v event.data pro extrakci hodnot
  function: BaselineAggregation;
  sampleWindow: string | number;    // Granularita vzorkování ('1m', '5m')
  trainingPeriod: string | number;  // Kolik historie ('7d', '24h')
  recalcInterval: string | number;  // Interval přepočtu ('1h', '15m')
  method: BaselineMethod;
  groupBy?: string;                 // Per-group baselines
  seasonal?: SeasonalPeriod;        // Sezónní vzory
  filter?: Record<string, unknown>; // Filtr eventů
}

/** Výsledek výpočtu baseline statistik */
export interface BaselineStats {
  metric: string;
  mean: number;
  stddev: number;
  median: number;
  percentiles: Record<number, number>;  // p5, p25, p75, p95, p99
  ewma?: number;
  sampleCount: number;
  min: number;
  max: number;
  computedAt: number;
  dataFrom: number;
  dataTo: number;
  groupKey?: string;
  seasonalBucket?: string;
}

/** Konfigurace baseline modulu */
export interface BaselineConfig {
  metrics: BaselineMetricConfig[];
  defaultSensitivity?: number;    // Výchozí: 2.0 (sigma)
  ewmaAlpha?: number;             // Výchozí: 0.3
  minSamples?: number;            // Výchozí: 10
}

/** Výsledek detekce anomálie */
export interface AnomalyResult {
  isAnomaly: boolean;
  currentValue: number;
  baseline: BaselineStats;
  zScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}
