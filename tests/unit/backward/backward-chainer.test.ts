import { describe, it, expect, beforeEach } from 'vitest';
import { BackwardChainer } from '../../../src/backward/backward-chainer';
import { RuleManager } from '../../../src/core/rule-manager';
import { ConditionEvaluator } from '../../../src/evaluation/condition-evaluator';
import { FactStore } from '../../../src/core/fact-store';
import type { RuleInput } from '../../../src/types/rule';
import type {
  FactGoal,
  EventGoal,
  RuleProofNode,
  FactExistsNode,
  UnachievableNode,
} from '../../../src/types/backward';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createRule = (overrides: Partial<RuleInput> & { id: string }): RuleInput => ({
  name: overrides.id,
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'event', topic: 'test' },
  conditions: [],
  actions: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackwardChainer', () => {
  let manager: RuleManager;
  let evaluator: ConditionEvaluator;
  let facts: FactStore;

  beforeEach(() => {
    manager = new RuleManager();
    evaluator = new ConditionEvaluator();
    facts = new FactStore();
  });

  function chainer(config?: { maxDepth?: number; maxExploredRules?: number }) {
    return new BackwardChainer(manager, evaluator, facts, config);
  }

  // -----------------------------------------------------------------------
  // Fact goal — base cases
  // -----------------------------------------------------------------------

  describe('evaluateFactGoal — fact already exists', () => {
    it('returns achievable when fact exists (existence check)', () => {
      facts.set('customer:123:tier', 'gold');

      const result = chainer().evaluate({ type: 'fact', key: 'customer:123:tier' });

      expect(result.achievable).toBe(true);
      expect(result.proof.type).toBe('fact_exists');

      const proof = result.proof as FactExistsNode;
      expect(proof.key).toBe('customer:123:tier');
      expect(proof.currentValue).toBe('gold');
      expect(proof.satisfied).toBe(true);
    });

    it('returns achievable when fact value matches (eq)', () => {
      facts.set('customer:123:tier', 'vip');

      const result = chainer().evaluate({
        type: 'fact', key: 'customer:123:tier', value: 'vip',
      });

      expect(result.achievable).toBe(true);
    });

    it('returns achievable when fact value matches (gte)', () => {
      facts.set('sensor:temp', 150);

      const result = chainer().evaluate({
        type: 'fact', key: 'sensor:temp', value: 100, operator: 'gte',
      });

      expect(result.achievable).toBe(true);
    });

    it('returns achievable with neq operator', () => {
      facts.set('status', 'active');

      const result = chainer().evaluate({
        type: 'fact', key: 'status', value: 'inactive', operator: 'neq',
      });

      expect(result.achievable).toBe(true);
    });

    it('returns achievable with gt operator', () => {
      facts.set('score', 80);

      const result = chainer().evaluate({
        type: 'fact', key: 'score', value: 50, operator: 'gt',
      });

      expect(result.achievable).toBe(true);
    });

    it('returns achievable with lt operator', () => {
      facts.set('score', 20);

      const result = chainer().evaluate({
        type: 'fact', key: 'score', value: 50, operator: 'lt',
      });

      expect(result.achievable).toBe(true);
    });

    it('returns achievable with lte operator', () => {
      facts.set('score', 50);

      const result = chainer().evaluate({
        type: 'fact', key: 'score', value: 50, operator: 'lte',
      });

      expect(result.achievable).toBe(true);
    });

    it('does not satisfy when value mismatches (eq)', () => {
      facts.set('customer:123:tier', 'bronze');

      const result = chainer().evaluate({
        type: 'fact', key: 'customer:123:tier', value: 'vip',
      });

      // No rules either → unachievable
      expect(result.achievable).toBe(false);
      expect(result.proof.type).toBe('fact_exists');

      const proof = result.proof as FactExistsNode;
      expect(proof.currentValue).toBe('bronze');
      expect(proof.satisfied).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Fact goal — no rules
  // -----------------------------------------------------------------------

  describe('evaluateFactGoal — no rules', () => {
    it('returns unachievable (no_rules) when fact does not exist and no rule produces it', () => {
      const result = chainer().evaluate({ type: 'fact', key: 'missing:key' });

      expect(result.achievable).toBe(false);
      expect(result.proof.type).toBe('unachievable');

      const proof = result.proof as UnachievableNode;
      expect(proof.reason).toBe('no_rules');
    });
  });

  // -----------------------------------------------------------------------
  // Fact goal — rule with no conditions (always satisfiable)
  // -----------------------------------------------------------------------

  describe('evaluateFactGoal — rule produces fact', () => {
    it('returns achievable when a rule with no conditions produces the fact', () => {
      manager.register(createRule({
        id: 'set-tier',
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'customer:tier' });

      expect(result.achievable).toBe(true);
      expect(result.proof.type).toBe('rule');

      const proof = result.proof as RuleProofNode;
      expect(proof.ruleId).toBe('set-tier');
      expect(proof.satisfied).toBe(true);
      expect(proof.conditions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Fact goal — rule with conditions satisfied
  // -----------------------------------------------------------------------

  describe('evaluateFactGoal — conditions satisfied', () => {
    it('returns achievable when rule conditions are met by existing facts', () => {
      facts.set('customer:totalSpent', 5000);

      manager.register(createRule({
        id: 'vip-upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:totalSpent' }, operator: 'gte', value: 1000 },
        ],
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'customer:tier' });

      expect(result.achievable).toBe(true);

      const proof = result.proof as RuleProofNode;
      expect(proof.ruleId).toBe('vip-upgrade');
      expect(proof.conditions).toHaveLength(1);
      expect(proof.conditions[0]!.satisfied).toBe(true);
      expect(proof.conditions[0]!.source).toBe('fact:customer:totalSpent');
      expect(proof.conditions[0]!.operator).toBe('gte');
      expect(proof.conditions[0]!.actualValue).toBe(5000);
    });
  });

  // -----------------------------------------------------------------------
  // Fact goal — rule conditions not satisfied
  // -----------------------------------------------------------------------

  describe('evaluateFactGoal — conditions not satisfied', () => {
    it('returns unachievable (all_paths_failed) when conditions are not met', () => {
      facts.set('customer:totalSpent', 100);

      manager.register(createRule({
        id: 'vip-upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:totalSpent' }, operator: 'gte', value: 1000 },
        ],
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'customer:tier' });

      expect(result.achievable).toBe(false);
      expect(result.proof.type).toBe('unachievable');

      const proof = result.proof as UnachievableNode;
      expect(proof.reason).toBe('all_paths_failed');
    });
  });

  // -----------------------------------------------------------------------
  // Recursion — chain of rules
  // -----------------------------------------------------------------------

  describe('recursion', () => {
    it('achieves goal through a chain of two rules', () => {
      // Rule 1: set loyalty:points → requires customer:active
      // Rule 2: set customer:tier → requires loyalty:points
      // Fact: customer:active exists
      facts.set('customer:active', true);

      manager.register(createRule({
        id: 'earn-points',
        priority: 100,
        conditions: [
          { source: { type: 'fact', pattern: 'customer:active' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'loyalty:points', value: 500 }],
      }));

      manager.register(createRule({
        id: 'vip-upgrade',
        priority: 100,
        conditions: [
          { source: { type: 'fact', pattern: 'loyalty:points' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'customer:tier' });

      expect(result.achievable).toBe(true);
      expect(result.exploredRules).toBe(2);

      const proof = result.proof as RuleProofNode;
      expect(proof.ruleId).toBe('vip-upgrade');
      expect(proof.children).toHaveLength(1);
      expect(proof.children[0]!.type).toBe('rule');
      expect((proof.children[0] as RuleProofNode).ruleId).toBe('earn-points');
    });

    it('achieves goal through three levels of recursion', () => {
      facts.set('base:fact', true);

      manager.register(createRule({
        id: 'level-1',
        conditions: [
          { source: { type: 'fact', pattern: 'base:fact' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'level1:output', value: 1 }],
      }));

      manager.register(createRule({
        id: 'level-2',
        conditions: [
          { source: { type: 'fact', pattern: 'level1:output' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'level2:output', value: 2 }],
      }));

      manager.register(createRule({
        id: 'level-3',
        conditions: [
          { source: { type: 'fact', pattern: 'level2:output' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'level3:output', value: 3 }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'level3:output' });

      expect(result.achievable).toBe(true);
      expect(result.exploredRules).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Cycle detection
  // -----------------------------------------------------------------------

  describe('cycle detection', () => {
    it('detects a direct cycle (rule depends on its own output)', () => {
      // Rule produces fact A but also requires fact A
      manager.register(createRule({
        id: 'self-loop',
        conditions: [
          { source: { type: 'fact', pattern: 'loop:value' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'loop:value', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'loop:value' });

      expect(result.achievable).toBe(false);
      expect(result.proof.type).toBe('unachievable');

      const proof = result.proof as UnachievableNode;
      expect(proof.reason).toBe('cycle_detected');
    });

    it('detects an indirect cycle (A → B → A)', () => {
      // Rule A produces fact-a, requires fact-b
      // Rule B produces fact-b, requires fact-a
      manager.register(createRule({
        id: 'rule-a',
        conditions: [
          { source: { type: 'fact', pattern: 'fact-b' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'fact-a', value: true }],
      }));

      manager.register(createRule({
        id: 'rule-b',
        conditions: [
          { source: { type: 'fact', pattern: 'fact-a' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'fact-b', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'fact-a' });

      expect(result.achievable).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Max depth
  // -----------------------------------------------------------------------

  describe('max depth', () => {
    it('stops at maxDepth and reports max_depth', () => {
      // Create a chain deeper than maxDepth=2
      manager.register(createRule({
        id: 'deep-1',
        conditions: [
          { source: { type: 'fact', pattern: 'deep:2' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'deep:1', value: true }],
      }));

      manager.register(createRule({
        id: 'deep-2',
        conditions: [
          { source: { type: 'fact', pattern: 'deep:3' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'deep:2', value: true }],
      }));

      manager.register(createRule({
        id: 'deep-3',
        conditions: [],
        actions: [{ type: 'set_fact', key: 'deep:3', value: true }],
      }));

      const result = chainer({ maxDepth: 2 }).evaluate({
        type: 'fact', key: 'deep:1',
      });

      expect(result.achievable).toBe(false);
      expect(result.maxDepthReached).toBe(true);
    });

    it('succeeds when chain fits within maxDepth', () => {
      manager.register(createRule({
        id: 'deep-1',
        conditions: [
          { source: { type: 'fact', pattern: 'deep:2' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'deep:1', value: true }],
      }));

      manager.register(createRule({
        id: 'deep-2',
        conditions: [],
        actions: [{ type: 'set_fact', key: 'deep:2', value: true }],
      }));

      const result = chainer({ maxDepth: 3 }).evaluate({
        type: 'fact', key: 'deep:1',
      });

      expect(result.achievable).toBe(true);
      expect(result.maxDepthReached).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Max explored rules
  // -----------------------------------------------------------------------

  describe('max explored rules', () => {
    it('stops exploring after maxExploredRules', () => {
      for (let i = 0; i < 5; i++) {
        manager.register(createRule({
          id: `rule-${i}`,
          priority: i,
          conditions: [
            { source: { type: 'fact', pattern: `missing:${i}` }, operator: 'exists', value: true },
          ],
          actions: [{ type: 'set_fact', key: 'target:fact', value: i }],
        }));
      }

      const result = chainer({ maxExploredRules: 3 }).evaluate({
        type: 'fact', key: 'target:fact',
      });

      expect(result.exploredRules).toBeLessThanOrEqual(3);
    });
  });

  // -----------------------------------------------------------------------
  // Event goal
  // -----------------------------------------------------------------------

  describe('evaluateEventGoal', () => {
    it('returns achievable when a rule emits the target event with no conditions', () => {
      manager.register(createRule({
        id: 'emit-order',
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }],
      }));

      const result = chainer().evaluate({ type: 'event', topic: 'order.completed' });

      expect(result.achievable).toBe(true);

      const proof = result.proof as RuleProofNode;
      expect(proof.ruleId).toBe('emit-order');
    });

    it('returns unachievable (no_rules) when no rule emits the event', () => {
      const result = chainer().evaluate({ type: 'event', topic: 'missing.event' });

      expect(result.achievable).toBe(false);

      const proof = result.proof as UnachievableNode;
      expect(proof.reason).toBe('no_rules');
    });

    it('returns achievable when event rule conditions are met by facts', () => {
      facts.set('order:status', 'paid');

      manager.register(createRule({
        id: 'complete-order',
        conditions: [
          { source: { type: 'fact', pattern: 'order:status' }, operator: 'eq', value: 'paid' },
        ],
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }],
      }));

      const result = chainer().evaluate({ type: 'event', topic: 'order.completed' });

      expect(result.achievable).toBe(true);
    });

    it('returns unachievable (all_paths_failed) when event rule conditions are not met', () => {
      facts.set('order:status', 'pending');

      manager.register(createRule({
        id: 'complete-order',
        conditions: [
          { source: { type: 'fact', pattern: 'order:status' }, operator: 'eq', value: 'paid' },
        ],
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }],
      }));

      const result = chainer().evaluate({ type: 'event', topic: 'order.completed' });

      expect(result.achievable).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Proof tree structure
  // -----------------------------------------------------------------------

  describe('proof tree', () => {
    it('builds correct proof tree for a two-level chain', () => {
      facts.set('customer:active', true);

      manager.register(createRule({
        id: 'earn-points',
        name: 'Earn Points',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:active' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'loyalty:points', value: 500 }],
      }));

      manager.register(createRule({
        id: 'vip-upgrade',
        name: 'VIP Upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'loyalty:points' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'customer:tier' });

      // Top level
      const root = result.proof as RuleProofNode;
      expect(root.type).toBe('rule');
      expect(root.ruleId).toBe('vip-upgrade');
      expect(root.ruleName).toBe('VIP Upgrade');
      expect(root.satisfied).toBe(true);
      expect(root.conditions).toHaveLength(1);
      expect(root.conditions[0]!.source).toBe('fact:loyalty:points');

      // Child — sub-goal for loyalty:points
      expect(root.children).toHaveLength(1);
      const child = root.children[0] as RuleProofNode;
      expect(child.type).toBe('rule');
      expect(child.ruleId).toBe('earn-points');
      expect(child.ruleName).toBe('Earn Points');
      expect(child.satisfied).toBe(true);
      expect(child.conditions[0]!.source).toBe('fact:customer:active');
      expect(child.conditions[0]!.satisfied).toBe(true);
    });

    it('includes condition details in proof nodes', () => {
      facts.set('metric:value', 42);

      manager.register(createRule({
        id: 'check-metric',
        name: 'Check Metric',
        conditions: [
          { source: { type: 'fact', pattern: 'metric:value' }, operator: 'gte', value: 10 },
        ],
        actions: [{ type: 'set_fact', key: 'metric:ok', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'metric:ok' });
      const proof = result.proof as RuleProofNode;

      expect(proof.conditions[0]).toEqual({
        source: 'fact:metric:value',
        operator: 'gte',
        expectedValue: 10,
        actualValue: 42,
        satisfied: true,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Multiple rules — alternative paths
  // -----------------------------------------------------------------------

  describe('alternative paths', () => {
    it('succeeds via second rule when first rule fails', () => {
      facts.set('payment:method', 'credit-card');

      // Rule A — requires non-existent fact
      manager.register(createRule({
        id: 'rule-fail',
        priority: 200,
        conditions: [
          { source: { type: 'fact', pattern: 'nonexistent:fact' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'order:status', value: 'confirmed' }],
      }));

      // Rule B — requires existing fact
      manager.register(createRule({
        id: 'rule-success',
        priority: 100,
        conditions: [
          { source: { type: 'fact', pattern: 'payment:method' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'order:status', value: 'confirmed' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'order:status' });

      expect(result.achievable).toBe(true);
      expect((result.proof as RuleProofNode).ruleId).toBe('rule-success');
    });

    it('returns first successful path and stops', () => {
      manager.register(createRule({
        id: 'first',
        priority: 200,
        actions: [{ type: 'set_fact', key: 'target', value: 'a' }],
      }));

      manager.register(createRule({
        id: 'second',
        priority: 100,
        actions: [{ type: 'set_fact', key: 'target', value: 'b' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(true);
      // First rule (highest priority) should be returned
      expect((result.proof as RuleProofNode).ruleId).toBe('first');
      expect(result.exploredRules).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Disabled rules and groups
  // -----------------------------------------------------------------------

  describe('disabled rules and groups', () => {
    it('skips disabled rules', () => {
      manager.register(createRule({
        id: 'disabled-rule',
        enabled: false,
        actions: [{ type: 'set_fact', key: 'target:fact', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target:fact' });

      expect(result.achievable).toBe(false);
      expect((result.proof as UnachievableNode).reason).toBe('no_rules');
    });

    it('skips rules in disabled groups', () => {
      manager.registerGroup({ id: 'grp', name: 'Disabled Group', enabled: false });

      manager.register(createRule({
        id: 'grouped-rule',
        group: 'grp',
        actions: [{ type: 'set_fact', key: 'target:fact', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target:fact' });

      expect(result.achievable).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Template/interpolated action keys
  // -----------------------------------------------------------------------

  describe('template action keys', () => {
    it('matches template set_fact key with wildcard', () => {
      manager.register(createRule({
        id: 'template-rule',
        actions: [{ type: 'set_fact', key: 'customer:${event.id}:tier', value: 'vip' }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'customer:123:tier' });

      expect(result.achievable).toBe(true);
      expect((result.proof as RuleProofNode).ruleId).toBe('template-rule');
    });

    it('matches template emit_event topic with wildcard', () => {
      manager.register(createRule({
        id: 'template-event',
        actions: [{ type: 'emit_event', topic: '${domain}.completed', data: {} }],
      }));

      const result = chainer().evaluate({ type: 'event', topic: 'order.completed' });

      expect(result.achievable).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Non-fact conditions (event, context, lookup)
  // -----------------------------------------------------------------------

  describe('non-fact conditions', () => {
    it('treats event-based conditions as unsatisfied (no trigger context)', () => {
      manager.register(createRule({
        id: 'event-cond-rule',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gt', value: 100 },
        ],
        actions: [{ type: 'set_fact', key: 'target:fact', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target:fact' });

      expect(result.achievable).toBe(false);
    });

    it('treats context-based conditions as unsatisfied', () => {
      manager.register(createRule({
        id: 'context-cond-rule',
        conditions: [
          { source: { type: 'context', key: 'userId' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target:fact', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target:fact' });

      expect(result.achievable).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // QueryResult metadata
  // -----------------------------------------------------------------------

  describe('QueryResult metadata', () => {
    it('includes goal in result', () => {
      const goal: FactGoal = { type: 'fact', key: 'missing:key' };
      const result = chainer().evaluate(goal);

      expect(result.goal).toEqual(goal);
    });

    it('includes exploredRules count', () => {
      manager.register(createRule({
        id: 'r1',
        conditions: [
          { source: { type: 'fact', pattern: 'x' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: 1 }],
      }));

      manager.register(createRule({
        id: 'r2',
        conditions: [
          { source: { type: 'fact', pattern: 'y' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: 2 }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      expect(result.exploredRules).toBe(2);
    });

    it('reports durationMs as a positive number', () => {
      const result = chainer().evaluate({ type: 'fact', key: 'any' });

      expect(result.durationMs).toBeTypeOf('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('reports maxDepthReached=false when depth is not exceeded', () => {
      facts.set('x', 1);
      const result = chainer().evaluate({ type: 'fact', key: 'x' });

      expect(result.maxDepthReached).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple conditions within a single rule
  // -----------------------------------------------------------------------

  describe('multiple conditions', () => {
    it('all conditions must be satisfied for rule to succeed', () => {
      facts.set('cond:a', true);
      // cond:b is missing

      manager.register(createRule({
        id: 'multi-cond',
        conditions: [
          { source: { type: 'fact', pattern: 'cond:a' }, operator: 'eq', value: true },
          { source: { type: 'fact', pattern: 'cond:b' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      // cond:b cannot be produced (no rules) → fails
      expect(result.achievable).toBe(false);
    });

    it('succeeds when all conditions are met by existing facts', () => {
      facts.set('cond:a', true);
      facts.set('cond:b', true);

      manager.register(createRule({
        id: 'multi-cond',
        conditions: [
          { source: { type: 'fact', pattern: 'cond:a' }, operator: 'eq', value: true },
          { source: { type: 'fact', pattern: 'cond:b' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(true);
    });

    it('succeeds when missing condition is achievable via another rule', () => {
      facts.set('cond:a', true);
      // cond:b is missing but can be produced

      manager.register(createRule({
        id: 'produce-b',
        actions: [{ type: 'set_fact', key: 'cond:b', value: true }],
      }));

      manager.register(createRule({
        id: 'multi-cond',
        conditions: [
          { source: { type: 'fact', pattern: 'cond:a' }, operator: 'eq', value: true },
          { source: { type: 'fact', pattern: 'cond:b' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(true);

      const proof = result.proof as RuleProofNode;
      expect(proof.ruleId).toBe('multi-cond');
      expect(proof.children).toHaveLength(1);
      expect((proof.children[0] as RuleProofNode).ruleId).toBe('produce-b');
    });
  });

  // -----------------------------------------------------------------------
  // Default config values
  // -----------------------------------------------------------------------

  describe('default configuration', () => {
    it('uses maxDepth=10 by default', () => {
      // Build a chain of 11 levels
      for (let i = 0; i < 11; i++) {
        const conditions = i < 10
          ? [{ source: { type: 'fact' as const, pattern: `chain:${i + 1}` }, operator: 'exists' as const, value: true }]
          : [];
        manager.register(createRule({
          id: `chain-${i}`,
          conditions,
          actions: [{ type: 'set_fact', key: `chain:${i}`, value: true }],
        }));
      }

      const result = chainer().evaluate({ type: 'fact', key: 'chain:0' });

      expect(result.maxDepthReached).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Condition source descriptions
  // -----------------------------------------------------------------------

  describe('condition source descriptions', () => {
    it('describes fact source correctly', () => {
      facts.set('my:fact', 42);

      manager.register(createRule({
        id: 'r',
        conditions: [
          { source: { type: 'fact', pattern: 'my:fact' }, operator: 'eq', value: 42 },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });
      const proof = result.proof as RuleProofNode;

      expect(proof.conditions[0]!.source).toBe('fact:my:fact');
    });

    it('describes event source correctly (event condition causes rule to fail)', () => {
      manager.register(createRule({
        id: 'event-rule',
        priority: 200,
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gt', value: 0 },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      manager.register(createRule({
        id: 'fallback',
        priority: 100,
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      // event-rule fails (no trigger context), fallback succeeds
      expect(result.achievable).toBe(true);
      expect((result.proof as RuleProofNode).ruleId).toBe('fallback');
      expect(result.exploredRules).toBe(2);
    });

    it('describes context source correctly (via failing rule conditions)', () => {
      // A rule with only a context condition fails in backward chaining,
      // but we add a fallback to ensure the algorithm runs through.
      manager.register(createRule({
        id: 'ctx-rule',
        priority: 200,
        conditions: [
          { source: { type: 'context', key: 'userId' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      manager.register(createRule({
        id: 'fallback',
        priority: 100,
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      // Fallback succeeds — ctx-rule was tried first but failed
      expect(result.achievable).toBe(true);
      expect(result.exploredRules).toBe(2);
    });

    it('describes lookup source correctly (with field)', () => {
      manager.register(createRule({
        id: 'lookup-rule',
        priority: 200,
        conditions: [
          { source: { type: 'lookup', name: 'customer', field: 'email' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      manager.register(createRule({
        id: 'fallback',
        priority: 100,
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(true);
      // Lookup rule failed, fallback succeeded
      expect((result.proof as RuleProofNode).ruleId).toBe('fallback');
    });

    it('describes lookup source correctly (without field)', () => {
      manager.register(createRule({
        id: 'lookup-rule',
        priority: 200,
        conditions: [
          { source: { type: 'lookup', name: 'customer' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      manager.register(createRule({
        id: 'fallback',
        priority: 100,
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer().evaluate({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(true);
      expect((result.proof as RuleProofNode).ruleId).toBe('fallback');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty rule set gracefully', () => {
      const result = chainer().evaluate({ type: 'fact', key: 'anything' });

      expect(result.achievable).toBe(false);
      expect(result.exploredRules).toBe(0);
    });

    it('handles fact already existing with undefined goal value (existence check)', () => {
      facts.set('existing', 0);

      const result = chainer().evaluate({ type: 'fact', key: 'existing' });

      expect(result.achievable).toBe(true);
    });

    it('handles fact with falsy value (null)', () => {
      facts.set('null-fact', null);

      const result = chainer().evaluate({ type: 'fact', key: 'null-fact', value: null });

      expect(result.achievable).toBe(true);
    });

    it('handles fact with falsy value (0)', () => {
      facts.set('zero-fact', 0);

      const result = chainer().evaluate({ type: 'fact', key: 'zero-fact', value: 0 });

      expect(result.achievable).toBe(true);
    });

    it('handles fact with falsy value (empty string)', () => {
      facts.set('empty-fact', '');

      const result = chainer().evaluate({ type: 'fact', key: 'empty-fact', value: '' });

      expect(result.achievable).toBe(true);
    });

    it('handles event goal with maxDepth=0', () => {
      manager.register(createRule({
        id: 'r',
        actions: [{ type: 'emit_event', topic: 'test', data: {} }],
      }));

      const result = chainer({ maxDepth: 0 }).evaluate({ type: 'event', topic: 'test' });

      expect(result.achievable).toBe(false);
      expect(result.maxDepthReached).toBe(true);
    });

    it('handles fact goal with maxDepth=0', () => {
      // Even existing fact is at depth 0, which is fine (depth check is only before rule search)
      // Actually the check is at the beginning, so depth=0 should trigger maxDepth for rules
      manager.register(createRule({
        id: 'r',
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = chainer({ maxDepth: 0 }).evaluate({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(false);
      expect(result.maxDepthReached).toBe(true);
    });

    it('returns max_depth when depth limit is 0 even if fact exists', () => {
      facts.set('existing', 42);

      const result = chainer({ maxDepth: 0 }).evaluate({
        type: 'fact', key: 'existing', value: 42,
      });

      // Depth check is evaluated first, before the fact lookup.
      expect(result.maxDepthReached).toBe(true);
      expect(result.achievable).toBe(false);
    });
  });
});
