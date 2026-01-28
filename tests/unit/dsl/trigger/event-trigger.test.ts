import { describe, it, expect } from 'vitest';
import { onEvent } from '../../../../src/dsl/trigger/event-trigger';

describe('onEvent', () => {
  it('creates event trigger builder', () => {
    const trigger = onEvent('order.created').build();

    expect(trigger).toEqual({
      type: 'event',
      topic: 'order.created',
    });
  });

  it('supports wildcard patterns', () => {
    const trigger = onEvent('order.*').build();
    expect(trigger.topic).toBe('order.*');
  });

  it('supports multi-segment wildcards', () => {
    const trigger = onEvent('**').build();
    expect(trigger.topic).toBe('**');
  });

  it('supports complex topic patterns', () => {
    const trigger = onEvent('domain.subdomain.action').build();
    expect(trigger.topic).toBe('domain.subdomain.action');
  });
});
