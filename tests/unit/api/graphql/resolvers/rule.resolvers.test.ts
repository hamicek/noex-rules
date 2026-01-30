import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ruleResolvers } from '../../../../../src/api/graphql/resolvers/rule.resolvers';
import { NotFoundError, ConflictError } from '../../../../../src/api/middleware/error-handler';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, createTestContextWithSubsystems, teardownContext, createTestRule } from './setup';

const { Query, Mutation, Rule: RuleType } = ruleResolvers;

describe('ruleResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query ────────────────────────────────────────────────────────

  describe('Query.rules', () => {
    it('returns empty array when no rules exist', () => {
      const result = Query.rules(null, null, ctx);
      expect(result).toEqual([]);
    });

    it('returns all registered rules', () => {
      ctx.engine.registerRule(createTestRule({ id: 'r-1', name: 'Rule 1' }));
      ctx.engine.registerRule(createTestRule({ id: 'r-2', name: 'Rule 2' }));

      const result = Query.rules(null, null, ctx);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toContain('r-1');
      expect(result.map(r => r.id)).toContain('r-2');
    });
  });

  describe('Query.rule', () => {
    it('returns null for non-existent rule', () => {
      const result = Query.rule(null, { id: 'missing' }, ctx);
      expect(result).toBeNull();
    });

    it('returns rule by id', () => {
      ctx.engine.registerRule(createTestRule({ id: 'r-1', name: 'Rule One' }));

      const result = Query.rule(null, { id: 'r-1' }, ctx);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('r-1');
      expect(result!.name).toBe('Rule One');
    });
  });

  // ─── Mutation ─────────────────────────────────────────────────────

  describe('Mutation.createRule', () => {
    it('creates a rule and returns it', () => {
      const input = {
        id: 'new-rule',
        name: 'New Rule',
        trigger: { type: 'event' as const, topic: 'test.event' },
        actions: [{ type: 'log' as const, level: 'info' as const, message: 'ok' }],
      };

      const result = Mutation.createRule(null, { input }, ctx);
      expect(result.id).toBe('new-rule');
      expect(result.name).toBe('New Rule');
      expect(result.version).toBe(1);
      expect(result.enabled).toBe(true);
      expect(result.priority).toBe(0);
      expect(result.tags).toEqual([]);
      expect(result.createdAt).toBeTypeOf('number');
    });

    it('applies explicit values from input', () => {
      const input = {
        id: 'custom',
        name: 'Custom',
        description: 'desc',
        priority: 50,
        enabled: false,
        tags: ['a', 'b'],
        trigger: { type: 'event' as const, topic: 'x' },
        actions: [{ type: 'log' as const, level: 'info' as const, message: 'ok' }],
      };

      const result = Mutation.createRule(null, { input }, ctx);
      expect(result.priority).toBe(50);
      expect(result.enabled).toBe(false);
      expect(result.description).toBe('desc');
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('throws ConflictError for duplicate id', () => {
      ctx.engine.registerRule(createTestRule({ id: 'dup' }));

      const input = {
        id: 'dup',
        name: 'Dup',
        trigger: { type: 'event' as const, topic: 'x' },
        actions: [{ type: 'log' as const, level: 'info' as const, message: 'ok' }],
      };

      expect(() => Mutation.createRule(null, { input }, ctx)).toThrow(ConflictError);
    });
  });

  describe('Mutation.updateRule', () => {
    it('updates rule fields', () => {
      ctx.engine.registerRule(createTestRule({ id: 'upd' }));

      const result = Mutation.updateRule(null, {
        id: 'upd',
        input: { name: 'Updated', priority: 99 },
      }, ctx);

      expect(result.name).toBe('Updated');
      expect(result.priority).toBe(99);
    });

    it('throws NotFoundError for non-existent rule', () => {
      expect(() =>
        Mutation.updateRule(null, { id: 'missing', input: { name: 'X' } }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  describe('Mutation.deleteRule', () => {
    it('deletes existing rule and returns true', () => {
      ctx.engine.registerRule(createTestRule({ id: 'del' }));

      const result = Mutation.deleteRule(null, { id: 'del' }, ctx);
      expect(result).toBe(true);
      expect(ctx.engine.getRule('del')).toBeUndefined();
    });

    it('throws NotFoundError for non-existent rule', () => {
      expect(() =>
        Mutation.deleteRule(null, { id: 'missing' }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  describe('Mutation.enableRule', () => {
    it('enables disabled rule and returns it', () => {
      ctx.engine.registerRule(createTestRule({ id: 'en', enabled: false }));

      const result = Mutation.enableRule(null, { id: 'en' }, ctx);
      expect(result.enabled).toBe(true);
    });

    it('throws NotFoundError for non-existent rule', () => {
      expect(() =>
        Mutation.enableRule(null, { id: 'missing' }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  describe('Mutation.disableRule', () => {
    it('disables enabled rule and returns it', () => {
      ctx.engine.registerRule(createTestRule({ id: 'dis', enabled: true }));

      const result = Mutation.disableRule(null, { id: 'dis' }, ctx);
      expect(result.enabled).toBe(false);
    });

    it('throws NotFoundError for non-existent rule', () => {
      expect(() =>
        Mutation.disableRule(null, { id: 'missing' }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  // ─── Rule type resolvers ─────────────────────────────────────────

  describe('Rule.groupId', () => {
    it('returns group id when present', () => {
      ctx.engine.createGroup({ id: 'g1', name: 'G1' });
      ctx.engine.registerRule(createTestRule({ id: 'r-g', group: 'g1' }));
      const rule = ctx.engine.getRule('r-g')!;

      expect(RuleType.groupId(rule)).toBe('g1');
    });

    it('returns null when no group', () => {
      ctx.engine.registerRule(createTestRule({ id: 'r-ng' }));
      const rule = ctx.engine.getRule('r-ng')!;

      expect(RuleType.groupId(rule)).toBeNull();
    });
  });

  describe('Rule.group', () => {
    it('returns null when rule has no group', () => {
      ctx.engine.registerRule(createTestRule({ id: 'no-grp' }));
      const rule = ctx.engine.getRule('no-grp')!;

      expect(RuleType.group(rule, {}, ctx)).toBeNull();
    });

    it('resolves group object when rule belongs to a group', async () => {
      ctx.engine.createGroup({ id: 'g1', name: 'Group One' });
      ctx.engine.registerRule(createTestRule({ id: 'grp-rule', group: 'g1' }));
      const rule = ctx.engine.getRule('grp-rule')!;

      const group = await RuleType.group(rule, {}, ctx);
      expect(group).not.toBeNull();
      expect(group!.id).toBe('g1');
      expect(group!.name).toBe('Group One');
    });

    it('returns null when group reference is stale (group deleted)', async () => {
      ctx.engine.createGroup({ id: 'g-del', name: 'Deleted' });
      ctx.engine.registerRule(createTestRule({ id: 'stale', group: 'g-del' }));
      ctx.engine.deleteGroup('g-del');
      const rule = ctx.engine.getRule('stale')!;

      const group = await RuleType.group(rule, {}, ctx);
      expect(group).toBeNull();
    });
  });

  describe('Rule.versions', () => {
    it('returns null when versioning is not configured', () => {
      ctx.engine.registerRule(createTestRule({ id: 'no-ver' }));
      const rule = ctx.engine.getRule('no-ver')!;

      expect(RuleType.versions(rule, {}, ctx)).toBeNull();
    });

    it('returns version history when versioning is configured', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'ver-rule' }));
        vCtx.engine.updateRule('ver-rule', { name: 'Updated Name' });
        const rule = vCtx.engine.getRule('ver-rule')!;

        const result = RuleType.versions(rule, {}, vCtx);
        expect(result).not.toBeNull();
        expect(result!.entries.length).toBeGreaterThanOrEqual(2);
        expect(result!.totalVersions).toBeGreaterThanOrEqual(2);
        expect(typeof result!.hasMore).toBe('boolean');
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('respects limit and offset arguments', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'paged' }));
        vCtx.engine.updateRule('paged', { name: 'V2' });
        vCtx.engine.updateRule('paged', { name: 'V3' });
        const rule = vCtx.engine.getRule('paged')!;

        const page = RuleType.versions(rule, { limit: 1, offset: 0 }, vCtx);
        expect(page).not.toBeNull();
        expect(page!.entries).toHaveLength(1);
        expect(page!.hasMore).toBe(true);
      } finally {
        await vCtx.engine.stop();
      }
    });
  });

  describe('Rule.auditEntries', () => {
    it('returns empty array when audit is not configured', () => {
      ctx.engine.registerRule(createTestRule({ id: 'no-audit' }));
      const rule = ctx.engine.getRule('no-audit')!;

      expect(RuleType.auditEntries(rule, {}, ctx)).toEqual([]);
    });

    it('returns audit entries for the rule', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'audited' }));
        aCtx.engine.updateRule('audited', { name: 'Changed' });
        const rule = aCtx.engine.getRule('audited')!;

        const entries = RuleType.auditEntries(rule, {}, aCtx);
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries.every(e => e.ruleId === 'audited')).toBe(true);
      } finally {
        await aCtx.engine.stop();
      }
    });

    it('respects limit argument', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'ltd' }));
        aCtx.engine.updateRule('ltd', { name: 'V2' });
        aCtx.engine.updateRule('ltd', { name: 'V3' });
        const rule = aCtx.engine.getRule('ltd')!;

        const entries = RuleType.auditEntries(rule, { limit: 1 }, aCtx);
        expect(entries).toHaveLength(1);
      } finally {
        await aCtx.engine.stop();
      }
    });
  });
});
