import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine.js';
import type { RuleInput } from '../../src/types/rule.js';

function makeRule(overrides: Partial<RuleInput> & { id: string }): RuleInput {
  return {
    name: overrides.id,
    priority: 0,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'emit_event', topic: 'out', data: {} }],
    ...overrides,
  };
}

describe('Group lifecycle integration', () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'integration-groups' });
  });

  afterEach(async () => {
    await engine.stop();
  });

  it('full lifecycle: create → assign rules → disable → enable → delete', async () => {
    // 1. Create group
    const group = engine.createGroup({
      id: 'billing',
      name: 'Billing Rules',
      description: 'Rules for the billing domain',
    });

    expect(group.enabled).toBe(true);

    // 2. Create rules in group
    engine.registerRule(makeRule({
      id: 'invoice-rule',
      group: 'billing',
      trigger: { type: 'event', topic: 'invoice.created' },
      actions: [{ type: 'set_fact', key: 'invoice.processed', value: true }],
    }));

    engine.registerRule(makeRule({
      id: 'payment-rule',
      group: 'billing',
      trigger: { type: 'event', topic: 'payment.received' },
      actions: [{ type: 'set_fact', key: 'payment.processed', value: true }],
    }));

    // Also create an ungrouped rule to verify it's not affected
    engine.registerRule(makeRule({
      id: 'audit-rule',
      trigger: { type: 'event', topic: 'invoice.created' },
      actions: [{ type: 'set_fact', key: 'audit.logged', value: true }],
    }));

    expect(engine.getGroupRules('billing')).toHaveLength(2);

    // 3. Verify rules fire when group is enabled
    await engine.emit('invoice.created');
    expect(engine.getFact('invoice.processed')).toBe(true);
    expect(engine.getFact('audit.logged')).toBe(true);

    // 4. Disable group — billing rules stop firing
    engine.disableGroup('billing');
    expect(engine.getGroup('billing')!.enabled).toBe(false);

    // Reset facts for clean assertion
    engine.deleteFact('invoice.processed');
    engine.deleteFact('payment.processed');
    engine.deleteFact('audit.logged');

    await engine.emit('invoice.created');
    expect(engine.getFact('invoice.processed')).toBeUndefined();
    expect(engine.getFact('audit.logged')).toBe(true); // ungrouped still fires

    await engine.emit('payment.received');
    expect(engine.getFact('payment.processed')).toBeUndefined();

    // 5. Enable group — billing rules resume
    engine.enableGroup('billing');
    expect(engine.getGroup('billing')!.enabled).toBe(true);

    await engine.emit('invoice.created');
    expect(engine.getFact('invoice.processed')).toBe(true);

    await engine.emit('payment.received');
    expect(engine.getFact('payment.processed')).toBe(true);

    // 6. Delete group — rules become ungrouped
    engine.deleteGroup('billing');
    expect(engine.getGroup('billing')).toBeUndefined();

    const invoiceRule = engine.getRule('invoice-rule')!;
    expect(invoiceRule).not.toHaveProperty('group');

    const paymentRule = engine.getRule('payment-rule')!;
    expect(paymentRule).not.toHaveProperty('group');

    // 7. Ungrouped rules still fire
    engine.deleteFact('invoice.processed');
    await engine.emit('invoice.created');
    expect(engine.getFact('invoice.processed')).toBe(true);
  });

  it('individually disabled rule stays disabled after group re-enable', async () => {
    engine.createGroup({ id: 'g', name: 'G' });

    engine.registerRule(makeRule({
      id: 'active-rule',
      group: 'g',
      trigger: { type: 'event', topic: 'test.event' },
      actions: [{ type: 'set_fact', key: 'active.fired', value: true }],
    }));

    engine.registerRule(makeRule({
      id: 'disabled-rule',
      group: 'g',
      enabled: false,
      trigger: { type: 'event', topic: 'test.event' },
      actions: [{ type: 'set_fact', key: 'disabled.fired', value: true }],
    }));

    // Both in same group, but one is individually disabled
    engine.disableGroup('g');
    engine.enableGroup('g');

    await engine.emit('test.event');

    expect(engine.getFact('active.fired')).toBe(true);
    expect(engine.getFact('disabled.fired')).toBeUndefined();
  });

  it('multiple groups operate independently', async () => {
    engine.createGroup({ id: 'billing', name: 'Billing' });
    engine.createGroup({ id: 'shipping', name: 'Shipping' });

    engine.registerRule(makeRule({
      id: 'bill-rule',
      group: 'billing',
      trigger: { type: 'event', topic: 'order.placed' },
      actions: [{ type: 'set_fact', key: 'billing.fired', value: true }],
    }));

    engine.registerRule(makeRule({
      id: 'ship-rule',
      group: 'shipping',
      trigger: { type: 'event', topic: 'order.placed' },
      actions: [{ type: 'set_fact', key: 'shipping.fired', value: true }],
    }));

    // Disable only billing
    engine.disableGroup('billing');

    await engine.emit('order.placed');

    expect(engine.getFact('billing.fired')).toBeUndefined();
    expect(engine.getFact('shipping.fired')).toBe(true);
  });

  it('deleting group with no rules succeeds', () => {
    engine.createGroup({ id: 'empty', name: 'Empty' });
    expect(engine.deleteGroup('empty')).toBe(true);
    expect(engine.getGroup('empty')).toBeUndefined();
  });

  it('group affects fact-triggered rules', async () => {
    engine.createGroup({ id: 'g', name: 'G' });
    engine.registerRule(makeRule({
      id: 'fact-rule',
      group: 'g',
      trigger: { type: 'fact', pattern: 'temperature' },
      actions: [{ type: 'set_fact', key: 'alert.sent', value: true }],
    }));

    engine.disableGroup('g');
    await engine.setFact('temperature', 100);
    expect(engine.getFact('alert.sent')).toBeUndefined();

    engine.enableGroup('g');
    await engine.setFact('temperature', 101);
    expect(engine.getFact('alert.sent')).toBe(true);
  });
});
