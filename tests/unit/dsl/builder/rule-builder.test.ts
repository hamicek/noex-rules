import { describe, it, expect } from 'vitest';
import { Rule, RuleBuilder } from '../../../../src/dsl/builder/rule-builder';
import { onEvent } from '../../../../src/dsl/trigger/event-trigger';
import { onFact } from '../../../../src/dsl/trigger/fact-trigger';
import { onTimer } from '../../../../src/dsl/trigger/timer-trigger';
import { event, fact } from '../../../../src/dsl/condition/source-expr';
import { lookup } from '../../../../src/dsl/condition/lookup-expr';
import { emit, setFact, deleteFact } from '../../../../src/dsl/action';
import { ref } from '../../../../src/dsl/helpers/ref';

describe('RuleBuilder', () => {
  describe('create', () => {
    it('creates new rule builder with id', () => {
      const builder = Rule.create('test-rule');
      expect(builder).toBeInstanceOf(RuleBuilder);
    });

    it('throws for empty id', () => {
      expect(() => Rule.create('')).toThrow('Rule ID must be a non-empty string');
    });

    it('throws for non-string id', () => {
      expect(() => Rule.create(null as unknown as string)).toThrow('Rule ID must be a non-empty string');
    });
  });

  describe('fluent API', () => {
    it('sets name', () => {
      const rule = Rule.create('test')
        .name('Test Rule')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.name).toBe('Test Rule');
    });

    it('uses id as name if not specified', () => {
      const rule = Rule.create('my-rule-id')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.name).toBe('my-rule-id');
    });

    it('sets description', () => {
      const rule = Rule.create('test')
        .description('This rule does something')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.description).toBe('This rule does something');
    });

    it('sets priority', () => {
      const rule = Rule.create('test')
        .priority(100)
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.priority).toBe(100);
    });

    it('throws for invalid priority', () => {
      expect(() => Rule.create('test').priority(NaN)).toThrow('Priority must be a finite number');
      expect(() => Rule.create('test').priority(Infinity)).toThrow('Priority must be a finite number');
    });

    it('defaults priority to 0', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.priority).toBe(0);
    });

    it('sets enabled', () => {
      const rule = Rule.create('test')
        .enabled(false)
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.enabled).toBe(false);
    });

    it('defaults enabled to true', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.enabled).toBe(true);
    });

    it('sets tags', () => {
      const rule = Rule.create('test')
        .tags('orders', 'notifications')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.tags).toEqual(['orders', 'notifications']);
    });

    it('accumulates tags from multiple calls', () => {
      const rule = Rule.create('test')
        .tags('tag1')
        .tags('tag2', 'tag3')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('defaults tags to empty array', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.tags).toEqual([]);
    });
  });

  describe('when (trigger)', () => {
    it('accepts TriggerBuilder', () => {
      const rule = Rule.create('test')
        .when(onEvent('order.created'))
        .then(emit('result'))
        .build();

      expect(rule.trigger).toEqual({
        type: 'event',
        topic: 'order.created',
      });
    });

    it('accepts raw RuleTrigger object', () => {
      const rule = Rule.create('test')
        .when({ type: 'event', topic: 'custom.event' })
        .then(emit('result'))
        .build();

      expect(rule.trigger).toEqual({
        type: 'event',
        topic: 'custom.event',
      });
    });

    it('accepts onFact trigger builder', () => {
      const rule = Rule.create('test')
        .when(onFact('customer:*:creditScore'))
        .then(emit('result'))
        .build();

      expect(rule.trigger).toEqual({
        type: 'fact',
        pattern: 'customer:*:creditScore',
      });
    });

    it('accepts onTimer trigger builder', () => {
      const rule = Rule.create('test')
        .when(onTimer('payment-timeout'))
        .then(emit('result'))
        .build();

      expect(rule.trigger).toEqual({
        type: 'timer',
        name: 'payment-timeout',
      });
    });
  });

  describe('if/and (conditions)', () => {
    it('adds single condition with if()', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .if(event('amount').gte(100))
        .then(emit('result'))
        .build();

      expect(rule.conditions).toHaveLength(1);
      expect(rule.conditions[0]).toEqual({
        source: { type: 'event', field: 'amount' },
        operator: 'gte',
        value: 100,
      });
    });

    it('adds multiple conditions with if() and and()', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .if(event('amount').gte(100))
        .and(event('status').eq('active'))
        .and(fact('customer:vip').eq(true))
        .then(emit('result'))
        .build();

      expect(rule.conditions).toHaveLength(3);
    });

    it('accepts raw RuleCondition objects', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .if({
          source: { type: 'event', field: 'custom' },
          operator: 'eq',
          value: 'test',
        })
        .then(emit('result'))
        .build();

      expect(rule.conditions[0].source).toEqual({ type: 'event', field: 'custom' });
    });

    it('conditions are optional', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.conditions).toEqual([]);
    });
  });

  describe('then/also (actions)', () => {
    it('adds single action with then()', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then(emit('notification.send', { message: 'Hello' }))
        .build();

      expect(rule.actions).toHaveLength(1);
      expect(rule.actions[0]).toEqual({
        type: 'emit_event',
        topic: 'notification.send',
        data: { message: 'Hello' },
      });
    });

    it('adds multiple actions with then() and also()', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then(emit('first.event'))
        .also(setFact('key', 'value'))
        .also(deleteFact('temp'))
        .build();

      expect(rule.actions).toHaveLength(3);
      expect(rule.actions[0].type).toBe('emit_event');
      expect(rule.actions[1].type).toBe('set_fact');
      expect(rule.actions[2].type).toBe('delete_fact');
    });

    it('accepts raw RuleAction objects', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then({
          type: 'log',
          level: 'info',
          message: 'Rule executed',
        })
        .build();

      expect(rule.actions[0]).toEqual({
        type: 'log',
        level: 'info',
        message: 'Rule executed',
      });
    });
  });

  describe('build validation', () => {
    it('throws when trigger is missing', () => {
      expect(() =>
        Rule.create('test')
          .then(emit('result'))
          .build()
      ).toThrow('Rule "test": trigger is required');
    });

    it('throws when actions are missing', () => {
      expect(() =>
        Rule.create('test')
          .when(onEvent('test'))
          .build()
      ).toThrow('Rule "test": at least one action is required');
    });
  });

  describe('lookup (external data)', () => {
    it('adds a single lookup with required fields', () => {
      const rule = Rule.create('test')
        .when(onEvent('order.created'))
        .lookup('credit', {
          service: 'creditService',
          method: 'getScore',
        })
        .then(emit('result'))
        .build();

      expect(rule.lookups).toEqual([
        {
          name: 'credit',
          service: 'creditService',
          method: 'getScore',
          args: [],
        },
      ]);
    });

    it('adds lookup with args containing refs', () => {
      const rule = Rule.create('test')
        .when(onEvent('order.created'))
        .lookup('credit', {
          service: 'creditService',
          method: 'getScore',
          args: [ref('event.customerId'), 42],
        })
        .then(emit('result'))
        .build();

      expect(rule.lookups![0].args).toEqual([
        { ref: 'event.customerId' },
        42,
      ]);
    });

    it('adds lookup with cache config', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .lookup('data', {
          service: 'svc',
          method: 'fetch',
          cache: { ttl: '5m' },
        })
        .then(emit('result'))
        .build();

      expect(rule.lookups![0].cache).toEqual({ ttl: '5m' });
    });

    it('adds lookup with numeric TTL', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .lookup('data', {
          service: 'svc',
          method: 'fetch',
          cache: { ttl: 30000 },
        })
        .then(emit('result'))
        .build();

      expect(rule.lookups![0].cache).toEqual({ ttl: 30000 });
    });

    it('adds lookup with onError strategy', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .lookup('risky', {
          service: 'svc',
          method: 'fetch',
          onError: 'fail',
        })
        .then(emit('result'))
        .build();

      expect(rule.lookups![0].onError).toBe('fail');
    });

    it('adds multiple lookups', () => {
      const rule = Rule.create('test')
        .when(onEvent('order.created'))
        .lookup('credit', {
          service: 'creditService',
          method: 'getScore',
          args: [ref('event.customerId')],
          cache: { ttl: '5m' },
        })
        .lookup('fraud', {
          service: 'fraudService',
          method: 'checkRisk',
          args: [ref('event.email'), ref('event.amount')],
          onError: 'skip',
        })
        .then(emit('result'))
        .build();

      expect(rule.lookups).toHaveLength(2);
      expect(rule.lookups![0].name).toBe('credit');
      expect(rule.lookups![1].name).toBe('fraud');
    });

    it('omits lookups from output when none are defined', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .then(emit('result'))
        .build();

      expect(rule.lookups).toBeUndefined();
    });

    it('omits cache when not specified', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .lookup('data', { service: 'svc', method: 'fetch' })
        .then(emit('result'))
        .build();

      expect(rule.lookups![0]).not.toHaveProperty('cache');
    });

    it('omits onError when not specified', () => {
      const rule = Rule.create('test')
        .when(onEvent('test'))
        .lookup('data', { service: 'svc', method: 'fetch' })
        .then(emit('result'))
        .build();

      expect(rule.lookups![0]).not.toHaveProperty('onError');
    });

    it('returns this for chaining', () => {
      const builder = Rule.create('test');
      const result = builder.lookup('data', { service: 'svc', method: 'fetch' });
      expect(result).toBe(builder);
    });

    it('chains with conditions using lookup() DSL function', () => {
      const rule = Rule.create('test')
        .when(onEvent('order.created'))
        .lookup('credit', {
          service: 'creditService',
          method: 'getScore',
          args: [ref('event.customerId')],
        })
        .if(lookup('credit').gte(700))
        .then(emit('order.approved'))
        .build();

      expect(rule.lookups).toHaveLength(1);
      expect(rule.conditions).toHaveLength(1);
      expect(rule.conditions[0]).toEqual({
        source: { type: 'lookup', name: 'credit' },
        operator: 'gte',
        value: 700,
      });
    });

    describe('validation', () => {
      it('throws for empty name', () => {
        expect(() =>
          Rule.create('test').lookup('', { service: 'svc', method: 'fn' })
        ).toThrow('Lookup name must be a non-empty string');
      });

      it('throws for non-string name', () => {
        expect(() =>
          Rule.create('test').lookup(null as unknown as string, { service: 'svc', method: 'fn' })
        ).toThrow('Lookup name must be a non-empty string');
      });

      it('throws for empty service', () => {
        expect(() =>
          Rule.create('test').lookup('data', { service: '', method: 'fn' })
        ).toThrow('Lookup "data": service must be a non-empty string');
      });

      it('throws for non-string service', () => {
        expect(() =>
          Rule.create('test').lookup('data', { service: 123 as unknown as string, method: 'fn' })
        ).toThrow('Lookup "data": service must be a non-empty string');
      });

      it('throws for empty method', () => {
        expect(() =>
          Rule.create('test').lookup('data', { service: 'svc', method: '' })
        ).toThrow('Lookup "data": method must be a non-empty string');
      });

      it('throws for non-string method', () => {
        expect(() =>
          Rule.create('test').lookup('data', { service: 'svc', method: null as unknown as string })
        ).toThrow('Lookup "data": method must be a non-empty string');
      });

      it('throws for duplicate lookup name', () => {
        expect(() =>
          Rule.create('test')
            .lookup('credit', { service: 'svc', method: 'fn' })
            .lookup('credit', { service: 'other', method: 'fn2' })
        ).toThrow('Lookup "credit": duplicate lookup name');
      });
    });
  });

  describe('complete rule building', () => {
    it('builds complete rule with all options', () => {
      const rule = Rule.create('order-notification')
        .name('Send Order Notification')
        .description('Sends notification for large orders')
        .priority(100)
        .enabled(true)
        .tags('orders', 'notifications')
        .when(onEvent('order.created'))
        .if(event('amount').gte(100))
        .and(event('status').eq('confirmed'))
        .then(emit('notification.send', {
          orderId: ref('event.orderId'),
          message: 'Large order received!',
        }))
        .also(setFact('order:${event.orderId}:notified', true))
        .build();

      expect(rule).toEqual({
        id: 'order-notification',
        name: 'Send Order Notification',
        description: 'Sends notification for large orders',
        priority: 100,
        enabled: true,
        tags: ['orders', 'notifications'],
        trigger: {
          type: 'event',
          topic: 'order.created',
        },
        conditions: [
          {
            source: { type: 'event', field: 'amount' },
            operator: 'gte',
            value: 100,
          },
          {
            source: { type: 'event', field: 'status' },
            operator: 'eq',
            value: 'confirmed',
          },
        ],
        actions: [
          {
            type: 'emit_event',
            topic: 'notification.send',
            data: {
              orderId: { ref: 'event.orderId' },
              message: 'Large order received!',
            },
          },
          {
            type: 'set_fact',
            key: 'order:${event.orderId}:notified',
            value: true,
          },
        ],
      });
    });

    it('builds complete rule with lookups', () => {
      const rule = Rule.create('check-credit-score')
        .name('Check Credit Score on Order')
        .when(onEvent('order.created'))
        .lookup('credit', {
          service: 'creditService',
          method: 'getScore',
          args: [ref('event.customerId')],
          cache: { ttl: '5m' },
        })
        .lookup('fraud', {
          service: 'fraudService',
          method: 'checkRisk',
          args: [ref('event.email'), ref('event.amount')],
          onError: 'skip',
        })
        .if(lookup('credit').gte(700))
        .and(lookup('fraud.riskLevel').neq('high'))
        .then(emit('order.approved', { customerId: ref('event.customerId') }))
        .also(setFact('customer:${event.customerId}:lastCreditScore', ref('lookup.credit')))
        .build();

      expect(rule).toEqual({
        id: 'check-credit-score',
        name: 'Check Credit Score on Order',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [{ ref: 'event.customerId' }],
            cache: { ttl: '5m' },
          },
          {
            name: 'fraud',
            service: 'fraudService',
            method: 'checkRisk',
            args: [{ ref: 'event.email' }, { ref: 'event.amount' }],
            onError: 'skip',
          },
        ],
        conditions: [
          {
            source: { type: 'lookup', name: 'credit' },
            operator: 'gte',
            value: 700,
          },
          {
            source: { type: 'lookup', name: 'fraud', field: 'riskLevel' },
            operator: 'neq',
            value: 'high',
          },
        ],
        actions: [
          {
            type: 'emit_event',
            topic: 'order.approved',
            data: { customerId: { ref: 'event.customerId' } },
          },
          {
            type: 'set_fact',
            key: 'customer:${event.customerId}:lastCreditScore',
            value: { ref: 'lookup.credit' },
          },
        ],
      });
    });

    it('builds minimal valid rule', () => {
      const rule = Rule.create('minimal')
        .when(onEvent('trigger'))
        .then(emit('action'))
        .build();

      expect(rule).toEqual({
        id: 'minimal',
        name: 'minimal',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'trigger' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'action', data: {} }],
      });
    });
  });
});
