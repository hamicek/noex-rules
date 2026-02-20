import { describe, it, expect } from 'vitest';
import { setTimer } from '../../../../src/dsl/action/timer-actions';

describe('setTimer — cron support', () => {
  describe('with config object', () => {
    it('creates cron timer action', () => {
      const action = setTimer({
        name: 'weekly-report',
        cron: '0 8 * * MON',
        onExpire: {
          topic: 'report.generate',
          data: { type: 'weekly' },
        },
      }).build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'weekly-report',
          cron: '0 8 * * MON',
          onExpire: {
            topic: 'report.generate',
            data: { type: 'weekly' },
          },
        },
      });
    });

    it('creates cron timer with maxCount', () => {
      const action = setTimer({
        name: 'limited-cron',
        cron: '*/5 * * * *',
        maxCount: 10,
        onExpire: {
          topic: 'check.run',
        },
      }).build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'limited-cron',
          cron: '*/5 * * * *',
          maxCount: 10,
          onExpire: {
            topic: 'check.run',
            data: {},
          },
        },
      });
    });

    it('cron timer has no duration field', () => {
      const action = setTimer({
        name: 'no-duration',
        cron: '0 0 1 * *',
        onExpire: { topic: 'monthly.close' },
      }).build();

      expect((action as any).timer.duration).toBeUndefined();
      expect((action as any).timer.repeat).toBeUndefined();
    });

    it('throws when both cron and duration are provided', () => {
      expect(() =>
        setTimer({
          name: 'conflict',
          cron: '0 8 * * MON',
          duration: '1h',
          onExpire: { topic: 'test' },
        })
      ).toThrow('cron and duration are mutually exclusive');
    });

    it('throws when both cron and repeat are provided', () => {
      expect(() =>
        setTimer({
          name: 'conflict',
          cron: '0 8 * * MON',
          repeat: { interval: '5m' },
          onExpire: { topic: 'test' },
        })
      ).toThrow('cron and repeat are mutually exclusive');
    });

    it('throws on invalid cron expression', () => {
      expect(() =>
        setTimer({
          name: 'bad-cron',
          cron: 'not valid',
          onExpire: { topic: 'test' },
        })
      ).toThrow('valid cron expression');
    });

    it('throws when neither cron nor duration is provided', () => {
      expect(() =>
        setTimer({
          name: 'nothing',
          onExpire: { topic: 'test' },
        })
      ).toThrow('either duration or cron must be specified');
    });
  });

  describe('with fluent API', () => {
    it('creates cron timer with .cron()', () => {
      const action = setTimer('weekly-report')
        .cron('0 8 * * MON')
        .emit('report.generate', { type: 'weekly' })
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'weekly-report',
          cron: '0 8 * * MON',
          onExpire: {
            topic: 'report.generate',
            data: { type: 'weekly' },
          },
        },
      });
    });

    it('creates cron timer with maxCount using .cron()', () => {
      const action = setTimer('limited')
        .cron('*/5 * * * *', 3)
        .emit('check.run')
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'limited',
          cron: '*/5 * * * *',
          maxCount: 3,
          onExpire: {
            topic: 'check.run',
            data: {},
          },
        },
      });
    });

    it('cron fluent timer has no duration', () => {
      const action = setTimer('no-dur')
        .cron('0 0 * * *')
        .emit('daily.run')
        .build();

      expect((action as any).timer.duration).toBeUndefined();
    });

    it('throws when .cron() and .after() are both used', () => {
      expect(() =>
        setTimer('conflict')
          .cron('0 8 * * MON')
          .after('1h')
          .emit('test')
          .build()
      ).toThrow('.cron() and .after() are mutually exclusive');
    });

    it('throws when .cron() and .repeat() are both used', () => {
      expect(() =>
        setTimer('conflict')
          .cron('0 8 * * MON')
          .repeat('5m')
          .emit('test')
          .build()
      ).toThrow('.cron() and .repeat() are mutually exclusive');
    });

    it('throws on invalid cron expression in fluent API', () => {
      expect(() =>
        setTimer('bad').cron('invalid')
      ).toThrow('valid cron expression');
    });

    it('uses default duration when neither .cron() nor .after() is called', () => {
      const action = setTimer('default').emit('test').build();
      expect((action as any).timer.duration).toBe('1m');
    });

    it('allows method chaining in any order with cron', () => {
      const action = setTimer('flexible')
        .emit('test.event', { data: 'value' })
        .cron('0 9 * * *')
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'flexible',
          cron: '0 9 * * *',
          onExpire: {
            topic: 'test.event',
            data: { data: 'value' },
          },
        },
      });
    });
  });
});
