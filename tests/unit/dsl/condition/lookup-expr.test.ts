import { describe, it, expect } from 'vitest';
import { lookup } from '../../../../src/dsl/condition/lookup-expr';
import { ref } from '../../../../src/dsl/helpers/ref';

describe('lookup', () => {
  describe('source creation', () => {
    it('creates source expression for a plain lookup name', () => {
      const condition = lookup('credit').gte(700).build();

      expect(condition.source).toEqual({ type: 'lookup', name: 'credit' });
      expect(condition.operator).toBe('gte');
      expect(condition.value).toBe(700);
    });

    it('creates source expression with dot-notated field access', () => {
      const condition = lookup('fraud.riskLevel').neq('high').build();

      expect(condition.source).toEqual({
        type: 'lookup',
        name: 'fraud',
        field: 'riskLevel',
      });
      expect(condition.operator).toBe('neq');
      expect(condition.value).toBe('high');
    });

    it('supports deeply nested field paths', () => {
      const condition = lookup('api.response.data.score').gte(50).build();

      expect(condition.source).toEqual({
        type: 'lookup',
        name: 'api',
        field: 'response.data.score',
      });
    });
  });

  describe('operator chaining', () => {
    it('eq', () => {
      const condition = lookup('status').eq('approved').build();
      expect(condition.operator).toBe('eq');
      expect(condition.value).toBe('approved');
    });

    it('neq', () => {
      const condition = lookup('status').neq('rejected').build();
      expect(condition.operator).toBe('neq');
      expect(condition.value).toBe('rejected');
    });

    it('gt', () => {
      const condition = lookup('score').gt(80).build();
      expect(condition.operator).toBe('gt');
      expect(condition.value).toBe(80);
    });

    it('gte', () => {
      const condition = lookup('score').gte(700).build();
      expect(condition.operator).toBe('gte');
      expect(condition.value).toBe(700);
    });

    it('lt', () => {
      const condition = lookup('risk').lt(0.5).build();
      expect(condition.operator).toBe('lt');
      expect(condition.value).toBe(0.5);
    });

    it('lte', () => {
      const condition = lookup('risk').lte(0.3).build();
      expect(condition.operator).toBe('lte');
      expect(condition.value).toBe(0.3);
    });

    it('in', () => {
      const condition = lookup('tier').in(['gold', 'platinum']).build();
      expect(condition.operator).toBe('in');
      expect(condition.value).toEqual(['gold', 'platinum']);
    });

    it('notIn', () => {
      const condition = lookup('tier').notIn(['banned', 'suspended']).build();
      expect(condition.operator).toBe('not_in');
      expect(condition.value).toEqual(['banned', 'suspended']);
    });

    it('contains', () => {
      const condition = lookup('permissions').contains('admin').build();
      expect(condition.operator).toBe('contains');
      expect(condition.value).toBe('admin');
    });

    it('notContains', () => {
      const condition = lookup('flags').notContains('blocked').build();
      expect(condition.operator).toBe('not_contains');
      expect(condition.value).toBe('blocked');
    });

    it('matches', () => {
      const condition = lookup('email').matches('^.*@corp\\.com$').build();
      expect(condition.operator).toBe('matches');
      expect(condition.value).toBe('^.*@corp\\.com$');
    });

    it('exists', () => {
      const condition = lookup('credit').exists().build();
      expect(condition.operator).toBe('exists');
      expect(condition.value).toBe(true);
    });

    it('notExists', () => {
      const condition = lookup('optional').notExists().build();
      expect(condition.operator).toBe('not_exists');
      expect(condition.value).toBe(true);
    });
  });

  describe('reference values', () => {
    it('accepts ref() as comparison value', () => {
      const condition = lookup('credit').gte(ref('event.minScore')).build();
      expect(condition.value).toEqual({ ref: 'event.minScore' });
    });

    it('accepts ref() in list operators', () => {
      const condition = lookup('tier').in(ref('fact.allowedTiers')).build();
      expect(condition.value).toEqual({ ref: 'fact.allowedTiers' });
    });
  });

  describe('build() output', () => {
    it('produces a valid RuleCondition for a plain lookup', () => {
      const condition = lookup('credit').gte(700).build();

      expect(condition).toEqual({
        source: { type: 'lookup', name: 'credit' },
        operator: 'gte',
        value: 700,
      });
    });

    it('produces a valid RuleCondition for a lookup with field', () => {
      const condition = lookup('fraud.riskLevel').neq('high').build();

      expect(condition).toEqual({
        source: { type: 'lookup', name: 'fraud', field: 'riskLevel' },
        operator: 'neq',
        value: 'high',
      });
    });
  });

  describe('error handling', () => {
    it('throws when building without operator', () => {
      expect(() => lookup('credit').build()).toThrow('operator not specified');
    });

    it('includes source context in error message', () => {
      expect(() => lookup('credit').build()).toThrow(
        'Condition on lookup("credit"): operator not specified. Use .eq(), .gte(), etc.',
      );
    });

    it('throws on empty string', () => {
      expect(() => lookup('')).toThrow('must be a non-empty string');
    });

    it('throws on non-string argument', () => {
      expect(() => lookup(42 as unknown as string)).toThrow('must be a non-empty string');
    });

    it('throws when name part is empty (leading dot)', () => {
      expect(() => lookup('.field')).toThrow('name part must not be empty');
    });

    it('throws when field part is empty (trailing dot)', () => {
      expect(() => lookup('name.')).toThrow('field part must not be empty');
    });
  });
});
