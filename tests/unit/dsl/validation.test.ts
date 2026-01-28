import { describe, it, expect } from 'vitest';
import {
  Rule,
  onEvent,
  onFact,
  onTimer,
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
 * Validační testy pro všechny DSL entry pointy.
 *
 * Ověřují, že neplatné vstupy selžou ihned při volání factory funkce
 * (fail-fast), nikoliv až při build().
 */

describe('DSL input validation', () => {
  // ── Triggers ──────────────────────────────────────────────────

  describe('onEvent()', () => {
    it('rejects empty string', () => {
      expect(() => onEvent('')).toThrow('onEvent() topic must be a non-empty string');
    });

    it('rejects non-string value', () => {
      expect(() => onEvent(undefined as any)).toThrow('onEvent() topic must be a non-empty string');
      expect(() => onEvent(null as any)).toThrow('onEvent() topic must be a non-empty string');
      expect(() => onEvent(42 as any)).toThrow('onEvent() topic must be a non-empty string');
    });
  });

  describe('onFact()', () => {
    it('rejects empty string', () => {
      expect(() => onFact('')).toThrow('onFact() pattern must be a non-empty string');
    });

    it('rejects non-string value', () => {
      expect(() => onFact(undefined as any)).toThrow('onFact() pattern must be a non-empty string');
    });
  });

  describe('onTimer()', () => {
    it('rejects empty string', () => {
      expect(() => onTimer('')).toThrow('onTimer() name must be a non-empty string');
    });

    it('rejects non-string value', () => {
      expect(() => onTimer(null as any)).toThrow('onTimer() name must be a non-empty string');
    });
  });

  // ── Condition sources ─────────────────────────────────────────

  describe('event()', () => {
    it('rejects empty string', () => {
      expect(() => event('')).toThrow('event() field must be a non-empty string');
    });

    it('rejects non-string value', () => {
      expect(() => event(undefined as any)).toThrow('event() field must be a non-empty string');
    });
  });

  describe('fact() condition', () => {
    it('rejects empty string', () => {
      expect(() => fact('')).toThrow('fact() pattern must be a non-empty string');
    });

    it('rejects non-string value', () => {
      expect(() => fact(123 as any)).toThrow('fact() pattern must be a non-empty string');
    });
  });

  describe('context()', () => {
    it('rejects empty string', () => {
      expect(() => context('')).toThrow('context() key must be a non-empty string');
    });

    it('rejects non-string value', () => {
      expect(() => context(null as any)).toThrow('context() key must be a non-empty string');
    });
  });

  // ── Actions ───────────────────────────────────────────────────

  describe('emit()', () => {
    it('rejects empty topic', () => {
      expect(() => emit('')).toThrow('emit() topic must be a non-empty string');
    });

    it('rejects non-string topic', () => {
      expect(() => emit(42 as any)).toThrow('emit() topic must be a non-empty string');
    });
  });

  describe('setFact()', () => {
    it('rejects empty key', () => {
      expect(() => setFact('', true)).toThrow('setFact() key must be a non-empty string');
    });

    it('rejects non-string key', () => {
      expect(() => setFact(null as any, true)).toThrow(
        'setFact() key must be a non-empty string',
      );
    });
  });

  describe('deleteFact()', () => {
    it('rejects empty key', () => {
      expect(() => deleteFact('')).toThrow('deleteFact() key must be a non-empty string');
    });

    it('rejects non-string key', () => {
      expect(() => deleteFact(undefined as any)).toThrow(
        'deleteFact() key must be a non-empty string',
      );
    });
  });

  describe('cancelTimer()', () => {
    it('rejects empty name', () => {
      expect(() => cancelTimer('')).toThrow('cancelTimer() name must be a non-empty string');
    });

    it('rejects non-string name', () => {
      expect(() => cancelTimer(42 as any)).toThrow(
        'cancelTimer() name must be a non-empty string',
      );
    });
  });

  describe('log()', () => {
    it('rejects empty level', () => {
      expect(() => log('' as any, 'msg')).toThrow('log() level must be a non-empty string');
    });

    it('rejects invalid level', () => {
      expect(() => log('verbose' as any, 'msg')).toThrow(
        'log() level must be one of: debug, info, warn, error',
      );
    });

    it('rejects non-string message', () => {
      expect(() => log('info', 42 as any)).toThrow('log() message must be a string');
    });

    it('accepts empty message', () => {
      expect(() => log('info', '')).not.toThrow();
    });
  });

  // ── callService() ────────────────────────────────────────────

  describe('callService()', () => {
    it('rejects empty service name', () => {
      expect(() => callService('')).toThrow('callService() service must be a non-empty string');
    });

    it('rejects non-string service name', () => {
      expect(() => callService(null as any)).toThrow(
        'callService() service must be a non-empty string',
      );
    });

    it('rejects empty method in direct call', () => {
      expect(() => callService('svc', '')).toThrow(
        'callService() method must be a non-empty string',
      );
    });

    it('rejects empty method in fluent call', () => {
      const builder = callService('svc');
      expect(() => (builder as any).method('')).toThrow(
        'callService().method() name must be a non-empty string',
      );
    });
  });

  // ── setTimer() ───────────────────────────────────────────────

  describe('setTimer() fluent', () => {
    it('rejects empty name', () => {
      expect(() => setTimer('')).toThrow('setTimer() name must be a non-empty string');
    });

    it('rejects non-string name', () => {
      // Číslo padne do config-object větve, kde validace hlásí config.name
      expect(() => setTimer(42 as any)).toThrow('must be a non-empty string');
    });

    it('rejects invalid duration in .after()', () => {
      const builder = setTimer('timer') as ReturnType<typeof setTimer>;
      expect(() => (builder as any).after('bad')).toThrow(
        'setTimer().after() duration must be a duration string',
      );
    });

    it('rejects zero duration in .after()', () => {
      const builder = setTimer('timer') as ReturnType<typeof setTimer>;
      expect(() => (builder as any).after(0)).toThrow(
        'setTimer().after() duration must be a positive number',
      );
    });

    it('rejects empty topic in .emit()', () => {
      const builder = setTimer('timer') as ReturnType<typeof setTimer>;
      expect(() => (builder as any).emit('')).toThrow(
        'setTimer().emit() topic must be a non-empty string',
      );
    });

    it('rejects invalid interval in .repeat()', () => {
      const builder = setTimer('timer') as ReturnType<typeof setTimer>;
      expect(() => (builder as any).repeat('bad')).toThrow(
        'setTimer().repeat() interval must be a duration string',
      );
    });

    it('accepts valid fluent chain', () => {
      expect(() =>
        (setTimer('timer') as any).after('5m').emit('t.expire').build(),
      ).not.toThrow();
    });
  });

  describe('setTimer() config object', () => {
    it('rejects empty name', () => {
      expect(() =>
        setTimer({ name: '', duration: '5m', onExpire: { topic: 'x' } }),
      ).toThrow('setTimer() config.name must be a non-empty string');
    });

    it('rejects invalid duration', () => {
      expect(() =>
        setTimer({ name: 'timer', duration: 'bad', onExpire: { topic: 'x' } }),
      ).toThrow('setTimer() config.duration must be a duration string');
    });

    it('rejects zero duration', () => {
      expect(() =>
        setTimer({ name: 'timer', duration: 0, onExpire: { topic: 'x' } }),
      ).toThrow('setTimer() config.duration must be a positive number');
    });

    it('rejects empty onExpire topic', () => {
      expect(() =>
        setTimer({ name: 'timer', duration: '5m', onExpire: { topic: '' } }),
      ).toThrow('setTimer() config.onExpire.topic must be a non-empty string');
    });

    it('rejects invalid repeat interval', () => {
      expect(() =>
        setTimer({
          name: 'timer',
          duration: '5m',
          onExpire: { topic: 'x' },
          repeat: { interval: 'bad' },
        }),
      ).toThrow('setTimer() config.repeat.interval must be a duration string');
    });

    it('accepts valid config', () => {
      expect(() =>
        setTimer({
          name: 'timer',
          duration: '15m',
          onExpire: { topic: 'x.expired' },
          repeat: { interval: '5m', maxCount: 3 },
        }),
      ).not.toThrow();
    });
  });

  // ── ref() ────────────────────────────────────────────────────

  describe('ref()', () => {
    it('rejects empty path', () => {
      expect(() => ref('')).toThrow('ref() path must be a non-empty string');
    });

    it('rejects non-string path', () => {
      expect(() => ref(undefined as any)).toThrow('ref() path must be a non-empty string');
      expect(() => ref(null as any)).toThrow('ref() path must be a non-empty string');
      expect(() => ref(42 as any)).toThrow('ref() path must be a non-empty string');
    });
  });

  // ── Full rule build with validation ──────────────────────────

  describe('Rule.create() with validation', () => {
    it('catches invalid trigger topic at creation time', () => {
      expect(() =>
        Rule.create('rule').when(onEvent('')),
      ).toThrow('onEvent() topic must be a non-empty string');
    });

    it('catches invalid condition source at creation time', () => {
      expect(() =>
        Rule.create('rule')
          .when(onEvent('test'))
          .if(event('').eq(true)),
      ).toThrow('event() field must be a non-empty string');
    });

    it('catches invalid action topic at creation time', () => {
      expect(() =>
        Rule.create('rule')
          .when(onEvent('test'))
          .then(emit('')),
      ).toThrow('emit() topic must be a non-empty string');
    });

    it('builds successfully with all valid inputs', () => {
      const rule = Rule.create('valid-rule')
        .name('Valid Rule')
        .description('Test rule for validation')
        .priority(10)
        .tags('test', 'validation')
        .when(onEvent('order.created'))
        .if(event('amount').gte(100))
        .and(fact('customer:${event.customerId}:vip').eq(true))
        .and(context('threshold').lte(ref('event.amount')))
        .then(emit('notification.send', { orderId: ref('event.orderId') }))
        .also(setFact('order:${event.orderId}:notified', ref('event.timestamp')))
        .also(log.info('Order ${event.orderId} processed'))
        .build();

      expect(rule.id).toBe('valid-rule');
      expect(rule.conditions).toHaveLength(3);
      expect(rule.actions).toHaveLength(3);
    });
  });
});
