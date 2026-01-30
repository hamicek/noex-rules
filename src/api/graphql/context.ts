import type { RuleEngine } from '../../core/rule-engine.js';
import type { WebhookManager } from '../notifications/webhook-manager.js';
import type { SSEManager } from '../notifications/sse-manager.js';
import type { MetricsCollector } from '../../observability/metrics-collector.js';

/**
 * Context dostupný ve všech GraphQL resolverech.
 *
 * Zrcadlí RouteContext z REST API — oba přistupují ke stejným
 * sdíleným instancím (engine, webhook, SSE).
 */
export interface GraphQLContext {
  engine: RuleEngine;
  webhookManager: WebhookManager;
  sseManager: SSEManager;
  metricsCollector?: MetricsCollector;
}
