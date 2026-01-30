import { RuleEngine } from '../../../../../src/core/rule-engine';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import type { RuleInput } from '../../../../../src/types/rule';
import { WebhookManager } from '../../../../../src/api/notifications/webhook-manager';
import { SSEManager } from '../../../../../src/api/notifications/sse-manager';

export async function createTestContext(): Promise<GraphQLContext> {
  const engine = await RuleEngine.start({ name: 'graphql-test' });
  const webhookManager = new WebhookManager();
  const sseManager = new SSEManager();
  return { engine, webhookManager, sseManager };
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
