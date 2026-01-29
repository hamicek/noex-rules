import { describe, it, expect } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import type { MetricsConfig, OpenTelemetryConfig, RuleEngineConfig } from '../../../src/types/index.js';

describe('MetricsConfig', () => {
  describe('type compatibility', () => {
    it('should accept empty config (all fields optional)', () => {
      const config: MetricsConfig = {};

      expect(config.enabled).toBeUndefined();
      expect(config.perRuleMetrics).toBeUndefined();
      expect(config.maxLabeledRules).toBeUndefined();
      expect(config.histogramBuckets).toBeUndefined();
      expect(config.prefix).toBeUndefined();
    });

    it('should accept enabled flag only', () => {
      const config: MetricsConfig = {
        enabled: true,
      };

      expect(config.enabled).toBe(true);
    });

    it('should accept perRuleMetrics with cardinality limit', () => {
      const config: MetricsConfig = {
        enabled: true,
        perRuleMetrics: true,
        maxLabeledRules: 50,
      };

      expect(config.perRuleMetrics).toBe(true);
      expect(config.maxLabeledRules).toBe(50);
    });

    it('should accept custom histogram buckets', () => {
      const buckets = [0.01, 0.05, 0.1, 0.5, 1, 5];
      const config: MetricsConfig = {
        histogramBuckets: buckets,
      };

      expect(config.histogramBuckets).toEqual(buckets);
    });

    it('should accept custom prefix', () => {
      const config: MetricsConfig = {
        prefix: 'my_app_rules',
      };

      expect(config.prefix).toBe('my_app_rules');
    });

    it('should accept full configuration', () => {
      const config: MetricsConfig = {
        enabled: true,
        perRuleMetrics: true,
        maxLabeledRules: 200,
        histogramBuckets: [0.001, 0.01, 0.1, 1, 10],
        prefix: 'custom_prefix',
      };

      expect(config.enabled).toBe(true);
      expect(config.perRuleMetrics).toBe(true);
      expect(config.maxLabeledRules).toBe(200);
      expect(config.histogramBuckets).toEqual([0.001, 0.01, 0.1, 1, 10]);
      expect(config.prefix).toBe('custom_prefix');
    });
  });
});

describe('OpenTelemetryConfig', () => {
  describe('type compatibility', () => {
    it('should accept empty config (all fields optional)', () => {
      const config: OpenTelemetryConfig = {};

      expect(config.enabled).toBeUndefined();
      expect(config.serviceName).toBeUndefined();
      expect(config.traceConditions).toBeUndefined();
    });

    it('should accept enabled flag only', () => {
      const config: OpenTelemetryConfig = {
        enabled: true,
      };

      expect(config.enabled).toBe(true);
    });

    it('should accept serviceName', () => {
      const config: OpenTelemetryConfig = {
        enabled: true,
        serviceName: 'my-rule-engine',
      };

      expect(config.serviceName).toBe('my-rule-engine');
    });

    it('should accept traceConditions flag', () => {
      const config: OpenTelemetryConfig = {
        enabled: true,
        traceConditions: true,
      };

      expect(config.traceConditions).toBe(true);
    });

    it('should accept full configuration', () => {
      const config: OpenTelemetryConfig = {
        enabled: true,
        serviceName: 'production-engine',
        traceConditions: false,
      };

      expect(config.enabled).toBe(true);
      expect(config.serviceName).toBe('production-engine');
      expect(config.traceConditions).toBe(false);
    });
  });
});

describe('RuleEngineConfig observability integration', () => {
  it('should allow RuleEngineConfig without metrics or opentelemetry', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
    };

    expect(config.metrics).toBeUndefined();
    expect(config.opentelemetry).toBeUndefined();
  });

  it('should accept metrics in RuleEngineConfig', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
      metrics: {
        enabled: true,
      },
    };

    expect(config.metrics).toBeDefined();
    expect(config.metrics!.enabled).toBe(true);
  });

  it('should accept metrics with all options in RuleEngineConfig', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
      metrics: {
        enabled: true,
        perRuleMetrics: true,
        maxLabeledRules: 75,
        histogramBuckets: [0.01, 0.1, 1],
        prefix: 'noex',
      },
    };

    expect(config.metrics!.perRuleMetrics).toBe(true);
    expect(config.metrics!.maxLabeledRules).toBe(75);
    expect(config.metrics!.histogramBuckets).toEqual([0.01, 0.1, 1]);
    expect(config.metrics!.prefix).toBe('noex');
  });

  it('should accept opentelemetry in RuleEngineConfig', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
      opentelemetry: {
        enabled: true,
        serviceName: 'my-engine',
      },
    };

    expect(config.opentelemetry).toBeDefined();
    expect(config.opentelemetry!.enabled).toBe(true);
    expect(config.opentelemetry!.serviceName).toBe('my-engine');
  });

  it('should accept opentelemetry with all options in RuleEngineConfig', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
      opentelemetry: {
        enabled: true,
        serviceName: 'prod-engine',
        traceConditions: true,
      },
    };

    expect(config.opentelemetry!.serviceName).toBe('prod-engine');
    expect(config.opentelemetry!.traceConditions).toBe(true);
  });

  it('should accept both metrics and opentelemetry together', () => {
    const config: RuleEngineConfig = {
      name: 'observable-engine',
      metrics: {
        enabled: true,
        perRuleMetrics: true,
      },
      opentelemetry: {
        enabled: true,
        serviceName: 'observable-engine',
      },
    };

    expect(config.metrics).toBeDefined();
    expect(config.opentelemetry).toBeDefined();
    expect(config.metrics!.enabled).toBe(true);
    expect(config.opentelemetry!.enabled).toBe(true);
  });

  it('should coexist with all other config options', () => {
    const adapter = new MemoryAdapter();
    const config: RuleEngineConfig = {
      name: 'full-config',
      maxConcurrency: 5,
      debounceMs: 100,
      persistence: {
        adapter,
        key: 'rules',
      },
      timerPersistence: {
        adapter,
        checkIntervalMs: 500,
      },
      audit: {
        adapter,
        batchSize: 100,
      },
      tracing: {
        enabled: true,
        maxEntries: 5000,
      },
      metrics: {
        enabled: true,
        perRuleMetrics: true,
        maxLabeledRules: 50,
      },
      opentelemetry: {
        enabled: true,
        serviceName: 'full-config-engine',
        traceConditions: false,
      },
    };

    expect(config.persistence).toBeDefined();
    expect(config.timerPersistence).toBeDefined();
    expect(config.audit).toBeDefined();
    expect(config.tracing).toBeDefined();
    expect(config.metrics).toBeDefined();
    expect(config.opentelemetry).toBeDefined();
  });
});
