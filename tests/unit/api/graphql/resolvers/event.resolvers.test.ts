import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventResolvers } from '../../../../../src/api/graphql/resolvers/event.resolvers';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, teardownContext } from './setup';

const { Mutation } = eventResolvers;

describe('eventResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  describe('Mutation.emitEvent', () => {
    it('emits event and returns it', async () => {
      const result = await Mutation.emitEvent(null, {
        input: { topic: 'order.created', data: { orderId: '123' } },
      }, ctx);

      expect(result.topic).toBe('order.created');
      expect(result.data).toEqual({ orderId: '123' });
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeTypeOf('number');
      expect(result.source).toBeDefined();
    });

    it('emits event with empty data when data is omitted', async () => {
      const result = await Mutation.emitEvent(null, {
        input: { topic: 'ping' },
      }, ctx);

      expect(result.topic).toBe('ping');
      expect(result.data).toEqual({});
    });
  });

  describe('Mutation.emitCorrelatedEvent', () => {
    it('emits correlated event with tracking ids', async () => {
      const result = await Mutation.emitCorrelatedEvent(null, {
        input: {
          topic: 'payment.received',
          data: { amount: 100 },
          correlationId: 'order-flow-1',
          causationId: 'order-created-1',
        },
      }, ctx);

      expect(result.topic).toBe('payment.received');
      expect(result.data).toEqual({ amount: 100 });
      expect(result.correlationId).toBe('order-flow-1');
      expect(result.causationId).toBe('order-created-1');
    });

    it('emits without causationId', async () => {
      const result = await Mutation.emitCorrelatedEvent(null, {
        input: {
          topic: 'start',
          correlationId: 'flow-1',
        },
      }, ctx);

      expect(result.correlationId).toBe('flow-1');
      expect(result.data).toEqual({});
    });
  });
});
