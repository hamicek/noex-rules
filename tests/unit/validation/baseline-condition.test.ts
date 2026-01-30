import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../../src/validation/rule-validator.js';

function makeRule(conditions: unknown) {
  return {
    id: 'test-1',
    name: 'Test',
    trigger: { type: 'event', topic: 'test' },
    conditions,
  };
}

describe('baseline condition validation', () => {
  const v = new RuleInputValidator();

  describe('valid baseline conditions', () => {
    it('should pass with a valid baseline source (above)', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass with all comparison types', () => {
      for (const comparison of ['above', 'below', 'outside', 'above_percentile', 'below_percentile']) {
        const result = v.validate(makeRule([{
          source: { type: 'baseline', metric: 'latency', comparison },
          operator: 'eq',
          value: true,
        }]));
        expect(result.valid).toBe(true);
      }
    });

    it('should pass with optional sensitivity', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'api_latency', comparison: 'above', sensitivity: 3.0 },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(true);
    });

    it('should pass without sensitivity', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'throughput', comparison: 'outside' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(true);
    });
  });

  describe('metric field validation', () => {
    it('should fail when metric is missing', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', comparison: 'above' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].source.metric')).toBe(true);
    });

    it('should fail when metric is not a string', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 42, comparison: 'above' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.metric' && e.message.includes('must be a string'),
      )).toBe(true);
    });

    it('should fail when metric is empty', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: '  ', comparison: 'above' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.metric' && e.message.includes('cannot be empty'),
      )).toBe(true);
    });
  });

  describe('comparison field validation', () => {
    it('should fail when comparison is missing', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].source.comparison')).toBe(true);
    });

    it('should fail when comparison is not a string', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 123 },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.comparison' && e.message.includes('must be a string'),
      )).toBe(true);
    });

    it('should fail when comparison is invalid', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 'invalid' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.comparison' && e.message.includes('Invalid baseline comparison'),
      )).toBe(true);
    });
  });

  describe('sensitivity field validation', () => {
    it('should fail when sensitivity is not a number', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: 'high' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.sensitivity' && e.message.includes('positive number'),
      )).toBe(true);
    });

    it('should fail when sensitivity is zero', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: 0 },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.sensitivity' && e.message.includes('positive number'),
      )).toBe(true);
    });

    it('should fail when sensitivity is negative', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: -1 },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.sensitivity' && e.message.includes('positive number'),
      )).toBe(true);
    });

    it('should fail when sensitivity is Infinity', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: Infinity },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'conditions[0].source.sensitivity' && e.message.includes('positive number'),
      )).toBe(true);
    });

    it('should pass with fractional sensitivity', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: 0.5 },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(true);
    });
  });

  describe('reports all errors at once', () => {
    it('should report both metric and comparison errors', () => {
      const result = v.validate(makeRule([{
        source: { type: 'baseline' },
        operator: 'eq',
        value: true,
      }]));
      expect(result.valid).toBe(false);
      const sourceErrors = result.errors.filter(e => e.path.startsWith('conditions[0].source.'));
      expect(sourceErrors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('baseline alongside other source types', () => {
    it('should validate baseline conditions alongside fact and event conditions', () => {
      const result = v.validate(makeRule([
        {
          source: { type: 'fact', pattern: 'config:enabled' },
          operator: 'eq',
          value: true,
        },
        {
          source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: 2.5 },
          operator: 'eq',
          value: true,
        },
        {
          source: { type: 'event', field: 'severity' },
          operator: 'gte',
          value: 3,
        },
      ]));
      expect(result.valid).toBe(true);
    });
  });
});
