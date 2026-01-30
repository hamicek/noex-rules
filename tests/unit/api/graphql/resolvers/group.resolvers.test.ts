import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { groupResolvers } from '../../../../../src/api/graphql/resolvers/group.resolvers';
import { NotFoundError, ConflictError } from '../../../../../src/api/middleware/error-handler';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, teardownContext, createTestRule } from './setup';

const { Query, Mutation, RuleGroup: RuleGroupType } = groupResolvers;

describe('groupResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query ────────────────────────────────────────────────────────

  describe('Query.groups', () => {
    it('returns empty array when no groups exist', () => {
      const result = Query.groups(null, null, ctx);
      expect(result).toEqual([]);
    });

    it('returns all groups', () => {
      ctx.engine.createGroup({ id: 'g1', name: 'Group 1' });
      ctx.engine.createGroup({ id: 'g2', name: 'Group 2' });

      const result = Query.groups(null, null, ctx);
      expect(result).toHaveLength(2);
      expect(result.map(g => g.id)).toContain('g1');
      expect(result.map(g => g.id)).toContain('g2');
    });
  });

  describe('Query.group', () => {
    it('returns null for non-existent group', () => {
      const result = Query.group(null, { id: 'missing' }, ctx);
      expect(result).toBeNull();
    });

    it('returns group by id', () => {
      ctx.engine.createGroup({ id: 'g1', name: 'Group 1', description: 'desc' });

      const result = Query.group(null, { id: 'g1' }, ctx);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('g1');
      expect(result!.name).toBe('Group 1');
      expect(result!.description).toBe('desc');
      expect(result!.enabled).toBe(true);
      expect(result!.createdAt).toBeTypeOf('number');
    });
  });

  // ─── Mutation ─────────────────────────────────────────────────────

  describe('Mutation.createGroup', () => {
    it('creates group and returns it', () => {
      const result = Mutation.createGroup(null, {
        input: { id: 'new-g', name: 'New Group' },
      }, ctx);

      expect(result.id).toBe('new-g');
      expect(result.name).toBe('New Group');
      expect(result.enabled).toBe(true);
    });

    it('respects explicit enabled: false', () => {
      const result = Mutation.createGroup(null, {
        input: { id: 'off', name: 'Disabled', enabled: false },
      }, ctx);

      expect(result.enabled).toBe(false);
    });

    it('throws ConflictError for duplicate id', () => {
      ctx.engine.createGroup({ id: 'dup', name: 'Dup' });

      expect(() =>
        Mutation.createGroup(null, { input: { id: 'dup', name: 'Again' } }, ctx),
      ).toThrow(ConflictError);
    });
  });

  describe('Mutation.updateGroup', () => {
    it('updates group fields', () => {
      ctx.engine.createGroup({ id: 'upd', name: 'Old' });

      const result = Mutation.updateGroup(null, {
        id: 'upd',
        input: { name: 'New Name', description: 'updated' },
      }, ctx);

      expect(result.name).toBe('New Name');
      expect(result.description).toBe('updated');
    });

    it('throws NotFoundError for non-existent group', () => {
      expect(() =>
        Mutation.updateGroup(null, { id: 'missing', input: { name: 'X' } }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  describe('Mutation.deleteGroup', () => {
    it('deletes existing group and returns true', () => {
      ctx.engine.createGroup({ id: 'del', name: 'Del' });

      const result = Mutation.deleteGroup(null, { id: 'del' }, ctx);
      expect(result).toBe(true);
      expect(ctx.engine.getGroup('del')).toBeUndefined();
    });

    it('throws NotFoundError for non-existent group', () => {
      expect(() =>
        Mutation.deleteGroup(null, { id: 'missing' }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  describe('Mutation.enableGroup', () => {
    it('enables disabled group', () => {
      ctx.engine.createGroup({ id: 'en', name: 'G', enabled: false });

      const result = Mutation.enableGroup(null, { id: 'en' }, ctx);
      expect(result.enabled).toBe(true);
    });

    it('throws NotFoundError for non-existent group', () => {
      expect(() =>
        Mutation.enableGroup(null, { id: 'missing' }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  describe('Mutation.disableGroup', () => {
    it('disables enabled group', () => {
      ctx.engine.createGroup({ id: 'dis', name: 'G' });

      const result = Mutation.disableGroup(null, { id: 'dis' }, ctx);
      expect(result.enabled).toBe(false);
    });

    it('throws NotFoundError for non-existent group', () => {
      expect(() =>
        Mutation.disableGroup(null, { id: 'missing' }, ctx),
      ).toThrow(NotFoundError);
    });
  });

  // ─── RuleGroup type resolvers ────────────────────────────────────

  describe('RuleGroup.rules', () => {
    it('returns empty array when group has no rules', () => {
      ctx.engine.createGroup({ id: 'empty-g', name: 'Empty' });
      const group = ctx.engine.getGroup('empty-g')!;

      expect(RuleGroupType.rules(group, {}, ctx)).toEqual([]);
    });

    it('returns rules belonging to the group', () => {
      ctx.engine.createGroup({ id: 'g-rules', name: 'With Rules' });
      ctx.engine.registerRule(createTestRule({ id: 'r1', name: 'R1', group: 'g-rules' }));
      ctx.engine.registerRule(createTestRule({ id: 'r2', name: 'R2', group: 'g-rules' }));
      ctx.engine.registerRule(createTestRule({ id: 'r3', name: 'R3' })); // no group
      const group = ctx.engine.getGroup('g-rules')!;

      const rules = RuleGroupType.rules(group, {}, ctx);
      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });
  });

  describe('RuleGroup.rulesCount', () => {
    it('returns 0 for empty group', () => {
      ctx.engine.createGroup({ id: 'cnt-0', name: 'Empty' });
      const group = ctx.engine.getGroup('cnt-0')!;

      expect(RuleGroupType.rulesCount(group, {}, ctx)).toBe(0);
    });

    it('returns correct count of rules in group', () => {
      ctx.engine.createGroup({ id: 'cnt-g', name: 'Counted' });
      ctx.engine.registerRule(createTestRule({ id: 'c1', group: 'cnt-g' }));
      ctx.engine.registerRule(createTestRule({ id: 'c2', group: 'cnt-g' }));
      ctx.engine.registerRule(createTestRule({ id: 'c3', group: 'cnt-g' }));
      const group = ctx.engine.getGroup('cnt-g')!;

      expect(RuleGroupType.rulesCount(group, {}, ctx)).toBe(3);
    });
  });
});
