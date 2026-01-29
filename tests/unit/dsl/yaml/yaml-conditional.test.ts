import { describe, it, expect } from 'vitest';
import { validateRule, YamlValidationError } from '../../../../src/dsl/yaml/schema';
import type { RuleAction } from '../../../../src/types/action';
import type { RuleCondition } from '../../../../src/types/condition';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cond-rule',
    trigger: { type: 'event', topic: 'test.event' },
    actions: [{ type: 'emit_event', topic: 'fallback', data: {} }],
    ...overrides,
  };
}

function conditionObj(field: string, operator: string, value: unknown): Record<string, unknown> {
  return {
    source: { type: 'event', field },
    operator,
    value,
  };
}

function conditionalAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'conditional',
    conditions: [conditionObj('amount', 'gte', 100)],
    then: [{ type: 'emit_event', topic: 'premium.process', data: {} }],
    ...overrides,
  };
}

type ConditionalAction = Extract<RuleAction, { type: 'conditional' }>;

// ---------------------------------------------------------------------------
// Plural "conditions" (array)
// ---------------------------------------------------------------------------

describe('YAML conditional action', () => {
  describe('plural conditions', () => {
    it('parses a conditional action with a single condition', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction()],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.type).toBe('conditional');
      expect(action.conditions).toHaveLength(1);
      expect(action.conditions[0]!.source).toEqual({ type: 'event', field: 'amount' });
      expect(action.conditions[0]!.operator).toBe('gte');
      expect(action.conditions[0]!.value).toBe(100);
      expect(action.then).toHaveLength(1);
      expect(action.then[0]!.type).toBe('emit_event');
      expect(action.else).toBeUndefined();
    });

    it('parses multiple conditions (AND logic)', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({
          conditions: [
            conditionObj('amount', 'gte', 100),
            { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true },
          ],
        })],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.conditions).toHaveLength(2);
      expect(action.conditions[1]!.source).toEqual({ type: 'fact', pattern: 'customer:vip' });
    });
  });

  // ---------------------------------------------------------------------------
  // Singular "condition" (auto-wrapped)
  // ---------------------------------------------------------------------------

  describe('singular condition', () => {
    it('auto-wraps a single condition object into an array', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'conditional',
          condition: conditionObj('status', 'eq', 'active'),
          then: [{ type: 'log', level: 'info', message: 'active' }],
        }],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.conditions).toHaveLength(1);
      expect(action.conditions[0]!.operator).toBe('eq');
      expect(action.conditions[0]!.value).toBe('active');
    });
  });

  // ---------------------------------------------------------------------------
  // else branch
  // ---------------------------------------------------------------------------

  describe('else branch', () => {
    it('parses conditional with else branch', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({
          else: [{ type: 'emit_event', topic: 'standard.process', data: {} }],
        })],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.else).toBeDefined();
      expect(action.else).toHaveLength(1);
      expect(action.else![0]!.type).toBe('emit_event');
    });

    it('parses conditional without else branch', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction()],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.else).toBeUndefined();
    });

    it('accepts empty else array', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({ else: [] })],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.else).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Reference normalization
  // ---------------------------------------------------------------------------

  describe('reference normalization', () => {
    it('normalizes ${...} references in then branch data', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({
          then: [{
            type: 'emit_event',
            topic: 'out',
            data: { orderId: '${event.orderId}' },
          }],
        })],
      }));

      const action = rule.actions[0] as ConditionalAction;
      const emitAction = action.then[0] as Extract<RuleAction, { type: 'emit_event' }>;
      expect(emitAction.data.orderId).toEqual({ ref: 'event.orderId' });
    });

    it('normalizes references in else branch data', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({
          else: [{
            type: 'set_fact',
            key: 'fallback:id',
            value: '${event.id}',
          }],
        })],
      }));

      const action = rule.actions[0] as ConditionalAction;
      const setFact = action.else![0] as Extract<RuleAction, { type: 'set_fact' }>;
      expect(setFact.value).toEqual({ ref: 'event.id' });
    });

    it('normalizes references in condition values', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'conditional',
          conditions: [{
            source: { type: 'event', field: 'userId' },
            operator: 'eq',
            value: '${context.currentUser}',
          }],
          then: [{ type: 'log', level: 'info', message: 'match' }],
        }],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.conditions[0]!.value).toEqual({ ref: 'context.currentUser' });
    });
  });

  // ---------------------------------------------------------------------------
  // Nested conditionals
  // ---------------------------------------------------------------------------

  describe('nested conditionals', () => {
    it('supports conditional inside then branch', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({
          then: [{
            type: 'conditional',
            conditions: [conditionObj('tier', 'eq', 'gold')],
            then: [{ type: 'emit_event', topic: 'gold.process', data: {} }],
            else: [{ type: 'emit_event', topic: 'silver.process', data: {} }],
          }],
        })],
      }));

      const outer = rule.actions[0] as ConditionalAction;
      const inner = outer.then[0] as ConditionalAction;
      expect(inner.type).toBe('conditional');
      expect(inner.conditions[0]!.value).toBe('gold');
      expect(inner.then).toHaveLength(1);
      expect(inner.else).toHaveLength(1);
    });

    it('supports conditional inside else branch', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({
          else: [{
            type: 'conditional',
            conditions: [conditionObj('priority', 'eq', 'high')],
            then: [{ type: 'log', level: 'warn', message: 'high priority fallback' }],
          }],
        })],
      }));

      const outer = rule.actions[0] as ConditionalAction;
      const inner = outer.else![0] as ConditionalAction;
      expect(inner.type).toBe('conditional');
      expect(inner.conditions[0]!.value).toBe('high');
    });

    it('supports deeply nested conditionals (3 levels)', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'conditional',
          conditions: [conditionObj('level', 'eq', 1)],
          then: [{
            type: 'conditional',
            conditions: [conditionObj('level', 'eq', 2)],
            then: [{
              type: 'conditional',
              conditions: [conditionObj('level', 'eq', 3)],
              then: [{ type: 'log', level: 'info', message: 'deep' }],
            }],
          }],
        }],
      }));

      const l1 = rule.actions[0] as ConditionalAction;
      const l2 = l1.then[0] as ConditionalAction;
      const l3 = l2.then[0] as ConditionalAction;
      expect(l3.then[0]!.type).toBe('log');
    });
  });

  // ---------------------------------------------------------------------------
  // Mixed actions
  // ---------------------------------------------------------------------------

  describe('mixed actions', () => {
    it('parses conditional alongside other action types', () => {
      const rule = validateRule(minimalRule({
        actions: [
          { type: 'log', level: 'info', message: 'before' },
          conditionalAction(),
          { type: 'emit_event', topic: 'after', data: {} },
        ],
      }));

      expect(rule.actions).toHaveLength(3);
      expect(rule.actions[0]!.type).toBe('log');
      expect(rule.actions[1]!.type).toBe('conditional');
      expect(rule.actions[2]!.type).toBe('emit_event');
    });

    it('supports multiple actions in then/else branches', () => {
      const rule = validateRule(minimalRule({
        actions: [conditionalAction({
          then: [
            { type: 'set_fact', key: 'premium', value: true },
            { type: 'emit_event', topic: 'premium.process', data: {} },
            { type: 'log', level: 'info', message: 'premium order' },
          ],
          else: [
            { type: 'emit_event', topic: 'standard.process', data: {} },
          ],
        })],
      }));

      const action = rule.actions[0] as ConditionalAction;
      expect(action.then).toHaveLength(3);
      expect(action.else).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Error paths
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws when both conditions and condition are missing', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'conditional',
          then: [{ type: 'log', level: 'info', message: 'x' }],
        }],
      }))).toThrow(/missing required field "conditions"/);
    });

    it('throws when conditions is empty array', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({ conditions: [] })],
      }))).toThrow(/must have at least one condition/);
    });

    it('throws when then is missing', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'conditional',
          conditions: [conditionObj('x', 'eq', 1)],
        }],
      }))).toThrow(/missing required field "then"/);
    });

    it('throws when then is empty array', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({ then: [] })],
      }))).toThrow(/must have at least one action/);
    });

    it('throws on invalid condition in conditions array', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({
          conditions: [{ source: { type: 'event', field: 'x' }, operator: 'bogus', value: 1 }],
        })],
      }))).toThrow(/invalid operator/);
    });

    it('throws on invalid action in then branch', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({
          then: [{ type: 'nonexistent_action' }],
        })],
      }))).toThrow(/invalid action type/);
    });

    it('throws on invalid action in else branch', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({
          else: [{ type: 'nonexistent_action' }],
        })],
      }))).toThrow(/invalid action type/);
    });

    it('throws on invalid condition source type', () => {
      expect(() => validateRule(minimalRule({
        actions: [{
          type: 'conditional',
          conditions: [{ source: { type: 'invalid' }, operator: 'eq', value: 1 }],
        }],
      }))).toThrow(/invalid source type/);
    });

    it('includes correct path for conditions error', () => {
      try {
        validateRule(minimalRule({
          actions: [conditionalAction({ conditions: [] })],
        }));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toContain('actions[0]');
        expect((err as YamlValidationError).path).toContain('conditions');
      }
    });

    it('includes correct path for then branch error', () => {
      try {
        validateRule(minimalRule({
          actions: [conditionalAction({
            then: [{ type: 'emit_event' }],
          })],
        }));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toContain('then[0]');
      }
    });

    it('includes correct path for else branch error', () => {
      try {
        validateRule(minimalRule({
          actions: [conditionalAction({
            else: [{ type: 'log', level: 'invalid', message: 'x' }],
          })],
        }));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toContain('else[0]');
      }
    });

    it('includes correct path for singular condition error', () => {
      try {
        validateRule(minimalRule({
          actions: [{
            type: 'conditional',
            condition: { source: { type: 'event' }, operator: 'eq', value: 1 },
            then: [{ type: 'log', level: 'info', message: 'x' }],
          }],
        }));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toContain('condition');
      }
    });

    it('throws on non-array then', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({
          then: 'not-an-array',
        })],
      }))).toThrow(/must be an array/);
    });

    it('throws on non-array else', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({
          else: 'not-an-array',
        })],
      }))).toThrow(/must be an array/);
    });

    it('throws on non-array conditions', () => {
      expect(() => validateRule(minimalRule({
        actions: [conditionalAction({
          conditions: 'not-an-array',
        })],
      }))).toThrow(/must be an array/);
    });

    it('validates nested conditional error paths correctly', () => {
      try {
        validateRule(minimalRule({
          actions: [conditionalAction({
            then: [{
              type: 'conditional',
              conditions: [conditionObj('x', 'eq', 1)],
              then: [{ type: 'emit_event' }], // missing topic
            }],
          })],
        }));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        const yamlErr = err as YamlValidationError;
        expect(yamlErr.path).toContain('then[0]');
        expect(yamlErr.message).toContain('topic');
      }
    });
  });
});
