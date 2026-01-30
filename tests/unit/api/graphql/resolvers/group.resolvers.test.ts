import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { groupResolvers } from '../../../../../src/api/graphql/resolvers/group.resolvers';
import { NotFoundError, ConflictError } from '../../../../../src/api/middleware/error-handler';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, teardownContext } from './setup';

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

  describe('RuleGroup.rules (stub)', () => {
    it('returns empty array (deferred to field resolvers)', () => {
      expect(RuleGroupType.rules()).toEqual([]);
    });
  });

  describe('RuleGroup.rulesCount (stub)', () => {
    it('returns 0 (deferred to field resolvers)', () => {
      expect(RuleGroupType.rulesCount()).toBe(0);
    });
  });
});
