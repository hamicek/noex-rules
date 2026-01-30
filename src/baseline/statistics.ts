import type {
  BaselineStats,
  BaselineMethod,
  BaselineComparison,
  AnomalyResult,
} from '../types/baseline.js';

// ---------------------------------------------------------------------------
// Volby pro computeBaselineStats
// ---------------------------------------------------------------------------

/** Volby pro výpočet kompletních baseline statistik */
export interface ComputeStatsOptions {
  metric: string;
  method: BaselineMethod;
  ewmaAlpha?: number;
  dataFrom?: number;
  dataTo?: number;
  groupKey?: string;
  seasonalBucket?: string;
}

// ---------------------------------------------------------------------------
// Elementární statistické funkce
// ---------------------------------------------------------------------------

/** Aritmetický průměr (klouzavý průměr) */
export function computeMovingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Exponenciálně vážený klouzavý průměr */
export function computeEWMA(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let ewma = values[0]!;
  for (let i = 1; i < values.length; i++) {
    ewma = alpha * values[i]! + (1 - alpha) * ewma;
  }
  return ewma;
}

/** Směrodatná odchylka (populační) */
export function computeStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  let sumSqDiff = 0;
  for (const v of values) {
    const diff = v - mean;
    sumSqDiff += diff * diff;
  }
  return Math.sqrt(sumSqDiff / values.length);
}

/** Percentil z setříděného pole (lineární interpolace) */
export function computePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0]!;

  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedValues[lower]!;

  const fraction = index - lower;
  return sortedValues[lower]! + fraction * (sortedValues[upper]! - sortedValues[lower]!);
}

/** Z-skóre */
export function computeZScore(value: number, mean: number, stddev: number): number {
  if (stddev === 0) {
    if (value === mean) return 0;
    return value > mean ? Infinity : -Infinity;
  }
  return (value - mean) / stddev;
}

// ---------------------------------------------------------------------------
// Klasifikace a detekce anomálií
// ---------------------------------------------------------------------------

/** Klasifikace závažnosti podle z-skóre */
export function classifyAnomaly(zScore: number): 'low' | 'medium' | 'high' | 'critical' {
  const abs = Math.abs(zScore);
  if (abs >= 4) return 'critical';
  if (abs >= 3) return 'high';
  if (abs >= 2) return 'medium';
  return 'low';
}

/** Standardní percentilové klíče počítané v baseline */
const STANDARD_PERCENTILES = [5, 25, 75, 95, 99] as const;

/** Výpočet kompletních baseline statistik z naměřených hodnot */
export function computeBaselineStats(values: number[], options: ComputeStatsOptions): BaselineStats {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = computeMovingAverage(values);
  const stddev = computeStdDev(values, mean);
  const now = Date.now();

  const percentiles: Record<number, number> = {};
  for (const p of STANDARD_PERCENTILES) {
    percentiles[p] = computePercentile(sorted, p);
  }

  const stats: BaselineStats = {
    metric: options.metric,
    mean,
    stddev,
    median: computePercentile(sorted, 50),
    percentiles,
    sampleCount: values.length,
    min: sorted.length > 0 ? sorted[0]! : 0,
    max: sorted.length > 0 ? sorted[sorted.length - 1]! : 0,
    computedAt: now,
    dataFrom: options.dataFrom ?? now,
    dataTo: options.dataTo ?? now,
  };

  if (options.method === 'ewma') {
    stats.ewma = computeEWMA(values, options.ewmaAlpha ?? 0.3);
  }

  if (options.groupKey !== undefined) {
    stats.groupKey = options.groupKey;
  }

  if (options.seasonalBucket !== undefined) {
    stats.seasonalBucket = options.seasonalBucket;
  }

  return stats;
}

/**
 * Kontrola anomálie – porovnání aktuální hodnoty s baseline statistikami.
 *
 * Pro sigma-based porovnání (above, below, outside) je `sensitivity` počet
 * směrodatných odchylek. Pro percentilová porovnání (above_percentile,
 * below_percentile) je `sensitivity` číslo percentilu (např. 95).
 */
export function checkAnomaly(
  value: number,
  stats: BaselineStats,
  comparison: BaselineComparison,
  sensitivity: number,
): AnomalyResult {
  const zScore = computeZScore(value, stats.mean, stats.stddev);
  let isAnomaly: boolean;

  switch (comparison) {
    case 'above':
      isAnomaly = value > stats.mean + sensitivity * stats.stddev;
      break;
    case 'below':
      isAnomaly = value < stats.mean - sensitivity * stats.stddev;
      break;
    case 'outside':
      isAnomaly = Math.abs(value - stats.mean) > sensitivity * stats.stddev;
      break;
    case 'above_percentile': {
      const threshold = stats.percentiles[sensitivity];
      isAnomaly = threshold !== undefined ? value > threshold : false;
      break;
    }
    case 'below_percentile': {
      const threshold = stats.percentiles[sensitivity];
      isAnomaly = threshold !== undefined ? value < threshold : false;
      break;
    }
  }

  const severity = classifyAnomaly(zScore);

  return {
    isAnomaly,
    currentValue: value,
    baseline: stats,
    zScore,
    severity,
    description: formatAnomalyDescription(value, stats, comparison, sensitivity, isAnomaly, zScore),
  };
}

// ---------------------------------------------------------------------------
// Interní helpery
// ---------------------------------------------------------------------------

function formatAnomalyDescription(
  value: number,
  stats: BaselineStats,
  comparison: BaselineComparison,
  sensitivity: number,
  isAnomaly: boolean,
  zScore: number,
): string {
  if (!isAnomaly) {
    return `Value ${value} is within normal range for ${stats.metric} (z-score: ${formatNum(zScore)})`;
  }

  switch (comparison) {
    case 'above':
      return `Value ${value} is above baseline for ${stats.metric} (mean: ${formatNum(stats.mean)}, z-score: ${formatNum(zScore)}, threshold: ${sensitivity}\u03C3)`;
    case 'below':
      return `Value ${value} is below baseline for ${stats.metric} (mean: ${formatNum(stats.mean)}, z-score: ${formatNum(zScore)}, threshold: ${sensitivity}\u03C3)`;
    case 'outside':
      return `Value ${value} deviates from baseline for ${stats.metric} (mean: ${formatNum(stats.mean)}, z-score: ${formatNum(zScore)}, threshold: \u00B1${sensitivity}\u03C3)`;
    case 'above_percentile':
      return `Value ${value} exceeds p${sensitivity} for ${stats.metric} (threshold: ${formatNum(stats.percentiles[sensitivity] ?? 0)})`;
    case 'below_percentile':
      return `Value ${value} is below p${sensitivity} for ${stats.metric} (threshold: ${formatNum(stats.percentiles[sensitivity] ?? 0)})`;
  }
}

function formatNum(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : String(n);
}
