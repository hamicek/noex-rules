import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { versionResolvers } from '../../../../../src/api/graphql/resolvers/version.resolvers';
import { ServiceUnavailableError, NotFoundError } from '../../../../../src/api/middleware/error-handler';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, createTestContextWithSubsystems, teardownContext, createTestRule } from './setup';

const { Query, Mutation } = versionResolvers;

describe('versionResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query.ruleVersions ─────────────────────────────────────────

  describe('Query.ruleVersions', () => {
    it('throws ServiceUnavailableError when versioning is not configured', () => {
      expect(() =>
        Query.ruleVersions(null, { ruleId: 'any' }, ctx),
      ).toThrow(ServiceUnavailableError);
    });

    it('returns version history for a rule', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'ver-1' }));
        vCtx.engine.updateRule('ver-1', { name: 'Updated' });

        const result = Query.ruleVersions(null, { ruleId: 'ver-1' }, vCtx);

        expect(result.entries.length).toBeGreaterThanOrEqual(2);
        expect(result.totalVersions).toBeGreaterThanOrEqual(2);
        expect(typeof result.hasMore).toBe('boolean');
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('returns empty result for non-existent rule', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        const result = Query.ruleVersions(null, { ruleId: 'nonexistent' }, vCtx);

        expect(result.entries).toEqual([]);
        expect(result.totalVersions).toBe(0);
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('accepts query parameters for filtering', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'filt-r' }));
        vCtx.engine.updateRule('filt-r', { name: 'V2' });
        vCtx.engine.updateRule('filt-r', { name: 'V3' });

        const result = Query.ruleVersions(null, {
          ruleId: 'filt-r',
          query: { limit: 1, offset: 0, order: 'desc' },
        }, vCtx);

        expect(result.entries).toHaveLength(1);
        expect(result.hasMore).toBe(true);
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('filters by change types', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'ct-r' }));
        vCtx.engine.updateRule('ct-r', { name: 'Changed' });

        const result = Query.ruleVersions(null, {
          ruleId: 'ct-r',
          query: { changeTypes: ['registered'] },
        }, vCtx);

        expect(result.entries.length).toBe(1);
        expect(result.entries[0]!.changeType).toBe('registered');
      } finally {
        await vCtx.engine.stop();
      }
    });
  });

  // ─── Query.ruleVersion ──────────────────────────────────────────

  describe('Query.ruleVersion', () => {
    it('throws ServiceUnavailableError when versioning is not configured', () => {
      expect(() =>
        Query.ruleVersion(null, { ruleId: 'any', version: 1 }, ctx),
      ).toThrow(ServiceUnavailableError);
    });

    it('returns specific version entry', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'sv-r' }));

        const result = Query.ruleVersion(null, { ruleId: 'sv-r', version: 1 }, vCtx);

        expect(result).not.toBeNull();
        expect(result!.version).toBe(1);
        expect(result!.changeType).toBe('registered');
        expect(result!.ruleSnapshot).toBeDefined();
        expect(result!.ruleSnapshot.id).toBe('sv-r');
        expect(result!.timestamp).toBeTypeOf('number');
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('returns null for non-existent version', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'no-v' }));

        const result = Query.ruleVersion(null, { ruleId: 'no-v', version: 999 }, vCtx);
        expect(result).toBeNull();
      } finally {
        await vCtx.engine.stop();
      }
    });
  });

  // ─── Query.ruleVersionDiff ──────────────────────────────────────

  describe('Query.ruleVersionDiff', () => {
    it('throws ServiceUnavailableError when versioning is not configured', () => {
      expect(() =>
        Query.ruleVersionDiff(null, { ruleId: 'any', fromVersion: 1, toVersion: 2 }, ctx),
      ).toThrow(ServiceUnavailableError);
    });

    it('returns diff between two versions', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'diff-r', name: 'Original' }));
        vCtx.engine.updateRule('diff-r', { name: 'Changed' });

        const result = Query.ruleVersionDiff(null, {
          ruleId: 'diff-r',
          fromVersion: 1,
          toVersion: 2,
        }, vCtx);

        expect(result).not.toBeNull();
        expect(result!.ruleId).toBe('diff-r');
        expect(result!.fromVersion).toBe(1);
        expect(result!.toVersion).toBe(2);
        expect(result!.changes.length).toBeGreaterThanOrEqual(1);

        const nameChange = result!.changes.find(c => c.field === 'name');
        expect(nameChange).toBeDefined();
        expect(nameChange!.oldValue).toBe('Original');
        expect(nameChange!.newValue).toBe('Changed');
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('returns null when versions do not exist', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        const result = Query.ruleVersionDiff(null, {
          ruleId: 'ghost',
          fromVersion: 1,
          toVersion: 2,
        }, vCtx);

        expect(result).toBeNull();
      } finally {
        await vCtx.engine.stop();
      }
    });
  });

  // ─── Mutation.rollbackRule ──────────────────────────────────────

  describe('Mutation.rollbackRule', () => {
    it('throws ServiceUnavailableError when versioning is not configured', () => {
      expect(() =>
        Mutation.rollbackRule(null, { id: 'any', version: 1 }, ctx),
      ).toThrow(ServiceUnavailableError);
    });

    it('throws NotFoundError for non-existent rule', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        expect(() =>
          Mutation.rollbackRule(null, { id: 'missing', version: 1 }, vCtx),
        ).toThrow(NotFoundError);
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('rolls back rule to previous version', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'rb-r', name: 'Original', priority: 10 }));
        vCtx.engine.updateRule('rb-r', { name: 'Modified', priority: 50 });

        const rolledBack = Mutation.rollbackRule(null, { id: 'rb-r', version: 1 }, vCtx);

        expect(rolledBack.name).toBe('Original');
        expect(rolledBack.priority).toBe(10);
      } finally {
        await vCtx.engine.stop();
      }
    });

    it('throws error for non-existent version', async () => {
      const vCtx = await createTestContextWithSubsystems();
      try {
        vCtx.engine.registerRule(createTestRule({ id: 'rb-bad' }));

        expect(() =>
          Mutation.rollbackRule(null, { id: 'rb-bad', version: 999 }, vCtx),
        ).toThrow();
      } finally {
        await vCtx.engine.stop();
      }
    });
  });
});
