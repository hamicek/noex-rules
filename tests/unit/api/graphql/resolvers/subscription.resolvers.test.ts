import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { subscriptionResolvers } from '../../../../../src/api/graphql/resolvers/subscription.resolvers';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, createTestContextWithSubsystems, teardownContext, createTestRule } from './setup';

const { Subscription } = subscriptionResolvers;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Collects `count` values from an async iterable with a timeout guard. */
async function collect<T>(
  iter: AsyncIterableIterator<T>,
  count: number,
  timeoutMs = 2000,
): Promise<T[]> {
  const results: T[] = [];
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`collect() timed out after ${timeoutMs}ms`)), timeoutMs),
  );

  for (let i = 0; i < count; i++) {
    const next = await Promise.race([iter.next(), timeout]);
    if ((next as IteratorResult<T>).done) break;
    results.push((next as IteratorReturnResult<T>).value);
  }
  return results;
}

/** Drains any immediately available values without blocking. */
async function drain<T>(iter: AsyncIterableIterator<T>): Promise<void> {
  await iter.return?.();
}

// ═════════════════════════════════════════════════════════════════════════════

describe('subscriptionResolvers', () => {
  // ─── engineEvent ─────────────────────────────────────────────────────

  describe('Subscription.engineEvent', () => {
    let ctx: GraphQLContext;

    beforeEach(async () => {
      ctx = await createTestContext();
    });

    afterEach(async () => {
      await teardownContext(ctx);
    });

    it('receives events matching the default wildcard pattern', async () => {
      const iter = Subscription.engineEvent.subscribe(null, { patterns: ['*'] }, ctx);

      await ctx.engine.emit('order.created', { id: '1' });
      await ctx.engine.emit('payment.received', { amount: 42 });

      const items = await collect(iter, 2);
      await drain(iter);

      expect(items).toHaveLength(2);
      expect(items[0]!.engineEvent.topic).toBe('order.created');
      expect(items[0]!.engineEvent.data).toEqual({ id: '1' });
      expect(items[1]!.engineEvent.topic).toBe('payment.received');
      expect(items[1]!.engineEvent.data).toEqual({ amount: 42 });
    });

    it('receives only events matching a specific pattern', async () => {
      const iter = Subscription.engineEvent.subscribe(null, { patterns: ['order.*'] }, ctx);

      await ctx.engine.emit('order.created', { id: '1' });
      await ctx.engine.emit('payment.received', { amount: 10 });
      await ctx.engine.emit('order.updated', { id: '1' });

      const items = await collect(iter, 2);
      await drain(iter);

      expect(items).toHaveLength(2);
      expect(items[0]!.engineEvent.topic).toBe('order.created');
      expect(items[1]!.engineEvent.topic).toBe('order.updated');
    });

    it('supports multiple patterns simultaneously', async () => {
      const iter = Subscription.engineEvent.subscribe(
        null,
        { patterns: ['order.*', 'payment.*'] },
        ctx,
      );

      await ctx.engine.emit('order.created', {});
      await ctx.engine.emit('payment.received', {});
      await ctx.engine.emit('inventory.updated', {});

      const items = await collect(iter, 2);
      await drain(iter);

      expect(items).toHaveLength(2);
      expect(items.map((i) => i.engineEvent.topic)).toEqual([
        'order.created',
        'payment.received',
      ]);
    });

    it('yields full event structure', async () => {
      const iter = Subscription.engineEvent.subscribe(null, { patterns: ['*'] }, ctx);

      await ctx.engine.emit('test.event', { foo: 'bar' });

      const [item] = await collect(iter, 1);
      await drain(iter);

      const event = item!.engineEvent;
      expect(event.id).toBeTypeOf('string');
      expect(event.topic).toBe('test.event');
      expect(event.data).toEqual({ foo: 'bar' });
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.source).toBeTypeOf('string');
    });

    it('stops delivering events after iterator is closed', async () => {
      const iter = Subscription.engineEvent.subscribe(null, { patterns: ['*'] }, ctx);

      await ctx.engine.emit('first', {});
      const items = await collect(iter, 1);
      expect(items).toHaveLength(1);

      // Close the iterator
      await drain(iter);

      // Events emitted after close should be silently dropped
      await ctx.engine.emit('second', {});

      // Calling next on a closed iterator returns done
      const result = await iter.next();
      expect(result.done).toBe(true);
    });

    it('unsubscribes from engine when iterator is closed', async () => {
      const received: string[] = [];

      // Register a regular subscriber to verify engine still works
      const unsub = ctx.engine.subscribe('*', (event) => {
        received.push(event.topic);
      });

      const iter = Subscription.engineEvent.subscribe(null, { patterns: ['*'] }, ctx);

      await ctx.engine.emit('before', {});
      await collect(iter, 1);
      await drain(iter);

      // Engine subscriber should still work independently
      await ctx.engine.emit('after', {});
      expect(received).toContain('before');
      expect(received).toContain('after');

      unsub();
    });
  });

  // ─── auditEvent ──────────────────────────────────────────────────────

  describe('Subscription.auditEvent', () => {
    let ctx: GraphQLContext;

    beforeEach(async () => {
      ctx = await createTestContextWithSubsystems();
    });

    afterEach(async () => {
      await teardownContext(ctx);
    });

    it('receives audit entries without filters', async () => {
      const iter = Subscription.auditEvent.subscribe(null, {}, ctx);

      ctx.engine.registerRule(createTestRule({ id: 'sub-r1' }));

      const items = await collect(iter, 1);
      await drain(iter);

      expect(items).toHaveLength(1);
      expect(items[0]!.auditEvent.type).toBe('rule_registered');
      expect(items[0]!.auditEvent.ruleId).toBe('sub-r1');
    });

    it('filters by category', async () => {
      const iter = Subscription.auditEvent.subscribe(
        null,
        { categories: ['fact_change'] },
        ctx,
      );

      // rule_management entry — should be filtered out
      ctx.engine.registerRule(createTestRule({ id: 'cat-filter-r' }));

      // fact_change entry — should pass
      await ctx.engine.setFact('price', 100);

      const items = await collect(iter, 1);
      await drain(iter);

      expect(items).toHaveLength(1);
      expect(items[0]!.auditEvent.category).toBe('fact_change');
    });

    it('filters by event type', async () => {
      const iter = Subscription.auditEvent.subscribe(
        null,
        { types: ['rule_registered'] },
        ctx,
      );

      ctx.engine.registerRule(createTestRule({ id: 'type-filter-r1' }));
      await ctx.engine.setFact('irrelevant', 1);

      const items = await collect(iter, 1);
      await drain(iter);

      expect(items).toHaveLength(1);
      expect(items[0]!.auditEvent.type).toBe('rule_registered');
    });

    it('filters by ruleId', async () => {
      const iter = Subscription.auditEvent.subscribe(
        null,
        { ruleIds: ['target-rule'] },
        ctx,
      );

      ctx.engine.registerRule(createTestRule({ id: 'other-rule' }));
      ctx.engine.registerRule(createTestRule({ id: 'target-rule', name: 'Target' }));

      const items = await collect(iter, 1);
      await drain(iter);

      expect(items).toHaveLength(1);
      expect(items[0]!.auditEvent.ruleId).toBe('target-rule');
    });

    it('combines multiple filters with AND logic', async () => {
      const iter = Subscription.auditEvent.subscribe(
        null,
        {
          categories: ['rule_management'],
          types: ['rule_registered'],
          ruleIds: ['combo-r'],
        },
        ctx,
      );

      // Passes all three filters
      ctx.engine.registerRule(createTestRule({ id: 'combo-r' }));

      // Passes category + type but wrong ruleId
      ctx.engine.registerRule(createTestRule({ id: 'wrong-id' }));

      const items = await collect(iter, 1);
      await drain(iter);

      expect(items).toHaveLength(1);
      expect(items[0]!.auditEvent.ruleId).toBe('combo-r');
    });

    it('yields complete audit entry structure', async () => {
      const iter = Subscription.auditEvent.subscribe(null, {}, ctx);

      ctx.engine.registerRule(createTestRule({ id: 'struct-r', name: 'Structure Rule' }));

      const [item] = await collect(iter, 1);
      await drain(iter);

      const entry = item!.auditEvent;
      expect(entry.id).toBeTypeOf('string');
      expect(entry.timestamp).toBeTypeOf('number');
      expect(entry.category).toBeTypeOf('string');
      expect(entry.type).toBeTypeOf('string');
      expect(entry.summary).toBeTypeOf('string');
      expect(entry.source).toBeTypeOf('string');
      expect(entry.details).toBeTypeOf('object');
    });

    it('closes immediately when audit is not configured', async () => {
      const noAuditCtx = await createTestContext();
      try {
        const iter = Subscription.auditEvent.subscribe(null, {}, noAuditCtx);

        const result = await iter.next();
        expect(result.done).toBe(true);
      } finally {
        await noAuditCtx.engine.stop();
      }
    });

    it('stops delivering after iterator is closed', async () => {
      const iter = Subscription.auditEvent.subscribe(null, {}, ctx);

      ctx.engine.registerRule(createTestRule({ id: 'close-r' }));
      await collect(iter, 1);
      await drain(iter);

      // Should not throw or hang
      const result = await iter.next();
      expect(result.done).toBe(true);
    });
  });
});
