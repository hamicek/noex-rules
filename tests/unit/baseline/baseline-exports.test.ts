import { describe, it, expect } from 'vitest';
import * as mainExports from '../../../src/index';

describe('Baseline barrel export from src/index.ts', () => {
  // -------------------------------------------------------------------------
  // Runtime exports (classes, functions)
  // -------------------------------------------------------------------------

  it('exports BaselineStore class', () => {
    expect(mainExports.BaselineStore).toBeDefined();
    expect(typeof mainExports.BaselineStore).toBe('function');
  });

  it('BaselineStore has static start method', () => {
    expect(typeof mainExports.BaselineStore.start).toBe('function');
  });

  // -------------------------------------------------------------------------
  // Pure statistical functions
  // -------------------------------------------------------------------------

  it('exports computeMovingAverage', () => {
    expect(typeof mainExports.computeMovingAverage).toBe('function');
    expect(mainExports.computeMovingAverage([2, 4, 6])).toBe(4);
  });

  it('exports computeEWMA', () => {
    expect(typeof mainExports.computeEWMA).toBe('function');
    expect(mainExports.computeEWMA([10, 20, 30], 0.5)).toBeGreaterThan(0);
  });

  it('exports computeStdDev', () => {
    expect(typeof mainExports.computeStdDev).toBe('function');
    expect(mainExports.computeStdDev([1, 1, 1], 1)).toBe(0);
  });

  it('exports computePercentile', () => {
    expect(typeof mainExports.computePercentile).toBe('function');
    expect(mainExports.computePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('exports computeZScore', () => {
    expect(typeof mainExports.computeZScore).toBe('function');
    expect(mainExports.computeZScore(10, 5, 2.5)).toBe(2);
  });

  it('exports classifyAnomaly', () => {
    expect(typeof mainExports.classifyAnomaly).toBe('function');
    expect(mainExports.classifyAnomaly(1.5)).toBe('low');
    expect(mainExports.classifyAnomaly(2.5)).toBe('medium');
    expect(mainExports.classifyAnomaly(3.5)).toBe('high');
    expect(mainExports.classifyAnomaly(4.5)).toBe('critical');
  });

  it('exports computeBaselineStats', () => {
    expect(typeof mainExports.computeBaselineStats).toBe('function');
  });

  it('exports checkAnomaly', () => {
    expect(typeof mainExports.checkAnomaly).toBe('function');
  });

  // -------------------------------------------------------------------------
  // Type-level verification (compile-time checks expressed as runtime tests)
  // -------------------------------------------------------------------------

  it('BaselineConfig type is usable via RuleEngineConfig', () => {
    // Verify BaselineConfig is part of exported types by constructing
    // a partial config object with baseline section
    const config: mainExports.RuleEngineConfig = {
      name: 'test-baseline-export',
      baseline: {
        metrics: [
          {
            name: 'test_metric',
            topic: 'test.*',
            field: 'value',
            function: 'avg',
            sampleWindow: '1m',
            trainingPeriod: '24h',
            recalcInterval: '1h',
            method: 'zscore',
          },
        ],
        defaultSensitivity: 2.0,
        ewmaAlpha: 0.3,
        minSamples: 10,
      },
    };
    expect(config.baseline).toBeDefined();
    expect(config.baseline!.metrics).toHaveLength(1);
    expect(config.baseline!.metrics[0].name).toBe('test_metric');
  });

  it('EngineStats baseline section type is usable', () => {
    const stats: mainExports.EngineStats = {
      rulesCount: 0,
      factsCount: 0,
      timersCount: 0,
      eventsProcessed: 0,
      rulesExecuted: 0,
      avgProcessingTimeMs: 0,
      baseline: {
        metricsCount: 3,
        totalRecalculations: 42,
        anomaliesDetected: 7,
      },
    };
    expect(stats.baseline).toBeDefined();
    expect(stats.baseline!.metricsCount).toBe(3);
  });
});
