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

describe('condition validation', () => {
  const v = new RuleInputValidator();

  describe('conditions array', () => {
    it('should fail when conditions is not an array', () => {
      const result = v.validate(makeRule('not-an-array'));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions')).toBe(true);
    });

    it('should pass with empty conditions array', () => {
      const result = v.validate(makeRule([]));
      expect(result.valid).toBe(true);
    });
  });

  describe('condition object', () => {
    it('should fail when condition is not an object', () => {
      const result = v.validate(makeRule([42]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0]')).toBe(true);
    });

    it('should fail when source is missing', () => {
      const result = v.validate(makeRule([{ operator: 'eq', value: 10 }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].source')).toBe(true);
    });

    it('should fail when operator is missing', () => {
      const result = v.validate(makeRule([{
        source: { type: 'fact', pattern: 'x' },
        value: 10,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].operator')).toBe(true);
    });

    it('should fail when operator is invalid', () => {
      const result = v.validate(makeRule([{
        source: { type: 'fact', pattern: 'test' },
        operator: 'invalid',
        value: 10,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid operator'))).toBe(true);
    });

    it('should fail when value is missing for binary operator', () => {
      const result = v.validate(makeRule([{
        source: { type: 'fact', pattern: 'test' },
        operator: 'eq',
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].value')).toBe(true);
    });

    it('should not require value for exists operator', () => {
      const result = v.validate(makeRule([{
        source: { type: 'fact', pattern: 'user:*:email' },
        operator: 'exists',
      }]));
      expect(result.valid).toBe(true);
    });

    it('should not require value for not_exists operator', () => {
      const result = v.validate(makeRule([{
        source: { type: 'fact', pattern: 'user:*:email' },
        operator: 'not_exists',
      }]));
      expect(result.valid).toBe(true);
    });
  });

  describe('condition source', () => {
    it('should fail when source is not an object', () => {
      const result = v.validate(makeRule([{
        source: 'string',
        operator: 'eq',
        value: 1,
      }]));
      expect(result.valid).toBe(false);
    });

    it('should fail when source type is invalid', () => {
      const result = v.validate(makeRule([{
        source: { type: 'invalid' },
        operator: 'eq',
        value: 10,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid source type'))).toBe(true);
    });

    it('should validate fact source with pattern', () => {
      const result = v.validate(makeRule([{
        source: { type: 'fact', pattern: 'customer:123:age' },
        operator: 'gte',
        value: 18,
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when fact source has no pattern', () => {
      const result = v.validate(makeRule([{
        source: { type: 'fact' },
        operator: 'eq',
        value: 1,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].source.pattern')).toBe(true);
    });

    it('should validate event source with field', () => {
      const result = v.validate(makeRule([{
        source: { type: 'event', field: 'amount' },
        operator: 'gt',
        value: 100,
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when event source has no field', () => {
      const result = v.validate(makeRule([{
        source: { type: 'event' },
        operator: 'eq',
        value: 1,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].source.field')).toBe(true);
    });

    it('should validate context source with key', () => {
      const result = v.validate(makeRule([{
        source: { type: 'context', key: 'userRole' },
        operator: 'in',
        value: ['admin', 'moderator'],
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when context source has no key', () => {
      const result = v.validate(makeRule([{
        source: { type: 'context' },
        operator: 'eq',
        value: 1,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'conditions[0].source.key')).toBe(true);
    });
  });

  describe('all operators pass', () => {
    const operators = [
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
      'in', 'not_in', 'contains', 'not_contains', 'matches',
    ];

    for (const op of operators) {
      it(`should pass with operator "${op}"`, () => {
        const result = v.validate(makeRule([{
          source: { type: 'fact', pattern: 'test' },
          operator: op,
          value: 1,
        }]));
        expect(result.valid).toBe(true);
      });
    }
  });
});
