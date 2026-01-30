import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeMovingAverage,
  computeEWMA,
  computeStdDev,
  computePercentile,
  computeZScore,
  classifyAnomaly,
  computeBaselineStats,
  checkAnomaly,
} from '../../../src/baseline/statistics';
import type { BaselineStats } from '../../../src/types/baseline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Vytvoří BaselineStats s rozumnými výchozími hodnotami */
function makeStats(overrides: Partial<BaselineStats> = {}): BaselineStats {
  return {
    metric: 'test_metric',
    mean: 100,
    stddev: 10,
    median: 100,
    percentiles: { 5: 80, 25: 90, 75: 110, 95: 120, 99: 130 },
    sampleCount: 100,
    min: 70,
    max: 140,
    computedAt: Date.now(),
    dataFrom: Date.now() - 86_400_000,
    dataTo: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeMovingAverage
// ---------------------------------------------------------------------------

describe('computeMovingAverage()', () => {
  it('returns 0 for empty array', () => {
    expect(computeMovingAverage([])).toBe(0);
  });

  it('returns the value itself for single-element array', () => {
    expect(computeMovingAverage([42])).toBe(42);
  });

  it('computes arithmetic mean', () => {
    expect(computeMovingAverage([10, 20, 30])).toBe(20);
  });

  it('handles negative values', () => {
    expect(computeMovingAverage([-10, 10])).toBe(0);
  });

  it('handles floating point values', () => {
    expect(computeMovingAverage([1.5, 2.5, 3.0])).toBeCloseTo(2.333, 2);
  });

  it('handles large datasets', () => {
    const values = Array.from({ length: 10_000 }, (_, i) => i + 1);
    expect(computeMovingAverage(values)).toBe(5000.5);
  });

  it('handles all identical values', () => {
    expect(computeMovingAverage([7, 7, 7, 7])).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// computeEWMA
// ---------------------------------------------------------------------------

describe('computeEWMA()', () => {
  it('returns 0 for empty array', () => {
    expect(computeEWMA([], 0.3)).toBe(0);
  });

  it('returns the value itself for single-element array', () => {
    expect(computeEWMA([42], 0.3)).toBe(42);
  });

  it('computes correct EWMA with known values', () => {
    // alpha=0.5: EWMA₀=10, EWMA₁=0.5*20+0.5*10=15, EWMA₂=0.5*30+0.5*15=22.5
    expect(computeEWMA([10, 20, 30], 0.5)).toBe(22.5);
  });

  it('alpha=1 returns last value (no memory)', () => {
    expect(computeEWMA([10, 20, 30], 1.0)).toBe(30);
  });

  it('alpha=0 returns first value (full memory)', () => {
    expect(computeEWMA([10, 20, 30], 0.0)).toBe(10);
  });

  it('higher alpha gives more weight to recent values', () => {
    const values = [10, 20, 30, 40, 50];
    const highAlpha = computeEWMA(values, 0.9);
    const lowAlpha = computeEWMA(values, 0.1);
    expect(highAlpha).toBeGreaterThan(lowAlpha);
  });

  it('converges towards constant value', () => {
    const values = [100, 50, 50, 50, 50, 50, 50, 50, 50, 50];
    const result = computeEWMA(values, 0.5);
    // Po mnoha iteracích konverguje ke 50
    expect(result).toBeCloseTo(50.098, 2);
  });

  it('handles standard alpha 0.3', () => {
    // EWMA₀=10, EWMA₁=0.3*20+0.7*10=13, EWMA₂=0.3*30+0.7*13=18.1
    expect(computeEWMA([10, 20, 30], 0.3)).toBeCloseTo(18.1, 10);
  });
});

// ---------------------------------------------------------------------------
// computeStdDev
// ---------------------------------------------------------------------------

describe('computeStdDev()', () => {
  it('returns 0 for empty array', () => {
    expect(computeStdDev([], 0)).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(computeStdDev([42], 42)).toBe(0);
  });

  it('returns 0 for identical values', () => {
    expect(computeStdDev([5, 5, 5, 5], 5)).toBe(0);
  });

  it('computes correct population stddev for known dataset', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9], mean=5
    // variance = ((9+1+1+1+0+0+4+16)/8) = 32/8 = 4, stddev = 2
    expect(computeStdDev([2, 4, 4, 4, 5, 5, 7, 9], 5)).toBe(2);
  });

  it('handles negative values', () => {
    // [-1, 1], mean=0, variance = (1+1)/2 = 1, stddev = 1
    expect(computeStdDev([-1, 1], 0)).toBe(1);
  });

  it('handles symmetric distribution', () => {
    // [-2, -1, 0, 1, 2], mean=0
    // variance = (4+1+0+1+4)/5 = 2, stddev = sqrt(2)
    expect(computeStdDev([-2, -1, 0, 1, 2], 0)).toBeCloseTo(Math.sqrt(2), 10);
  });

  it('handles floating point precision', () => {
    expect(computeStdDev([0.1, 0.2, 0.3], 0.2)).toBeCloseTo(0.0816, 3);
  });
});

// ---------------------------------------------------------------------------
// computePercentile
// ---------------------------------------------------------------------------

describe('computePercentile()', () => {
  it('returns 0 for empty array', () => {
    expect(computePercentile([], 50)).toBe(0);
  });

  it('returns single value regardless of percentile', () => {
    expect(computePercentile([42], 0)).toBe(42);
    expect(computePercentile([42], 50)).toBe(42);
    expect(computePercentile([42], 100)).toBe(42);
  });

  it('p0 returns minimum', () => {
    expect(computePercentile([10, 20, 30], 0)).toBe(10);
  });

  it('p100 returns maximum', () => {
    expect(computePercentile([10, 20, 30], 100)).toBe(30);
  });

  it('p50 returns median for odd-length array', () => {
    expect(computePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('p50 interpolates for even-length array', () => {
    // [10, 20, 30, 40], p50: index = 0.5 * 3 = 1.5
    // interp = 20 + 0.5 * (30 - 20) = 25
    expect(computePercentile([10, 20, 30, 40], 50)).toBe(25);
  });

  it('interpolates between values', () => {
    // [10, 20, 30, 40], p25: index = 0.25 * 3 = 0.75
    // interp = 10 + 0.75 * (20 - 10) = 17.5
    expect(computePercentile([10, 20, 30, 40], 25)).toBe(17.5);
  });

  it('computes p95 for larger dataset', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    // index = 0.95 * 99 = 94.05 → interp between 95 and 96
    expect(computePercentile(values, 95)).toBeCloseTo(95.05, 2);
  });

  it('p75 for quartile dataset', () => {
    // [0, 25, 50, 75, 100], p75: index = 0.75 * 4 = 3 → exact = 75
    expect(computePercentile([0, 25, 50, 75, 100], 75)).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// computeZScore
// ---------------------------------------------------------------------------

describe('computeZScore()', () => {
  it('returns 0 when value equals mean', () => {
    expect(computeZScore(100, 100, 15)).toBe(0);
  });

  it('computes positive z-score for value above mean', () => {
    expect(computeZScore(130, 100, 15)).toBe(2);
  });

  it('computes negative z-score for value below mean', () => {
    expect(computeZScore(70, 100, 15)).toBe(-2);
  });

  it('returns 0 when stddev is 0 and value equals mean', () => {
    expect(computeZScore(50, 50, 0)).toBe(0);
  });

  it('returns Infinity when stddev is 0 and value > mean', () => {
    expect(computeZScore(51, 50, 0)).toBe(Infinity);
  });

  it('returns -Infinity when stddev is 0 and value < mean', () => {
    expect(computeZScore(49, 50, 0)).toBe(-Infinity);
  });

  it('handles fractional z-scores', () => {
    // z = (115 - 100) / 10 = 1.5
    expect(computeZScore(115, 100, 10)).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// classifyAnomaly
// ---------------------------------------------------------------------------

describe('classifyAnomaly()', () => {
  it('classifies |z| < 2 as low', () => {
    expect(classifyAnomaly(0)).toBe('low');
    expect(classifyAnomaly(1.0)).toBe('low');
    expect(classifyAnomaly(1.99)).toBe('low');
    expect(classifyAnomaly(-1.5)).toBe('low');
  });

  it('classifies 2 ≤ |z| < 3 as medium', () => {
    expect(classifyAnomaly(2.0)).toBe('medium');
    expect(classifyAnomaly(2.5)).toBe('medium');
    expect(classifyAnomaly(2.99)).toBe('medium');
    expect(classifyAnomaly(-2.0)).toBe('medium');
  });

  it('classifies 3 ≤ |z| < 4 as high', () => {
    expect(classifyAnomaly(3.0)).toBe('high');
    expect(classifyAnomaly(3.5)).toBe('high');
    expect(classifyAnomaly(3.99)).toBe('high');
    expect(classifyAnomaly(-3.0)).toBe('high');
  });

  it('classifies |z| ≥ 4 as critical', () => {
    expect(classifyAnomaly(4.0)).toBe('critical');
    expect(classifyAnomaly(5.0)).toBe('critical');
    expect(classifyAnomaly(10.0)).toBe('critical');
    expect(classifyAnomaly(-4.0)).toBe('critical');
  });

  it('is symmetric (uses absolute value)', () => {
    expect(classifyAnomaly(3.5)).toBe(classifyAnomaly(-3.5));
    expect(classifyAnomaly(2.0)).toBe(classifyAnomaly(-2.0));
  });
});

// ---------------------------------------------------------------------------
// computeBaselineStats
// ---------------------------------------------------------------------------

describe('computeBaselineStats()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes all fields for a known dataset', () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const stats = computeBaselineStats(values, {
      metric: 'latency',
      method: 'zscore',
      dataFrom: now - 3600_000,
      dataTo: now,
    });

    expect(stats.metric).toBe('latency');
    expect(stats.mean).toBe(5);
    expect(stats.stddev).toBe(2);
    expect(stats.median).toBe(4.5);
    expect(stats.sampleCount).toBe(8);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
    expect(stats.computedAt).toBe(now);
    expect(stats.dataFrom).toBe(now - 3600_000);
    expect(stats.dataTo).toBe(now);
  });

  it('computes standard percentiles', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const stats = computeBaselineStats(values, { metric: 'throughput', method: 'zscore' });

    expect(stats.percentiles[5]).toBeCloseTo(5.95, 1);
    expect(stats.percentiles[25]).toBeCloseTo(25.75, 1);
    expect(stats.percentiles[75]).toBeCloseTo(75.25, 1);
    expect(stats.percentiles[95]).toBeCloseTo(95.05, 1);
    expect(stats.percentiles[99]).toBeCloseTo(99.01, 1);
  });

  it('includes ewma only for ewma method', () => {
    const values = [10, 20, 30];
    const zscore = computeBaselineStats(values, { metric: 'x', method: 'zscore' });
    const ewma = computeBaselineStats(values, { metric: 'x', method: 'ewma', ewmaAlpha: 0.5 });

    expect(zscore.ewma).toBeUndefined();
    expect(ewma.ewma).toBe(22.5);
  });

  it('uses default ewmaAlpha 0.3 when not specified', () => {
    const stats = computeBaselineStats([10, 20, 30], { metric: 'x', method: 'ewma' });
    // EWMA₀=10, EWMA₁=0.3*20+0.7*10=13, EWMA₂=0.3*30+0.7*13=18.1
    expect(stats.ewma).toBeCloseTo(18.1, 10);
  });

  it('includes groupKey when provided', () => {
    const stats = computeBaselineStats([1, 2, 3], {
      metric: 'latency',
      method: 'zscore',
      groupKey: 'endpoint:/api/users',
    });
    expect(stats.groupKey).toBe('endpoint:/api/users');
  });

  it('omits groupKey when not provided', () => {
    const stats = computeBaselineStats([1, 2, 3], { metric: 'x', method: 'zscore' });
    expect(stats).not.toHaveProperty('groupKey');
  });

  it('includes seasonalBucket when provided', () => {
    const stats = computeBaselineStats([1, 2, 3], {
      metric: 'x',
      method: 'zscore',
      seasonalBucket: 'hour:14',
    });
    expect(stats.seasonalBucket).toBe('hour:14');
  });

  it('omits seasonalBucket when not provided', () => {
    const stats = computeBaselineStats([1, 2, 3], { metric: 'x', method: 'zscore' });
    expect(stats).not.toHaveProperty('seasonalBucket');
  });

  it('handles empty values array', () => {
    const stats = computeBaselineStats([], { metric: 'empty', method: 'zscore' });

    expect(stats.mean).toBe(0);
    expect(stats.stddev).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.sampleCount).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
  });

  it('handles single value', () => {
    const stats = computeBaselineStats([42], { metric: 'single', method: 'zscore' });

    expect(stats.mean).toBe(42);
    expect(stats.stddev).toBe(0);
    expect(stats.median).toBe(42);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.sampleCount).toBe(1);
  });

  it('defaults dataFrom and dataTo to now', () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const stats = computeBaselineStats([1], { metric: 'x', method: 'zscore' });
    expect(stats.dataFrom).toBe(now);
    expect(stats.dataTo).toBe(now);
  });

  it('does not mutate original values array', () => {
    const values = [30, 10, 20];
    computeBaselineStats(values, { metric: 'x', method: 'zscore' });
    expect(values).toEqual([30, 10, 20]);
  });
});

// ---------------------------------------------------------------------------
// checkAnomaly
// ---------------------------------------------------------------------------

describe('checkAnomaly()', () => {
  // mean=100, stddev=10

  describe('comparison: above', () => {
    it('detects anomaly when value exceeds mean + sensitivity*stddev', () => {
      const stats = makeStats();
      // threshold = 100 + 2*10 = 120, value 125 > 120
      const result = checkAnomaly(125, stats, 'above', 2.0);
      expect(result.isAnomaly).toBe(true);
    });

    it('does not flag value at threshold boundary', () => {
      const stats = makeStats();
      // threshold = 100 + 2*10 = 120, value = 120 (not > 120)
      const result = checkAnomaly(120, stats, 'above', 2.0);
      expect(result.isAnomaly).toBe(false);
    });

    it('does not flag value below threshold', () => {
      const stats = makeStats();
      const result = checkAnomaly(100, stats, 'above', 2.0);
      expect(result.isAnomaly).toBe(false);
    });

    it('does not flag values below mean', () => {
      const stats = makeStats();
      const result = checkAnomaly(50, stats, 'above', 2.0);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('comparison: below', () => {
    it('detects anomaly when value is below mean - sensitivity*stddev', () => {
      const stats = makeStats();
      // threshold = 100 - 2*10 = 80, value 75 < 80
      const result = checkAnomaly(75, stats, 'below', 2.0);
      expect(result.isAnomaly).toBe(true);
    });

    it('does not flag value at threshold boundary', () => {
      const stats = makeStats();
      const result = checkAnomaly(80, stats, 'below', 2.0);
      expect(result.isAnomaly).toBe(false);
    });

    it('does not flag value above mean', () => {
      const stats = makeStats();
      const result = checkAnomaly(150, stats, 'below', 2.0);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('comparison: outside', () => {
    it('detects anomaly above', () => {
      const stats = makeStats();
      const result = checkAnomaly(125, stats, 'outside', 2.0);
      expect(result.isAnomaly).toBe(true);
    });

    it('detects anomaly below', () => {
      const stats = makeStats();
      const result = checkAnomaly(75, stats, 'outside', 2.0);
      expect(result.isAnomaly).toBe(true);
    });

    it('does not flag value within range', () => {
      const stats = makeStats();
      const result = checkAnomaly(105, stats, 'outside', 2.0);
      expect(result.isAnomaly).toBe(false);
    });

    it('does not flag value at boundary', () => {
      const stats = makeStats();
      // |120 - 100| = 20 = 2 * 10, not > 20
      const result = checkAnomaly(120, stats, 'outside', 2.0);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('comparison: above_percentile', () => {
    it('detects anomaly when value exceeds percentile threshold', () => {
      const stats = makeStats(); // p95 = 120
      const result = checkAnomaly(125, stats, 'above_percentile', 95);
      expect(result.isAnomaly).toBe(true);
    });

    it('does not flag value at percentile boundary', () => {
      const stats = makeStats(); // p95 = 120
      const result = checkAnomaly(120, stats, 'above_percentile', 95);
      expect(result.isAnomaly).toBe(false);
    });

    it('does not flag value below percentile', () => {
      const stats = makeStats(); // p95 = 120
      const result = checkAnomaly(110, stats, 'above_percentile', 95);
      expect(result.isAnomaly).toBe(false);
    });

    it('returns false when percentile key is missing', () => {
      const stats = makeStats(); // nemá p90
      const result = checkAnomaly(999, stats, 'above_percentile', 90);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('comparison: below_percentile', () => {
    it('detects anomaly when value is below percentile threshold', () => {
      const stats = makeStats(); // p5 = 80
      const result = checkAnomaly(75, stats, 'below_percentile', 5);
      expect(result.isAnomaly).toBe(true);
    });

    it('does not flag value at percentile boundary', () => {
      const stats = makeStats(); // p5 = 80
      const result = checkAnomaly(80, stats, 'below_percentile', 5);
      expect(result.isAnomaly).toBe(false);
    });

    it('returns false when percentile key is missing', () => {
      const stats = makeStats();
      const result = checkAnomaly(-999, stats, 'below_percentile', 10);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('result fields', () => {
    it('includes currentValue', () => {
      const result = checkAnomaly(125, makeStats(), 'above', 2.0);
      expect(result.currentValue).toBe(125);
    });

    it('includes baseline stats reference', () => {
      const stats = makeStats();
      const result = checkAnomaly(125, stats, 'above', 2.0);
      expect(result.baseline).toBe(stats);
    });

    it('computes correct z-score', () => {
      const stats = makeStats(); // mean=100, stddev=10
      const result = checkAnomaly(130, stats, 'above', 2.0);
      expect(result.zScore).toBe(3);
    });

    it('classifies severity based on z-score', () => {
      const stats = makeStats(); // mean=100, stddev=10
      // z = (140-100)/10 = 4 → critical
      const result = checkAnomaly(140, stats, 'above', 2.0);
      expect(result.severity).toBe('critical');
    });

    it('provides description for anomaly', () => {
      const result = checkAnomaly(125, makeStats(), 'above', 2.0);
      expect(result.description).toContain('above baseline');
      expect(result.description).toContain('test_metric');
      expect(result.description).toContain('125');
    });

    it('provides description for normal value', () => {
      const result = checkAnomaly(100, makeStats(), 'above', 2.0);
      expect(result.description).toContain('within normal range');
      expect(result.description).toContain('test_metric');
    });

    it('provides description for outside anomaly', () => {
      const result = checkAnomaly(75, makeStats(), 'outside', 2.0);
      expect(result.description).toContain('deviates from baseline');
    });

    it('provides description for below anomaly', () => {
      const result = checkAnomaly(75, makeStats(), 'below', 2.0);
      expect(result.description).toContain('below baseline');
    });

    it('provides description for percentile anomaly', () => {
      const result = checkAnomaly(125, makeStats(), 'above_percentile', 95);
      expect(result.description).toContain('exceeds p95');
    });

    it('provides description for below_percentile anomaly', () => {
      const result = checkAnomaly(75, makeStats(), 'below_percentile', 5);
      expect(result.description).toContain('below p5');
    });
  });

  describe('edge cases', () => {
    it('handles zero stddev (all identical values)', () => {
      const stats = makeStats({ mean: 50, stddev: 0 });
      // above: value > 50 + 2*0 = 50, 51 > 50 → anomaly
      const result = checkAnomaly(51, stats, 'above', 2.0);
      expect(result.isAnomaly).toBe(true);
      expect(result.zScore).toBe(Infinity);
      expect(result.severity).toBe('critical');
    });

    it('handles zero stddev with exact mean value', () => {
      const stats = makeStats({ mean: 50, stddev: 0 });
      const result = checkAnomaly(50, stats, 'above', 2.0);
      expect(result.isAnomaly).toBe(false);
      expect(result.zScore).toBe(0);
    });

    it('handles very small sensitivity', () => {
      const stats = makeStats(); // mean=100, stddev=10
      // threshold = 100 + 0.1*10 = 101
      const result = checkAnomaly(102, stats, 'above', 0.1);
      expect(result.isAnomaly).toBe(true);
    });

    it('handles very large sensitivity', () => {
      const stats = makeStats(); // mean=100, stddev=10
      // threshold = 100 + 100*10 = 1100
      const result = checkAnomaly(500, stats, 'above', 100);
      expect(result.isAnomaly).toBe(false);
    });

    it('handles negative values', () => {
      const stats = makeStats({ mean: -50, stddev: 5, min: -70, max: -30 });
      const result = checkAnomaly(-60, stats, 'below', 2.0);
      // threshold = -50 - 2*5 = -60, value = -60, not < -60
      expect(result.isAnomaly).toBe(false);
    });
  });
});
