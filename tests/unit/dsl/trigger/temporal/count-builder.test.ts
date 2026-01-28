import { describe, it, expect } from 'vitest';
import { count, CountBuilder } from '../../../../../src/dsl/trigger/temporal/count-builder';

describe('count()', () => {
  describe('factory', () => {
    it('returns a CountBuilder instance', () => {
      expect(count()).toBeInstanceOf(CountBuilder);
    });
  });

  describe('basic usage', () => {
    it('builds a count trigger with defaults', () => {
      const trigger = count()
        .event('auth.login_failed')
        .threshold(3)
        .window('5m')
        .build();

      expect(trigger).toEqual({
        type: 'temporal',
        pattern: {
          type: 'count',
          event: { topic: 'auth.login_failed' },
          threshold: 3,
          comparison: 'gte',
          window: '5m',
        },
      });
    });

    it('accepts numeric window (milliseconds)', () => {
      const trigger = count()
        .event('error')
        .threshold(10)
        .window(60000)
        .build();

      expect(trigger.pattern).toMatchObject({ window: 60000 });
    });

    it('builds count with zero threshold', () => {
      const trigger = count()
        .event('heartbeat')
        .threshold(0)
        .comparison('eq')
        .window('1m')
        .build();

      expect(trigger.pattern).toMatchObject({ threshold: 0, comparison: 'eq' });
    });
  });

  describe('event filter', () => {
    it('supports filter on event matcher', () => {
      const trigger = count()
        .event('api.error', { statusCode: 500 })
        .threshold(10)
        .window('1m')
        .build();

      const pattern = trigger.pattern as { event: { topic: string; filter?: Record<string, unknown> } };
      expect(pattern.event).toEqual({ topic: 'api.error', filter: { statusCode: 500 } });
    });
  });

  describe('comparison', () => {
    it('defaults to gte', () => {
      const trigger = count()
        .event('a')
        .threshold(5)
        .window('1m')
        .build();

      expect(trigger.pattern).toMatchObject({ comparison: 'gte' });
    });

    it('sets comparison to lte', () => {
      const trigger = count()
        .event('a')
        .threshold(5)
        .comparison('lte')
        .window('1m')
        .build();

      expect(trigger.pattern).toMatchObject({ comparison: 'lte' });
    });

    it('sets comparison to eq', () => {
      const trigger = count()
        .event('a')
        .threshold(5)
        .comparison('eq')
        .window('1m')
        .build();

      expect(trigger.pattern).toMatchObject({ comparison: 'eq' });
    });
  });

  describe('groupBy', () => {
    it('sets groupBy field', () => {
      const trigger = count()
        .event('auth.login_failed')
        .threshold(3)
        .window('5m')
        .groupBy('userId')
        .build();

      expect(trigger.pattern).toMatchObject({ groupBy: 'userId' });
    });

    it('omits groupBy when not set', () => {
      const trigger = count()
        .event('a')
        .threshold(1)
        .window('1m')
        .build();

      expect(trigger.pattern).not.toHaveProperty('groupBy');
    });
  });

  describe('sliding', () => {
    it('enables sliding window', () => {
      const trigger = count()
        .event('a')
        .threshold(5)
        .window('1m')
        .sliding()
        .build();

      expect(trigger.pattern).toMatchObject({ sliding: true });
    });

    it('explicitly sets sliding to false (tumbling)', () => {
      const trigger = count()
        .event('a')
        .threshold(5)
        .window('1m')
        .sliding(false)
        .build();

      expect(trigger.pattern).toMatchObject({ sliding: false });
    });

    it('omits sliding when not set', () => {
      const trigger = count()
        .event('a')
        .threshold(1)
        .window('1m')
        .build();

      expect(trigger.pattern).not.toHaveProperty('sliding');
    });
  });

  describe('fluent chaining', () => {
    it('returns this from every setter', () => {
      const builder = count();
      expect(builder.event('a')).toBe(builder);
      expect(builder.threshold(1)).toBe(builder);
      expect(builder.comparison('gte')).toBe(builder);
      expect(builder.window('1m')).toBe(builder);
      expect(builder.groupBy('id')).toBe(builder);
      expect(builder.sliding()).toBe(builder);
    });
  });

  describe('complete rule integration', () => {
    it('produces valid temporal trigger for RuleBuilder', () => {
      const trigger = count()
        .event('auth.login_failed')
        .threshold(5)
        .comparison('gte')
        .window('5m')
        .groupBy('userId')
        .sliding()
        .build();

      expect(trigger.type).toBe('temporal');
      expect(trigger.pattern).toEqual({
        type: 'count',
        event: { topic: 'auth.login_failed' },
        threshold: 5,
        comparison: 'gte',
        window: '5m',
        groupBy: 'userId',
        sliding: true,
      });
    });
  });

  describe('validation', () => {
    it('throws when event is missing', () => {
      expect(() =>
        count().threshold(3).window('5m').build()
      ).toThrow('count() requires .event() to set the counted event');
    });

    it('throws when threshold is missing', () => {
      expect(() =>
        count().event('a').window('5m').build()
      ).toThrow('count() requires .threshold() to set the count threshold');
    });

    it('throws when window is missing', () => {
      expect(() =>
        count().event('a').threshold(3).build()
      ).toThrow('count() requires .window() to set the time window');
    });

    it('throws for empty event topic', () => {
      expect(() =>
        count().event('')
      ).toThrow('count().event() topic must be a non-empty string');
    });

    it('throws for negative threshold', () => {
      expect(() =>
        count().event('a').threshold(-1)
      ).toThrow('count().threshold() must be a non-negative finite number');
    });

    it('throws for NaN threshold', () => {
      expect(() =>
        count().event('a').threshold(NaN)
      ).toThrow('count().threshold() must be a non-negative finite number');
    });

    it('throws for Infinity threshold', () => {
      expect(() =>
        count().event('a').threshold(Infinity)
      ).toThrow('count().threshold() must be a non-negative finite number');
    });

    it('throws for invalid comparison operator', () => {
      expect(() =>
        count().event('a').threshold(3).comparison('invalid' as 'gte')
      ).toThrow("count().comparison() must be 'gte', 'lte', or 'eq'");
    });

    it('throws for invalid window duration', () => {
      expect(() =>
        count().event('a').threshold(3).window('bad')
      ).toThrow(/count\(\)\.window\(\)/);
    });

    it('throws for empty groupBy', () => {
      expect(() =>
        count().event('a').threshold(3).window('1m').groupBy('')
      ).toThrow('count().groupBy() must be a non-empty string');
    });
  });
});
