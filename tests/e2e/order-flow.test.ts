import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';
import type { Event } from '../../src/types/event';

/**
 * E2E testy pro kompletní objednávkový flow.
 *
 * Testuje reálný scénář e-commerce:
 * 1. Vytvoření objednávky a nastavení stavu
 * 2. Zpracování platby a řetězení eventů
 * 3. Zrušení objednávky a refund flow
 * 4. Validace podmínek
 *
 * Pozn: Timer expiration je testována v rule-execution.test.ts.
 * Tyto testy se zaměřují na kompletní flow bez čekání na timeout.
 */
describe('Order Flow E2E', () => {
  let engine: RuleEngine;

  const createOrderRules = (): RuleInput[] => [
    // 1. Při vytvoření objednávky nastavit stav a timer
    {
      id: 'order-created-init',
      name: 'Initialize Order',
      priority: 100,
      enabled: true,
      tags: ['order', 'init'],
      trigger: { type: 'event', topic: 'order.created' },
      conditions: [],
      actions: [
        { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'pending_payment' },
        { type: 'set_fact', key: 'order:${event.orderId}:customerId', value: { ref: 'event.customerId' } },
        { type: 'set_fact', key: 'order:${event.orderId}:amount', value: { ref: 'event.amount' } },
        { type: 'set_fact', key: 'order:${event.orderId}:createdAt', value: { ref: 'event.timestamp' } },
        {
          type: 'set_timer',
          timer: {
            name: 'payment-timeout:${event.orderId}',
            duration: '15m',
            onExpire: {
              topic: 'order.payment_timeout',
              data: {
                orderId: { ref: 'event.orderId' },
                customerId: { ref: 'event.customerId' }
              }
            }
          }
        }
      ]
    },

    // 2. Při přijetí platby zrušit timer a aktualizovat stav
    {
      id: 'payment-received',
      name: 'Handle Payment',
      priority: 100,
      enabled: true,
      tags: ['order', 'payment'],
      trigger: { type: 'event', topic: 'payment.confirmed' },
      conditions: [
        { source: { type: 'fact', pattern: 'order:${event.orderId}:status' }, operator: 'eq', value: 'pending_payment' }
      ],
      actions: [
        { type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' },
        { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'paid' },
        { type: 'set_fact', key: 'order:${event.orderId}:paidAt', value: { ref: 'event.timestamp' } },
        { type: 'set_fact', key: 'order:${event.orderId}:paymentId', value: { ref: 'event.paymentId' } },
        {
          type: 'emit_event',
          topic: 'order.paid',
          data: {
            orderId: { ref: 'event.orderId' },
            customerId: { ref: 'event.customerId' },
            amount: { ref: 'event.amount' }
          }
        }
      ]
    },

    // 3. Při zaplacení objednávky naplánovat expedici
    {
      id: 'schedule-shipment',
      name: 'Schedule Shipment',
      priority: 50,
      enabled: true,
      tags: ['order', 'shipment'],
      trigger: { type: 'event', topic: 'order.paid' },
      conditions: [],
      actions: [
        { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'processing' },
        {
          type: 'set_timer',
          timer: {
            name: 'shipment-ready:${event.orderId}',
            duration: '2h',
            onExpire: {
              topic: 'order.ready_for_shipment',
              data: {
                orderId: { ref: 'event.orderId' },
                customerId: { ref: 'event.customerId' }
              }
            }
          }
        }
      ]
    },

    // 4. Expedice objednávky (manuálně spuštěná)
    {
      id: 'ship-order',
      name: 'Ship Order',
      priority: 100,
      enabled: true,
      tags: ['order', 'shipment'],
      trigger: { type: 'event', topic: 'order.ship' },
      conditions: [
        { source: { type: 'fact', pattern: 'order:${event.orderId}:status' }, operator: 'eq', value: 'processing' }
      ],
      actions: [
        { type: 'cancel_timer', name: 'shipment-ready:${event.orderId}' },
        { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'shipped' },
        { type: 'set_fact', key: 'order:${event.orderId}:shippedAt', value: { ref: 'event.timestamp' } },
        {
          type: 'emit_event',
          topic: 'order.shipped',
          data: {
            orderId: { ref: 'event.orderId' },
            customerId: { ref: 'event.customerId' }
          }
        }
      ]
    },

    // 5. Manuální zrušení objednávky zákazníkem
    {
      id: 'customer-cancel',
      name: 'Customer Cancellation',
      priority: 100,
      enabled: true,
      tags: ['order', 'cancel'],
      trigger: { type: 'event', topic: 'order.cancel_requested' },
      conditions: [
        { source: { type: 'fact', pattern: 'order:${event.orderId}:status' }, operator: 'in', value: ['pending_payment', 'paid', 'processing'] }
      ],
      actions: [
        { type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' },
        { type: 'cancel_timer', name: 'shipment-ready:${event.orderId}' },
        { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'cancelled' },
        { type: 'set_fact', key: 'order:${event.orderId}:cancelledAt', value: { ref: 'event.timestamp' } },
        { type: 'set_fact', key: 'order:${event.orderId}:cancelReason', value: 'customer_request' },
        {
          type: 'emit_event',
          topic: 'order.cancelled',
          data: {
            orderId: { ref: 'event.orderId' },
            reason: 'customer_request'
          }
        }
      ]
    },

    // 6. Refund pro zrušené zaplacené objednávky
    {
      id: 'process-refund',
      name: 'Process Refund',
      priority: 90,
      enabled: true,
      tags: ['order', 'refund'],
      trigger: { type: 'event', topic: 'order.cancelled' },
      conditions: [
        { source: { type: 'fact', pattern: 'order:${event.orderId}:paymentId' }, operator: 'exists', value: null }
      ],
      actions: [
        { type: 'set_fact', key: 'order:${event.orderId}:refundStatus', value: 'pending' },
        {
          type: 'emit_event',
          topic: 'refund.requested',
          data: {
            orderId: { ref: 'event.orderId' },
            paymentId: { ref: 'fact.order:${event.orderId}:paymentId' }
          }
        }
      ]
    },

    // 7. VIP zákazník dostane extra benefity
    {
      id: 'vip-benefits',
      name: 'VIP Benefits',
      priority: 80,
      enabled: true,
      tags: ['order', 'vip'],
      trigger: { type: 'event', topic: 'order.paid' },
      conditions: [
        { source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' }, operator: 'eq', value: 'vip' }
      ],
      actions: [
        { type: 'set_fact', key: 'order:${event.orderId}:vipDiscount', value: 10 },
        {
          type: 'emit_event',
          topic: 'vip.benefit_applied',
          data: {
            orderId: { ref: 'event.orderId' },
            customerId: { ref: 'event.customerId' },
            benefit: 'discount'
          }
        }
      ]
    }
  ];

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'order-flow-test' });
    for (const rule of createOrderRules()) {
      engine.registerRule(rule);
    }
  });

  afterEach(async () => {
    await engine.stop();
  });

  describe('order creation', () => {
    it('initializes order with correct status and facts', async () => {
      await engine.emit('order.created', {
        orderId: 'ord-001',
        customerId: 'cust-123',
        amount: 1500,
        timestamp: 1704067200000
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
      expect(engine.getFact('order:ord-c:customerId')).toBe('cust-1');
    });
  });

  describe('payment processing', () => {
    it('processes payment and updates order status', async () => {
      await engine.emit('order.created', {
        orderId: 'ord-pay',
        customerId: 'cust-123',
        amount: 1000
      });

      expect(engine.getFact('order:ord-pay:status')).toBe('pending_payment');

      await engine.emit('payment.confirmed', {
        orderId: 'ord-pay',
        customerId: 'cust-123',
        amount: 1000,
        paymentId: 'pay-xyz',
        timestamp: 1704067300000
      });

      expect(engine.getFact('order:ord-pay:status')).toBe('processing');
      expect(engine.getFact('order:ord-pay:paymentId')).toBe('pay-xyz');
      expect(engine.getFact('order:ord-pay:paidAt')).toBe(1704067300000);
      // Payment timer should be cancelled
      expect(engine.getTimer('payment-timeout:ord-pay')).toBeUndefined();
      // Shipment timer should be set
      expect(engine.getTimer('shipment-ready:ord-pay')).toBeDefined();
    });

    it('emits order.paid event on successful payment', async () => {
      const events: Event[] = [];
      engine.subscribe('order.paid', (event) => events.push(event));

      await engine.emit('order.created', {
        orderId: 'ord-event',
        customerId: 'cust-456',
        amount: 500
      });

      await engine.emit('payment.confirmed', {
        orderId: 'ord-event',
        customerId: 'cust-456',
        amount: 500,
        paymentId: 'pay-abc'
      });

      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('order.paid');
      expect(events[0].data.orderId).toBe('ord-event');
      expect(events[0].data.customerId).toBe('cust-456');
      expect(events[0].data.amount).toBe(500);
    });

    it('rejects duplicate payment (condition not met)', async () => {
      await engine.emit('order.created', {
        orderId: 'ord-dup',
        customerId: 'cust-dup',
        amount: 999
      });

      await engine.emit('payment.confirmed', {
        orderId: 'ord-dup',
        customerId: 'cust-dup',
        amount: 999,
        paymentId: 'pay-first'
      });

      expect(engine.getFact('order:ord-dup:paymentId')).toBe('pay-first');

      // Second payment should be rejected (status is no longer pending_payment)
      await engine.emit('payment.confirmed', {
        orderId: 'ord-dup',
        customerId: 'cust-dup',
        amount: 999,
        paymentId: 'pay-second'
      });

      // Original payment ID should remain
      expect(engine.getFact('order:ord-dup:paymentId')).toBe('pay-first');
    });

    it('rejects payment for non-existent order', async () => {
      await engine.emit('payment.confirmed', {
        orderId: 'ord-ghost',
        customerId: 'cust-ghost',
        amount: 500,
        paymentId: 'pay-ghost'
      });

      expect(engine.getFact('order:ord-ghost:status')).toBeUndefined();
      expect(engine.getFact('order:ord-ghost:paymentId')).toBeUndefined();
    });
  });

  describe('order shipment', () => {
    it('ships order and updates status', async () => {
      await engine.emit('order.created', { orderId: 'ord-ship', customerId: 'cust-1', amount: 100 });
      await engine.emit('payment.confirmed', { orderId: 'ord-ship', customerId: 'cust-1', amount: 100, paymentId: 'pay-1' });

      expect(engine.getFact('order:ord-ship:status')).toBe('processing');

      await engine.emit('order.ship', {
        orderId: 'ord-ship',
        customerId: 'cust-1',
        timestamp: 1704070000000
      });

      expect(engine.getFact('order:ord-ship:status')).toBe('shipped');
      expect(engine.getFact('order:ord-ship:shippedAt')).toBe(1704070000000);
      expect(engine.getTimer('shipment-ready:ord-ship')).toBeUndefined();
    });

    it('emits order.shipped event', async () => {
      const events: Event[] = [];
      engine.subscribe('order.shipped', (event) => events.push(event));

      await engine.emit('order.created', { orderId: 'ord-ship-ev', customerId: 'cust-1', amount: 100 });
      await engine.emit('payment.confirmed', { orderId: 'ord-ship-ev', customerId: 'cust-1', amount: 100, paymentId: 'pay-1' });
      await engine.emit('order.ship', { orderId: 'ord-ship-ev', customerId: 'cust-1' });

      expect(events).toHaveLength(1);
      expect(events[0].data.orderId).toBe('ord-ship-ev');
    });

    it('cannot ship unpaid order', async () => {
      await engine.emit('order.created', { orderId: 'ord-unpaid', customerId: 'cust-1', amount: 100 });

      await engine.emit('order.ship', { orderId: 'ord-unpaid', customerId: 'cust-1' });

      // Status should still be pending_payment
      expect(engine.getFact('order:ord-unpaid:status')).toBe('pending_payment');
    });
  });

  describe('order cancellation', () => {
    it('cancels pending order', async () => {
      const cancelEvents: Event[] = [];
      engine.subscribe('order.cancelled', (event) => cancelEvents.push(event));

      await engine.emit('order.created', { orderId: 'ord-cancel', customerId: 'cust-1', amount: 100 });

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-cancel',
        customerId: 'cust-1'
      });

      expect(engine.getFact('order:ord-cancel:status')).toBe('cancelled');
      expect(engine.getFact('order:ord-cancel:cancelReason')).toBe('customer_request');
      expect(engine.getTimer('payment-timeout:ord-cancel')).toBeUndefined();

      expect(cancelEvents).toHaveLength(1);
      expect(cancelEvents[0].data.reason).toBe('customer_request');
    });

    it('cancels paid order and triggers refund', async () => {
      const refundEvents: Event[] = [];
      engine.subscribe('refund.requested', (event) => refundEvents.push(event));

      await engine.emit('order.created', { orderId: 'ord-refund', customerId: 'cust-1', amount: 500 });
      await engine.emit('payment.confirmed', { orderId: 'ord-refund', customerId: 'cust-1', amount: 500, paymentId: 'pay-refund' });

      expect(engine.getFact('order:ord-refund:status')).toBe('processing');

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-refund',
        customerId: 'cust-1'
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
        customerId: 'cust-1'
      });

      // Should still be shipped
      expect(engine.getFact('order:ord-shipped:status')).toBe('shipped');
    });

    it('does not trigger refund for unpaid cancelled order', async () => {
      const refundEvents: Event[] = [];
      engine.subscribe('refund.requested', (event) => refundEvents.push(event));

      await engine.emit('order.created', { orderId: 'ord-no-refund', customerId: 'cust-1', amount: 100 });

      await engine.emit('order.cancel_requested', {
        orderId: 'ord-no-refund',
        customerId: 'cust-1'
      });

      expect(engine.getFact('order:ord-no-refund:status')).toBe('cancelled');
      expect(engine.getFact('order:ord-no-refund:refundStatus')).toBeUndefined();

      // No refund should be requested
      expect(refundEvents).toHaveLength(0);
    });
  });

  describe('VIP customer benefits', () => {
    it('applies VIP discount when customer tier is vip', async () => {
      const benefitEvents: Event[] = [];
      engine.subscribe('vip.benefit_applied', (event) => benefitEvents.push(event));

      // Set customer as VIP
      await engine.setFact('customer:cust-vip:tier', 'vip');

      await engine.emit('order.created', { orderId: 'ord-vip', customerId: 'cust-vip', amount: 1000 });
      await engine.emit('payment.confirmed', { orderId: 'ord-vip', customerId: 'cust-vip', amount: 1000, paymentId: 'pay-vip' });

      expect(engine.getFact('order:ord-vip:vipDiscount')).toBe(10);
      expect(benefitEvents).toHaveLength(1);
      expect(benefitEvents[0].data.benefit).toBe('discount');
    });

    it('does not apply VIP discount for regular customers', async () => {
      const benefitEvents: Event[] = [];
      engine.subscribe('vip.benefit_applied', (event) => benefitEvents.push(event));

      // Set customer as regular
      await engine.setFact('customer:cust-reg:tier', 'regular');

      await engine.emit('order.created', { orderId: 'ord-reg', customerId: 'cust-reg', amount: 1000 });
      await engine.emit('payment.confirmed', { orderId: 'ord-reg', customerId: 'cust-reg', amount: 1000, paymentId: 'pay-reg' });

      expect(engine.getFact('order:ord-reg:vipDiscount')).toBeUndefined();
      expect(benefitEvents).toHaveLength(0);
    });
  });

  describe('complete order lifecycle', () => {
    it('processes full order: create -> pay -> ship', async () => {
      const allEvents: Event[] = [];
      engine.subscribe('*', (event) => allEvents.push(event));

      // Create
      await engine.emit('order.created', {
        orderId: 'ord-full',
        customerId: 'cust-full',
        amount: 2500
      });

      expect(engine.getFact('order:ord-full:status')).toBe('pending_payment');

      // Pay
      await engine.emit('payment.confirmed', {
        orderId: 'ord-full',
        customerId: 'cust-full',
        amount: 2500,
        paymentId: 'pay-full'
      });

      expect(engine.getFact('order:ord-full:status')).toBe('processing');

      // Ship
      await engine.emit('order.ship', {
        orderId: 'ord-full',
        customerId: 'cust-full'
      });

      expect(engine.getFact('order:ord-full:status')).toBe('shipped');

      // Verify event chain
      const topics = allEvents.map(e => e.topic);
      expect(topics).toContain('order.created');
      expect(topics).toContain('payment.confirmed');
      expect(topics).toContain('order.paid');
      expect(topics).toContain('order.ship');
      expect(topics).toContain('order.shipped');
    });

    it('processes order with cancellation: create -> pay -> cancel -> refund', async () => {
      const allEvents: Event[] = [];
      engine.subscribe('*', (event) => allEvents.push(event));

      // Create
      await engine.emit('order.created', {
        orderId: 'ord-cancel-flow',
        customerId: 'cust-cancel',
        amount: 1500
      });

      // Pay
      await engine.emit('payment.confirmed', {
        orderId: 'ord-cancel-flow',
        customerId: 'cust-cancel',
        amount: 1500,
        paymentId: 'pay-cancel-flow'
      });

      expect(engine.getFact('order:ord-cancel-flow:status')).toBe('processing');

      // Cancel
      await engine.emit('order.cancel_requested', {
        orderId: 'ord-cancel-flow',
        customerId: 'cust-cancel'
      });

      expect(engine.getFact('order:ord-cancel-flow:status')).toBe('cancelled');
      expect(engine.getFact('order:ord-cancel-flow:refundStatus')).toBe('pending');

      // Verify event chain
      const topics = allEvents.map(e => e.topic);
      expect(topics).toContain('order.cancelled');
      expect(topics).toContain('refund.requested');
    });
  });

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
});
