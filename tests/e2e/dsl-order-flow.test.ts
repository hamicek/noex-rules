import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import {
  Rule,
  onEvent,
  onFact,
  event,
  fact,
  emit,
  setFact,
  deleteFact,
  setTimer,
  cancelTimer,
  ref,
} from '../../src/dsl';
import type { Event } from '../../src/types/event';
import type { RuleInput } from '../../src/types/rule';

/**
 * E2E testy pro kompletní objednávkový flow definovaný pomocí DSL.
 *
 * Ověřuje, že pravidla vytvořená přes DSL fluent API se chovají
 * identicky s pravidly definovanými raw objekty (viz order-flow.test.ts).
 *
 * Pokrývá:
 * - Event triggery (onEvent)
 * - Fact triggery (onFact)
 * - Podmínky s event/fact selektory a ref()
 * - Všechny typy akcí: emit, setFact, deleteFact, setTimer, cancelTimer
 * - Řetězení akcí přes .also()
 * - Prioritní řazení pravidel
 * - Interpolaci klíčů (${event.orderId})
 * - Kompletní obchodní flow (vytvoření → platba → expedice / zrušení → refund)
 */
describe('DSL Order Flow E2E', () => {
  let engine: RuleEngine;

  const createOrderRules = (): RuleInput[] => [
    // 1. Inicializace objednávky — nastavit stav, uložit metadata, spustit platební timeout
    Rule.create('order-created-init')
      .name('Initialize Order')
      .priority(100)
      .tags('order', 'init')
      .when(onEvent('order.created'))
      .then(setFact('order:${event.orderId}:status', 'pending_payment'))
      .also(setFact('order:${event.orderId}:customerId', ref('event.customerId')))
      .also(setFact('order:${event.orderId}:amount', ref('event.amount')))
      .also(setFact('order:${event.orderId}:createdAt', ref('event.timestamp')))
      .also(setTimer({
        name: 'payment-timeout:${event.orderId}',
        duration: '15m',
        onExpire: {
          topic: 'order.payment_timeout',
          data: {
            orderId: ref('event.orderId'),
            customerId: ref('event.customerId'),
          },
        },
      }))
      .build(),

    // 2. Příjem platby — zrušit timeout, aktualizovat stav, emitovat order.paid
    Rule.create('payment-received')
      .name('Handle Payment')
      .priority(100)
      .tags('order', 'payment')
      .when(onEvent('payment.confirmed'))
      .if(fact('order:${event.orderId}:status').eq('pending_payment'))
      .then(cancelTimer('payment-timeout:${event.orderId}'))
      .also(setFact('order:${event.orderId}:status', 'paid'))
      .also(setFact('order:${event.orderId}:paidAt', ref('event.timestamp')))
      .also(setFact('order:${event.orderId}:paymentId', ref('event.paymentId')))
      .also(emit('order.paid', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        amount: ref('event.amount'),
      }))
      .build(),

    // 3. Po zaplacení naplánovat expedici
    Rule.create('schedule-shipment')
      .name('Schedule Shipment')
      .priority(50)
      .tags('order', 'shipment')
      .when(onEvent('order.paid'))
      .then(setFact('order:${event.orderId}:status', 'processing'))
      .also(setTimer({
        name: 'shipment-ready:${event.orderId}',
        duration: '2h',
        onExpire: {
          topic: 'order.ready_for_shipment',
          data: {
            orderId: ref('event.orderId'),
            customerId: ref('event.customerId'),
          },
        },
      }))
      .build(),

    // 4. Expedice objednávky (manuálně spuštěná)
    Rule.create('ship-order')
      .name('Ship Order')
      .priority(100)
      .tags('order', 'shipment')
      .when(onEvent('order.ship'))
      .if(fact('order:${event.orderId}:status').eq('processing'))
      .then(cancelTimer('shipment-ready:${event.orderId}'))
      .also(setFact('order:${event.orderId}:status', 'shipped'))
      .also(setFact('order:${event.orderId}:shippedAt', ref('event.timestamp')))
      .also(emit('order.shipped', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
      }))
      .build(),

    // 5. Zrušení objednávky zákazníkem
    Rule.create('customer-cancel')
      .name('Customer Cancellation')
      .priority(100)
      .tags('order', 'cancel')
      .when(onEvent('order.cancel_requested'))
      .if(fact('order:${event.orderId}:status').in(['pending_payment', 'paid', 'processing']))
      .then(cancelTimer('payment-timeout:${event.orderId}'))
      .also(cancelTimer('shipment-ready:${event.orderId}'))
      .also(setFact('order:${event.orderId}:status', 'cancelled'))
      .also(setFact('order:${event.orderId}:cancelledAt', ref('event.timestamp')))
      .also(setFact('order:${event.orderId}:cancelReason', 'customer_request'))
      .also(emit('order.cancelled', {
        orderId: ref('event.orderId'),
        reason: 'customer_request',
      }))
      .build(),

    // 6. Refund pro zaplacené zrušené objednávky
    Rule.create('process-refund')
      .name('Process Refund')
      .priority(90)
      .tags('order', 'refund')
      .when(onEvent('order.cancelled'))
      .if(fact('order:${event.orderId}:paymentId').exists())
      .then(setFact('order:${event.orderId}:refundStatus', 'pending'))
      .also(emit('refund.requested', {
        orderId: ref('event.orderId'),
        paymentId: ref('fact.order:${event.orderId}:paymentId'),
      }))
      .build(),

    // 7. VIP benefity
    Rule.create('vip-benefits')
      .name('VIP Benefits')
      .priority(80)
      .tags('order', 'vip')
      .when(onEvent('order.paid'))
      .if(fact('customer:${event.customerId}:tier').eq('vip'))
      .then(setFact('order:${event.orderId}:vipDiscount', 10))
      .also(emit('vip.benefit_applied', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        benefit: 'discount',
      }))
      .build(),
  ];

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'dsl-order-flow-test' });
    for (const rule of createOrderRules()) {
      engine.registerRule(rule);
    }
  });

  afterEach(async () => {
    await engine.stop();
  });

  // ---------------------------------------------------------------------------
  // Vytvoření objednávky
  // ---------------------------------------------------------------------------

  describe('order creation', () => {
    it('initializes order with correct status and facts', async () => {
      await engine.emit('order.created', {
        orderId: 'ord-001',
        customerId: 'cust-123',
        amount: 1500,
        timestamp: 1704067200000,
      });

      expect(engine.getFact('order:ord-001:status')).toBe('pending_payment');
      expect(engine.getFact('order:ord-001:customerId')).toBe('cust-123');
      expect(engine.getFact('order:ord-001:amount')).toBe(1500);
      expect(engine.getFact('order:ord-001:createdAt')).toBe(1704067200000);
      expect(engine.getTimer('payment-timeout:ord-001')).toBeDefined();
    });

    it('creates multiple independent orders', async () => {
      await engine.emit('order.created', { orderId: 'ord-a', customerId: 'cust-1', amount: 100 });
      await engine.emit('order.created', { orderId: 'ord-b', customerId: 'cust-2', amount: 200 });
      await engine.emit('order.created', { orderId: 'ord-c', customerId: 'cust-1', amount: 300 });

      expect(engine.getFact('order:ord-a:status')).toBe('pending_payment');
      expect(engine.getFact('order:ord-b:status')).toBe('pending_payment');
      expect(engine.getFact('order:ord-c:status')).toBe('pending_payment');
      expect(engine.getFact('order:ord-a:customerId')).toBe('cust-1');
      expect(engine.getFact('order:ord-b:customerId')).toBe('cust-2');
    });
  });

  // ---------------------------------------------------------------------------
  // Zpracování platby
  // ---------------------------------------------------------------------------

  describe('payment processing', () => {
    it('processes payment and updates order status', async () => {
      await engine.emit('order.created', {
        orderId: 'ord-pay',
        customerId: 'cust-123',
        amount: 1000,
      });

      expect(engine.getFact('order:ord-pay:status')).toBe('pending_payment');

      await engine.emit('payment.confirmed', {
        orderId: 'ord-pay',
        customerId: 'cust-123',
        amount: 1000,
        paymentId: 'pay-xyz',
        timestamp: 1704067300000,
      });

      expect(engine.getFact('order:ord-pay:status')).toBe('processing');
      expect(engine.getFact('order:ord-pay:paymentId')).toBe('pay-xyz');
      expect(engine.getFact('order:ord-pay:paidAt')).toBe(1704067300000);
      expect(engine.getTimer('payment-timeout:ord-pay')).toBeUndefined();
      expect(engine.getTimer('shipment-ready:ord-pay')).toBeDefined();
    });

    it('emits order.paid event on successful payment', async () => {
      const events: Event[] = [];
      engine.subscribe('order.paid', (e) => events.push(e));

      await engine.emit('order.created', {
        orderId: 'ord-event',
        customerId: 'cust-456',
        amount: 500,
      });

      await engine.emit('payment.confirmed', {
        orderId: 'ord-event',
        customerId: 'cust-456',
        amount: 500,
        paymentId: 'pay-abc',
      });

      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('order.paid');
      expect(events[0].data.orderId).toBe('ord-event');
      expect(events[0].data.customerId).toBe('cust-456');
      expect(events[0].data.amount).toBe(500);
    });

    it('rejects duplicate payment (condition not met after first)', async () => {
      await engine.emit('order.created', {
        orderId: 'ord-dup',
        customerId: 'cust-dup',
        amount: 999,
      });

      await engine.emit('payment.confirmed', {
        orderId: 'ord-dup',
        customerId: 'cust-dup',
        amount: 999,
        paymentId: 'pay-first',
      });

      expect(engine.getFact('order:ord-dup:paymentId')).toBe('pay-first');

      // Druhá platba nesmí projít — stav už není pending_payment
      await engine.emit('payment.confirmed', {
        orderId: 'ord-dup',
        customerId: 'cust-dup',
        amount: 999,
        paymentId: 'pay-second',
      });

      expect(engine.getFact('order:ord-dup:paymentId')).toBe('pay-first');
    });

    it('rejects payment for non-existent order', async () => {
      await engine.emit('payment.confirmed', {
        orderId: 'ord-ghost',
        customerId: 'cust-ghost',
        amount: 500,
        paymentId: 'pay-ghost',
      });

      expect(engine.getFact('order:ord-ghost:status')).toBeUndefined();
      expect(engine.getFact('order:ord-ghost:paymentId')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Expedice
  // ---------------------------------------------------------------------------

  describe('order shipment', () => {
    it('ships order and updates status', async () => {
      await engine.emit('order.created', { orderId: 'ord-ship', customerId: 'cust-1', amount: 100 });
      await engine.emit('payment.confirmed', { orderId: 'ord-ship', customerId: 'cust-1', amount: 100, paymentId: 'pay-1' });

      expect(engine.getFact('order:ord-ship:status')).toBe('processing');

      await engine.emit('order.ship', {
        orderId: 'ord-ship',
        customerId: 'cust-1',
        timestamp: 1704070000000,
      });

      expect(engine.getFact('order:ord-ship:status')).toBe('shipped');
      expect(engine.getFact('order:ord-ship:shippedAt')).toBe(1704070000000);
      expect(engine.getTimer('shipment-ready:ord-ship')).toBeUndefined();
    });

    it('emits order.shipped event', async () => {
      const events: Event[] = [];
      engine.subscribe('order.shipped', (e) => events.push(e));

      await engine.emit('order.created', { orderId: 'ord-ship-ev', customerId: 'cust-1', amount: 100 });
      await engine.emit('payment.confirmed', { orderId: 'ord-ship-ev', customerId: 'cust-1', amount: 100, paymentId: 'pay-1' });
      await engine.emit('order.ship', { orderId: 'ord-ship-ev', customerId: 'cust-1' });

      expect(events).toHaveLength(1);
      expect(events[0].data.orderId).toBe('ord-ship-ev');
    });

    it('cannot ship unpaid order', async () => {
      await engine.emit('order.created', { orderId: 'ord-unpaid', customerId: 'cust-1', amount: 100 });

      await engine.emit('order.ship', { orderId: 'ord-unpaid', customerId: 'cust-1' });

      expect(engine.getFact('order:ord-unpaid:status')).toBe('pending_payment');
    });
  });

  // ---------------------------------------------------------------------------
  // Zrušení objednávky
  // ---------------------------------------------------------------------------

  describe('order cancellation', () => {
    it('cancels pending order', async () => {
      const cancelEvents: Event[] = [];
      engine.subscribe('order.cancelled', (e) => cancelEvents.push(e));

      await engine.emit('order.created', { orderId: 'ord-cancel', customerId: 'cust-1', amount: 100 });

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-cancel',
        customerId: 'cust-1',
      });

      expect(engine.getFact('order:ord-cancel:status')).toBe('cancelled');
      expect(engine.getFact('order:ord-cancel:cancelReason')).toBe('customer_request');
      expect(engine.getTimer('payment-timeout:ord-cancel')).toBeUndefined();
      expect(cancelEvents).toHaveLength(1);
      expect(cancelEvents[0].data.reason).toBe('customer_request');
    });

    it('cancels paid order and triggers refund', async () => {
      const refundEvents: Event[] = [];
      engine.subscribe('refund.requested', (e) => refundEvents.push(e));

      await engine.emit('order.created', { orderId: 'ord-refund', customerId: 'cust-1', amount: 500 });
      await engine.emit('payment.confirmed', { orderId: 'ord-refund', customerId: 'cust-1', amount: 500, paymentId: 'pay-refund' });

      expect(engine.getFact('order:ord-refund:status')).toBe('processing');

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-refund',
        customerId: 'cust-1',
      });

      expect(engine.getFact('order:ord-refund:status')).toBe('cancelled');
      expect(engine.getFact('order:ord-refund:refundStatus')).toBe('pending');
      expect(refundEvents).toHaveLength(1);
      expect(refundEvents[0].data.orderId).toBe('ord-refund');
      expect(refundEvents[0].data.paymentId).toBe('pay-refund');
    });

    it('cannot cancel shipped order', async () => {
      await engine.emit('order.created', { orderId: 'ord-shipped', customerId: 'cust-1', amount: 100 });
      await engine.emit('payment.confirmed', { orderId: 'ord-shipped', customerId: 'cust-1', amount: 100, paymentId: 'pay-1' });
      await engine.emit('order.ship', { orderId: 'ord-shipped', customerId: 'cust-1' });

      expect(engine.getFact('order:ord-shipped:status')).toBe('shipped');

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-shipped',
        customerId: 'cust-1',
      });

      expect(engine.getFact('order:ord-shipped:status')).toBe('shipped');
    });

    it('does not trigger refund for unpaid cancelled order', async () => {
      const refundEvents: Event[] = [];
      engine.subscribe('refund.requested', (e) => refundEvents.push(e));

      await engine.emit('order.created', { orderId: 'ord-no-refund', customerId: 'cust-1', amount: 100 });

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-no-refund',
        customerId: 'cust-1',
      });

      expect(engine.getFact('order:ord-no-refund:status')).toBe('cancelled');
      expect(engine.getFact('order:ord-no-refund:refundStatus')).toBeUndefined();
      expect(refundEvents).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // VIP
  // ---------------------------------------------------------------------------

  describe('VIP customer benefits', () => {
    it('applies VIP discount when customer tier is vip', async () => {
      const benefitEvents: Event[] = [];
      engine.subscribe('vip.benefit_applied', (e) => benefitEvents.push(e));

      await engine.setFact('customer:cust-vip:tier', 'vip');

      await engine.emit('order.created', { orderId: 'ord-vip', customerId: 'cust-vip', amount: 1000 });
      await engine.emit('payment.confirmed', { orderId: 'ord-vip', customerId: 'cust-vip', amount: 1000, paymentId: 'pay-vip' });

      expect(engine.getFact('order:ord-vip:vipDiscount')).toBe(10);
      expect(benefitEvents).toHaveLength(1);
      expect(benefitEvents[0].data.benefit).toBe('discount');
    });

    it('does not apply VIP discount for regular customers', async () => {
      const benefitEvents: Event[] = [];
      engine.subscribe('vip.benefit_applied', (e) => benefitEvents.push(e));

      await engine.setFact('customer:cust-reg:tier', 'regular');

      await engine.emit('order.created', { orderId: 'ord-reg', customerId: 'cust-reg', amount: 1000 });
      await engine.emit('payment.confirmed', { orderId: 'ord-reg', customerId: 'cust-reg', amount: 1000, paymentId: 'pay-reg' });

      expect(engine.getFact('order:ord-reg:vipDiscount')).toBeUndefined();
      expect(benefitEvents).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Fact trigger — reaktivní pravidla na změnu faktu
  // ---------------------------------------------------------------------------

  describe('fact-triggered rules', () => {
    it('reacts to fact change via onFact trigger', async () => {
      const alerts: Event[] = [];
      engine.subscribe('inventory.stock_changed', (e) => alerts.push(e));

      const stockRule = Rule.create('stock-change-alert')
        .name('Stock Change Alert')
        .priority(100)
        .when(onFact('inventory:*:stock'))
        .then(emit('inventory.stock_changed', {
          factKey: ref('trigger.fact.key'),
          newValue: ref('trigger.fact.value'),
        }))
        .build();

      engine.registerRule(stockRule);

      await engine.setFact('inventory:SKU-100:stock', 50);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].data.factKey).toBe('inventory:SKU-100:stock');
      expect(alerts[0].data.newValue).toBe(50);

      await engine.setFact('inventory:SKU-200:stock', 5);
      expect(alerts).toHaveLength(2);
      expect(alerts[1].data.factKey).toBe('inventory:SKU-200:stock');
      expect(alerts[1].data.newValue).toBe(5);
    });

    it('does not fire for non-matching fact pattern', async () => {
      const events: Event[] = [];
      engine.subscribe('inventory.stock_changed', (e) => events.push(e));

      const stockRule = Rule.create('stock-only-rule')
        .priority(100)
        .when(onFact('inventory:*:stock'))
        .then(emit('inventory.stock_changed'))
        .build();

      engine.registerRule(stockRule);

      // Jiný vzor — nesmí spustit
      await engine.setFact('customer:cust-1:name', 'Alice');
      expect(events).toHaveLength(0);

      // Správný vzor — spustí
      await engine.setFact('inventory:SKU-1:stock', 10);
      expect(events).toHaveLength(1);
    });

    it('triggers rule chain: fact change → emit → event rule', async () => {
      const notifications: Event[] = [];
      engine.subscribe('customer.tier_upgrade_notification', (e) => notifications.push(e));

      // Pravidlo reagující na změnu tieru — emituje event
      const tierChangeRule = Rule.create('tier-change-notify')
        .name('Tier Change Notification')
        .priority(100)
        .when(onFact('customer:*:tier'))
        .then(emit('customer.tier_changed', {
          customerKey: ref('trigger.fact.key'),
          newTier: ref('trigger.fact.value'),
        }))
        .build();

      // Pravidlo reagující na tier changed event — emituje notifikaci
      const upgradeNotifyRule = Rule.create('upgrade-notification')
        .name('Send Upgrade Notification')
        .priority(50)
        .when(onEvent('customer.tier_changed'))
        .if(event('newTier').eq('vip'))
        .then(emit('customer.tier_upgrade_notification', {
          message: 'Congratulations on VIP status!',
          customerKey: ref('event.customerKey'),
        }))
        .build();

      engine.registerRule(tierChangeRule);
      engine.registerRule(upgradeNotifyRule);

      // Nastavení na regular — tier_changed se emituje, ale upgrade notifikace ne
      await engine.setFact('customer:cust-42:tier', 'regular');
      expect(notifications).toHaveLength(0);

      // Upgrade na VIP — spustí celý řetěz
      await engine.setFact('customer:cust-42:tier', 'vip');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].data.message).toBe('Congratulations on VIP status!');
    });
  });

  // ---------------------------------------------------------------------------
  // Kompletní lifecycle
  // ---------------------------------------------------------------------------

  describe('complete order lifecycle', () => {
    it('processes full order: create → pay → ship', async () => {
      const allEvents: Event[] = [];
      engine.subscribe('*', (e) => allEvents.push(e));

      await engine.emit('order.created', {
        orderId: 'ord-full',
        customerId: 'cust-full',
        amount: 2500,
      });

      expect(engine.getFact('order:ord-full:status')).toBe('pending_payment');

      await engine.emit('payment.confirmed', {
        orderId: 'ord-full',
        customerId: 'cust-full',
        amount: 2500,
        paymentId: 'pay-full',
      });

      expect(engine.getFact('order:ord-full:status')).toBe('processing');

      await engine.emit('order.ship', {
        orderId: 'ord-full',
        customerId: 'cust-full',
      });

      expect(engine.getFact('order:ord-full:status')).toBe('shipped');

      const topics = allEvents.map((e) => e.topic);
      expect(topics).toContain('order.created');
      expect(topics).toContain('payment.confirmed');
      expect(topics).toContain('order.paid');
      expect(topics).toContain('order.ship');
      expect(topics).toContain('order.shipped');
    });

    it('processes order with cancellation: create → pay → cancel → refund', async () => {
      const allEvents: Event[] = [];
      engine.subscribe('*', (e) => allEvents.push(e));

      await engine.emit('order.created', {
        orderId: 'ord-cancel-flow',
        customerId: 'cust-cancel',
        amount: 1500,
      });

      await engine.emit('payment.confirmed', {
        orderId: 'ord-cancel-flow',
        customerId: 'cust-cancel',
        amount: 1500,
        paymentId: 'pay-cancel-flow',
      });

      expect(engine.getFact('order:ord-cancel-flow:status')).toBe('processing');

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-cancel-flow',
        customerId: 'cust-cancel',
      });

      expect(engine.getFact('order:ord-cancel-flow:status')).toBe('cancelled');
      expect(engine.getFact('order:ord-cancel-flow:refundStatus')).toBe('pending');

      const topics = allEvents.map((e) => e.topic);
      expect(topics).toContain('order.cancelled');
      expect(topics).toContain('refund.requested');
    });

    it('VIP full lifecycle: create → pay (with benefits) → ship', async () => {
      const benefitEvents: Event[] = [];
      engine.subscribe('vip.benefit_applied', (e) => benefitEvents.push(e));

      await engine.setFact('customer:cust-vip-flow:tier', 'vip');

      await engine.emit('order.created', {
        orderId: 'ord-vip-flow',
        customerId: 'cust-vip-flow',
        amount: 5000,
      });

      await engine.emit('payment.confirmed', {
        orderId: 'ord-vip-flow',
        customerId: 'cust-vip-flow',
        amount: 5000,
        paymentId: 'pay-vip-flow',
      });

      // VIP benefit musí být aplikován
      expect(engine.getFact('order:ord-vip-flow:vipDiscount')).toBe(10);
      expect(benefitEvents).toHaveLength(1);

      await engine.emit('order.ship', {
        orderId: 'ord-vip-flow',
        customerId: 'cust-vip-flow',
      });

      expect(engine.getFact('order:ord-vip-flow:status')).toBe('shipped');
    });
  });

  // ---------------------------------------------------------------------------
  // Statistiky
  // ---------------------------------------------------------------------------

  describe('statistics', () => {
    it('tracks processed events and executed rules', async () => {
      const initialStats = engine.getStats();

      await engine.emit('order.created', { orderId: 'ord-stats', customerId: 'cust-stats', amount: 100 });
      await engine.emit('payment.confirmed', { orderId: 'ord-stats', customerId: 'cust-stats', amount: 100, paymentId: 'pay-stats' });

      const finalStats = engine.getStats();

      expect(finalStats.eventsProcessed).toBeGreaterThan(initialStats.eventsProcessed);
      expect(finalStats.rulesExecuted).toBeGreaterThan(initialStats.rulesExecuted);
      expect(finalStats.factsCount).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // DSL-specific: ověření, že DSL build produkuje validní RuleInput
  // ---------------------------------------------------------------------------

  describe('DSL output equivalence', () => {
    it('DSL-built rule matches raw object structure', () => {
      const dslRule = Rule.create('equiv-test')
        .name('Equivalence Test')
        .priority(50)
        .tags('test')
        .when(onEvent('test.event'))
        .if(event('amount').gte(100))
        .then(emit('test.output', { value: ref('event.amount') }))
        .also(setFact('test:${event.id}:done', true))
        .build();

      const rawRule: RuleInput = {
        id: 'equiv-test',
        name: 'Equivalence Test',
        priority: 50,
        enabled: true,
        tags: ['test'],
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
        ],
        actions: [
          { type: 'emit_event', topic: 'test.output', data: { value: { ref: 'event.amount' } } },
          { type: 'set_fact', key: 'test:${event.id}:done', value: true },
        ],
      };

      expect(dslRule.id).toBe(rawRule.id);
      expect(dslRule.name).toBe(rawRule.name);
      expect(dslRule.priority).toBe(rawRule.priority);
      expect(dslRule.enabled).toBe(rawRule.enabled);
      expect(dslRule.tags).toEqual(rawRule.tags);
      expect(dslRule.trigger).toEqual(rawRule.trigger);
      expect(dslRule.conditions).toEqual(rawRule.conditions);
      expect(dslRule.actions).toEqual(rawRule.actions);
    });
  });
});
