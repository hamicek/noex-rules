import { describe, it, expect } from 'vitest';
import type { RuleInput } from '../../../src/types/rule';
import {
  Rule,
  onEvent,
  onFact,
  onTimer,
  sequence,
  absence,
  count,
  aggregate,
  event,
  fact,
  context,
  emit,
  setFact,
  deleteFact,
  setTimer,
  cancelTimer,
  callService,
  log,
  ref,
} from '../../../src/dsl';

/**
 * Migration examples: raw objects vs DSL.
 *
 * Each test verifies that the DSL builder produces an identical
 * RuleInput to the hand-written raw object. This guarantees the
 * migration guide examples are accurate.
 */
describe('Migration Examples', () => {
  describe('Triggers', () => {
    it('event trigger', () => {
      const raw: RuleInput = {
        id: 'evt-trigger',
        name: 'evt-trigger',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'order.processed', data: {} }],
      };

      const dsl = Rule.create('evt-trigger')
        .when(onEvent('order.created'))
        .then(emit('order.processed'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('fact trigger', () => {
      const raw: RuleInput = {
        id: 'fact-trigger',
        name: 'fact-trigger',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'fact', pattern: 'customer:*:totalSpent' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'check.done', data: {} }],
      };

      const dsl = Rule.create('fact-trigger')
        .when(onFact('customer:*:totalSpent'))
        .then(emit('check.done'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('timer trigger', () => {
      const raw: RuleInput = {
        id: 'timer-trigger',
        name: 'timer-trigger',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'timer', name: 'payment-timeout:*' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'timeout.fired', data: {} }],
      };

      const dsl = Rule.create('timer-trigger')
        .when(onTimer('payment-timeout:*'))
        .then(emit('timeout.fired'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('sequence temporal trigger', () => {
      const raw: RuleInput = {
        id: 'seq-trigger',
        name: 'seq-trigger',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'auth.login_failed' },
              { topic: 'auth.login_failed' },
              { topic: 'auth.login_failed' },
            ],
            within: '5m',
            groupBy: 'data.userId',
          },
        },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'security.alert', data: {} }],
      };

      const dsl = Rule.create('seq-trigger')
        .when(
          sequence()
            .event('auth.login_failed')
            .event('auth.login_failed')
            .event('auth.login_failed')
            .within('5m')
            .groupBy('data.userId'),
        )
        .then(emit('security.alert'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('absence temporal trigger', () => {
      const raw: RuleInput = {
        id: 'absence-trigger',
        name: 'absence-trigger',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'absence',
            after: { topic: 'order.created' },
            expected: { topic: 'payment.received' },
            within: '15m',
            groupBy: 'orderId',
          },
        },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'order.timeout', data: {} }],
      };

      const dsl = Rule.create('absence-trigger')
        .when(
          absence()
            .after('order.created')
            .expected('payment.received')
            .within('15m')
            .groupBy('orderId'),
        )
        .then(emit('order.timeout'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('count temporal trigger', () => {
      const raw: RuleInput = {
        id: 'count-trigger',
        name: 'count-trigger',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'count',
            event: { topic: 'error.*', filter: { severity: 'critical' } },
            threshold: 10,
            comparison: 'gte',
            window: '1m',
            sliding: true,
          },
        },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'alert.critical', data: {} }],
      };

      const dsl = Rule.create('count-trigger')
        .when(
          count()
            .event('error.*', { severity: 'critical' })
            .threshold(10)
            .comparison('gte')
            .window('1m')
            .sliding(),
        )
        .then(emit('alert.critical'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('aggregate temporal trigger', () => {
      const raw: RuleInput = {
        id: 'agg-trigger',
        name: 'agg-trigger',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'aggregate',
            event: { topic: 'transaction.completed' },
            field: 'data.amount',
            function: 'sum',
            threshold: 10000,
            comparison: 'gte',
            window: '1h',
            groupBy: 'data.accountId',
          },
        },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'limit.reached', data: {} }],
      };

      const dsl = Rule.create('agg-trigger')
        .when(
          aggregate()
            .event('transaction.completed')
            .field('data.amount')
            .function('sum')
            .threshold(10000)
            .comparison('gte')
            .window('1h')
            .groupBy('data.accountId'),
        )
        .then(emit('limit.reached'))
        .build();

      expect(dsl).toEqual(raw);
    });
  });

  describe('Conditions', () => {
    it('event field equality', () => {
      const raw: RuleInput = {
        id: 'cond-eq',
        name: 'cond-eq',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [
          { source: { type: 'event', field: 'status' }, operator: 'eq', value: 'active' },
        ],
        actions: [{ type: 'emit_event', topic: 'matched', data: {} }],
      };

      const dsl = Rule.create('cond-eq')
        .when(onEvent('test'))
        .if(event('status').eq('active'))
        .then(emit('matched'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('fact pattern with neq', () => {
      const raw: RuleInput = {
        id: 'cond-neq',
        name: 'cond-neq',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
            operator: 'neq',
            value: 'cancelled',
          },
        ],
        actions: [{ type: 'emit_event', topic: 'matched', data: {} }],
      };

      const dsl = Rule.create('cond-neq')
        .when(onEvent('test'))
        .if(fact('order:${event.orderId}:status').neq('cancelled'))
        .then(emit('matched'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('comparison operators (gt, gte, lt, lte)', () => {
      const raw: RuleInput = {
        id: 'cond-cmp',
        name: 'cond-cmp',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
          { source: { type: 'event', field: 'quantity' }, operator: 'lt', value: 50 },
        ],
        actions: [{ type: 'emit_event', topic: 'matched', data: {} }],
      };

      const dsl = Rule.create('cond-cmp')
        .when(onEvent('test'))
        .if(event('amount').gte(100))
        .and(event('quantity').lt(50))
        .then(emit('matched'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('membership operators (in, notIn)', () => {
      const raw: RuleInput = {
        id: 'cond-in',
        name: 'cond-in',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
            operator: 'in',
            value: ['pending_payment', 'paid', 'processing'],
          },
        ],
        actions: [{ type: 'emit_event', topic: 'matched', data: {} }],
      };

      const dsl = Rule.create('cond-in')
        .when(onEvent('test'))
        .if(fact('order:${event.orderId}:status').in(['pending_payment', 'paid', 'processing']))
        .then(emit('matched'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('contains and matches operators', () => {
      const raw: RuleInput = {
        id: 'cond-contains',
        name: 'cond-contains',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [
          { source: { type: 'event', field: 'tags' }, operator: 'contains', value: 'urgent' },
          { source: { type: 'event', field: 'email' }, operator: 'matches', value: '^[a-z]+@example\\.com$' },
        ],
        actions: [{ type: 'emit_event', topic: 'matched', data: {} }],
      };

      const dsl = Rule.create('cond-contains')
        .when(onEvent('test'))
        .if(event('tags').contains('urgent'))
        .and(event('email').matches(/^[a-z]+@example\.com$/))
        .then(emit('matched'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('existence operators', () => {
      const raw: RuleInput = {
        id: 'cond-exists',
        name: 'cond-exists',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'order:${event.orderId}:paymentId' },
            operator: 'exists',
            value: true,
          },
        ],
        actions: [{ type: 'emit_event', topic: 'matched', data: {} }],
      };

      const dsl = Rule.create('cond-exists')
        .when(onEvent('test'))
        .if(fact('order:${event.orderId}:paymentId').exists())
        .then(emit('matched'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('context source with ref value', () => {
      const raw: RuleInput = {
        id: 'cond-ctx',
        name: 'cond-ctx',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [
          {
            source: { type: 'context', key: 'threshold' },
            operator: 'lte',
            value: { ref: 'event.amount' },
          },
        ],
        actions: [{ type: 'emit_event', topic: 'matched', data: {} }],
      };

      const dsl = Rule.create('cond-ctx')
        .when(onEvent('test'))
        .if(context('threshold').lte(ref('event.amount')))
        .then(emit('matched'))
        .build();

      expect(dsl).toEqual(raw);
    });
  });

  describe('Actions', () => {
    it('emit event with ref data', () => {
      const raw: RuleInput = {
        id: 'act-emit',
        name: 'act-emit',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          {
            type: 'emit_event',
            topic: 'notification.send',
            data: {
              orderId: { ref: 'event.orderId' },
              message: 'Order received!',
            },
          },
        ],
      };

      const dsl = Rule.create('act-emit')
        .when(onEvent('test'))
        .then(
          emit('notification.send', {
            orderId: ref('event.orderId'),
            message: 'Order received!',
          }),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('set fact with literal value', () => {
      const raw: RuleInput = {
        id: 'act-setfact',
        name: 'act-setfact',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'paid' },
        ],
      };

      const dsl = Rule.create('act-setfact')
        .when(onEvent('test'))
        .then(setFact('order:${event.orderId}:status', 'paid'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('set fact with ref value', () => {
      const raw: RuleInput = {
        id: 'act-setfact-ref',
        name: 'act-setfact-ref',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'order:${event.orderId}:paidAt', value: { ref: 'event.timestamp' } },
        ],
      };

      const dsl = Rule.create('act-setfact-ref')
        .when(onEvent('test'))
        .then(setFact('order:${event.orderId}:paidAt', ref('event.timestamp')))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('delete fact', () => {
      const raw: RuleInput = {
        id: 'act-delfact',
        name: 'act-delfact',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [{ type: 'delete_fact', key: 'temp:${event.id}' }],
      };

      const dsl = Rule.create('act-delfact')
        .when(onEvent('test'))
        .then(deleteFact('temp:${event.id}'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('set timer with options object', () => {
      const raw: RuleInput = {
        id: 'act-timer',
        name: 'act-timer',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          {
            type: 'set_timer',
            timer: {
              name: 'payment-timeout:${event.orderId}',
              duration: '15m',
              onExpire: {
                topic: 'order.payment_timeout',
                data: { orderId: { ref: 'event.orderId' } },
              },
            },
          },
        ],
      };

      const dsl = Rule.create('act-timer')
        .when(onEvent('test'))
        .then(
          setTimer({
            name: 'payment-timeout:${event.orderId}',
            duration: '15m',
            onExpire: {
              topic: 'order.payment_timeout',
              data: { orderId: ref('event.orderId') },
            },
          }),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('set timer with fluent API', () => {
      const raw: RuleInput = {
        id: 'act-timer-fluent',
        name: 'act-timer-fluent',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          {
            type: 'set_timer',
            timer: {
              name: 'reminder:${event.userId}',
              duration: '24h',
              onExpire: {
                topic: 'user.reminder',
                data: { userId: { ref: 'event.userId' } },
              },
              repeat: {
                interval: '1h',
                maxCount: 3,
              },
            },
          },
        ],
      };

      const dsl = Rule.create('act-timer-fluent')
        .when(onEvent('test'))
        .then(
          setTimer('reminder:${event.userId}')
            .after('24h')
            .emit('user.reminder', { userId: ref('event.userId') })
            .repeat('1h', 3),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('cancel timer', () => {
      const raw: RuleInput = {
        id: 'act-cancel',
        name: 'act-cancel',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          { type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' },
        ],
      };

      const dsl = Rule.create('act-cancel')
        .when(onEvent('test'))
        .then(cancelTimer('payment-timeout:${event.orderId}'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('call service (direct)', () => {
      const raw: RuleInput = {
        id: 'act-svc',
        name: 'act-svc',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          {
            type: 'call_service',
            service: 'emailService',
            method: 'send',
            args: [{ ref: 'event.email' }, 'Welcome!'],
          },
        ],
      };

      const dsl = Rule.create('act-svc')
        .when(onEvent('test'))
        .then(callService('emailService', 'send', [ref('event.email'), 'Welcome!']))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('call service (fluent)', () => {
      const raw: RuleInput = {
        id: 'act-svc-fluent',
        name: 'act-svc-fluent',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          {
            type: 'call_service',
            service: 'paymentService',
            method: 'processRefund',
            args: [{ ref: 'event.orderId' }, { ref: 'event.amount' }],
          },
        ],
      };

      const dsl = Rule.create('act-svc-fluent')
        .when(onEvent('test'))
        .then(
          callService('paymentService')
            .method('processRefund')
            .args(ref('event.orderId'), ref('event.amount')),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('log action', () => {
      const raw: RuleInput = {
        id: 'act-log',
        name: 'act-log',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [
          { type: 'log', level: 'info', message: 'Order ${event.orderId} processed' },
        ],
      };

      const dsl = Rule.create('act-log')
        .when(onEvent('test'))
        .then(log('info', 'Order ${event.orderId} processed'))
        .build();

      expect(dsl).toEqual(raw);
    });
  });

  describe('Builder metadata', () => {
    it('full rule with all metadata', () => {
      const raw: RuleInput = {
        id: 'full-meta',
        name: 'Full Rule',
        description: 'A rule with all metadata fields',
        priority: 100,
        enabled: true,
        tags: ['orders', 'vip'],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 1000 },
        ],
        actions: [
          { type: 'emit_event', topic: 'order.large', data: {} },
        ],
      };

      const dsl = Rule.create('full-meta')
        .name('Full Rule')
        .description('A rule with all metadata fields')
        .priority(100)
        .tags('orders', 'vip')
        .when(onEvent('order.created'))
        .if(event('amount').gte(1000))
        .then(emit('order.large'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('disabled rule', () => {
      const raw: RuleInput = {
        id: 'disabled',
        name: 'disabled',
        priority: 0,
        enabled: false,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'out', data: {} }],
      };

      const dsl = Rule.create('disabled')
        .enabled(false)
        .when(onEvent('test'))
        .then(emit('out'))
        .build();

      expect(dsl).toEqual(raw);
    });
  });

  describe('Real-world: Order flow', () => {
    it('order initialization rule', () => {
      const raw: RuleInput = {
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
          {
            type: 'set_timer',
            timer: {
              name: 'payment-timeout:${event.orderId}',
              duration: '15m',
              onExpire: {
                topic: 'order.payment_timeout',
                data: { orderId: { ref: 'event.orderId' } },
              },
            },
          },
        ],
      };

      const dsl = Rule.create('order-created-init')
        .name('Initialize Order')
        .priority(100)
        .tags('order', 'init')
        .when(onEvent('order.created'))
        .then(setFact('order:${event.orderId}:status', 'pending_payment'))
        .also(setFact('order:${event.orderId}:customerId', ref('event.customerId')))
        .also(setFact('order:${event.orderId}:amount', ref('event.amount')))
        .also(
          setTimer({
            name: 'payment-timeout:${event.orderId}',
            duration: '15m',
            onExpire: {
              topic: 'order.payment_timeout',
              data: { orderId: ref('event.orderId') },
            },
          }),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('payment received rule', () => {
      const raw: RuleInput = {
        id: 'payment-received',
        name: 'Handle Payment',
        priority: 100,
        enabled: true,
        tags: ['order', 'payment'],
        trigger: { type: 'event', topic: 'payment.confirmed' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
            operator: 'eq',
            value: 'pending_payment',
          },
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
              amount: { ref: 'event.amount' },
            },
          },
        ],
      };

      const dsl = Rule.create('payment-received')
        .name('Handle Payment')
        .priority(100)
        .tags('order', 'payment')
        .when(onEvent('payment.confirmed'))
        .if(fact('order:${event.orderId}:status').eq('pending_payment'))
        .then(cancelTimer('payment-timeout:${event.orderId}'))
        .also(setFact('order:${event.orderId}:status', 'paid'))
        .also(setFact('order:${event.orderId}:paidAt', ref('event.timestamp')))
        .also(setFact('order:${event.orderId}:paymentId', ref('event.paymentId')))
        .also(
          emit('order.paid', {
            orderId: ref('event.orderId'),
            customerId: ref('event.customerId'),
            amount: ref('event.amount'),
          }),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('customer cancellation rule', () => {
      const raw: RuleInput = {
        id: 'customer-cancel',
        name: 'Customer Cancellation',
        priority: 100,
        enabled: true,
        tags: ['order', 'cancel'],
        trigger: { type: 'event', topic: 'order.cancel_requested' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
            operator: 'in',
            value: ['pending_payment', 'paid', 'processing'],
          },
        ],
        actions: [
          { type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' },
          { type: 'cancel_timer', name: 'shipment-ready:${event.orderId}' },
          { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'cancelled' },
          { type: 'set_fact', key: 'order:${event.orderId}:cancelReason', value: 'customer_request' },
          {
            type: 'emit_event',
            topic: 'order.cancelled',
            data: {
              orderId: { ref: 'event.orderId' },
              reason: 'customer_request',
            },
          },
        ],
      };

      const dsl = Rule.create('customer-cancel')
        .name('Customer Cancellation')
        .priority(100)
        .tags('order', 'cancel')
        .when(onEvent('order.cancel_requested'))
        .if(fact('order:${event.orderId}:status').in(['pending_payment', 'paid', 'processing']))
        .then(cancelTimer('payment-timeout:${event.orderId}'))
        .also(cancelTimer('shipment-ready:${event.orderId}'))
        .also(setFact('order:${event.orderId}:status', 'cancelled'))
        .also(setFact('order:${event.orderId}:cancelReason', 'customer_request'))
        .also(
          emit('order.cancelled', {
            orderId: ref('event.orderId'),
            reason: 'customer_request',
          }),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('VIP benefits rule', () => {
      const raw: RuleInput = {
        id: 'vip-benefits',
        name: 'VIP Benefits',
        priority: 80,
        enabled: true,
        tags: ['order', 'vip'],
        trigger: { type: 'event', topic: 'order.paid' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
            operator: 'eq',
            value: 'vip',
          },
        ],
        actions: [
          { type: 'set_fact', key: 'order:${event.orderId}:vipDiscount', value: 10 },
          {
            type: 'emit_event',
            topic: 'vip.benefit_applied',
            data: {
              orderId: { ref: 'event.orderId' },
              customerId: { ref: 'event.customerId' },
              benefit: 'discount',
            },
          },
        ],
      };

      const dsl = Rule.create('vip-benefits')
        .name('VIP Benefits')
        .priority(80)
        .tags('order', 'vip')
        .when(onEvent('order.paid'))
        .if(fact('customer:${event.customerId}:tier').eq('vip'))
        .then(setFact('order:${event.orderId}:vipDiscount', 10))
        .also(
          emit('vip.benefit_applied', {
            orderId: ref('event.orderId'),
            customerId: ref('event.customerId'),
            benefit: 'discount',
          }),
        )
        .build();

      expect(dsl).toEqual(raw);
    });

    it('refund processing rule', () => {
      const raw: RuleInput = {
        id: 'process-refund',
        name: 'Process Refund',
        priority: 90,
        enabled: true,
        tags: ['order', 'refund'],
        trigger: { type: 'event', topic: 'order.cancelled' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'order:${event.orderId}:paymentId' },
            operator: 'exists',
            value: true,
          },
        ],
        actions: [
          { type: 'set_fact', key: 'order:${event.orderId}:refundStatus', value: 'pending' },
          {
            type: 'emit_event',
            topic: 'refund.requested',
            data: {
              orderId: { ref: 'event.orderId' },
              paymentId: { ref: 'fact.order:${event.orderId}:paymentId' },
            },
          },
        ],
      };

      const dsl = Rule.create('process-refund')
        .name('Process Refund')
        .priority(90)
        .tags('order', 'refund')
        .when(onEvent('order.cancelled'))
        .if(fact('order:${event.orderId}:paymentId').exists())
        .then(setFact('order:${event.orderId}:refundStatus', 'pending'))
        .also(
          emit('refund.requested', {
            orderId: ref('event.orderId'),
            paymentId: ref('fact.order:${event.orderId}:paymentId'),
          }),
        )
        .build();

      expect(dsl).toEqual(raw);
    });
  });

  describe('Multiple actions and conditions', () => {
    it('rule with multiple conditions (AND logic)', () => {
      const raw: RuleInput = {
        id: 'multi-cond',
        name: 'multi-cond',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.placed' },
        conditions: [
          { source: { type: 'event', field: 'total' }, operator: 'gte', value: 1000 },
          { source: { type: 'event', field: 'customer.tier' }, operator: 'eq', value: 'vip' },
          { source: { type: 'event', field: 'currency' }, operator: 'eq', value: 'USD' },
        ],
        actions: [{ type: 'emit_event', topic: 'order.priority', data: {} }],
      };

      const dsl = Rule.create('multi-cond')
        .when(onEvent('order.placed'))
        .if(event('total').gte(1000))
        .and(event('customer.tier').eq('vip'))
        .and(event('currency').eq('USD'))
        .then(emit('order.priority'))
        .build();

      expect(dsl).toEqual(raw);
    });

    it('rule with multiple actions', () => {
      const raw: RuleInput = {
        id: 'multi-act',
        name: 'multi-act',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'user.registered' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'user:${event.userId}:active', value: true },
          { type: 'emit_event', topic: 'welcome.send', data: { userId: { ref: 'event.userId' } } },
          { type: 'log', level: 'info', message: 'User ${event.userId} registered' },
        ],
      };

      const dsl = Rule.create('multi-act')
        .when(onEvent('user.registered'))
        .then(setFact('user:${event.userId}:active', true))
        .also(emit('welcome.send', { userId: ref('event.userId') }))
        .also(log('info', 'User ${event.userId} registered'))
        .build();

      expect(dsl).toEqual(raw);
    });
  });
});
