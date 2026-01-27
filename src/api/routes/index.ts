import type { FastifyInstance } from 'fastify';
import type { RuleEngine } from '../../core/rule-engine.js';
import { registerRulesRoutes } from './rules.js';
import { registerFactsRoutes } from './facts.js';

export interface RouteContext {
  engine: RuleEngine;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  context: RouteContext
): Promise<void> {
  fastify.decorate('engine', context.engine);

  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime()
    };
  });

  fastify.get('/stats', async () => {
    return context.engine.getStats();
  });

  await registerRulesRoutes(fastify);
  await registerFactsRoutes(fastify);
}

declare module 'fastify' {
  interface FastifyInstance {
    engine: RuleEngine;
  }
}
