import { describe, it, expect } from 'vitest';
import { baseline, BaselineExpr } from '../../../../src/dsl/condition/baseline-expr';

describe('baseline', () => {
  describe('factory function', () => {
    it('returns a BaselineExpr instance', () => {
      const expr = baseline('error_rate');
      expect(expr).toBeInstanceOf(BaselineExpr);
    });

    it('throws on empty string', () => {
      expect(() => baseline('')).toThrow('baseline() metric must be a non-empty string');
    });

    it('throws on non-string argument', () => {
      expect(() => baseline(42 as unknown as string)).toThrow(
        'baseline() metric must be a non-empty string',
      );
    });

    it('throws on undefined argument', () => {
      expect(() => baseline(undefined as unknown as string)).toThrow(
        'baseline() metric must be a non-empty string',
      );
    });
  });

  describe('above()', () => {
    it('builds condition with above comparison', () => {
      const condition = baseline('error_rate').above(2.5).build();

      expect(condition).toEqual({
        source: {
          type: 'baseline',
          metric: 'error_rate',
          comparison: 'above',
          sensitivity: 2.5,
        },
        operator: 'eq',
        value: true,
      });
    });

    it('throws on zero sensitivity', () => {
      expect(() => baseline('m').above(0)).toThrow(
        'sensitivity must be a positive finite number',
      );
    });

    it('throws on negative sensitivity', () => {
      expect(() => baseline('m').above(-1)).toThrow(
        'sensitivity must be a positive finite number',
      );
    });

    it('throws on NaN', () => {
      expect(() => baseline('m').above(NaN)).toThrow(
        'sensitivity must be a positive finite number',
      );
    });

    it('throws on Infinity', () => {
      expect(() => baseline('m').above(Infinity)).toThrow(
        'sensitivity must be a positive finite number',
      );
    });

    it('throws on non-number', () => {
      expect(() => baseline('m').above('2' as unknown as number)).toThrow(
        'sensitivity must be a positive finite number',
      );
    });
  });

  describe('below()', () => {
    it('builds condition with below comparison', () => {
      const condition = baseline('latency').below(2.0).build();

      expect(condition).toEqual({
        source: {
          type: 'baseline',
          metric: 'latency',
          comparison: 'below',
          sensitivity: 2.0,
        },
        operator: 'eq',
        value: true,
      });
    });

    it('throws on invalid sensitivity', () => {
      expect(() => baseline('m').below(-0.5)).toThrow(
        'sensitivity must be a positive finite number',
      );
    });
  });

  describe('outside()', () => {
    it('builds condition with outside comparison', () => {
      const condition = baseline('throughput').outside(3.0).build();

      expect(condition).toEqual({
        source: {
          type: 'baseline',
          metric: 'throughput',
          comparison: 'outside',
          sensitivity: 3.0,
        },
        operator: 'eq',
        value: true,
      });
    });

    it('throws on invalid sensitivity', () => {
      expect(() => baseline('m').outside(0)).toThrow(
        'sensitivity must be a positive finite number',
      );
    });
  });

  describe('abovePercentile()', () => {
    it('builds condition with above_percentile comparison', () => {
      const condition = baseline('response_time').abovePercentile(95).build();

      expect(condition).toEqual({
        source: {
          type: 'baseline',
          metric: 'response_time',
          comparison: 'above_percentile',
          sensitivity: 95,
        },
        operator: 'eq',
        value: true,
      });
    });

    it('accepts fractional percentile', () => {
      const condition = baseline('m').abovePercentile(99.9).build();
      expect(condition.source).toEqual(
        expect.objectContaining({ comparison: 'above_percentile', sensitivity: 99.9 }),
      );
    });

    it('accepts small percentile value', () => {
      const condition = baseline('m').abovePercentile(0.1).build();
      expect(condition.source).toEqual(
        expect.objectContaining({ comparison: 'above_percentile', sensitivity: 0.1 }),
      );
    });

    it('throws on percentile >= 100', () => {
      expect(() => baseline('m').abovePercentile(100)).toThrow(
        'percentile must be less than 100',
      );
    });

    it('throws on percentile = 0', () => {
      expect(() => baseline('m').abovePercentile(0)).toThrow(
        'percentile must be a positive finite number',
      );
    });

    it('throws on negative percentile', () => {
      expect(() => baseline('m').abovePercentile(-5)).toThrow(
        'percentile must be a positive finite number',
      );
    });
  });

  describe('belowPercentile()', () => {
    it('builds condition with below_percentile comparison', () => {
      const condition = baseline('request_count').belowPercentile(5).build();

      expect(condition).toEqual({
        source: {
          type: 'baseline',
          metric: 'request_count',
          comparison: 'below_percentile',
          sensitivity: 5,
        },
        operator: 'eq',
        value: true,
      });
    });

    it('throws on percentile >= 100', () => {
      expect(() => baseline('m').belowPercentile(100)).toThrow(
        'percentile must be less than 100',
      );
    });

    it('throws on percentile > 100', () => {
      expect(() => baseline('m').belowPercentile(150)).toThrow(
        'percentile must be less than 100',
      );
    });
  });

  describe('build() errors', () => {
    it('throws when no comparison method was called', () => {
      expect(() => baseline('error_rate').build()).toThrow(
        'Condition on baseline("error_rate"): comparison not specified. ' +
          'Use .above(), .below(), .outside(), .abovePercentile(), or .belowPercentile().',
      );
    });

    it('includes metric name in the error message', () => {
      expect(() => baseline('cpu_usage').build()).toThrow('baseline("cpu_usage")');
    });
  });

  describe('build() output structure', () => {
    it('always uses operator eq and value true', () => {
      const conditions = [
        baseline('a').above(1).build(),
        baseline('b').below(2).build(),
        baseline('c').outside(3).build(),
        baseline('d').abovePercentile(95).build(),
        baseline('e').belowPercentile(5).build(),
      ];

      for (const c of conditions) {
        expect(c.operator).toBe('eq');
        expect(c.value).toBe(true);
      }
    });

    it('preserves exact sensitivity value', () => {
      const condition = baseline('m').above(2.718281828).build();
      expect((condition.source as { sensitivity: number }).sensitivity).toBe(2.718281828);
    });
  });

  describe('error messages include method name', () => {
    it('above() error mentions above', () => {
      expect(() => baseline('m').above(-1)).toThrow('.above()');
    });

    it('below() error mentions below', () => {
      expect(() => baseline('m').below(-1)).toThrow('.below()');
    });

    it('outside() error mentions outside', () => {
      expect(() => baseline('m').outside(-1)).toThrow('.outside()');
    });

    it('abovePercentile() error mentions abovePercentile', () => {
      expect(() => baseline('m').abovePercentile(-1)).toThrow('.abovePercentile()');
    });

    it('belowPercentile() error mentions belowPercentile', () => {
      expect(() => baseline('m').belowPercentile(-1)).toThrow('.belowPercentile()');
    });
  });

  describe('error messages include metric name', () => {
    it('includes metric in sensitivity error', () => {
      expect(() => baseline('my_metric').above(-1)).toThrow('baseline("my_metric")');
    });

    it('includes metric in percentile range error', () => {
      expect(() => baseline('my_metric').abovePercentile(100)).toThrow(
        'baseline("my_metric")',
      );
    });
  });

  describe('ConditionBuilder conformance', () => {
    it('implements ConditionBuilder interface (build returns RuleCondition)', () => {
      const builder = baseline('metric').above(2);
      const condition = builder.build();

      expect(condition).toHaveProperty('source');
      expect(condition).toHaveProperty('operator');
      expect(condition).toHaveProperty('value');
      expect(condition.source).toHaveProperty('type', 'baseline');
    });
  });
});
