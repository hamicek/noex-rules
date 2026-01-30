import { describe, it, expect } from 'vitest';
import { validateRule, YamlValidationError } from '../../../../src/dsl/yaml/schema';

// ---------------------------------------------------------------------------
// Helper: minimal valid rule with baseline condition
// ---------------------------------------------------------------------------

function ruleWith(condition: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'baseline-rule',
    trigger: { type: 'event', topic: 'metrics.*' },
    conditions: [condition],
    actions: [{ type: 'emit_event', topic: 'ops.anomaly', data: {} }],
  };
}

function baselineCondition(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source: {
      type: 'baseline',
      metric: 'error_rate',
      comparison: 'above',
      ...overrides,
    },
    operator: 'eq',
    value: true,
  };
}

// ---------------------------------------------------------------------------
// Baseline condition source parsing
// ---------------------------------------------------------------------------

describe('validateRule — baseline conditions', () => {
  describe('valid baseline sources', () => {
    it('parses minimal baseline condition (metric + comparison)', () => {
      const rule = validateRule(ruleWith(baselineCondition()));

      expect(rule.conditions[0]).toEqual({
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      });
    });

    it('parses baseline condition with sensitivity', () => {
      const rule = validateRule(ruleWith(baselineCondition({ sensitivity: 3.0 })));

      expect(rule.conditions[0]!.source).toEqual({
        type: 'baseline',
        metric: 'error_rate',
        comparison: 'above',
        sensitivity: 3.0,
      });
    });

    it('parses all valid comparison types', () => {
      const comparisons = ['above', 'below', 'outside', 'above_percentile', 'below_percentile'];

      for (const comparison of comparisons) {
        const rule = validateRule(ruleWith(baselineCondition({ comparison })));
        const source = rule.conditions[0]!.source as { type: 'baseline'; comparison: string };
        expect(source.comparison).toBe(comparison);
      }
    });

    it('preserves metric name exactly as provided', () => {
      const rule = validateRule(ruleWith(baselineCondition({
        metric: 'api.v2.response_time_p99',
      })));

      const source = rule.conditions[0]!.source as { type: 'baseline'; metric: string };
      expect(source.metric).toBe('api.v2.response_time_p99');
    });

    it('handles fractional sensitivity values', () => {
      const rule = validateRule(ruleWith(baselineCondition({ sensitivity: 1.5 })));

      const source = rule.conditions[0]!.source as { type: 'baseline'; sensitivity?: number };
      expect(source.sensitivity).toBe(1.5);
    });

    it('omits sensitivity when not specified', () => {
      const rule = validateRule(ruleWith(baselineCondition()));

      const source = rule.conditions[0]!.source as { type: 'baseline'; sensitivity?: number };
      expect(source.sensitivity).toBeUndefined();
    });

    it('works with non-eq operators for advanced usage', () => {
      const rule = validateRule(ruleWith({
        source: { type: 'baseline', metric: 'cpu_load', comparison: 'above' },
        operator: 'neq',
        value: false,
      }));

      expect(rule.conditions[0]!.operator).toBe('neq');
    });
  });

  describe('multiple baseline conditions in one rule', () => {
    it('parses multiple baseline conditions', () => {
      const rule = validateRule({
        id: 'multi-baseline',
        trigger: { type: 'event', topic: 'metrics.*' },
        conditions: [
          {
            source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: 2.5 },
            operator: 'eq',
            value: true,
          },
          {
            source: { type: 'baseline', metric: 'latency_p99', comparison: 'above_percentile' },
            operator: 'eq',
            value: true,
          },
        ],
        actions: [{ type: 'emit_event', topic: 'ops.alert', data: {} }],
      });

      expect(rule.conditions).toHaveLength(2);

      const s0 = rule.conditions[0]!.source as { type: 'baseline'; metric: string };
      const s1 = rule.conditions[1]!.source as { type: 'baseline'; metric: string };
      expect(s0.metric).toBe('error_rate');
      expect(s1.metric).toBe('latency_p99');
    });
  });

  describe('mixed conditions', () => {
    it('parses baseline alongside event and fact conditions', () => {
      const rule = validateRule({
        id: 'mixed-conditions',
        trigger: { type: 'event', topic: 'api.response' },
        conditions: [
          {
            source: { type: 'event', field: 'status' },
            operator: 'eq',
            value: 200,
          },
          {
            source: { type: 'baseline', metric: 'api_latency', comparison: 'outside', sensitivity: 3.0 },
            operator: 'eq',
            value: true,
          },
          {
            source: { type: 'fact', pattern: 'monitoring:enabled' },
            operator: 'eq',
            value: true,
          },
        ],
        actions: [{ type: 'emit_event', topic: 'ops.latency_spike', data: {} }],
      });

      expect(rule.conditions).toHaveLength(3);
      expect(rule.conditions[0]!.source).toEqual({ type: 'event', field: 'status' });
      expect(rule.conditions[1]!.source).toEqual({
        type: 'baseline',
        metric: 'api_latency',
        comparison: 'outside',
        sensitivity: 3.0,
      });
      expect(rule.conditions[2]!.source).toEqual({ type: 'fact', pattern: 'monitoring:enabled' });
    });
  });

  // -------------------------------------------------------------------------
  // Validation errors
  // -------------------------------------------------------------------------

  describe('missing required fields', () => {
    it('throws on missing metric', () => {
      expect(() => validateRule(ruleWith({
        source: { type: 'baseline', comparison: 'above' },
        operator: 'eq',
        value: true,
      }))).toThrow(/missing required field "metric"/);
    });

    it('throws on missing comparison', () => {
      expect(() => validateRule(ruleWith({
        source: { type: 'baseline', metric: 'error_rate' },
        operator: 'eq',
        value: true,
      }))).toThrow(/missing required field "comparison"/);
    });
  });

  describe('invalid field values', () => {
    it('throws on empty metric string', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ metric: '' }))))
        .toThrow(/must be a non-empty string/);
    });

    it('throws on non-string metric', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ metric: 42 }))))
        .toThrow(/must be a non-empty string/);
    });

    it('throws on invalid comparison value', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ comparison: 'greater_than' }))))
        .toThrow(/invalid baseline comparison "greater_than"/);
    });

    it('throws on empty comparison string', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ comparison: '' }))))
        .toThrow(/must be a non-empty string/);
    });

    it('throws on non-string comparison', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ comparison: 5 }))))
        .toThrow(/must be a non-empty string/);
    });

    it('throws on non-number sensitivity', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ sensitivity: 'high' }))))
        .toThrow(/must be a finite number/);
    });

    it('throws on zero sensitivity', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ sensitivity: 0 }))))
        .toThrow(/sensitivity must be a positive number/);
    });

    it('throws on negative sensitivity', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ sensitivity: -1.5 }))))
        .toThrow(/sensitivity must be a positive number/);
    });

    it('throws on NaN sensitivity', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ sensitivity: NaN }))))
        .toThrow(/must be a finite number/);
    });

    it('throws on Infinity sensitivity', () => {
      expect(() => validateRule(ruleWith(baselineCondition({ sensitivity: Infinity }))))
        .toThrow(/must be a finite number/);
    });
  });

  // -------------------------------------------------------------------------
  // Error paths
  // -------------------------------------------------------------------------

  describe('error paths', () => {
    it('includes correct path for missing metric', () => {
      try {
        validateRule(ruleWith({
          source: { type: 'baseline', comparison: 'above' },
          operator: 'eq',
          value: true,
        }));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toContain('conditions[0].source');
      }
    });

    it('includes correct path for invalid comparison', () => {
      try {
        validateRule(ruleWith(baselineCondition({ comparison: 'invalid' })));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('rule.conditions[0].source.comparison');
      }
    });

    it('includes correct path for invalid sensitivity', () => {
      try {
        validateRule(ruleWith(baselineCondition({ sensitivity: -1 })));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('rule.conditions[0].source.sensitivity');
      }
    });

    it('error message for invalid comparison lists all valid options', () => {
      try {
        validateRule(ruleWith(baselineCondition({ comparison: 'wrong' })));
        expect.fail('Should have thrown');
      } catch (err) {
        const message = (err as YamlValidationError).message;
        expect(message).toContain('above');
        expect(message).toContain('below');
        expect(message).toContain('outside');
        expect(message).toContain('above_percentile');
        expect(message).toContain('below_percentile');
      }
    });
  });

  // -------------------------------------------------------------------------
  // YAML-like full rule scenario
  // -------------------------------------------------------------------------

  describe('full rule scenario', () => {
    it('parses a complete anomaly detection rule as YAML would produce', () => {
      const yamlLike = {
        id: 'latency-anomaly',
        name: 'API Latency Anomaly Detection',
        priority: 80,
        tags: ['monitoring', 'anomaly', 'sla'],
        trigger: { type: 'event', topic: 'api.response' },
        conditions: [
          {
            source: {
              type: 'baseline',
              metric: 'api_latency',
              comparison: 'above',
              sensitivity: 3.0,
            },
            operator: 'eq',
            value: true,
          },
        ],
        actions: [
          {
            type: 'emit_event',
            topic: 'ops.latency_spike',
            data: { metric: 'api_latency', severity: 'high' },
          },
          {
            type: 'log',
            level: 'warn',
            message: 'Latency anomaly detected',
          },
        ],
      };

      const rule = validateRule(yamlLike);

      expect(rule.id).toBe('latency-anomaly');
      expect(rule.name).toBe('API Latency Anomaly Detection');
      expect(rule.priority).toBe(80);
      expect(rule.tags).toEqual(['monitoring', 'anomaly', 'sla']);
      expect(rule.conditions[0]!.source).toEqual({
        type: 'baseline',
        metric: 'api_latency',
        comparison: 'above',
        sensitivity: 3.0,
      });
      expect(rule.actions).toHaveLength(2);
    });
  });
});
