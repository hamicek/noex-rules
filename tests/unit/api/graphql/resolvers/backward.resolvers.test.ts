import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { backwardResolvers } from '../../../../../src/api/graphql/resolvers/backward.resolvers';
import { ValidationError } from '../../../../../src/api/middleware/error-handler';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, teardownContext, createTestRule } from './setup';

const { Query, Goal, ProofNode } = backwardResolvers;

describe('backwardResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query.query ────────────────────────────────────────────────

  describe('Query.query', () => {
    it('evaluates a fact existence goal', () => {
      ctx.engine.setFact('temperature', 30);

      const result = Query.query(null, {
        goal: { type: 'fact', key: 'temperature' },
      }, ctx);

      expect(result.achievable).toBe(true);
      expect(result.goal).toEqual({ type: 'fact', key: 'temperature' });
      expect(result.proof).toBeDefined();
      expect(result.exploredRules).toBeTypeOf('number');
      expect(result.maxDepthReached).toBeTypeOf('boolean');
      expect(result.durationMs).toBeTypeOf('number');
    });

    it('evaluates a fact value goal', () => {
      ctx.engine.setFact('count', 5);

      const result = Query.query(null, {
        goal: { type: 'fact', key: 'count', value: 5, operator: 'eq' },
      }, ctx);

      expect(result.achievable).toBe(true);
    });

    it('returns unachievable for missing fact', () => {
      const result = Query.query(null, {
        goal: { type: 'fact', key: 'nonexistent' },
      }, ctx);

      expect(result.achievable).toBe(false);
    });

    it('evaluates an event goal', () => {
      ctx.engine.registerRule(createTestRule({
        id: 'evt-rule',
        trigger: { type: 'fact', pattern: 'x' },
        actions: [{ type: 'emit_event', topic: 'output.event', data: {} }],
      }));

      const result = Query.query(null, {
        goal: { type: 'event', topic: 'output.event' },
      }, ctx);

      expect(result.goal).toEqual({ type: 'event', topic: 'output.event' });
      expect(result.exploredRules).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('explores rules for fact goals achievable through chaining', () => {
      ctx.engine.registerRule(createTestRule({
        id: 'chain-rule',
        trigger: { type: 'fact', pattern: 'input' },
        conditions: [{ source: { type: 'fact', pattern: 'input' }, operator: 'exists' }],
        actions: [{ type: 'set_fact', key: 'derived', value: true }],
      }));
      ctx.engine.setFact('input', 1);

      const result = Query.query(null, {
        goal: { type: 'fact', key: 'derived' },
      }, ctx);

      expect(result.exploredRules).toBeGreaterThanOrEqual(1);
    });

    it('throws ValidationError when fact goal is missing key', () => {
      expect(() =>
        Query.query(null, { goal: { type: 'fact' } }, ctx),
      ).toThrow(ValidationError);
    });

    it('throws ValidationError when event goal is missing topic', () => {
      expect(() =>
        Query.query(null, { goal: { type: 'event' } }, ctx),
      ).toThrow(ValidationError);
    });

    it('includes proof tree structure', () => {
      ctx.engine.setFact('existing', 42);

      const result = Query.query(null, {
        goal: { type: 'fact', key: 'existing' },
      }, ctx);

      expect(result.proof).toBeDefined();
      expect(result.proof.type).toBeTypeOf('string');
    });
  });

  // ─── Union type resolvers ──────────────────────────────────────

  describe('Goal.__resolveType', () => {
    it('resolves FactGoal', () => {
      expect(Goal.__resolveType({ type: 'fact', key: 'k' })).toBe('FactGoal');
    });

    it('resolves EventGoal', () => {
      expect(Goal.__resolveType({ type: 'event', topic: 't' })).toBe('EventGoal');
    });
  });

  describe('ProofNode.__resolveType', () => {
    it('resolves FactExistsNode', () => {
      expect(ProofNode.__resolveType({
        type: 'fact_exists',
        key: 'k',
        currentValue: 1,
        satisfied: true,
      })).toBe('FactExistsNode');
    });

    it('resolves RuleProofNode', () => {
      expect(ProofNode.__resolveType({
        type: 'rule',
        ruleId: 'r',
        ruleName: 'R',
        satisfied: true,
        conditions: [],
        children: [],
      })).toBe('RuleProofNode');
    });

    it('resolves UnachievableNode', () => {
      expect(ProofNode.__resolveType({
        type: 'unachievable',
        reason: 'no_rules',
      })).toBe('UnachievableNode');
    });
  });
});
