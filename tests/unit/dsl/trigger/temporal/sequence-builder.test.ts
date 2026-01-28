import { describe, it, expect } from 'vitest';
import { sequence, SequenceBuilder } from '../../../../../src/dsl/trigger/temporal/sequence-builder';

describe('sequence()', () => {
  describe('factory', () => {
    it('returns a SequenceBuilder instance', () => {
      expect(sequence()).toBeInstanceOf(SequenceBuilder);
    });
  });

  describe('basic usage', () => {
    it('builds a two-event sequence trigger', () => {
      const trigger = sequence()
        .event('order.created')
        .event('payment.received')
        .within('5m')
        .build();

      expect(trigger).toEqual({
        type: 'temporal',
        pattern: {
          type: 'sequence',
          events: [
            { topic: 'order.created' },
            { topic: 'payment.received' },
          ],
          within: '5m',
        },
      });
    });

    it('builds a single-event sequence', () => {
      const trigger = sequence()
        .event('order.created')
        .within('1m')
        .build();

      expect(trigger).toEqual({
        type: 'temporal',
        pattern: {
          type: 'sequence',
          events: [{ topic: 'order.created' }],
          within: '1m',
        },
      });
    });

    it('builds a multi-event sequence', () => {
      const trigger = sequence()
        .event('step.1')
        .event('step.2')
        .event('step.3')
        .event('step.4')
        .within('10m')
        .build();

      const pattern = trigger.pattern;
      expect(pattern.type).toBe('sequence');
      expect((pattern as { events: unknown[] }).events).toHaveLength(4);
    });

    it('accepts numeric window (milliseconds)', () => {
      const trigger = sequence()
        .event('a')
        .event('b')
        .within(30000)
        .build();

      expect(trigger.pattern).toMatchObject({ within: 30000 });
    });
  });

  describe('event filters', () => {
    it('supports filter on event matcher', () => {
      const trigger = sequence()
        .event('auth.login_failed', { method: 'password' })
        .event('auth.login_failed', { method: 'password' })
        .within('5m')
        .build();

      const events = (trigger.pattern as { events: Array<{ topic: string; filter?: Record<string, unknown> }> }).events;
      expect(events[0]).toEqual({ topic: 'auth.login_failed', filter: { method: 'password' } });
      expect(events[1]).toEqual({ topic: 'auth.login_failed', filter: { method: 'password' } });
    });

    it('supports alias on event matcher', () => {
      const trigger = sequence()
        .event('order.created', undefined, 'firstOrder')
        .event('order.shipped', undefined, 'shipped')
        .within('24h')
        .build();

      const events = (trigger.pattern as { events: Array<{ topic: string; as?: string }> }).events;
      expect(events[0].as).toBe('firstOrder');
      expect(events[1].as).toBe('shipped');
    });

    it('supports filter and alias together', () => {
      const trigger = sequence()
        .event('order.created', { priority: 'high' }, 'order')
        .event('payment.received', undefined, 'payment')
        .within('15m')
        .build();

      const events = (trigger.pattern as { events: Array<{ topic: string; filter?: Record<string, unknown>; as?: string }> }).events;
      expect(events[0]).toEqual({ topic: 'order.created', filter: { priority: 'high' }, as: 'order' });
      expect(events[1]).toEqual({ topic: 'payment.received', as: 'payment' });
    });
  });

  describe('groupBy', () => {
    it('sets groupBy field', () => {
      const trigger = sequence()
        .event('order.created')
        .event('payment.received')
        .within('5m')
        .groupBy('orderId')
        .build();

      expect(trigger.pattern).toMatchObject({ groupBy: 'orderId' });
    });

    it('omits groupBy when not set', () => {
      const trigger = sequence()
        .event('a')
        .within('1m')
        .build();

      expect(trigger.pattern).not.toHaveProperty('groupBy');
    });
  });

  describe('strict', () => {
    it('enables strict mode', () => {
      const trigger = sequence()
        .event('a')
        .event('b')
        .within('1m')
        .strict()
        .build();

      expect(trigger.pattern).toMatchObject({ strict: true });
    });

    it('explicitly disables strict mode', () => {
      const trigger = sequence()
        .event('a')
        .event('b')
        .within('1m')
        .strict(false)
        .build();

      expect(trigger.pattern).not.toHaveProperty('strict');
    });

    it('omits strict when not set', () => {
      const trigger = sequence()
        .event('a')
        .within('1m')
        .build();

      expect(trigger.pattern).not.toHaveProperty('strict');
    });
  });

  describe('fluent chaining', () => {
    it('returns this from every setter', () => {
      const builder = sequence();
      expect(builder.event('a')).toBe(builder);
      expect(builder.within('1m')).toBe(builder);
      expect(builder.groupBy('id')).toBe(builder);
      expect(builder.strict()).toBe(builder);
    });
  });

  describe('complete rule integration', () => {
    it('produces valid temporal trigger for RuleBuilder', () => {
      const trigger = sequence()
        .event('auth.login_failed')
        .event('auth.login_failed')
        .event('auth.login_failed')
        .within('5m')
        .groupBy('userId')
        .strict()
        .build();

      expect(trigger.type).toBe('temporal');
      expect(trigger.pattern).toEqual({
        type: 'sequence',
        events: [
          { topic: 'auth.login_failed' },
          { topic: 'auth.login_failed' },
          { topic: 'auth.login_failed' },
        ],
        within: '5m',
        groupBy: 'userId',
        strict: true,
      });
    });
  });

  describe('validation', () => {
    it('throws when no events added', () => {
      expect(() =>
        sequence().within('5m').build()
      ).toThrow('sequence() requires at least one .event()');
    });

    it('throws when within is missing', () => {
      expect(() =>
        sequence().event('a').build()
      ).toThrow('sequence() requires .within() to set the time window');
    });

    it('throws for empty event topic', () => {
      expect(() =>
        sequence().event('')
      ).toThrow('sequence().event() topic must be a non-empty string');
    });

    it('throws for non-string event topic', () => {
      expect(() =>
        sequence().event(123 as unknown as string)
      ).toThrow('sequence().event() topic must be a non-empty string');
    });

    it('throws for invalid within duration', () => {
      expect(() =>
        sequence().event('a').within('bad')
      ).toThrow(/sequence\(\)\.within\(\)/);
    });

    it('throws for negative numeric within', () => {
      expect(() =>
        sequence().event('a').within(-100)
      ).toThrow(/sequence\(\)\.within\(\)/);
    });

    it('throws for empty groupBy', () => {
      expect(() =>
        sequence().event('a').within('1m').groupBy('')
      ).toThrow('sequence().groupBy() must be a non-empty string');
    });
  });
});
