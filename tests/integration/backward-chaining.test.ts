import { describe, it, expect, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';
import type {
  FactGoal,
  EventGoal,
  RuleProofNode,
  FactExistsNode,
  UnachievableNode,
} from '../../src/types/backward';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rule = (overrides: Partial<RuleInput> & { id: string }): RuleInput => ({
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

describe('Backward Chaining — RuleEngine Integration', () => {
  let engine: RuleEngine;

  afterEach(async () => {
    await engine.stop();
  });

  // -------------------------------------------------------------------------
  // Basic query() API
  // -------------------------------------------------------------------------

  describe('query() API basics', () => {
    it('returns QueryResult for a fact goal', async () => {
      engine = await RuleEngine.start({ name: 'bc-basic' });

      await engine.setFact('user:tier', 'gold');

      const result = engine.query({ type: 'fact', key: 'user:tier' });

      expect(result).toMatchObject({
        goal: { type: 'fact', key: 'user:tier' },
        achievable: true,
        exploredRules: 0,
        maxDepthReached: false,
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.proof.type).toBe('fact_exists');

      const proof = result.proof as FactExistsNode;
      expect(proof.key).toBe('user:tier');
      expect(proof.currentValue).toBe('gold');
      expect(proof.satisfied).toBe(true);
    });

    it('returns unachievable when fact does not exist and no rule produces it', async () => {
      engine = await RuleEngine.start({ name: 'bc-no-fact' });

      const result = engine.query({ type: 'fact', key: 'nonexistent:key' });

      expect(result.achievable).toBe(false);
      expect(result.proof.type).toBe('unachievable');
      expect((result.proof as UnachievableNode).reason).toBe('no_rules');
    });

    it('returns achievable when a registered rule produces the target fact', async () => {
      engine = await RuleEngine.start({ name: 'bc-rule' });

      engine.registerRule(rule({
        id: 'produce-target',
        actions: [{ type: 'set_fact', key: 'target:fact', value: 42 }],
      }));

      const result = engine.query({ type: 'fact', key: 'target:fact' });

      expect(result.achievable).toBe(true);
      expect(result.proof.type).toBe('rule');

      const proof = result.proof as RuleProofNode;
      expect(proof.ruleId).toBe('produce-target');
      expect(proof.satisfied).toBe(true);
    });

    it('throws when engine is stopped', async () => {
      engine = await RuleEngine.start({ name: 'bc-stopped' });
      await engine.stop();

      expect(() => engine.query({ type: 'fact', key: 'any' })).toThrow(
        /not running/,
      );

      // Restart for afterEach cleanup
      engine = await RuleEngine.start({ name: 'bc-stopped-restart' });
    });
  });

  // -------------------------------------------------------------------------
  // Event goals
  // -------------------------------------------------------------------------

  describe('event goals', () => {
    it('returns achievable when a rule emits the target event', async () => {
      engine = await RuleEngine.start({ name: 'bc-event' });

      engine.registerRule(rule({
        id: 'emit-order',
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }],
      }));

      const result = engine.query({ type: 'event', topic: 'order.completed' });

      expect(result.achievable).toBe(true);
      expect((result.proof as RuleProofNode).ruleId).toBe('emit-order');
    });

    it('returns unachievable when no rule emits the event', async () => {
      engine = await RuleEngine.start({ name: 'bc-no-event' });

      const result = engine.query({ type: 'event', topic: 'missing.topic' });

      expect(result.achievable).toBe(false);
      expect((result.proof as UnachievableNode).reason).toBe('no_rules');
    });
  });

  // -------------------------------------------------------------------------
  // Conditions evaluated against fact store
  // -------------------------------------------------------------------------

  describe('conditions against fact store', () => {
    it('achievable when rule conditions are satisfied by existing facts', async () => {
      engine = await RuleEngine.start({ name: 'bc-cond-sat' });

      await engine.setFact('customer:totalSpent', 5000);

      engine.registerRule(rule({
        id: 'vip-upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:totalSpent' }, operator: 'gte', value: 1000 },
        ],
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = engine.query({ type: 'fact', key: 'customer:tier' });

      expect(result.achievable).toBe(true);

      const proof = result.proof as RuleProofNode;
      expect(proof.conditions).toHaveLength(1);
      expect(proof.conditions[0]!.satisfied).toBe(true);
      expect(proof.conditions[0]!.actualValue).toBe(5000);
    });

    it('unachievable when conditions are not met', async () => {
      engine = await RuleEngine.start({ name: 'bc-cond-fail' });

      await engine.setFact('customer:totalSpent', 100);

      engine.registerRule(rule({
        id: 'vip-upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:totalSpent' }, operator: 'gte', value: 1000 },
        ],
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = engine.query({ type: 'fact', key: 'customer:tier' });

      expect(result.achievable).toBe(false);
      expect((result.proof as UnachievableNode).reason).toBe('all_paths_failed');
    });
  });

  // -------------------------------------------------------------------------
  // Recursive rule chains
  // -------------------------------------------------------------------------

  describe('recursive rule chains', () => {
    it('achieves goal through a chain of two rules', async () => {
      engine = await RuleEngine.start({ name: 'bc-chain' });

      await engine.setFact('customer:active', true);

      engine.registerRule(rule({
        id: 'earn-points',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:active' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'loyalty:points', value: 500 }],
      }));

      engine.registerRule(rule({
        id: 'vip-upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'loyalty:points' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }],
      }));

      const result = engine.query({ type: 'fact', key: 'customer:tier' });

      expect(result.achievable).toBe(true);
      expect(result.exploredRules).toBe(2);

      const root = result.proof as RuleProofNode;
      expect(root.ruleId).toBe('vip-upgrade');
      expect(root.children).toHaveLength(1);
      expect((root.children[0] as RuleProofNode).ruleId).toBe('earn-points');
    });
  });

  // -------------------------------------------------------------------------
  // VIP upgrade scenario (E2E complex chain)
  // -------------------------------------------------------------------------

  describe('VIP upgrade chain scenario', () => {
    it('traces full path: active customer → earn points → upgrade tier', async () => {
      engine = await RuleEngine.start({ name: 'bc-vip' });

      // Stav: zákazník je aktivní
      await engine.setFact('customer:123:active', true);

      // Pravidlo 1: Aktivní zákazník získá věrnostní body
      engine.registerRule(rule({
        id: 'loyalty-program',
        name: 'Loyalty Program',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:123:active' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'customer:123:loyaltyPoints', value: 1000 }],
      }));

      // Pravidlo 2: Zákazník s body >= 500 dostane VIP tier
      engine.registerRule(rule({
        id: 'vip-tier-upgrade',
        name: 'VIP Tier Upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:123:loyaltyPoints' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'customer:123:tier', value: 'vip' }],
      }));

      // Pravidlo 3: VIP zákazník dostane speciální nabídku
      engine.registerRule(rule({
        id: 'vip-offer',
        name: 'VIP Special Offer',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:123:tier' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'emit_event', topic: 'offer.created', data: { type: 'vip-exclusive' } }],
      }));

      // Query: Může se pro zákazníka 123 vytvořit VIP nabídka?
      const result = engine.query({ type: 'event', topic: 'offer.created' });

      expect(result.achievable).toBe(true);
      expect(result.exploredRules).toBe(3);

      // Ověření proof tree struktury
      const root = result.proof as RuleProofNode;
      expect(root.ruleId).toBe('vip-offer');
      expect(root.ruleName).toBe('VIP Special Offer');
      expect(root.satisfied).toBe(true);

      // Úroveň 2: vip-tier-upgrade
      expect(root.children).toHaveLength(1);
      const tierProof = root.children[0] as RuleProofNode;
      expect(tierProof.ruleId).toBe('vip-tier-upgrade');
      expect(tierProof.ruleName).toBe('VIP Tier Upgrade');

      // Úroveň 3: loyalty-program
      expect(tierProof.children).toHaveLength(1);
      const loyaltyProof = tierProof.children[0] as RuleProofNode;
      expect(loyaltyProof.ruleId).toBe('loyalty-program');
      expect(loyaltyProof.ruleName).toBe('Loyalty Program');

      // Koncový bod — customer:123:active existuje
      expect(loyaltyProof.conditions).toHaveLength(1);
      expect(loyaltyProof.conditions[0]!.satisfied).toBe(true);
      expect(loyaltyProof.conditions[0]!.source).toBe('fact:customer:123:active');
    });

    it('reports unachievable when customer is not active', async () => {
      engine = await RuleEngine.start({ name: 'bc-vip-fail' });

      // Zákazník NENÍ aktivní — žádný fakt
      engine.registerRule(rule({
        id: 'loyalty-program',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:123:active' }, operator: 'eq', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'customer:123:loyaltyPoints', value: 1000 }],
      }));

      engine.registerRule(rule({
        id: 'vip-tier-upgrade',
        conditions: [
          { source: { type: 'fact', pattern: 'customer:123:loyaltyPoints' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'customer:123:tier', value: 'vip' }],
      }));

      const result = engine.query({ type: 'fact', key: 'customer:123:tier' });

      expect(result.achievable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // BackwardChainingConfig propagation
  // -------------------------------------------------------------------------

  describe('config propagation', () => {
    it('respects maxDepth from engine config', async () => {
      engine = await RuleEngine.start({
        name: 'bc-depth',
        backwardChaining: { maxDepth: 1 },
      });

      // Dva pravidla — chain o hloubce 2
      engine.registerRule(rule({
        id: 'deep-1',
        conditions: [
          { source: { type: 'fact', pattern: 'deep:2' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'deep:1', value: true }],
      }));

      engine.registerRule(rule({
        id: 'deep-2',
        actions: [{ type: 'set_fact', key: 'deep:2', value: true }],
      }));

      const result = engine.query({ type: 'fact', key: 'deep:1' });

      // maxDepth=1 nestačí na chain o hloubce 2
      expect(result.achievable).toBe(false);
      expect(result.maxDepthReached).toBe(true);
    });

    it('respects maxExploredRules from engine config', async () => {
      engine = await RuleEngine.start({
        name: 'bc-max-rules',
        backwardChaining: { maxExploredRules: 2 },
      });

      for (let i = 0; i < 5; i++) {
        engine.registerRule(rule({
          id: `rule-${i}`,
          priority: 100 - i,
          conditions: [
            { source: { type: 'fact', pattern: `missing:${i}` }, operator: 'exists', value: true },
          ],
          actions: [{ type: 'set_fact', key: 'target', value: i }],
        }));
      }

      const result = engine.query({ type: 'fact', key: 'target' });

      expect(result.exploredRules).toBeLessThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Disabled rules and groups
  // -------------------------------------------------------------------------

  describe('disabled rules and groups', () => {
    it('skips disabled rules during backward chaining', async () => {
      engine = await RuleEngine.start({ name: 'bc-disabled' });

      engine.registerRule(rule({
        id: 'disabled-rule',
        enabled: false,
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = engine.query({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(false);
    });

    it('skips rules in disabled groups', async () => {
      engine = await RuleEngine.start({ name: 'bc-disabled-group' });

      engine.createGroup({ id: 'disabled-grp', name: 'Disabled', enabled: false });

      engine.registerRule(rule({
        id: 'grouped-rule',
        group: 'disabled-grp',
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      const result = engine.query({ type: 'fact', key: 'target' });

      expect(result.achievable).toBe(false);
    });

    it('uses dynamically disabled rules correctly', async () => {
      engine = await RuleEngine.start({ name: 'bc-dynamic-disable' });

      engine.registerRule(rule({
        id: 'target-rule',
        actions: [{ type: 'set_fact', key: 'target', value: true }],
      }));

      // Před disablem — achievable
      expect(engine.query({ type: 'fact', key: 'target' }).achievable).toBe(true);

      engine.disableRule('target-rule');

      // Po disablu — new chainer needed (lazy re-init should still work
      // because BackwardChainer delegates to RuleManager which checks enabled)
      expect(engine.query({ type: 'fact', key: 'target' }).achievable).toBe(false);

      engine.enableRule('target-rule');
      expect(engine.query({ type: 'fact', key: 'target' }).achievable).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Cycle detection through engine API
  // -------------------------------------------------------------------------

  describe('cycle detection', () => {
    it('detects circular dependencies between rules', async () => {
      engine = await RuleEngine.start({ name: 'bc-cycle' });

      engine.registerRule(rule({
        id: 'rule-a',
        conditions: [
          { source: { type: 'fact', pattern: 'fact-b' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'fact-a', value: true }],
      }));

      engine.registerRule(rule({
        id: 'rule-b',
        conditions: [
          { source: { type: 'fact', pattern: 'fact-a' }, operator: 'exists', value: true },
        ],
        actions: [{ type: 'set_fact', key: 'fact-b', value: true }],
      }));

      const result = engine.query({ type: 'fact', key: 'fact-a' });

      expect(result.achievable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Read-only verification
  // -------------------------------------------------------------------------

  describe('read-only semantics', () => {
    it('query() does not modify fact store', async () => {
      engine = await RuleEngine.start({ name: 'bc-readonly' });

      engine.registerRule(rule({
        id: 'produce-fact',
        actions: [{ type: 'set_fact', key: 'new:fact', value: 'created' }],
      }));

      const factsBefore = engine.getAllFacts().length;
      engine.query({ type: 'fact', key: 'new:fact' });
      const factsAfter = engine.getAllFacts().length;

      expect(factsAfter).toBe(factsBefore);
      expect(engine.getFact('new:fact')).toBeUndefined();
    });

    it('query() does not emit events', async () => {
      engine = await RuleEngine.start({ name: 'bc-no-events' });

      engine.registerRule(rule({
        id: 'emit-rule',
        actions: [{ type: 'emit_event', topic: 'side.effect', data: {} }],
      }));

      const events: unknown[] = [];
      engine.subscribe('side.effect', (e) => events.push(e));

      engine.query({ type: 'event', topic: 'side.effect' });

      expect(events).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Lazy initialization
  // -------------------------------------------------------------------------

  describe('lazy BackwardChainer initialization', () => {
    it('creates chainer on first query() call', async () => {
      engine = await RuleEngine.start({ name: 'bc-lazy' });

      // No error on start — chainer not created yet
      await engine.setFact('key', 'val');

      // First query triggers lazy init
      const result = engine.query({ type: 'fact', key: 'key' });
      expect(result.achievable).toBe(true);

      // Second query reuses the same chainer
      const result2 = engine.query({ type: 'fact', key: 'key' });
      expect(result2.achievable).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Fact value matching (operators)
  // -------------------------------------------------------------------------

  describe('fact value matching operators', () => {
    it('matches fact value with eq operator', async () => {
      engine = await RuleEngine.start({ name: 'bc-eq' });

      await engine.setFact('status', 'active');

      const result = engine.query({
        type: 'fact', key: 'status', value: 'active',
      });

      expect(result.achievable).toBe(true);
    });

    it('rejects mismatched fact value with eq operator', async () => {
      engine = await RuleEngine.start({ name: 'bc-eq-fail' });

      await engine.setFact('status', 'inactive');

      const result = engine.query({
        type: 'fact', key: 'status', value: 'active',
      });

      expect(result.achievable).toBe(false);
    });

    it('matches numeric fact with gte operator', async () => {
      engine = await RuleEngine.start({ name: 'bc-gte' });

      await engine.setFact('score', 150);

      const result = engine.query({
        type: 'fact', key: 'score', value: 100, operator: 'gte',
      });

      expect(result.achievable).toBe(true);
    });
  });
});
