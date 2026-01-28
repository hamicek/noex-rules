import { describe, it, expect } from 'vitest';
import { aggregate, AggregateBuilder } from '../../../../../src/dsl/trigger/temporal/aggregate-builder';

describe('aggregate()', () => {
  describe('factory', () => {
    it('returns an AggregateBuilder instance', () => {
      expect(aggregate()).toBeInstanceOf(AggregateBuilder);
    });
  });

  describe('basic usage', () => {
    it('builds an aggregate trigger with defaults', () => {
      const trigger = aggregate()
        .event('order.paid')
        .field('amount')
        .function('sum')
        .threshold(10000)
        .window('1h')
        .build();

      expect(trigger).toEqual({
        type: 'temporal',
        pattern: {
          type: 'aggregate',
          event: { topic: 'order.paid' },
          field: 'amount',
          function: 'sum',
          threshold: 10000,
          comparison: 'gte',
          window: '1h',
        },
      });
    });

    it('accepts numeric window (milliseconds)', () => {
      const trigger = aggregate()
        .event('order.paid')
        .field('amount')
        .function('sum')
        .threshold(10000)
        .window(3600000)
        .build();

      expect(trigger.pattern).toMatchObject({ window: 3600000 });
    });

    it('supports negative threshold', () => {
      const trigger = aggregate()
        .event('trade.executed')
        .field('pnl')
        .function('sum')
        .threshold(-5000)
        .comparison('lte')
        .window('1h')
        .build();

      expect(trigger.pattern).toMatchObject({ threshold: -5000, comparison: 'lte' });
    });
  });

  describe('aggregate functions', () => {
    const functions = ['sum', 'avg', 'min', 'max', 'count'] as const;

    for (const fn of functions) {
      it(`supports ${fn} function`, () => {
        const trigger = aggregate()
          .event('metric')
          .field('value')
          .function(fn)
          .threshold(100)
          .window('5m')
          .build();

        expect(trigger.pattern).toMatchObject({ function: fn });
      });
    }
  });

  describe('event filter', () => {
    it('supports filter on event matcher', () => {
      const trigger = aggregate()
        .event('order.paid', { currency: 'USD' })
        .field('amount')
        .function('sum')
        .threshold(10000)
        .window('1h')
        .build();

      const pattern = trigger.pattern as { event: { topic: string; filter?: Record<string, unknown> } };
      expect(pattern.event).toEqual({ topic: 'order.paid', filter: { currency: 'USD' } });
    });
  });

  describe('comparison', () => {
    it('defaults to gte', () => {
      const trigger = aggregate()
        .event('metric')
        .field('value')
        .function('avg')
        .threshold(100)
        .window('5m')
        .build();

      expect(trigger.pattern).toMatchObject({ comparison: 'gte' });
    });

    it('sets comparison to lte', () => {
      const trigger = aggregate()
        .event('metric')
        .field('value')
        .function('min')
        .threshold(10)
        .comparison('lte')
        .window('5m')
        .build();

      expect(trigger.pattern).toMatchObject({ comparison: 'lte' });
    });

    it('sets comparison to eq', () => {
      const trigger = aggregate()
        .event('metric')
        .field('value')
        .function('count')
        .threshold(100)
        .comparison('eq')
        .window('5m')
        .build();

      expect(trigger.pattern).toMatchObject({ comparison: 'eq' });
    });
  });

  describe('groupBy', () => {
    it('sets groupBy field', () => {
      const trigger = aggregate()
        .event('order.paid')
        .field('amount')
        .function('sum')
        .threshold(10000)
        .window('1h')
        .groupBy('region')
        .build();

      expect(trigger.pattern).toMatchObject({ groupBy: 'region' });
    });

    it('omits groupBy when not set', () => {
      const trigger = aggregate()
        .event('metric')
        .field('value')
        .function('sum')
        .threshold(100)
        .window('5m')
        .build();

      expect(trigger.pattern).not.toHaveProperty('groupBy');
    });
  });

  describe('fluent chaining', () => {
    it('returns this from every setter', () => {
      const builder = aggregate();
      expect(builder.event('a')).toBe(builder);
      expect(builder.field('f')).toBe(builder);
      expect(builder.function('sum')).toBe(builder);
      expect(builder.threshold(100)).toBe(builder);
      expect(builder.comparison('gte')).toBe(builder);
      expect(builder.window('1m')).toBe(builder);
      expect(builder.groupBy('id')).toBe(builder);
    });
  });

  describe('complete rule integration', () => {
    it('produces valid temporal trigger for RuleBuilder', () => {
      const trigger = aggregate()
        .event('api.response')
        .field('responseTime')
        .function('avg')
        .threshold(500)
        .comparison('gte')
        .window('5m')
        .groupBy('endpoint')
        .build();

      expect(trigger.type).toBe('temporal');
      expect(trigger.pattern).toEqual({
        type: 'aggregate',
        event: { topic: 'api.response' },
        field: 'responseTime',
        function: 'avg',
        threshold: 500,
        comparison: 'gte',
        window: '5m',
        groupBy: 'endpoint',
      });
    });
  });

  describe('validation', () => {
    it('throws when event is missing', () => {
      expect(() =>
        aggregate()
          .field('amount')
          .function('sum')
          .threshold(100)
          .window('1h')
          .build()
      ).toThrow('aggregate() requires .event() to set the source event');
    });

    it('throws when field is missing', () => {
      expect(() =>
        aggregate()
          .event('order.paid')
          .function('sum')
          .threshold(100)
          .window('1h')
          .build()
      ).toThrow('aggregate() requires .field() to set the aggregated field');
    });

    it('throws when function is missing', () => {
      expect(() =>
        aggregate()
          .event('order.paid')
          .field('amount')
          .threshold(100)
          .window('1h')
          .build()
      ).toThrow('aggregate() requires .function() to set the aggregate function');
    });

    it('throws when threshold is missing', () => {
      expect(() =>
        aggregate()
          .event('order.paid')
          .field('amount')
          .function('sum')
          .window('1h')
          .build()
      ).toThrow('aggregate() requires .threshold() to set the threshold value');
    });

    it('throws when window is missing', () => {
      expect(() =>
        aggregate()
          .event('order.paid')
          .field('amount')
          .function('sum')
          .threshold(100)
          .build()
      ).toThrow('aggregate() requires .window() to set the time window');
    });

    it('throws for empty event topic', () => {
      expect(() =>
        aggregate().event('')
      ).toThrow('aggregate().event() topic must be a non-empty string');
    });

    it('throws for empty field', () => {
      expect(() =>
        aggregate().event('a').field('')
      ).toThrow('aggregate().field() must be a non-empty string');
    });

    it('throws for invalid function', () => {
      expect(() =>
        aggregate().event('a').field('f').function('invalid' as 'sum')
      ).toThrow("aggregate().function() must be one of sum, avg, min, max, count");
    });

    it('throws for NaN threshold', () => {
      expect(() =>
        aggregate().event('a').field('f').function('sum').threshold(NaN)
      ).toThrow('aggregate().threshold() must be a finite number');
    });

    it('throws for Infinity threshold', () => {
      expect(() =>
        aggregate().event('a').field('f').function('sum').threshold(Infinity)
      ).toThrow('aggregate().threshold() must be a finite number');
    });

    it('throws for invalid comparison operator', () => {
      expect(() =>
        aggregate()
          .event('a')
          .field('f')
          .function('sum')
          .threshold(100)
          .comparison('invalid' as 'gte')
      ).toThrow("aggregate().comparison() must be 'gte', 'lte', or 'eq'");
    });

    it('throws for invalid window duration', () => {
      expect(() =>
        aggregate()
          .event('a')
          .field('f')
          .function('sum')
          .threshold(100)
          .window('bad')
      ).toThrow(/aggregate\(\)\.window\(\)/);
    });

    it('throws for empty groupBy', () => {
      expect(() =>
        aggregate()
          .event('a')
          .field('f')
          .function('sum')
          .threshold(100)
          .window('1m')
          .groupBy('')
      ).toThrow('aggregate().groupBy() must be a non-empty string');
    });
  });
});
