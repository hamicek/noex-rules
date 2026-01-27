import Fastify, { type FastifyInstance } from 'fastify';
import { RuleEngine } from '../../src/core/rule-engine.js';
import { registerRoutes } from '../../src/api/routes/index.js';
import { errorHandler } from '../../src/api/middleware/error-handler.js';

export interface TestContext {
  fastify: FastifyInstance;
  engine: RuleEngine;
}

export async function createTestServer(): Promise<TestContext> {
  const engine = await RuleEngine.start({
    name: 'test-engine'
  });

  const fastify = Fastify({
    logger: false
  });

  fastify.setErrorHandler(errorHandler);

  await fastify.register(
    async (instance) => {
      await registerRoutes(instance, { engine });
    },
    { prefix: '/api/v1' }
  );

  await fastify.ready();

  return { fastify, engine };
}

export async function closeTestServer(ctx: TestContext): Promise<void> {
  await ctx.fastify.close();
  await ctx.engine.stop();
}
