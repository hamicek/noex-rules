import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../../src/validation/rule-validator.js';

function makeRule(pattern: unknown) {
  return {
    id: 'test-1',
    name: 'Test',
    trigger: { type: 'temporal', pattern },
  };
}

describe('temporal pattern validation', () => {
  const v = new RuleInputValidator();

  describe('general', () => {
    it('should fail when pattern is not an object', () => {
      const result = v.validate(makeRule('string'));
      expect(result.valid).toBe(false);
    });

    it('should fail when pattern type is missing', () => {
      const result = v.validate(makeRule({}));
      expect(result.valid).toBe(false);
    });

    it('should fail when pattern type is invalid', () => {
      const result = v.validate(makeRule({ type: 'invalid' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid temporal pattern type'))).toBe(true);
    });
  });

  describe('sequence', () => {
    it('should pass with valid sequence', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, { topic: 'b' }],
        within: '30m',
      }));
      expect(result.valid).toBe(true);
    });

    it('should fail when events is missing', () => {
      const result = v.validate(makeRule({ type: 'sequence', within: '5m' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('events'))).toBe(true);
    });

    it('should fail when events is not an array', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: 'not-array',
        within: '5m',
      }));
      expect(result.valid).toBe(false);
    });

    it('should fail when events has less than 2 items', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }],
        within: '5m',
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('at least 2 events'))).toBe(true);
    });

    it('should fail when within is missing', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, { topic: 'b' }],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('within'))).toBe(true);
    });

    it('should accept numeric within', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, { topic: 'b' }],
        within: 5000,
      }));
      expect(result.valid).toBe(true);
    });

    it('should fail with invalid duration format', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, { topic: 'b' }],
        within: 'invalid',
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid duration format'))).toBe(true);
    });

    it('should fail with non-positive numeric duration', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, { topic: 'b' }],
        within: -1,
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('positive'))).toBe(true);
    });

    it('should validate event matcher within sequence', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, 'not-object'],
        within: '5m',
      }));
      expect(result.valid).toBe(false);
    });

    it('should fail when event matcher topic is missing', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, {}],
        within: '5m',
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('events[1].topic'))).toBe(true);
    });
  });

  describe('absence', () => {
    it('should pass with valid absence', () => {
      const result = v.validate(makeRule({
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' },
        within: '24h',
      }));
      expect(result.valid).toBe(true);
    });

    it('should fail when after is missing', () => {
      const result = v.validate(makeRule({
        type: 'absence',
        expected: { topic: 'b' },
        within: '5m',
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('after'))).toBe(true);
    });

    it('should fail when expected is missing', () => {
      const result = v.validate(makeRule({
        type: 'absence',
        after: { topic: 'a' },
        within: '5m',
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('expected'))).toBe(true);
    });

    it('should fail when within is missing', () => {
      const result = v.validate(makeRule({
        type: 'absence',
        after: { topic: 'a' },
        expected: { topic: 'b' },
      }));
      expect(result.valid).toBe(false);
    });
  });

  describe('count', () => {
    it('should pass with valid count', () => {
      const result = v.validate(makeRule({
        type: 'count',
        event: { topic: 'login.failed' },
        threshold: 5,
        window: '5m',
      }));
      expect(result.valid).toBe(true);
    });

    it('should fail when event is missing', () => {
      const result = v.validate(makeRule({
        type: 'count',
        threshold: 5,
        window: '5m',
      }));
      expect(result.valid).toBe(false);
    });

    it('should fail when threshold is missing', () => {
      const result = v.validate(makeRule({
        type: 'count',
        event: { topic: 'test' },
        window: '5m',
      }));
      expect(result.valid).toBe(false);
    });

    it('should fail when threshold is not positive', () => {
      const result = v.validate(makeRule({
        type: 'count',
        event: { topic: 'test' },
        threshold: 0,
        window: '5m',
      }));
      expect(result.valid).toBe(false);
    });

    it('should fail when window is missing', () => {
      const result = v.validate(makeRule({
        type: 'count',
        event: { topic: 'test' },
        threshold: 5,
      }));
      expect(result.valid).toBe(false);
    });

    it('should pass with valid comparison', () => {
      for (const comparison of ['gte', 'lte', 'eq']) {
        const result = v.validate(makeRule({
          type: 'count',
          event: { topic: 'test' },
          threshold: 5,
          comparison,
          window: '5m',
        }));
        expect(result.valid).toBe(true);
      }
    });

    it('should fail with invalid comparison', () => {
      const result = v.validate(makeRule({
        type: 'count',
        event: { topic: 'test' },
        threshold: 5,
        comparison: 'invalid',
        window: '5m',
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid comparison'))).toBe(true);
    });
  });

  describe('aggregate', () => {
    const validAggregate = {
      type: 'aggregate',
      event: { topic: 'transaction.completed' },
      field: 'amount',
      function: 'sum',
      threshold: 10000,
      comparison: 'gte',
      window: '1h',
    };

    it('should pass with valid aggregate', () => {
      const result = v.validate(makeRule(validAggregate));
      expect(result.valid).toBe(true);
    });

    it('should fail when event is missing', () => {
      const { event: _, ...rest } = validAggregate;
      const result = v.validate(makeRule(rest));
      expect(result.valid).toBe(false);
    });

    it('should fail when field is missing', () => {
      const { field: _, ...rest } = validAggregate;
      const result = v.validate(makeRule(rest));
      expect(result.valid).toBe(false);
    });

    it('should fail when field is not a string', () => {
      const result = v.validate(makeRule({ ...validAggregate, field: 42 }));
      expect(result.valid).toBe(false);
    });

    it('should fail when function is missing', () => {
      const { function: _, ...rest } = validAggregate;
      const result = v.validate(makeRule(rest));
      expect(result.valid).toBe(false);
    });

    it('should fail with invalid function', () => {
      const result = v.validate(makeRule({ ...validAggregate, function: 'invalid' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid aggregate function'))).toBe(true);
    });

    it('should pass with all valid functions', () => {
      for (const fn of ['sum', 'avg', 'min', 'max', 'count']) {
        const result = v.validate(makeRule({ ...validAggregate, function: fn }));
        expect(result.valid).toBe(true);
      }
    });

    it('should fail when threshold is missing', () => {
      const { threshold: _, ...rest } = validAggregate;
      const result = v.validate(makeRule(rest));
      expect(result.valid).toBe(false);
    });

    it('should fail when threshold is not a number', () => {
      const result = v.validate(makeRule({ ...validAggregate, threshold: 'high' }));
      expect(result.valid).toBe(false);
    });

    it('should fail with invalid comparison', () => {
      const result = v.validate(makeRule({ ...validAggregate, comparison: 'invalid' }));
      expect(result.valid).toBe(false);
    });

    it('should fail when window is missing', () => {
      const { window: _, ...rest } = validAggregate;
      const result = v.validate(makeRule(rest));
      expect(result.valid).toBe(false);
    });
  });

  describe('duration formats', () => {
    const durations = ['5ms', '10s', '30m', '1h', '7d', '2w', '1y'];

    for (const dur of durations) {
      it(`should accept "${dur}" as duration`, () => {
        const result = v.validate(makeRule({
          type: 'sequence',
          events: [{ topic: 'a' }, { topic: 'b' }],
          within: dur,
        }));
        expect(result.valid).toBe(true);
      });
    }

    it('should accept pure numeric string as duration', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, { topic: 'b' }],
        within: '5000',
      }));
      expect(result.valid).toBe(true);
    });

    it('should reject boolean as duration', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [{ topic: 'a' }, { topic: 'b' }],
        within: true,
      }));
      expect(result.valid).toBe(false);
    });
  });

  describe('event matcher aliases', () => {
    it('should track alias defined in event matcher', () => {
      const v2 = new RuleInputValidator({ strict: true });
      const result = v2.validate(makeRule({
        type: 'sequence',
        events: [
          { topic: 'a', as: 'first' },
          { topic: 'b' },
        ],
        within: '5m',
      }));
      expect(result.warnings.some(w => w.message.includes('"first"'))).toBe(true);
    });

    it('should fail when event matcher alias is not a string', () => {
      const result = v.validate(makeRule({
        type: 'sequence',
        events: [
          { topic: 'a', as: 42 },
          { topic: 'b' },
        ],
        within: '5m',
      }));
      expect(result.valid).toBe(false);
    });
  });
});
