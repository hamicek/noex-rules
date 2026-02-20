import { describe, it, expect } from 'vitest';
import { validateRule, YamlValidationError } from '../../../../src/dsl/yaml/schema';
import type { RuleAction } from '../../../../src/types/action';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'foreach-rule',
    trigger: { type: 'event', topic: 'test.event' },
    actions: [{ type: 'emit_event', topic: 'fallback', data: {} }],
    ...overrides,
  };
}

function forEachAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'for_each',
    collection: { ref: 'event.items' },
    as: 'item',
    actions: [{ type: 'set_fact', key: 'processed', value: true }],
    ...overrides,
  };
}

type ForEachAction = Extract<RuleAction, { type: 'for_each' }>;

// ---------------------------------------------------------------------------
// Valid for_each
// ---------------------------------------------------------------------------

describe('YAML for_each action', () => {
  describe('valid definitions', () => {
    it('parses a basic for_each action', () => {
      const rule = validateRule(minimalRule({
        actions: [forEachAction()],
      }));

      const action = rule.actions[0] as ForEachAction;
      expect(action.type).toBe('for_each');
      expect(action.collection).toEqual({ ref: 'event.items' });
      expect(action.as).toBe('item');
      expect(action.actions).toHaveLength(1);
      expect(action.actions[0]!.type).toBe('set_fact');
    });

    it('parses for_each with literal array collection', () => {
      const rule = validateRule(minimalRule({
        actions: [forEachAction({ collection: [1, 2, 3] })],
      }));

      const action = rule.actions[0] as ForEachAction;
      expect(action.collection).toEqual([1, 2, 3]);
    });

    it('parses for_each with maxIterations', () => {
      const rule = validateRule(minimalRule({
        actions: [forEachAction({ maxIterations: 50 })],
      }));

      const action = rule.actions[0] as ForEachAction;
      expect(action.maxIterations).toBe(50);
    });

    it('parses for_each with multiple body actions', () => {
      const rule = validateRule(minimalRule({
        actions: [forEachAction({
          actions: [
            { type: 'set_fact', key: 'a', value: 1 },
            { type: 'emit_event', topic: 'test', data: {} },
          ],
        })],
      }));

      const action = rule.actions[0] as ForEachAction;
      expect(action.actions).toHaveLength(2);
    });

    it('parses nested for_each', () => {
      const rule = validateRule(minimalRule({
        actions: [forEachAction({
          actions: [
            {
              type: 'for_each',
              collection: { ref: 'var.item.children' },
              as: 'child',
              actions: [{ type: 'set_fact', key: 'nested', value: true }],
            },
          ],
        })],
      }));

      const outer = rule.actions[0] as ForEachAction;
      const inner = outer.actions[0] as ForEachAction;
      expect(inner.type).toBe('for_each');
      expect(inner.as).toBe('child');
    });

    it('parses for_each with conditional in body', () => {
      const rule = validateRule(minimalRule({
        actions: [forEachAction({
          actions: [
            {
              type: 'conditional',
              conditions: [{ source: { type: 'context', key: 'item.amount' }, operator: 'gte', value: 100 }],
              then: [{ type: 'set_fact', key: 'high', value: true }],
            },
          ],
        })],
      }));

      const action = rule.actions[0] as ForEachAction;
      expect(action.actions[0]!.type).toBe('conditional');
    });
  });

  // ─── validation errors ──────────────────────────────────────────────────

  describe('validation errors', () => {
    it('rejects missing collection', () => {
      expect(() => validateRule(minimalRule({
        actions: [{ type: 'for_each', as: 'item', actions: [{ type: 'log', level: 'info', message: 'x' }] }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects missing as', () => {
      expect(() => validateRule(minimalRule({
        actions: [{ type: 'for_each', collection: [1], actions: [{ type: 'log', level: 'info', message: 'x' }] }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects missing actions', () => {
      expect(() => validateRule(minimalRule({
        actions: [{ type: 'for_each', collection: [1], as: 'item' }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects empty actions array', () => {
      expect(() => validateRule(minimalRule({
        actions: [{ type: 'for_each', collection: [1], as: 'item', actions: [] }],
      }))).toThrow(YamlValidationError);
    });

    it('rejects non-numeric maxIterations', () => {
      expect(() => validateRule(minimalRule({
        actions: [forEachAction({ maxIterations: 'abc' })],
      }))).toThrow(YamlValidationError);
    });
  });
});
