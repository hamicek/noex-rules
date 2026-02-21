import { describe, it, expect } from 'vitest';
import { tryCatch, TryCatchBuilder } from '../../../../src/dsl/action/try-catch-action';
import { emit } from '../../../../src/dsl/action/emit';
import { setFact } from '../../../../src/dsl/action/fact-actions';
import { log } from '../../../../src/dsl/action/log-action';
import { callService } from '../../../../src/dsl/action/service-actions';
import { ref } from '../../../../src/dsl/helpers/ref';
import { DslValidationError } from '../../../../src/dsl/helpers/errors';
import type { RuleAction } from '../../../../src/types/action';

type TryCatchAction = Extract<RuleAction, { type: 'try_catch' }>;

describe('TryCatchBuilder', () => {
  // ─── basic build ──────────────────────────────────────────────────────

  describe('basic build', () => {
    it('builds try/catch action with raw RuleAction inputs', () => {
      const action = tryCatch(
        { type: 'set_fact', key: 'a', value: 1 },
      )
      .catch(
        { type: 'log', level: 'error', message: 'fail' },
      )
      .build() as TryCatchAction;

      expect(action.type).toBe('try_catch');
      expect(action.try).toHaveLength(1);
      expect(action.try[0]!.type).toBe('set_fact');
      expect(action.catch).toBeDefined();
      expect(action.catch!.actions).toHaveLength(1);
      expect(action.catch!.actions[0]!.type).toBe('log');
      expect(action.catch!.as).toBeUndefined();
      expect(action.finally).toBeUndefined();
    });

    it('builds try/catch action with builder inputs', () => {
      const action = tryCatch(
        callService('payment').method('charge').args(ref('event.amount')),
        setFact('status', 'charged'),
      )
      .catch(
        log('error', 'Payment failed'),
        setFact('status', 'failed'),
      )
      .build() as TryCatchAction;

      expect(action.try).toHaveLength(2);
      expect(action.catch!.actions).toHaveLength(2);
    });

    it('builds try/finally action (no catch)', () => {
      const action = tryCatch(
        setFact('x', 1),
      )
      .finally(
        setFact('cleanup', true),
      )
      .build() as TryCatchAction;

      expect(action.try).toHaveLength(1);
      expect(action.catch).toBeUndefined();
      expect(action.finally).toHaveLength(1);
    });

    it('builds try/catch/finally action', () => {
      const action = tryCatch(
        setFact('a', 1),
      )
      .catch(
        log('error', 'fail'),
      )
      .finally(
        setFact('done', true),
      )
      .build() as TryCatchAction;

      expect(action.try).toHaveLength(1);
      expect(action.catch!.actions).toHaveLength(1);
      expect(action.finally).toHaveLength(1);
    });
  });

  // ─── catchAs ──────────────────────────────────────────────────────────

  describe('catchAs', () => {
    it('sets error variable name on catch', () => {
      const action = tryCatch(
        setFact('x', 1),
      )
      .catchAs('err')
      .catch(
        setFact('msg', ref('var.err.message')),
      )
      .build() as TryCatchAction;

      expect(action.catch!.as).toBe('err');
    });

    it('does not set as when catchAs is not called', () => {
      const action = tryCatch(
        setFact('x', 1),
      )
      .catch(
        log('error', 'oops'),
      )
      .build() as TryCatchAction;

      expect(action.catch!.as).toBeUndefined();
    });
  });

  // ─── chaining ─────────────────────────────────────────────────────────

  describe('chaining', () => {
    it('supports multiple catch calls', () => {
      const action = tryCatch(setFact('x', 1))
        .catch(log('error', 'first'))
        .catch(log('error', 'second'))
        .build() as TryCatchAction;

      expect(action.catch!.actions).toHaveLength(2);
    });

    it('supports multiple finally calls', () => {
      const action = tryCatch(setFact('x', 1))
        .catch(log('error', 'err'))
        .finally(setFact('a', 1))
        .finally(setFact('b', 2))
        .build() as TryCatchAction;

      expect(action.finally).toHaveLength(2);
    });

    it('returns this for all methods (fluent)', () => {
      const builder = tryCatch(setFact('x', 1));
      expect(builder.catchAs('e')).toBe(builder);
      expect(builder.catch(log('error', 'x'))).toBe(builder);
      expect(builder.finally(setFact('y', 2))).toBe(builder);
    });
  });

  // ─── validation errors ────────────────────────────────────────────────

  describe('validation errors', () => {
    it('throws when no try actions', () => {
      expect(() => tryCatch().catch(log('error', 'x')).build())
        .toThrow(DslValidationError);
    });

    it('throws when neither catch nor finally', () => {
      expect(() => tryCatch(setFact('x', 1)).build())
        .toThrow(DslValidationError);
    });

    it('throws on empty string catchAs', () => {
      expect(() => tryCatch(setFact('x', 1)).catchAs(''))
        .toThrow(DslValidationError);
    });
  });

  // ─── factory function ─────────────────────────────────────────────────

  describe('factory function', () => {
    it('returns TryCatchBuilder instance', () => {
      expect(tryCatch(setFact('x', 1))).toBeInstanceOf(TryCatchBuilder);
    });

    it('accepts mixed builder and raw action inputs', () => {
      const action = tryCatch(
        setFact('a', 1),                                           // builder
        { type: 'set_fact', key: 'b', value: 2 },                 // raw
        emit('test', { data: ref('event.orderId') }),              // builder
      )
      .catch(log('error', 'x'))
      .build() as TryCatchAction;

      expect(action.try).toHaveLength(3);
      expect(action.try[0]!.type).toBe('set_fact');
      expect(action.try[1]!.type).toBe('set_fact');
      expect(action.try[2]!.type).toBe('emit_event');
    });
  });
});
