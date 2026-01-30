import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  Goal,
  FactGoal,
  EventGoal,
  QueryResult,
  ProofNode,
  FactExistsNode,
  RuleProofNode,
  ConditionProofNode,
  UnachievableNode,
  BackwardChainingConfig,
  RuleEngineConfig,
} from '../../../src/types/index.js';

describe('Goal', () => {
  describe('type compatibility', () => {
    it('should accept FactGoal with key only (existence check)', () => {
      const goal: Goal = {
        type: 'fact',
        key: 'customer:123:tier',
      };

      expect(goal.type).toBe('fact');
      expect((goal as FactGoal).key).toBe('customer:123:tier');
    });

    it('should accept FactGoal with value', () => {
      const goal: Goal = {
        type: 'fact',
        key: 'customer:123:tier',
        value: 'vip',
      };

      expect((goal as FactGoal).value).toBe('vip');
    });

    it('should accept FactGoal with operator', () => {
      const goal: Goal = {
        type: 'fact',
        key: 'sensor:temp',
        value: 100,
        operator: 'gte',
      };

      expect((goal as FactGoal).operator).toBe('gte');
    });

    it('should accept EventGoal', () => {
      const goal: Goal = {
        type: 'event',
        topic: 'order.completed',
      };

      expect(goal.type).toBe('event');
      expect((goal as EventGoal).topic).toBe('order.completed');
    });
  });

  describe('type-level assertions', () => {
    it('should be a discriminated union on type field', () => {
      expectTypeOf<Goal>().toEqualTypeOf<FactGoal | EventGoal>();
    });
  });
});

describe('FactGoal', () => {
  describe('type compatibility', () => {
    it('should accept minimal fact goal', () => {
      const goal: FactGoal = {
        type: 'fact',
        key: 'user:active',
      };

      expect(goal.type).toBe('fact');
      expect(goal.key).toBe('user:active');
      expect(goal.value).toBeUndefined();
      expect(goal.operator).toBeUndefined();
    });

    it('should accept all operator variants', () => {
      const operators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

      for (const op of operators) {
        const goal: FactGoal = {
          type: 'fact',
          key: 'metric:value',
          value: 42,
          operator: op,
        };
        expect(goal.operator).toBe(op);
      }
    });

    it('should accept various value types', () => {
      const stringGoal: FactGoal = { type: 'fact', key: 'k', value: 'text' };
      const numberGoal: FactGoal = { type: 'fact', key: 'k', value: 42 };
      const boolGoal: FactGoal = { type: 'fact', key: 'k', value: true };
      const objectGoal: FactGoal = { type: 'fact', key: 'k', value: { nested: 1 } };

      expect(stringGoal.value).toBe('text');
      expect(numberGoal.value).toBe(42);
      expect(boolGoal.value).toBe(true);
      expect(objectGoal.value).toEqual({ nested: 1 });
    });
  });

  describe('type constraints', () => {
    it('should require type field', () => {
      // @ts-expect-error - type is required
      const _invalid: FactGoal = {
        key: 'test',
      };
      expect(true).toBe(true);
    });

    it('should require key field', () => {
      // @ts-expect-error - key is required
      const _invalid: FactGoal = {
        type: 'fact',
      };
      expect(true).toBe(true);
    });

    it('should not accept invalid operator', () => {
      const _invalid: FactGoal = {
        type: 'fact',
        key: 'test',
        // @ts-expect-error - invalid operator
        operator: 'contains',
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<FactGoal['type']>().toEqualTypeOf<'fact'>();
      expectTypeOf<FactGoal['key']>().toEqualTypeOf<string>();
      expectTypeOf<FactGoal['value']>().toEqualTypeOf<unknown>();
      expectTypeOf<FactGoal['operator']>().toEqualTypeOf<'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | undefined>();
    });
  });
});

describe('EventGoal', () => {
  describe('type compatibility', () => {
    it('should accept valid event goal', () => {
      const goal: EventGoal = {
        type: 'event',
        topic: 'user.registered',
      };

      expect(goal.type).toBe('event');
      expect(goal.topic).toBe('user.registered');
    });
  });

  describe('type constraints', () => {
    it('should require type field', () => {
      // @ts-expect-error - type is required
      const _invalid: EventGoal = {
        topic: 'test',
      };
      expect(true).toBe(true);
    });

    it('should require topic field', () => {
      // @ts-expect-error - topic is required
      const _invalid: EventGoal = {
        type: 'event',
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<EventGoal['type']>().toEqualTypeOf<'event'>();
      expectTypeOf<EventGoal['topic']>().toEqualTypeOf<string>();
    });
  });
});

describe('QueryResult', () => {
  describe('type compatibility', () => {
    it('should accept achievable result', () => {
      const result: QueryResult = {
        goal: { type: 'fact', key: 'customer:tier', value: 'vip' },
        achievable: true,
        proof: { type: 'fact_exists', key: 'customer:tier', currentValue: 'vip', satisfied: true },
        exploredRules: 3,
        maxDepthReached: false,
        durationMs: 1.5,
      };

      expect(result.achievable).toBe(true);
      expect(result.exploredRules).toBe(3);
      expect(result.maxDepthReached).toBe(false);
      expect(result.durationMs).toBe(1.5);
    });

    it('should accept unachievable result', () => {
      const result: QueryResult = {
        goal: { type: 'event', topic: 'order.shipped' },
        achievable: false,
        proof: { type: 'unachievable', reason: 'no_rules' },
        exploredRules: 0,
        maxDepthReached: false,
        durationMs: 0.1,
      };

      expect(result.achievable).toBe(false);
    });

    it('should accept result with max depth reached', () => {
      const result: QueryResult = {
        goal: { type: 'fact', key: 'deep:chain' },
        achievable: false,
        proof: { type: 'unachievable', reason: 'max_depth', details: 'Reached depth 10' },
        exploredRules: 15,
        maxDepthReached: true,
        durationMs: 5.2,
      };

      expect(result.maxDepthReached).toBe(true);
    });
  });

  describe('type constraints', () => {
    it('should require all fields', () => {
      // @ts-expect-error - goal is required
      const _invalid: QueryResult = {
        achievable: true,
        proof: { type: 'unachievable', reason: 'no_rules' },
        exploredRules: 0,
        maxDepthReached: false,
        durationMs: 0,
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<QueryResult['goal']>().toEqualTypeOf<Goal>();
      expectTypeOf<QueryResult['achievable']>().toEqualTypeOf<boolean>();
      expectTypeOf<QueryResult['proof']>().toEqualTypeOf<ProofNode>();
      expectTypeOf<QueryResult['exploredRules']>().toEqualTypeOf<number>();
      expectTypeOf<QueryResult['maxDepthReached']>().toEqualTypeOf<boolean>();
      expectTypeOf<QueryResult['durationMs']>().toEqualTypeOf<number>();
    });
  });
});

describe('ProofNode', () => {
  describe('type compatibility', () => {
    it('should accept FactExistsNode', () => {
      const node: ProofNode = {
        type: 'fact_exists',
        key: 'user:active',
        currentValue: true,
        satisfied: true,
      };

      expect(node.type).toBe('fact_exists');
    });

    it('should accept RuleProofNode', () => {
      const node: ProofNode = {
        type: 'rule',
        ruleId: 'rule-1',
        ruleName: 'VIP Upgrade',
        satisfied: true,
        conditions: [
          {
            source: 'fact:totalSpent',
            operator: 'gte',
            expectedValue: 1000,
            actualValue: 1500,
            satisfied: true,
          },
        ],
        children: [],
      };

      expect(node.type).toBe('rule');
    });

    it('should accept UnachievableNode', () => {
      const node: ProofNode = {
        type: 'unachievable',
        reason: 'cycle_detected',
        details: 'Cycle: rule-A → rule-B → rule-A',
      };

      expect(node.type).toBe('unachievable');
    });

    it('should accept nested proof tree', () => {
      const tree: ProofNode = {
        type: 'rule',
        ruleId: 'rule-top',
        ruleName: 'Top Rule',
        satisfied: true,
        conditions: [],
        children: [
          {
            type: 'rule',
            ruleId: 'rule-child',
            ruleName: 'Child Rule',
            satisfied: true,
            conditions: [
              {
                source: 'fact:order:total',
                operator: 'gt',
                expectedValue: 500,
                actualValue: 750,
                satisfied: true,
              },
            ],
            children: [
              {
                type: 'fact_exists',
                key: 'order:total',
                currentValue: 750,
                satisfied: true,
              },
            ],
          },
        ],
      };

      expect(tree.type).toBe('rule');
      expect((tree as RuleProofNode).children).toHaveLength(1);
      const child = (tree as RuleProofNode).children[0] as RuleProofNode;
      expect(child.children).toHaveLength(1);
      expect(child.children[0]!.type).toBe('fact_exists');
    });
  });

  describe('type-level assertions', () => {
    it('should be a discriminated union on type field', () => {
      expectTypeOf<ProofNode>().toEqualTypeOf<FactExistsNode | RuleProofNode | UnachievableNode>();
    });
  });
});

describe('FactExistsNode', () => {
  describe('type compatibility', () => {
    it('should accept satisfied node', () => {
      const node: FactExistsNode = {
        type: 'fact_exists',
        key: 'user:123:tier',
        currentValue: 'gold',
        satisfied: true,
      };

      expect(node.key).toBe('user:123:tier');
      expect(node.currentValue).toBe('gold');
      expect(node.satisfied).toBe(true);
    });

    it('should accept unsatisfied node with null value', () => {
      const node: FactExistsNode = {
        type: 'fact_exists',
        key: 'missing:key',
        currentValue: null,
        satisfied: false,
      };

      expect(node.currentValue).toBeNull();
      expect(node.satisfied).toBe(false);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<FactExistsNode['type']>().toEqualTypeOf<'fact_exists'>();
      expectTypeOf<FactExistsNode['key']>().toEqualTypeOf<string>();
      expectTypeOf<FactExistsNode['currentValue']>().toEqualTypeOf<unknown>();
      expectTypeOf<FactExistsNode['satisfied']>().toEqualTypeOf<boolean>();
    });
  });
});

describe('RuleProofNode', () => {
  describe('type compatibility', () => {
    it('should accept rule node with conditions and children', () => {
      const node: RuleProofNode = {
        type: 'rule',
        ruleId: 'vip-upgrade',
        ruleName: 'VIP Upgrade Rule',
        satisfied: true,
        conditions: [
          {
            source: 'fact:customer:totalSpent',
            operator: 'gte',
            expectedValue: 10000,
            actualValue: 15000,
            satisfied: true,
          },
          {
            source: 'fact:customer:accountAge',
            operator: 'gte',
            expectedValue: 365,
            actualValue: 730,
            satisfied: true,
          },
        ],
        children: [
          {
            type: 'fact_exists',
            key: 'customer:totalSpent',
            currentValue: 15000,
            satisfied: true,
          },
        ],
      };

      expect(node.ruleId).toBe('vip-upgrade');
      expect(node.conditions).toHaveLength(2);
      expect(node.children).toHaveLength(1);
    });

    it('should accept rule node with empty conditions and children', () => {
      const node: RuleProofNode = {
        type: 'rule',
        ruleId: 'simple-rule',
        ruleName: 'Simple Rule',
        satisfied: true,
        conditions: [],
        children: [],
      };

      expect(node.conditions).toHaveLength(0);
      expect(node.children).toHaveLength(0);
    });
  });

  describe('type constraints', () => {
    it('should require ruleId', () => {
      // @ts-expect-error - ruleId is required
      const _invalid: RuleProofNode = {
        type: 'rule',
        ruleName: 'Test',
        satisfied: true,
        conditions: [],
        children: [],
      };
      expect(true).toBe(true);
    });

    it('should require conditions array', () => {
      // @ts-expect-error - conditions is required
      const _invalid: RuleProofNode = {
        type: 'rule',
        ruleId: 'test',
        ruleName: 'Test',
        satisfied: true,
        children: [],
      };
      expect(true).toBe(true);
    });

    it('should require children array', () => {
      // @ts-expect-error - children is required
      const _invalid: RuleProofNode = {
        type: 'rule',
        ruleId: 'test',
        ruleName: 'Test',
        satisfied: true,
        conditions: [],
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<RuleProofNode['type']>().toEqualTypeOf<'rule'>();
      expectTypeOf<RuleProofNode['ruleId']>().toEqualTypeOf<string>();
      expectTypeOf<RuleProofNode['ruleName']>().toEqualTypeOf<string>();
      expectTypeOf<RuleProofNode['satisfied']>().toEqualTypeOf<boolean>();
      expectTypeOf<RuleProofNode['conditions']>().toEqualTypeOf<ConditionProofNode[]>();
      expectTypeOf<RuleProofNode['children']>().toEqualTypeOf<ProofNode[]>();
    });
  });
});

describe('ConditionProofNode', () => {
  describe('type compatibility', () => {
    it('should accept satisfied condition', () => {
      const node: ConditionProofNode = {
        source: 'fact:customer:tier',
        operator: 'eq',
        expectedValue: 'gold',
        actualValue: 'gold',
        satisfied: true,
      };

      expect(node.source).toBe('fact:customer:tier');
      expect(node.satisfied).toBe(true);
    });

    it('should accept unsatisfied condition', () => {
      const node: ConditionProofNode = {
        source: 'event:amount',
        operator: 'gt',
        expectedValue: 1000,
        actualValue: 500,
        satisfied: false,
      };

      expect(node.satisfied).toBe(false);
    });

    it('should accept undefined values', () => {
      const node: ConditionProofNode = {
        source: 'fact:missing:key',
        operator: 'exists',
        expectedValue: undefined,
        actualValue: undefined,
        satisfied: false,
      };

      expect(node.actualValue).toBeUndefined();
    });
  });

  describe('type constraints', () => {
    it('should require source', () => {
      // @ts-expect-error - source is required
      const _invalid: ConditionProofNode = {
        operator: 'eq',
        expectedValue: 1,
        actualValue: 1,
        satisfied: true,
      };
      expect(true).toBe(true);
    });

    it('should require satisfied', () => {
      // @ts-expect-error - satisfied is required
      const _invalid: ConditionProofNode = {
        source: 'fact:key',
        operator: 'eq',
        expectedValue: 1,
        actualValue: 1,
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<ConditionProofNode['source']>().toEqualTypeOf<string>();
      expectTypeOf<ConditionProofNode['operator']>().toEqualTypeOf<string>();
      expectTypeOf<ConditionProofNode['expectedValue']>().toEqualTypeOf<unknown>();
      expectTypeOf<ConditionProofNode['actualValue']>().toEqualTypeOf<unknown>();
      expectTypeOf<ConditionProofNode['satisfied']>().toEqualTypeOf<boolean>();
    });
  });
});

describe('UnachievableNode', () => {
  describe('type compatibility', () => {
    it('should accept all reason variants', () => {
      const reasons = ['no_rules', 'cycle_detected', 'max_depth', 'all_paths_failed'] as const;

      for (const reason of reasons) {
        const node: UnachievableNode = {
          type: 'unachievable',
          reason,
        };
        expect(node.reason).toBe(reason);
        expect(node.details).toBeUndefined();
      }
    });

    it('should accept optional details', () => {
      const node: UnachievableNode = {
        type: 'unachievable',
        reason: 'cycle_detected',
        details: 'Cycle between rule-A and rule-B',
      };

      expect(node.details).toBe('Cycle between rule-A and rule-B');
    });
  });

  describe('type constraints', () => {
    it('should require reason', () => {
      // @ts-expect-error - reason is required
      const _invalid: UnachievableNode = {
        type: 'unachievable',
      };
      expect(true).toBe(true);
    });

    it('should not accept invalid reason', () => {
      const _invalid: UnachievableNode = {
        type: 'unachievable',
        // @ts-expect-error - invalid reason
        reason: 'timeout',
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<UnachievableNode['type']>().toEqualTypeOf<'unachievable'>();
      expectTypeOf<UnachievableNode['reason']>().toEqualTypeOf<'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed'>();
      expectTypeOf<UnachievableNode['details']>().toEqualTypeOf<string | undefined>();
    });
  });
});

describe('BackwardChainingConfig', () => {
  describe('type compatibility', () => {
    it('should accept empty config (all optional)', () => {
      const config: BackwardChainingConfig = {};

      expect(config.maxDepth).toBeUndefined();
      expect(config.maxExploredRules).toBeUndefined();
    });

    it('should accept full config', () => {
      const config: BackwardChainingConfig = {
        maxDepth: 15,
        maxExploredRules: 200,
      };

      expect(config.maxDepth).toBe(15);
      expect(config.maxExploredRules).toBe(200);
    });

    it('should accept partial config', () => {
      const config: BackwardChainingConfig = {
        maxDepth: 5,
      };

      expect(config.maxDepth).toBe(5);
      expect(config.maxExploredRules).toBeUndefined();
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<BackwardChainingConfig['maxDepth']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<BackwardChainingConfig['maxExploredRules']>().toEqualTypeOf<number | undefined>();
    });
  });
});

describe('RuleEngineConfig.backwardChaining', () => {
  describe('type compatibility', () => {
    it('should accept backwardChaining in engine config', () => {
      const config: RuleEngineConfig = {
        backwardChaining: {
          maxDepth: 20,
          maxExploredRules: 50,
        },
      };

      expect(config.backwardChaining).toBeDefined();
      expect(config.backwardChaining!.maxDepth).toBe(20);
    });

    it('should be optional in engine config', () => {
      const config: RuleEngineConfig = {};

      expect(config.backwardChaining).toBeUndefined();
    });
  });

  describe('type-level assertions', () => {
    it('should have optional BackwardChainingConfig type', () => {
      expectTypeOf<RuleEngineConfig['backwardChaining']>().toEqualTypeOf<BackwardChainingConfig | undefined>();
    });
  });
});
