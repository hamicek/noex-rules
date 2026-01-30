import { describe, it, expect } from 'vitest';
import { factGoal, FactGoalBuilder } from '../../../../src/dsl/query/fact-goal-builder';

describe('factGoal', () => {
  describe('factory function', () => {
    it('returns a FactGoalBuilder instance', () => {
      const builder = factGoal('customer:tier');
      expect(builder).toBeInstanceOf(FactGoalBuilder);
    });

    it('throws on empty string', () => {
      expect(() => factGoal('')).toThrow('factGoal() key must be a non-empty string');
    });

    it('throws on non-string argument', () => {
      expect(() => factGoal(42 as unknown as string)).toThrow(
        'factGoal() key must be a non-empty string',
      );
    });

    it('throws on undefined argument', () => {
      expect(() => factGoal(undefined as unknown as string)).toThrow(
        'factGoal() key must be a non-empty string',
      );
    });
  });

  describe('exists()', () => {
    it('builds a fact goal without value (existence check)', () => {
      const goal = factGoal('order:status').exists().build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'order:status',
      });
    });
  });

  describe('default (no operator)', () => {
    it('builds an existence check when no operator is called', () => {
      const goal = factGoal('customer:active').build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'customer:active',
      });
    });
  });

  describe('equals()', () => {
    it('builds a fact goal with eq operator', () => {
      const goal = factGoal('customer:tier').equals('vip').build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'customer:tier',
        value: 'vip',
        operator: 'eq',
      });
    });

    it('accepts numeric value', () => {
      const goal = factGoal('score').equals(100).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'score',
        value: 100,
        operator: 'eq',
      });
    });

    it('accepts boolean value', () => {
      const goal = factGoal('active').equals(true).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'active',
        value: true,
        operator: 'eq',
      });
    });

    it('accepts null value', () => {
      const goal = factGoal('deleted').equals(null).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'deleted',
        value: null,
        operator: 'eq',
      });
    });

    it('accepts zero as value', () => {
      const goal = factGoal('count').equals(0).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'count',
        value: 0,
        operator: 'eq',
      });
    });

    it('accepts empty string as value', () => {
      const goal = factGoal('name').equals('').build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'name',
        value: '',
        operator: 'eq',
      });
    });
  });

  describe('neq()', () => {
    it('builds a fact goal with neq operator', () => {
      const goal = factGoal('status').neq('inactive').build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'status',
        value: 'inactive',
        operator: 'neq',
      });
    });
  });

  describe('gt()', () => {
    it('builds a fact goal with gt operator', () => {
      const goal = factGoal('score').gt(50).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'score',
        value: 50,
        operator: 'gt',
      });
    });

    it('throws on non-number value', () => {
      expect(() => factGoal('score').gt('50' as unknown as number)).toThrow(
        'factGoal("score").gt() value must be a finite number',
      );
    });

    it('throws on NaN', () => {
      expect(() => factGoal('score').gt(NaN)).toThrow(
        'factGoal("score").gt() value must be a finite number',
      );
    });

    it('throws on Infinity', () => {
      expect(() => factGoal('score').gt(Infinity)).toThrow(
        'factGoal("score").gt() value must be a finite number',
      );
    });
  });

  describe('gte()', () => {
    it('builds a fact goal with gte operator', () => {
      const goal = factGoal('sensor:temp').gte(100).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'sensor:temp',
        value: 100,
        operator: 'gte',
      });
    });

    it('throws on non-number value', () => {
      expect(() => factGoal('x').gte(null as unknown as number)).toThrow(
        'factGoal("x").gte() value must be a finite number',
      );
    });
  });

  describe('lt()', () => {
    it('builds a fact goal with lt operator', () => {
      const goal = factGoal('priority').lt(10).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'priority',
        value: 10,
        operator: 'lt',
      });
    });

    it('throws on non-number value', () => {
      expect(() => factGoal('x').lt(undefined as unknown as number)).toThrow(
        'factGoal("x").lt() value must be a finite number',
      );
    });
  });

  describe('lte()', () => {
    it('builds a fact goal with lte operator', () => {
      const goal = factGoal('budget').lte(1000).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'budget',
        value: 1000,
        operator: 'lte',
      });
    });

    it('throws on non-number value', () => {
      expect(() => factGoal('x').lte({} as unknown as number)).toThrow(
        'factGoal("x").lte() value must be a finite number',
      );
    });
  });

  describe('chaining', () => {
    it('last operator wins when chaining multiple', () => {
      const goal = factGoal('value').equals(1).gte(10).build();

      expect(goal).toEqual({
        type: 'fact',
        key: 'value',
        value: 10,
        operator: 'gte',
      });
    });

    it('returns this for fluent chaining', () => {
      const builder = factGoal('key');

      expect(builder.exists()).toBe(builder);
      expect(builder.equals('v')).toBe(builder);
    });
  });

  describe('negative numbers', () => {
    it('accepts negative numbers for gt', () => {
      const goal = factGoal('temp').gt(-10).build();
      expect(goal.value).toBe(-10);
      expect(goal.operator).toBe('gt');
    });

    it('accepts zero for gte', () => {
      const goal = factGoal('count').gte(0).build();
      expect(goal.value).toBe(0);
      expect(goal.operator).toBe('gte');
    });
  });

  describe('GoalBuilder interface', () => {
    it('has a build() method returning a Goal', () => {
      const builder = factGoal('key');
      expect(typeof builder.build).toBe('function');

      const goal = builder.build();
      expect(goal.type).toBe('fact');
    });

    it('can be detected via "build" in builder', () => {
      const builder = factGoal('key');
      expect('build' in builder).toBe(true);
    });
  });
});
