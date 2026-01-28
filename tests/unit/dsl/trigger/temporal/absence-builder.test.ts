import { describe, it, expect } from 'vitest';
import { absence, AbsenceBuilder } from '../../../../../src/dsl/trigger/temporal/absence-builder';

describe('absence()', () => {
  describe('factory', () => {
    it('returns an AbsenceBuilder instance', () => {
      expect(absence()).toBeInstanceOf(AbsenceBuilder);
    });
  });

  describe('basic usage', () => {
    it('builds an absence trigger', () => {
      const trigger = absence()
        .after('order.created')
        .expected('payment.received')
        .within('15m')
        .build();

      expect(trigger).toEqual({
        type: 'temporal',
        pattern: {
          type: 'absence',
          after: { topic: 'order.created' },
          expected: { topic: 'payment.received' },
          within: '15m',
        },
      });
    });

    it('accepts numeric window (milliseconds)', () => {
      const trigger = absence()
        .after('order.created')
        .expected('payment.received')
        .within(900000)
        .build();

      expect(trigger.pattern).toMatchObject({ within: 900000 });
    });
  });

  describe('event filters', () => {
    it('supports filter on after event', () => {
      const trigger = absence()
        .after('order.created', { priority: 'high' })
        .expected('payment.received')
        .within('15m')
        .build();

      const pattern = trigger.pattern as { after: { topic: string; filter?: Record<string, unknown> } };
      expect(pattern.after).toEqual({ topic: 'order.created', filter: { priority: 'high' } });
    });

    it('supports filter on expected event', () => {
      const trigger = absence()
        .after('order.created')
        .expected('payment.received', { method: 'card' })
        .within('15m')
        .build();

      const pattern = trigger.pattern as { expected: { topic: string; filter?: Record<string, unknown> } };
      expect(pattern.expected).toEqual({ topic: 'payment.received', filter: { method: 'card' } });
    });

    it('supports filters on both events', () => {
      const trigger = absence()
        .after('registration.started', { source: 'web' })
        .expected('registration.completed', { verified: true })
        .within('24h')
        .build();

      const pattern = trigger.pattern as {
        after: { topic: string; filter?: Record<string, unknown> };
        expected: { topic: string; filter?: Record<string, unknown> };
      };
      expect(pattern.after.filter).toEqual({ source: 'web' });
      expect(pattern.expected.filter).toEqual({ verified: true });
    });
  });

  describe('groupBy', () => {
    it('sets groupBy field', () => {
      const trigger = absence()
        .after('order.created')
        .expected('payment.received')
        .within('15m')
        .groupBy('orderId')
        .build();

      expect(trigger.pattern).toMatchObject({ groupBy: 'orderId' });
    });

    it('omits groupBy when not set', () => {
      const trigger = absence()
        .after('order.created')
        .expected('payment.received')
        .within('15m')
        .build();

      expect(trigger.pattern).not.toHaveProperty('groupBy');
    });
  });

  describe('fluent chaining', () => {
    it('returns this from every setter', () => {
      const builder = absence();
      expect(builder.after('a')).toBe(builder);
      expect(builder.expected('b')).toBe(builder);
      expect(builder.within('1m')).toBe(builder);
      expect(builder.groupBy('id')).toBe(builder);
    });
  });

  describe('complete rule integration', () => {
    it('produces valid temporal trigger for RuleBuilder', () => {
      const trigger = absence()
        .after('order.created')
        .expected('payment.received')
        .within('15m')
        .groupBy('orderId')
        .build();

      expect(trigger.type).toBe('temporal');
      expect(trigger.pattern).toEqual({
        type: 'absence',
        after: { topic: 'order.created' },
        expected: { topic: 'payment.received' },
        within: '15m',
        groupBy: 'orderId',
      });
    });
  });

  describe('validation', () => {
    it('throws when after is missing', () => {
      expect(() =>
        absence()
          .expected('payment.received')
          .within('15m')
          .build()
      ).toThrow('absence() requires .after() to set the trigger event');
    });

    it('throws when expected is missing', () => {
      expect(() =>
        absence()
          .after('order.created')
          .within('15m')
          .build()
      ).toThrow('absence() requires .expected() to set the awaited event');
    });

    it('throws when within is missing', () => {
      expect(() =>
        absence()
          .after('order.created')
          .expected('payment.received')
          .build()
      ).toThrow('absence() requires .within() to set the time window');
    });

    it('throws for empty after topic', () => {
      expect(() =>
        absence().after('')
      ).toThrow('absence().after() topic must be a non-empty string');
    });

    it('throws for non-string after topic', () => {
      expect(() =>
        absence().after(null as unknown as string)
      ).toThrow('absence().after() topic must be a non-empty string');
    });

    it('throws for empty expected topic', () => {
      expect(() =>
        absence().expected('')
      ).toThrow('absence().expected() topic must be a non-empty string');
    });

    it('throws for invalid within duration', () => {
      expect(() =>
        absence()
          .after('a')
          .expected('b')
          .within('invalid')
      ).toThrow(/absence\(\)\.within\(\)/);
    });

    it('throws for negative numeric within', () => {
      expect(() =>
        absence()
          .after('a')
          .expected('b')
          .within(-1)
      ).toThrow(/absence\(\)\.within\(\)/);
    });

    it('throws for empty groupBy', () => {
      expect(() =>
        absence()
          .after('a')
          .expected('b')
          .within('1m')
          .groupBy('')
      ).toThrow('absence().groupBy() must be a non-empty string');
    });
  });
});
