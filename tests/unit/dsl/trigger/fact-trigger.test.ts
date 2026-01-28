import { describe, it, expect } from 'vitest';
import { onFact } from '../../../../src/dsl/trigger/fact-trigger';

describe('onFact', () => {
  it('creates fact trigger builder', () => {
    const trigger = onFact('customer:123:creditScore').build();

    expect(trigger).toEqual({
      type: 'fact',
      pattern: 'customer:123:creditScore',
    });
  });

  it('supports wildcard patterns', () => {
    const trigger = onFact('customer:*:creditScore').build();
    expect(trigger.pattern).toBe('customer:*:creditScore');
  });

  it('supports multiple wildcards', () => {
    const trigger = onFact('*:*:status').build();
    expect(trigger.pattern).toBe('*:*:status');
  });

  it('supports complex fact patterns', () => {
    const trigger = onFact('inventory:warehouse-east:item-*:stock').build();
    expect(trigger.pattern).toBe('inventory:warehouse-east:item-*:stock');
  });

  it('supports simple fact names', () => {
    const trigger = onFact('globalConfig').build();
    expect(trigger.pattern).toBe('globalConfig');
  });
});
