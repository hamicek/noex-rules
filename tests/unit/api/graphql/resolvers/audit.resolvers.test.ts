import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { auditResolvers } from '../../../../../src/api/graphql/resolvers/audit.resolvers';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, createTestContextWithSubsystems, teardownContext, createTestRule } from './setup';

const { Query } = auditResolvers;

describe('auditResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query ────────────────────────────────────────────────────────

  describe('Query.auditEntries', () => {
    it('returns empty result when audit is not configured', () => {
      const result = Query.auditEntries(null, {}, ctx);

      expect(result.entries).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.queryTimeMs).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty result when no query input is provided', () => {
      const result = Query.auditEntries(null, { query: undefined }, ctx);

      expect(result.entries).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('returns audit entries when audit is configured', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'audit-r' }));

        const result = Query.auditEntries(null, {}, aCtx);
        expect(result.entries.length).toBeGreaterThanOrEqual(1);
        expect(result.totalCount).toBeGreaterThanOrEqual(1);
        expect(result.queryTimeMs).toBeTypeOf('number');
        expect(typeof result.hasMore).toBe('boolean');
      } finally {
        await aCtx.engine.stop();
      }
    });

    it('filters entries by category', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'cat-r' }));
        await aCtx.engine.setFact('some-fact', 42);

        const result = Query.auditEntries(null, {
          query: { category: 'rule_management' },
        }, aCtx);

        expect(result.entries.length).toBeGreaterThanOrEqual(1);
        expect(result.entries.every(e => e.category === 'rule_management')).toBe(true);
      } finally {
        await aCtx.engine.stop();
      }
    });

    it('filters entries by ruleId', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'r-a', name: 'Rule A' }));
        aCtx.engine.registerRule(createTestRule({ id: 'r-b', name: 'Rule B' }));

        const result = Query.auditEntries(null, {
          query: { ruleId: 'r-a' },
        }, aCtx);

        expect(result.entries.length).toBeGreaterThanOrEqual(1);
        expect(result.entries.every(e => e.ruleId === 'r-a')).toBe(true);
      } finally {
        await aCtx.engine.stop();
      }
    });

    it('filters entries by event types', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'type-r' }));
        aCtx.engine.updateRule('type-r', { name: 'Updated' });

        const result = Query.auditEntries(null, {
          query: { types: ['rule_registered'] },
        }, aCtx);

        expect(result.entries.length).toBeGreaterThanOrEqual(1);
        expect(result.entries.every(e => e.type === 'rule_registered')).toBe(true);
      } finally {
        await aCtx.engine.stop();
      }
    });

    it('respects limit and offset for pagination', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'pg-1' }));
        aCtx.engine.registerRule(createTestRule({ id: 'pg-2' }));
        aCtx.engine.registerRule(createTestRule({ id: 'pg-3' }));

        const page1 = Query.auditEntries(null, {
          query: { limit: 1, offset: 0 },
        }, aCtx);

        expect(page1.entries).toHaveLength(1);
        expect(page1.hasMore).toBe(true);

        const page2 = Query.auditEntries(null, {
          query: { limit: 1, offset: 1 },
        }, aCtx);

        expect(page2.entries).toHaveLength(1);
        expect(page2.entries[0]!.id).not.toBe(page1.entries[0]!.id);
      } finally {
        await aCtx.engine.stop();
      }
    });

    it('entries have complete structure', async () => {
      const aCtx = await createTestContextWithSubsystems();
      try {
        aCtx.engine.registerRule(createTestRule({ id: 'struct-r', name: 'Struct Rule' }));

        const result = Query.auditEntries(null, {}, aCtx);
        const entry = result.entries[0]!;

        expect(entry.id).toBeTypeOf('string');
        expect(entry.timestamp).toBeTypeOf('number');
        expect(entry.category).toBeTypeOf('string');
        expect(entry.type).toBeTypeOf('string');
        expect(entry.summary).toBeTypeOf('string');
        expect(entry.source).toBeTypeOf('string');
        expect(entry.details).toBeTypeOf('object');
      } finally {
        await aCtx.engine.stop();
      }
    });
  });
});
