import { describe, it, expect } from 'vitest';
import { onTimer } from '../../../../src/dsl/trigger/timer-trigger';

describe('onTimer', () => {
  it('creates timer trigger builder', () => {
    const trigger = onTimer('payment-timeout').build();

    expect(trigger).toEqual({
      type: 'timer',
      name: 'payment-timeout',
    });
  });

  it('supports entity-scoped timer names', () => {
    const trigger = onTimer('order:123:reminder').build();
    expect(trigger.name).toBe('order:123:reminder');
  });

  it('supports simple timer names', () => {
    const trigger = onTimer('daily-cleanup').build();
    expect(trigger.name).toBe('daily-cleanup');
  });

  it('supports namespaced timer names', () => {
    const trigger = onTimer('billing.subscription.renewal').build();
    expect(trigger.name).toBe('billing.subscription.renewal');
  });

  it('supports hyphenated timer names', () => {
    const trigger = onTimer('session-expiry-check').build();
    expect(trigger.name).toBe('session-expiry-check');
  });
});
