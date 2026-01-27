import { bench, describe } from 'vitest';
import { ConditionEvaluator, type EvaluationContext } from '../../../src/evaluation/condition-evaluator.js';
import { FactStore } from '../../../src/core/fact-store.js';
import type { RuleCondition } from '../../../src/types/condition.js';

type ConditionOperator = RuleCondition['operator'];

const OPERATORS: ConditionOperator[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'exists', 'not_exists'
];

function createContext(facts: FactStore, eventData: Record<string, unknown> = {}): EvaluationContext {
  return {
    trigger: {
      type: 'event',
      data: {
        orderId: 'ORD-12345',
        customerId: 'CUST-001',
        total: 150.50,
        items: ['item1', 'item2', 'item3'],
        status: 'pending',
        tags: ['vip', 'express'],
        nested: { level1: { level2: { value: 42 } } },
        ...eventData
      }
    },
    facts,
    variables: new Map([
      ['threshold', 100],
      ['status', 'active'],
      ['allowedStatuses', ['pending', 'processing', 'shipped']]
    ])
  };
}

function createCondition(operator: ConditionOperator, sourceType: 'fact' | 'event' | 'context'): RuleCondition {
  let source: RuleCondition['source'];
  switch (sourceType) {
    case 'fact':
      source = { type: 'fact', pattern: 'customer:CUST-001:status' };
      break;
    case 'event':
      source = { type: 'event', field: 'total' };
      break;
    case 'context':
      source = { type: 'context', key: 'threshold' };
      break;
  }

  let value: unknown;
  switch (operator) {
    case 'eq':
    case 'neq':
      value = sourceType === 'event' ? 150.50 : 'active';
      break;
    case 'gt':
    case 'gte':
      value = 100;
      break;
    case 'lt':
    case 'lte':
      value = 200;
      break;
    case 'in':
    case 'not_in':
      value = ['pending', 'active', 'processing'];
      break;
    case 'contains':
    case 'not_contains':
      value = 'act';
      break;
    case 'matches':
      value = '^act.*$';
      break;
    case 'exists':
    case 'not_exists':
      value = true;
      break;
  }

  return { source, operator, value };
}

function createConditions(count: number): RuleCondition[] {
  const conditions: RuleCondition[] = [];
  const sourceTypes: ('fact' | 'event' | 'context')[] = ['fact', 'event', 'context'];

  for (let i = 0; i < count; i++) {
    const operator = OPERATORS[i % OPERATORS.length];
    const sourceType = sourceTypes[i % sourceTypes.length];
    conditions.push(createCondition(operator, sourceType));
  }

  return conditions;
}

function populateFactStore(store: FactStore, count: number): void {
  for (let i = 0; i < count; i++) {
    store.set(`customer:CUST-${i.toString().padStart(3, '0')}:status`, 'active');
    store.set(`customer:CUST-${i.toString().padStart(3, '0')}:tier`, 'premium');
    store.set(`order:ORD-${i}:total`, 100 + i);
  }
}

describe('ConditionEvaluator', () => {
  describe('individual operators', () => {
    const evaluator = new ConditionEvaluator();
    const factStore = new FactStore();
    populateFactStore(factStore, 1000);
    const ctx = createContext(factStore);

    for (const operator of OPERATORS) {
      bench(`operator: ${operator}`, () => {
        const condition = createCondition(operator, 'event');
        for (let i = 0; i < 100; i++) {
          evaluator.evaluate(condition, ctx);
        }
      });
    }
  });

  describe('source types', () => {
    const evaluator = new ConditionEvaluator();
    const factStore = new FactStore();
    populateFactStore(factStore, 1000);
    const ctx = createContext(factStore);

    bench('source: fact (pattern lookup)', () => {
      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'customer:CUST-001:status' },
        operator: 'eq',
        value: 'active'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('source: fact (wildcard pattern)', () => {
      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'customer:*:status' },
        operator: 'eq',
        value: 'active'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('source: event (shallow field)', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: 100
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('source: event (nested field)', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'nested.level1.level2.value' },
        operator: 'eq',
        value: 42
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('source: context (variable lookup)', () => {
      const condition: RuleCondition = {
        source: { type: 'context', key: 'threshold' },
        operator: 'lt',
        value: 200
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });
  });

  describe('reference values', () => {
    const evaluator = new ConditionEvaluator();
    const factStore = new FactStore();
    factStore.set('config:limits:maxTotal', 500);
    const ctx = createContext(factStore);

    bench('static value comparison', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'total' },
        operator: 'lt',
        value: 500
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('ref: fact value', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'total' },
        operator: 'lt',
        value: { ref: 'fact.config:limits:maxTotal' }
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('ref: event value', () => {
      const condition: RuleCondition = {
        source: { type: 'context', key: 'threshold' },
        operator: 'lt',
        value: { ref: 'event.total' }
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('ref: context variable', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: { ref: 'var.threshold' }
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });
  });

  describe('fact interpolation', () => {
    const evaluator = new ConditionEvaluator();

    bench('static fact pattern', () => {
      const factStore = new FactStore();
      factStore.set('order:ORD-12345:status', 'pending');
      const ctx = createContext(factStore);

      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'order:ORD-12345:status' },
        operator: 'eq',
        value: 'pending'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('interpolated fact pattern (${event.orderId})', () => {
      const factStore = new FactStore();
      factStore.set('order:ORD-12345:status', 'pending');
      const ctx = createContext(factStore);

      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
        operator: 'eq',
        value: 'pending'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('multi-interpolation pattern', () => {
      const factStore = new FactStore();
      factStore.set('relation:CUST-001:ORD-12345:discount', 10);
      const ctx = createContext(factStore);

      const condition: RuleCondition = {
        source: { type: 'fact', pattern: 'relation:${event.customerId}:${event.orderId}:discount' },
        operator: 'gt',
        value: 0
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });
  });

  describe('evaluateAll() - condition count scalability', () => {
    const evaluator = new ConditionEvaluator();
    const factStore = new FactStore();
    populateFactStore(factStore, 1000);
    const ctx = createContext(factStore);

    const conditionSets = {
      1: createConditions(1),
      5: createConditions(5),
      10: createConditions(10),
      20: createConditions(20),
      50: createConditions(50)
    };

    bench('evaluateAll() - 1 condition', () => {
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditionSets[1], ctx);
      }
    });

    bench('evaluateAll() - 5 conditions', () => {
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditionSets[5], ctx);
      }
    });

    bench('evaluateAll() - 10 conditions', () => {
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditionSets[10], ctx);
      }
    });

    bench('evaluateAll() - 20 conditions', () => {
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditionSets[20], ctx);
      }
    });

    bench('evaluateAll() - 50 conditions', () => {
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditionSets[50], ctx);
      }
    });
  });

  describe('early exit optimization', () => {
    const evaluator = new ConditionEvaluator();
    const factStore = new FactStore();
    const ctx = createContext(factStore);

    bench('all conditions pass (worst case)', () => {
      const conditions: RuleCondition[] = Array.from({ length: 20 }, () => ({
        source: { type: 'event' as const, field: 'total' },
        operator: 'gt' as const,
        value: 100
      }));
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditions, ctx);
      }
    });

    bench('first condition fails (best case)', () => {
      const conditions: RuleCondition[] = [
        { source: { type: 'event', field: 'total' }, operator: 'lt', value: 0 },
        ...Array.from({ length: 19 }, () => ({
          source: { type: 'event' as const, field: 'total' },
          operator: 'gt' as const,
          value: 100
        }))
      ];
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditions, ctx);
      }
    });

    bench('middle condition fails', () => {
      const conditions: RuleCondition[] = [
        ...Array.from({ length: 10 }, () => ({
          source: { type: 'event' as const, field: 'total' },
          operator: 'gt' as const,
          value: 100
        })),
        { source: { type: 'event', field: 'total' }, operator: 'lt', value: 0 },
        ...Array.from({ length: 9 }, () => ({
          source: { type: 'event' as const, field: 'total' },
          operator: 'gt' as const,
          value: 100
        }))
      ];
      for (let i = 0; i < 100; i++) {
        evaluator.evaluateAll(conditions, ctx);
      }
    });
  });

  describe('fact store size impact', () => {
    const evaluator = new ConditionEvaluator();
    const stores = new Map<number, FactStore>();

    for (const size of [100, 1000, 10000]) {
      const store = new FactStore();
      populateFactStore(store, size);
      stores.set(size, store);
    }

    const condition: RuleCondition = {
      source: { type: 'fact', pattern: 'customer:CUST-050:status' },
      operator: 'eq',
      value: 'active'
    };

    bench('fact lookup - 100 facts in store', () => {
      const ctx = createContext(stores.get(100)!);
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('fact lookup - 1,000 facts in store', () => {
      const ctx = createContext(stores.get(1000)!);
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('fact lookup - 10,000 facts in store', () => {
      const ctx = createContext(stores.get(10000)!);
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });
  });

  describe('regex operator complexity', () => {
    const evaluator = new ConditionEvaluator();
    const factStore = new FactStore();
    const ctx = createContext(factStore, { text: 'The quick brown fox jumps over the lazy dog' });

    bench('matches - simple pattern', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'text' },
        operator: 'matches',
        value: 'fox'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('matches - anchored pattern', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'text' },
        operator: 'matches',
        value: '^The.*dog$'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('matches - character class pattern', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'text' },
        operator: 'matches',
        value: '[A-Z][a-z]+ [a-z]+'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });

    bench('matches - alternation pattern', () => {
      const condition: RuleCondition = {
        source: { type: 'event', field: 'text' },
        operator: 'matches',
        value: '(quick|slow|fast) (brown|white|black)'
      };
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(condition, ctx);
      }
    });
  });
});
