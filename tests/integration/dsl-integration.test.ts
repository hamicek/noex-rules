import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import { Rule, onEvent, event, fact, emit, setFact, ref } from '../../src/dsl';

describe('DSL Integration', () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = await RuleEngine.start();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it('executes DSL-defined rule on event match', async () => {
    const rule = Rule.create('simple-rule')
      .name('Simple Rule')
      .when(onEvent('test.input'))
      .then(emit('test.output', { received: true }))
      .build();

    engine.registerRule(rule);

    const events: unknown[] = [];
    engine.subscribe('test.output', (e) => events.push(e));

    await engine.emit('test.input', {});

    expect(events).toHaveLength(1);
    expect((events[0] as { data: { received: boolean } }).data.received).toBe(true);
  });

  it('evaluates conditions correctly', async () => {
    const rule = Rule.create('conditional-rule')
      .when(onEvent('order.created'))
      .if(event('amount').gte(100))
      .then(emit('order.large', { orderId: ref('event.orderId') }))
      .build();

    engine.registerRule(rule);

    const events: unknown[] = [];
    engine.subscribe('order.large', (e) => events.push(e));

    // Should not trigger - amount too low
    await engine.emit('order.created', { orderId: 'ORD-1', amount: 50 });
    expect(events).toHaveLength(0);

    // Should trigger - amount meets threshold
    await engine.emit('order.created', { orderId: 'ORD-2', amount: 150 });
    expect(events).toHaveLength(1);
    expect((events[0] as { data: { orderId: string } }).data.orderId).toBe('ORD-2');
  });

  it('evaluates multiple conditions with AND logic', async () => {
    const rule = Rule.create('multi-condition')
      .when(onEvent('payment.received'))
      .if(event('amount').gte(100))
      .and(event('currency').eq('USD'))
      .then(emit('payment.valid'))
      .build();

    engine.registerRule(rule);

    const events: unknown[] = [];
    engine.subscribe('payment.valid', (e) => events.push(e));

    // Missing currency condition
    await engine.emit('payment.received', { amount: 200, currency: 'EUR' });
    expect(events).toHaveLength(0);

    // Missing amount condition
    await engine.emit('payment.received', { amount: 50, currency: 'USD' });
    expect(events).toHaveLength(0);

    // Both conditions met
    await engine.emit('payment.received', { amount: 200, currency: 'USD' });
    expect(events).toHaveLength(1);
  });

  it('executes multiple actions', async () => {
    const rule = Rule.create('multi-action')
      .when(onEvent('user.registered'))
      .then(emit('welcome.send', { userId: ref('event.userId') }))
      .also(setFact('user:${event.userId}:registered', true))
      .build();

    engine.registerRule(rule);

    const events: unknown[] = [];
    engine.subscribe('welcome.send', (e) => events.push(e));

    await engine.emit('user.registered', { userId: 'U-123' });

    expect(events).toHaveLength(1);
    expect((events[0] as { data: { userId: string } }).data.userId).toBe('U-123');

    // Verify fact was set
    const factValue = engine.getFact('user:U-123:registered');
    expect(factValue).toBe(true);
  });

  it('uses fact values in conditions', async () => {
    // Set up initial fact
    engine.setFact('threshold', 100);

    const rule = Rule.create('fact-condition')
      .when(onEvent('check.value'))
      .if(event('value').gte(ref('fact.threshold')))
      .then(emit('check.passed'))
      .build();

    engine.registerRule(rule);

    const events: unknown[] = [];
    engine.subscribe('check.passed', (e) => events.push(e));

    // Below threshold
    await engine.emit('check.value', { value: 50 });
    expect(events).toHaveLength(0);

    // Above threshold
    await engine.emit('check.value', { value: 150 });
    expect(events).toHaveLength(1);
  });

  it('respects rule priority', async () => {
    const executionOrder: string[] = [];

    const lowPriority = Rule.create('low-priority')
      .priority(10)
      .when(onEvent('test.trigger'))
      .then(emit('low.executed'))
      .build();

    const highPriority = Rule.create('high-priority')
      .priority(100)
      .when(onEvent('test.trigger'))
      .then(emit('high.executed'))
      .build();

    engine.registerRule(lowPriority);
    engine.registerRule(highPriority);

    engine.subscribe('low.executed', () => executionOrder.push('low'));
    engine.subscribe('high.executed', () => executionOrder.push('high'));

    await engine.emit('test.trigger', {});

    // High priority should execute first
    expect(executionOrder[0]).toBe('high');
    expect(executionOrder[1]).toBe('low');
  });

  it('respects enabled flag', async () => {
    const disabledRule = Rule.create('disabled-rule')
      .enabled(false)
      .when(onEvent('test.trigger'))
      .then(emit('should.not.happen'))
      .build();

    engine.registerRule(disabledRule);

    const events: unknown[] = [];
    engine.subscribe('should.not.happen', (e) => events.push(e));

    await engine.emit('test.trigger', {});

    expect(events).toHaveLength(0);
  });

  it('handles complex rule with all features', async () => {
    const rule = Rule.create('complex-order-rule')
      .name('Complex Order Processing')
      .description('Processes large VIP orders')
      .priority(50)
      .tags('orders', 'vip', 'priority')
      .when(onEvent('order.placed'))
      .if(event('total').gte(1000))
      .and(event('customer.tier').eq('vip'))
      .then(emit('order.priority', {
        orderId: ref('event.orderId'),
        expedited: true,
      }))
      .also(setFact('order:${event.orderId}:priority', 'high'))
      .build();

    engine.registerRule(rule);

    const events: unknown[] = [];
    engine.subscribe('order.priority', (e) => events.push(e));

    // Non-VIP order - should not trigger
    await engine.emit('order.placed', {
      orderId: 'ORD-1',
      total: 2000,
      customer: { tier: 'standard' },
    });
    expect(events).toHaveLength(0);

    // Small VIP order - should not trigger
    await engine.emit('order.placed', {
      orderId: 'ORD-2',
      total: 500,
      customer: { tier: 'vip' },
    });
    expect(events).toHaveLength(0);

    // Large VIP order - should trigger
    await engine.emit('order.placed', {
      orderId: 'ORD-3',
      total: 2000,
      customer: { tier: 'vip' },
    });
    expect(events).toHaveLength(1);

    const emittedEvent = events[0] as { data: { orderId: string; expedited: boolean } };
    expect(emittedEvent.data.orderId).toBe('ORD-3');
    expect(emittedEvent.data.expedited).toBe(true);

    // Verify fact was set with interpolated key
    expect(engine.getFact('order:ORD-3:priority')).toBe('high');
  });
});
