import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConditionEvaluator,
  type EvaluationContext
} from '../../../src/evaluation/condition-evaluator';
import { FactStore } from '../../../src/core/fact-store';
import type { RuleCondition } from '../../../src/types/condition';

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;
  let factStore: FactStore;
  let context: EvaluationContext;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
    factStore = new FactStore();
    context = {
      trigger: {
        type: 'event',
        data: {}
      },
      facts: factStore,
      variables: new Map()
    };
  });

  describe('evaluate() - source types', () => {
    describe('fact source', () => {
      it('evaluates condition using fact value', () => {
        factStore.set('user:123:status', 'active');
        const condition: RuleCondition = {
          source: { type: 'fact', pattern: 'user:123:status' },
          operator: 'eq',
          value: 'active'
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });

      it('uses first matching fact when pattern has wildcards', () => {
        factStore.set('user:100:age', 25);
        factStore.set('user:200:age', 30);
        const condition: RuleCondition = {
          source: { type: 'fact', pattern: 'user:*:age' },
          operator: 'gte',
          value: 25
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });

      it('returns undefined value for non-existing fact', () => {
        const condition: RuleCondition = {
          source: { type: 'fact', pattern: 'nonexistent' },
          operator: 'exists',
          value: null
        };

        expect(evaluator.evaluate(condition, context)).toBe(false);
      });

      it('handles complex fact values', () => {
        factStore.set('order:500:items', ['apple', 'banana', 'orange']);
        const condition: RuleCondition = {
          source: { type: 'fact', pattern: 'order:500:items' },
          operator: 'contains',
          value: 'banana'
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });
    });

    describe('event source', () => {
      it('evaluates condition using event field', () => {
        context.trigger.data = { amount: 150, currency: 'USD' };
        const condition: RuleCondition = {
          source: { type: 'event', field: 'amount' },
          operator: 'gt',
          value: 100
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });

      it('accesses nested event fields', () => {
        context.trigger.data = {
          customer: {
            profile: {
              tier: 'premium'
            }
          }
        };
        const condition: RuleCondition = {
          source: { type: 'event', field: 'customer.profile.tier' },
          operator: 'eq',
          value: 'premium'
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });

      it('returns undefined for missing nested field', () => {
        context.trigger.data = { customer: {} };
        const condition: RuleCondition = {
          source: { type: 'event', field: 'customer.profile.tier' },
          operator: 'not_exists',
          value: null
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });

      it('handles array indexing in field path', () => {
        context.trigger.data = { items: [{ name: 'first' }, { name: 'second' }] };
        const condition: RuleCondition = {
          source: { type: 'event', field: 'items.0.name' },
          operator: 'eq',
          value: 'first'
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });
    });

    describe('context source', () => {
      it('evaluates condition using context variable', () => {
        context.variables.set('threshold', 50);
        const condition: RuleCondition = {
          source: { type: 'context', key: 'threshold' },
          operator: 'lte',
          value: 100
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });

      it('returns undefined for non-existing variable', () => {
        const condition: RuleCondition = {
          source: { type: 'context', key: 'missing' },
          operator: 'exists',
          value: null
        };

        expect(evaluator.evaluate(condition, context)).toBe(false);
      });

      it('handles various variable types', () => {
        context.variables.set('tags', ['urgent', 'support']);
        const condition: RuleCondition = {
          source: { type: 'context', key: 'tags' },
          operator: 'contains',
          value: 'urgent'
        };

        expect(evaluator.evaluate(condition, context)).toBe(true);
      });
    });
  });

  describe('evaluate() - reference resolution', () => {
    it('resolves fact reference in compare value', () => {
      factStore.set('config:min-amount', 100);
      context.trigger.data = { amount: 150 };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'amount' },
        operator: 'gt',
        value: { ref: 'fact.config:min-amount' }
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('resolves event reference in compare value', () => {
      context.trigger.data = { price: 100, minPrice: 50 };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'price' },
        operator: 'gte',
        value: { ref: 'event.minPrice' }
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('resolves trigger alias for event reference', () => {
      context.trigger.data = { current: 75, target: 75 };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'current' },
        operator: 'eq',
        value: { ref: 'trigger.target' }
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('resolves variable reference in compare value', () => {
      context.variables.set('maxAllowed', 1000);
      context.trigger.data = { quantity: 500 };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'quantity' },
        operator: 'lte',
        value: { ref: 'var.maxAllowed' }
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('resolves nested event field reference', () => {
      context.trigger.data = {
        order: { total: 200 },
        limits: { maxTotal: 500 }
      };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'order.total' },
        operator: 'lt',
        value: { ref: 'event.limits.maxTotal' }
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('returns undefined for non-existing reference', () => {
      context.trigger.data = { value: 100 };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: { ref: 'fact.nonexistent' }
      };

      expect(evaluator.evaluate(condition, context)).toBe(false);
    });
  });

  describe('evaluateAll() - AND logic', () => {
    it('returns true when all conditions pass', () => {
      factStore.set('user:type', 'premium');
      context.trigger.data = { amount: 500 };
      const conditions: RuleCondition[] = [
        {
          source: { type: 'fact', pattern: 'user:type' },
          operator: 'eq',
          value: 'premium'
        },
        {
          source: { type: 'event', field: 'amount' },
          operator: 'gte',
          value: 100
        }
      ];

      expect(evaluator.evaluateAll(conditions, context)).toBe(true);
    });

    it('returns false when any condition fails', () => {
      factStore.set('user:type', 'basic');
      context.trigger.data = { amount: 500 };
      const conditions: RuleCondition[] = [
        {
          source: { type: 'fact', pattern: 'user:type' },
          operator: 'eq',
          value: 'premium'
        },
        {
          source: { type: 'event', field: 'amount' },
          operator: 'gte',
          value: 100
        }
      ];

      expect(evaluator.evaluateAll(conditions, context)).toBe(false);
    });

    it('returns true for empty conditions array', () => {
      expect(evaluator.evaluateAll([], context)).toBe(true);
    });

    it('short-circuits on first failure', () => {
      const conditions: RuleCondition[] = [
        {
          source: { type: 'fact', pattern: 'missing' },
          operator: 'exists',
          value: null
        },
        {
          source: { type: 'event', field: 'field' },
          operator: 'eq',
          value: 'never-checked'
        }
      ];

      expect(evaluator.evaluateAll(conditions, context)).toBe(false);
    });

    it('evaluates multiple conditions with mixed source types', () => {
      factStore.set('config:enabled', true);
      context.trigger.data = { action: 'purchase', amount: 75 };
      context.variables.set('minAmount', 50);

      const conditions: RuleCondition[] = [
        {
          source: { type: 'fact', pattern: 'config:enabled' },
          operator: 'eq',
          value: true
        },
        {
          source: { type: 'event', field: 'action' },
          operator: 'in',
          value: ['purchase', 'refund']
        },
        {
          source: { type: 'event', field: 'amount' },
          operator: 'gte',
          value: { ref: 'var.minAmount' }
        }
      ];

      expect(evaluator.evaluateAll(conditions, context)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles null fact value correctly', () => {
      factStore.set('nullable', null);
      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'nullable' },
        operator: 'eq',
        value: null
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('handles boolean fact value', () => {
      factStore.set('flag', false);
      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'flag' },
        operator: 'eq',
        value: false
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('handles zero value comparison', () => {
      context.trigger.data = { count: 0 };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'count' },
        operator: 'gte',
        value: 0
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('handles empty string value', () => {
      factStore.set('name', '');
      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'name' },
          operator: 'eq',
        value: ''
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('handles empty array value', () => {
      context.trigger.data = { items: [] };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'items' },
        operator: 'not_contains',
        value: 'anything'
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('handles regex matching via matches operator', () => {
      factStore.set('email', 'user@example.com');
      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'email' },
        operator: 'matches',
        value: '^[a-z]+@[a-z]+\\.[a-z]+$'
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('returns false for invalid regex pattern', () => {
      factStore.set('text', 'some text');
      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'text' },
        operator: 'matches',
        value: '[invalid('
      };

      expect(evaluator.evaluate(condition, context)).toBe(false);
    });

    it('handles in operator with various types', () => {
      context.trigger.data = { status: 'pending' };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'status' },
        operator: 'in',
        value: ['pending', 'processing', 'completed']
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('handles not_in operator correctly', () => {
      context.trigger.data = { role: 'admin' };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'role' },
        operator: 'not_in',
        value: ['guest', 'banned']
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });
  });

  describe('trigger type variations', () => {
    it('works with fact trigger type', () => {
      context.trigger = {
        type: 'fact',
        data: { key: 'user:status', value: 'online', previousValue: 'offline' }
      };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: 'online'
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('works with timer trigger type', () => {
      context.trigger = {
        type: 'timer',
        data: { timerName: 'session-timeout', userId: '123' }
      };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'timerName' },
        operator: 'eq',
        value: 'session-timeout'
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('works with temporal trigger type', () => {
      context.trigger = {
        type: 'temporal',
        data: { schedule: 'daily', hour: 9 }
      };
      const condition: RuleCondition = {
        source: { type: 'event', field: 'hour' },
        operator: 'eq',
        value: 9
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });
  });
});
