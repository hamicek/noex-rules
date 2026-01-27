import type { FastifyInstance } from 'fastify';
import type { RuleEngine } from '../../core/rule-engine.js';
import type { WebhookManager } from '../notifications/webhook-manager.js';
import { registerRulesRoutes } from './rules.js';
import { registerFactsRoutes } from './facts.js';
import { registerEventsRoutes } from './events.js';
import { registerTimersRoutes } from './timers.js';
import { registerHealthRoutes } from './health.js';
import { registerWebhooksRoutes } from './webhooks.js';

export interface RouteContext {
  engine: RuleEngine;
  webhookManager: WebhookManager;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  context: RouteContext
): Promise<void> {
  fastify.decorate('engine', context.engine);

  await registerHealthRoutes(fastify);
  await registerRulesRoutes(fastify);
  await registerFactsRoutes(fastify);
  await registerEventsRoutes(fastify);
  await registerTimersRoutes(fastify);
  await registerWebhooksRoutes(fastify, context.webhookManager);
}

declare module 'fastify' {
  interface FastifyInstance {
    engine: RuleEngine;
  }
}
