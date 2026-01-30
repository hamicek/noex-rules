import type { RuleEngine } from '../../core/rule-engine.js';
import type { WebhookManager } from '../notifications/webhook-manager.js';
import type { SSEManager } from '../notifications/sse-manager.js';
import type { MetricsCollector } from '../../observability/metrics-collector.js';
import type { GraphQLLoaders } from './loaders/index.js';

/**
 * Sdílené služby předávané při registraci GraphQL pluginu.
 * Neobsahuje per-request objekty (loadery).
 */
export interface GraphQLBaseContext {
  engine: RuleEngine;
  webhookManager: WebhookManager;
  sseManager: SSEManager;
  metricsCollector?: MetricsCollector;
}

/**
 * Plný context dostupný ve všech GraphQL resolverech.
 *
 * Rozšiřuje {@link GraphQLBaseContext} o `loaders` — DataLoadery
 * vytvářené per-request pro prevenci N+1 dotazů ve field resolverech.
 */
export interface GraphQLContext extends GraphQLBaseContext {
  loaders: GraphQLLoaders;
}
