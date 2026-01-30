import { MemoryAdapter } from '@hamicek/noex';
import { RuleEngine } from '../../../../../src/core/rule-engine';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import type { RuleInput, RuleEngineConfig } from '../../../../../src/types';
import { WebhookManager } from '../../../../../src/api/notifications/webhook-manager';
import { SSEManager } from '../../../../../src/api/notifications/sse-manager';

export async function createTestContext(
  configOverrides?: Partial<RuleEngineConfig>,
): Promise<GraphQLContext> {
  const engine = await RuleEngine.start({ name: 'graphql-test', ...configOverrides });
  const webhookManager = new WebhookManager();
  const sseManager = new SSEManager();
  return { engine, webhookManager, sseManager };
}

export async function createTestContextWithSubsystems(): Promise<GraphQLContext> {
  return createTestContext({
    versioning: { adapter: new MemoryAdapter() },
    audit: { adapter: new MemoryAdapter(), flushIntervalMs: 0 },
  });
}

export async function teardownContext(ctx: GraphQLContext): Promise<void> {
  await ctx.engine.stop();
}

export function createTestRule(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    id: 'test-rule-1',
    name: 'Test Rule',
    description: 'A test rule',
    priority: 10,
    enabled: true,
    tags: ['test'],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'Triggered' }],
    ...overrides,
  };
}
