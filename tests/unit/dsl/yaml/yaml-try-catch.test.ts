import { describe, it, expect } from 'vitest';
import { validateRule, YamlValidationError } from '../../../../src/dsl/yaml/schema';
import type { RuleAction } from '../../../../src/types/action';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'try-catch-rule',
    trigger: { type: 'event', topic: 'test.event' },
    actions: [{ type: 'emit_event', topic: 'fallback', data: {} }],
    ...overrides,
  };
}

function tryCatchAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'try_catch',
    try: [{ type: 'set_fact', key: 'x', value: 1 }],
    catch: {
      actions: [{ type: 'log', level: 'error', message: 'fail' }],
    },
    ...overrides,
  };
}

type TryCatchAction = Extract<RuleAction, { type: 'try_catch' }>;

// ---------------------------------------------------------------------------
// Valid try_catch
// ---------------------------------------------------------------------------

describe('YAML try_catch action', () => {
  describe('valid definitions', () => {
    it('parses a basic try/catch action', () => {
      const rule = validateRule(minimalRule({
        actions: [tryCatchAction()],
      }));

      const action = rule.actions[0] as TryCatchAction;
      expect(action.type).toBe('try_catch');
      expect(action.try).toHaveLength(1);
      expect(action.try[0]!.type).toBe('set_fact');
      expect(action.catch).toBeDefined();
      expect(action.catch!.actions).toHaveLength(1);
      expect(action.catch!.actions[0]!.type).toBe('log');
    });

    it('parses try/catch with error variable (as)', () => {
      const rule = validateRule(minimalRule({
        actions: [tryCatchAction({
          catch: {
            as: 'err',
            actions: [{ type: 'set_fact', key: 'msg', value: '${var.err.message}' }],
          },
        })],
      }));

      const action = rule.actions[0] as TryCatchAction;
      expect(action.catch!.as).toBe('err');
    });

    it('parses try/finally (no catch)', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          finally: [{ type: 'set_fact', key: 'cleanup', value: true }],
        }],
      }));

      const action = rule.actions[0] as TryCatchAction;
      expect(action.catch).toBeUndefined();
      expect(action.finally).toHaveLength(1);
    });

    it('parses try/catch/finally', () => {
      const rule = validateRule(minimalRule({
        actions: [tryCatchAction({
          finally: [{ type: 'set_fact', key: 'done', value: true }],
        })],
      }));

      const action = rule.actions[0] as TryCatchAction;
      expect(action.try).toHaveLength(1);
      expect(action.catch!.actions).toHaveLength(1);
      expect(action.finally).toHaveLength(1);
    });

    it('parses try with multiple actions', () => {
      const rule = validateRule(minimalRule({
        actions: [tryCatchAction({
          try: [
            { type: 'set_fact', key: 'a', value: 1 },
            { type: 'emit_event', topic: 'test', data: {} },
            { type: 'log', level: 'info', message: 'step3' },
          ],
        })],
      }));

      const action = rule.actions[0] as TryCatchAction;
      expect(action.try).toHaveLength(3);
    });

    it('parses nested try_catch inside try block', () => {
      const rule = validateRule(minimalRule({
        actions: [tryCatchAction({
          try: [{
            type: 'try_catch',
            try: [{ type: 'set_fact', key: 'inner', value: true }],
            catch: { actions: [{ type: 'log', level: 'error', message: 'inner fail' }] },
          }],
        })],
      }));

      const outer = rule.actions[0] as TryCatchAction;
      const inner = outer.try[0] as TryCatchAction;
      expect(inner.type).toBe('try_catch');
      expect(inner.try[0]!.type).toBe('set_fact');
    });

    it('parses try_catch inside for_each', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'for_each',
          collection: { ref: 'event.items' },
          as: 'item',
          actions: [tryCatchAction()],
        }],
      }));

      const forEach = rule.actions[0] as Extract<RuleAction, { type: 'for_each' }>;
      expect(forEach.actions[0]!.type).toBe('try_catch');
    });
  });

  // ─── validation errors ──────────────────────────────────────────────────

  describe('validation errors', () => {
    it('rejects missing try', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          catch: { actions: [{ type: 'log', level: 'error', message: 'x' }] },
        }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects empty try array', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [],
          catch: { actions: [{ type: 'log', level: 'error', message: 'x' }] },
        }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects missing both catch and finally', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
        }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects catch without actions', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          catch: { as: 'err' },
        }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects empty catch actions', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          catch: { actions: [] },
        }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects empty finally array', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          finally: [],
        }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects non-string catch.as', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          catch: { as: 123, actions: [{ type: 'log', level: 'error', message: 'x' }] },
        }],
      }))).toThrow(YamlValidationError);
    });

    it('validates nested actions in try block', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'invalid_type' }],
          catch: { actions: [{ type: 'log', level: 'error', message: 'x' }] },
        }],
      }))).toThrow(YamlValidationError);
    });

    it('validates nested actions in catch block', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          catch: { actions: [{ type: 'invalid_type' }] },
        }],
      }))).toThrow(YamlValidationError);
    });

    it('validates nested actions in finally block', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          catch: { actions: [{ type: 'log', level: 'error', message: 'x' }] },
          finally: [{ type: 'invalid_type' }],
        }],
      }))).toThrow(YamlValidationError);
    });
  });
});
