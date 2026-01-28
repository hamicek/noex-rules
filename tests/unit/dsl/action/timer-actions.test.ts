import { describe, it, expect } from 'vitest';
import { setTimer, cancelTimer } from '../../../../src/dsl/action/timer-actions';
import { ref } from '../../../../src/dsl/helpers/ref';

describe('setTimer', () => {
  describe('with config object', () => {
    it('creates set_timer action with basic config', () => {
      const action = setTimer({
        name: 'payment-timeout',
        duration: '15m',
        onExpire: {
          topic: 'order.payment_timeout',
        },
      }).build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'payment-timeout',
          duration: '15m',
          onExpire: {
            topic: 'order.payment_timeout',
            data: {},
          },
        },
      });
    });

    it('creates set_timer action with data', () => {
      const action = setTimer({
        name: 'reminder',
        duration: '24h',
        onExpire: {
          topic: 'reminder.send',
          data: { message: 'Check your order' },
        },
      }).build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'reminder',
          duration: '24h',
          onExpire: {
            topic: 'reminder.send',
            data: { message: 'Check your order' },
          },
        },
      });
    });

    it('creates set_timer action with ref in data', () => {
      const action = setTimer({
        name: 'order-timeout',
        duration: '30m',
        onExpire: {
          topic: 'order.timeout',
          data: {
            orderId: ref('event.orderId'),
            userId: ref('event.userId'),
            static: 'value',
          },
        },
      }).build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'order-timeout',
          duration: '30m',
          onExpire: {
            topic: 'order.timeout',
            data: {
              orderId: { ref: 'event.orderId' },
              userId: { ref: 'event.userId' },
              static: 'value',
            },
          },
        },
      });
    });

    it('creates set_timer action with repeat config', () => {
      const action = setTimer({
        name: 'periodic-check',
        duration: '1h',
        onExpire: {
          topic: 'health.check',
        },
        repeat: {
          interval: '10m',
          maxCount: 5,
        },
      }).build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'periodic-check',
          duration: '1h',
          onExpire: {
            topic: 'health.check',
            data: {},
          },
          repeat: {
            interval: '10m',
            maxCount: 5,
          },
        },
      });
    });

    it('creates set_timer action with repeat without maxCount', () => {
      const action = setTimer({
        name: 'infinite-check',
        duration: '5m',
        onExpire: {
          topic: 'check.run',
        },
        repeat: {
          interval: '1m',
        },
      }).build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'infinite-check',
          duration: '5m',
          onExpire: {
            topic: 'check.run',
            data: {},
          },
          repeat: {
            interval: '1m',
            maxCount: undefined,
          },
        },
      });
    });

    it('supports numeric duration in milliseconds', () => {
      const action = setTimer({
        name: 'quick-timer',
        duration: 5000,
        onExpire: {
          topic: 'quick.expire',
        },
      }).build();

      expect((action as any).timer.duration).toBe(5000);
    });
  });

  describe('with fluent API', () => {
    it('creates set_timer action with fluent builder', () => {
      const action = setTimer('payment-timeout')
        .after('15m')
        .emit('order.payment_timeout')
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'payment-timeout',
          duration: '15m',
          onExpire: {
            topic: 'order.payment_timeout',
            data: {},
          },
        },
      });
    });

    it('creates set_timer with emit data using fluent builder', () => {
      const action = setTimer('notification')
        .after('1h')
        .emit('notification.send', {
          message: 'Time is up!',
          priority: 'high',
        })
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'notification',
          duration: '1h',
          onExpire: {
            topic: 'notification.send',
            data: {
              message: 'Time is up!',
              priority: 'high',
            },
          },
        },
      });
    });

    it('creates set_timer with ref in fluent data', () => {
      const action = setTimer('order-expiry')
        .after('24h')
        .emit('order.expired', {
          orderId: ref('event.orderId'),
          amount: ref('event.amount'),
        })
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'order-expiry',
          duration: '24h',
          onExpire: {
            topic: 'order.expired',
            data: {
              orderId: { ref: 'event.orderId' },
              amount: { ref: 'event.amount' },
            },
          },
        },
      });
    });

    it('creates set_timer with repeat using fluent builder', () => {
      const action = setTimer('retry-timer')
        .after('5m')
        .emit('retry.attempt')
        .repeat('1m', 3)
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'retry-timer',
          duration: '5m',
          onExpire: {
            topic: 'retry.attempt',
            data: {},
          },
          repeat: {
            interval: '1m',
            maxCount: 3,
          },
        },
      });
    });

    it('creates set_timer with infinite repeat using fluent builder', () => {
      const action = setTimer('heartbeat')
        .after('10s')
        .emit('health.ping')
        .repeat('10s')
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'heartbeat',
          duration: '10s',
          onExpire: {
            topic: 'health.ping',
            data: {},
          },
          repeat: {
            interval: '10s',
            maxCount: undefined,
          },
        },
      });
    });

    it('uses default duration when after() not called', () => {
      const action = setTimer('default-timer').emit('test.event').build();

      expect((action as any).timer.duration).toBe('1m');
    });

    it('throws error when emit() not called', () => {
      expect(() => {
        setTimer('incomplete-timer').after('5m').build();
      }).toThrow('Timer "incomplete-timer" requires onExpire topic');
    });

    it('supports numeric values for duration and interval', () => {
      const action = setTimer('numeric-timer')
        .after(30000)
        .emit('test.event')
        .repeat(5000, 10)
        .build();

      expect((action as any).timer.duration).toBe(30000);
      expect((action as any).timer.repeat.interval).toBe(5000);
    });

    it('allows method chaining in any order', () => {
      const action = setTimer('flexible-timer')
        .emit('test.event', { data: 'value' })
        .repeat('5m', 2)
        .after('1h')
        .build();

      expect(action).toEqual({
        type: 'set_timer',
        timer: {
          name: 'flexible-timer',
          duration: '1h',
          onExpire: {
            topic: 'test.event',
            data: { data: 'value' },
          },
          repeat: {
            interval: '5m',
            maxCount: 2,
          },
        },
      });
    });
  });
});

describe('cancelTimer', () => {
  it('creates cancel_timer action', () => {
    const action = cancelTimer('payment-timeout').build();

    expect(action).toEqual({
      type: 'cancel_timer',
      name: 'payment-timeout',
    });
  });

  it('supports interpolation patterns in name', () => {
    const action = cancelTimer('order-timeout:${event.orderId}').build();

    expect(action).toEqual({
      type: 'cancel_timer',
      name: 'order-timeout:${event.orderId}',
    });
  });

  it('handles complex timer names', () => {
    const action = cancelTimer('namespace:service:timer-123').build();

    expect(action).toEqual({
      type: 'cancel_timer',
      name: 'namespace:service:timer-123',
    });
  });
});
