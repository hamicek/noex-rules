import { describe, it, expect } from 'vitest';
import { validateRule, normalizeValue, YamlValidationError } from '../../../../src/dsl/yaml/schema';

// ---------------------------------------------------------------------------
// Helper: minimal valid rule object
// ---------------------------------------------------------------------------

function minimalRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-rule',
    trigger: { type: 'event', topic: 'test.event' },
    actions: [{ type: 'emit_event', topic: 'test.result', data: {} }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeValue
// ---------------------------------------------------------------------------

describe('normalizeValue', () => {
  it('passes primitives through unchanged', () => {
    expect(normalizeValue(42)).toBe(42);
    expect(normalizeValue('hello')).toBe('hello');
    expect(normalizeValue(true)).toBe(true);
    expect(normalizeValue(null)).toBe(null);
  });

  it('converts ${...} string to ref object', () => {
    expect(normalizeValue('${event.orderId}')).toEqual({ ref: 'event.orderId' });
    expect(normalizeValue('${context.user.name}')).toEqual({ ref: 'context.user.name' });
  });

  it('does not convert partial interpolation', () => {
    expect(normalizeValue('prefix-${event.id}')).toBe('prefix-${event.id}');
    expect(normalizeValue('${event.id}-suffix')).toBe('${event.id}-suffix');
  });

  it('passes through explicit { ref } object', () => {
    expect(normalizeValue({ ref: 'event.field' })).toEqual({ ref: 'event.field' });
  });

  it('does not treat object with ref + other keys as reference', () => {
    const input = { ref: 'event.field', extra: 'value' };
    expect(normalizeValue(input)).toEqual({ ref: 'event.field', extra: 'value' });
  });

  it('normalizes arrays recursively', () => {
    expect(normalizeValue(['a', '${event.x}', 42])).toEqual([
      'a',
      { ref: 'event.x' },
      42,
    ]);
  });

  it('normalizes nested objects recursively', () => {
    const input = {
      orderId: '${event.orderId}',
      message: 'hello',
      nested: { value: '${context.key}' },
    };
    expect(normalizeValue(input)).toEqual({
      orderId: { ref: 'event.orderId' },
      message: 'hello',
      nested: { value: { ref: 'context.key' } },
    });
  });
});

// ---------------------------------------------------------------------------
// validateRule — basics
// ---------------------------------------------------------------------------

describe('validateRule', () => {
  describe('defaults', () => {
    it('produces valid RuleInput with minimal fields', () => {
      const rule = validateRule(minimalRule());
      expect(rule).toEqual({
        id: 'test-rule',
        name: 'test-rule',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'test.result', data: {} }],
      });
    });

    it('uses id as name when name is missing', () => {
      expect(validateRule(minimalRule()).name).toBe('test-rule');
    });

    it('defaults priority to 0', () => {
      expect(validateRule(minimalRule()).priority).toBe(0);
    });

    it('defaults enabled to true', () => {
      expect(validateRule(minimalRule()).enabled).toBe(true);
    });
  });

  describe('all fields', () => {
    it('accepts all optional fields', () => {
      const rule = validateRule(minimalRule({
        name: 'My Rule',
        description: 'A test rule',
        priority: 50,
        enabled: false,
        tags: ['tag1', 'tag2'],
      }));

      expect(rule.name).toBe('My Rule');
      expect(rule.description).toBe('A test rule');
      expect(rule.priority).toBe(50);
      expect(rule.enabled).toBe(false);
      expect(rule.tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('required fields', () => {
    it('throws on missing id', () => {
      expect(() => validateRule({ trigger: { type: 'event', topic: 't' }, actions: [{ type: 'delete_fact', key: 'k' }] }))
        .toThrow(YamlValidationError);
    });

    it('throws on missing trigger', () => {
      expect(() => validateRule({ id: 'x', actions: [{ type: 'delete_fact', key: 'k' }] }))
        .toThrow(YamlValidationError);
    });

    it('throws on missing actions', () => {
      expect(() => validateRule({ id: 'x', trigger: { type: 'event', topic: 't' } }))
        .toThrow(YamlValidationError);
    });

    it('throws on empty actions array', () => {
      expect(() => validateRule(minimalRule({ actions: [] })))
        .toThrow(/must have at least one action/);
    });
  });

  describe('type validation', () => {
    it('throws when priority is not a number', () => {
      expect(() => validateRule(minimalRule({ priority: 'high' })))
        .toThrow(YamlValidationError);
    });

    it('throws when enabled is not a boolean', () => {
      expect(() => validateRule(minimalRule({ enabled: 'yes' })))
        .toThrow(YamlValidationError);
    });

    it('throws when tags contains non-strings', () => {
      expect(() => validateRule(minimalRule({ tags: [1, 2] })))
        .toThrow(YamlValidationError);
    });

    it('throws when description is not a string', () => {
      expect(() => validateRule(minimalRule({ description: 123 })))
        .toThrow(YamlValidationError);
    });
  });

  // ---------------------------------------------------------------------------
  // Trigger validation
  // ---------------------------------------------------------------------------

  describe('trigger', () => {
    it('validates event trigger', () => {
      const rule = validateRule(minimalRule({
        trigger: { type: 'event', topic: 'order.created' },
      }));
      expect(rule.trigger).toEqual({ type: 'event', topic: 'order.created' });
    });

    it('validates fact trigger', () => {
      const rule = validateRule(minimalRule({
        trigger: { type: 'fact', pattern: 'user:*:age' },
      }));
      expect(rule.trigger).toEqual({ type: 'fact', pattern: 'user:*:age' });
    });

    it('validates timer trigger', () => {
      const rule = validateRule(minimalRule({
        trigger: { type: 'timer', name: 'payment-check' },
      }));
      expect(rule.trigger).toEqual({ type: 'timer', name: 'payment-check' });
    });

    it('throws on invalid trigger type', () => {
      expect(() => validateRule(minimalRule({
        trigger: { type: 'unknown', topic: 'x' },
      }))).toThrow(/invalid trigger type/);
    });

    it('throws on missing trigger topic', () => {
      expect(() => validateRule(minimalRule({
        trigger: { type: 'event' },
      }))).toThrow(/missing required field "topic"/);
    });
  });

  // ---------------------------------------------------------------------------
  // Temporal trigger patterns
  // ---------------------------------------------------------------------------

  describe('temporal patterns', () => {
    it('validates sequence pattern', () => {
      const rule = validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'auth.login_failed' },
              { topic: 'auth.login_failed' },
              { topic: 'auth.login_failed' },
            ],
            within: '5m',
            groupBy: 'userId',
            strict: true,
          },
        },
      }));

      expect(rule.trigger).toEqual({
        type: 'temporal',
        pattern: {
          type: 'sequence',
          events: [
            { topic: 'auth.login_failed' },
            { topic: 'auth.login_failed' },
            { topic: 'auth.login_failed' },
          ],
          within: '5m',
          groupBy: 'userId',
          strict: true,
        },
      });
    });

    it('validates absence pattern', () => {
      const rule = validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'absence',
            after: { topic: 'order.created' },
            expected: { topic: 'payment.received' },
            within: '24h',
            groupBy: 'orderId',
          },
        },
      }));

      expect(rule.trigger.type).toBe('temporal');
    });

    it('validates count pattern', () => {
      const rule = validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'count',
            event: { topic: 'api.request' },
            threshold: 100,
            comparison: 'gte',
            window: '1m',
            sliding: true,
          },
        },
      }));

      const trigger = rule.trigger as { type: 'temporal'; pattern: { type: string; sliding?: boolean } };
      expect(trigger.pattern.type).toBe('count');
      expect(trigger.pattern.sliding).toBe(true);
    });

    it('validates aggregate pattern', () => {
      const rule = validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'aggregate',
            event: { topic: 'order.placed' },
            field: 'amount',
            function: 'sum',
            threshold: 10000,
            comparison: 'gte',
            window: '1h',
            groupBy: 'customerId',
          },
        },
      }));

      const trigger = rule.trigger as { type: 'temporal'; pattern: { type: string } };
      expect(trigger.pattern.type).toBe('aggregate');
    });

    it('validates event matcher with filter and alias', () => {
      const rule = validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'order.created', filter: { status: 'pending' }, as: 'start' },
              { topic: 'order.completed', as: 'end' },
            ],
            within: '30m',
          },
        },
      }));

      const trigger = rule.trigger as { type: 'temporal'; pattern: { events: Array<{ topic: string; filter?: Record<string, unknown>; as?: string }> } };
      expect(trigger.pattern.events[0]).toEqual({
        topic: 'order.created',
        filter: { status: 'pending' },
        as: 'start',
      });
    });

    it('validates duration as number (milliseconds)', () => {
      const rule = validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'absence',
            after: { topic: 'a' },
            expected: { topic: 'b' },
            within: 60000,
          },
        },
      }));

      const trigger = rule.trigger as { type: 'temporal'; pattern: { within: string | number } };
      expect(trigger.pattern.within).toBe(60000);
    });

    it('throws on sequence with < 2 events', () => {
      expect(() => validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [{ topic: 'only.one' }],
            within: '5m',
          },
        },
      }))).toThrow(/must have at least 2 events/);
    });

    it('throws on invalid temporal type', () => {
      expect(() => validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: { type: 'invalid' },
        },
      }))).toThrow(/invalid temporal pattern type/);
    });

    it('throws on invalid comparison in count', () => {
      expect(() => validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'count',
            event: { topic: 'x' },
            threshold: 5,
            comparison: 'gt',
            window: '1m',
          },
        },
      }))).toThrow(/invalid comparison/);
    });

    it('throws on invalid aggregate function', () => {
      expect(() => validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'aggregate',
            event: { topic: 'x' },
            field: 'amount',
            function: 'median',
            threshold: 100,
            comparison: 'gte',
            window: '1h',
          },
        },
      }))).toThrow(/invalid function/);
    });

    it('throws on invalid duration format', () => {
      expect(() => validateRule(minimalRule({
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'absence',
            after: { topic: 'a' },
            expected: { topic: 'b' },
            within: 'invalid',
          },
        },
      }))).toThrow(/must be a duration string/);
    });
  });

  // ---------------------------------------------------------------------------
  // Condition validation
  // ---------------------------------------------------------------------------

  describe('conditions', () => {
    it('validates event source condition', () => {
      const rule = validateRule(minimalRule({
        conditions: [{
          source: { type: 'event', field: 'amount' },
          operator: 'gte',
          value: 100,
        }],
      }));

      expect(rule.conditions[0]).toEqual({
        source: { type: 'event', field: 'amount' },
        operator: 'gte',
        value: 100,
      });
    });

    it('validates fact source condition', () => {
      const rule = validateRule(minimalRule({
        conditions: [{
          source: { type: 'fact', pattern: 'user:123:active' },
          operator: 'eq',
          value: true,
        }],
      }));

      expect(rule.conditions[0]!.source).toEqual({ type: 'fact', pattern: 'user:123:active' });
    });

    it('validates context source condition', () => {
      const rule = validateRule(minimalRule({
        conditions: [{
          source: { type: 'context', key: 'env' },
          operator: 'eq',
          value: 'production',
        }],
      }));

      expect(rule.conditions[0]!.source).toEqual({ type: 'context', key: 'env' });
    });

    it('validates all operators', () => {
      const operators = [
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
        'in', 'not_in', 'contains', 'not_contains', 'matches',
      ];

      for (const op of operators) {
        const value = ['in', 'not_in'].includes(op) ? [1, 2, 3] : 'x';
        const rule = validateRule(minimalRule({
          conditions: [{
            source: { type: 'event', field: 'x' },
            operator: op,
            value,
          }],
        }));
        expect(rule.conditions[0]!.operator).toBe(op);
      }
    });

    it('validates unary operators (exists, not_exists)', () => {
      for (const op of ['exists', 'not_exists']) {
        const rule = validateRule(minimalRule({
          conditions: [{
            source: { type: 'event', field: 'optionalField' },
            operator: op,
          }],
        }));
        expect(rule.conditions[0]!.operator).toBe(op);
        expect(rule.conditions[0]!.value).toBe(true);
      }
    });

    it('normalizes ${...} references in condition values', () => {
      const rule = validateRule(minimalRule({
        conditions: [{
          source: { type: 'event', field: 'userId' },
          operator: 'eq',
          value: '${context.currentUserId}',
        }],
      }));

      expect(rule.conditions[0]!.value).toEqual({ ref: 'context.currentUserId' });
    });

    it('throws on invalid operator', () => {
      expect(() => validateRule(minimalRule({
        conditions: [{
          source: { type: 'event', field: 'x' },
          operator: 'like',
          value: '%pattern%',
        }],
      }))).toThrow(/invalid operator/);
    });

    it('throws on invalid source type', () => {
      expect(() => validateRule(minimalRule({
        conditions: [{
          source: { type: 'database', table: 'users' },
          operator: 'eq',
          value: 1,
        }],
      }))).toThrow(/invalid source type/);
    });

    it('throws when non-unary operator has no value', () => {
      expect(() => validateRule(minimalRule({
        conditions: [{
          source: { type: 'event', field: 'x' },
          operator: 'eq',
        }],
      }))).toThrow(/missing required field "value"/);
    });
  });

  // ---------------------------------------------------------------------------
  // Action validation
  // ---------------------------------------------------------------------------

  describe('actions', () => {
    it('validates set_fact action', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'set_fact',
          key: 'user:123:status',
          value: 'active',
        }],
      }));

      expect(rule.actions[0]).toEqual({
        type: 'set_fact',
        key: 'user:123:status',
        value: 'active',
      });
    });

    it('validates set_fact with ${...} reference', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'set_fact',
          key: 'order:status',
          value: '${event.status}',
        }],
      }));

      expect(rule.actions[0]).toEqual({
        type: 'set_fact',
        key: 'order:status',
        value: { ref: 'event.status' },
      });
    });

    it('validates delete_fact action', () => {
      const rule = validateRule(minimalRule({
        actions: [{ type: 'delete_fact', key: 'temp:data' }],
      }));

      expect(rule.actions[0]).toEqual({ type: 'delete_fact', key: 'temp:data' });
    });

    it('validates emit_event action', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'emit_event',
          topic: 'notification.send',
          data: {
            orderId: '${event.orderId}',
            message: 'Order created',
          },
        }],
      }));

      expect(rule.actions[0]).toEqual({
        type: 'emit_event',
        topic: 'notification.send',
        data: {
          orderId: { ref: 'event.orderId' },
          message: 'Order created',
        },
      });
    });

    it('validates emit_event with default empty data', () => {
      const rule = validateRule(minimalRule({
        actions: [{ type: 'emit_event', topic: 'ping' }],
      }));

      expect(rule.actions[0]).toEqual({
        type: 'emit_event',
        topic: 'ping',
        data: {},
      });
    });

    it('validates set_timer action', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'set_timer',
          timer: {
            name: 'payment-timeout',
            duration: '15m',
            onExpire: {
              topic: 'order.timeout',
              data: { reason: 'Payment not received' },
            },
          },
        }],
      }));

      const action = rule.actions[0] as { type: 'set_timer'; timer: { name: string; duration: string | number } };
      expect(action.timer.name).toBe('payment-timeout');
      expect(action.timer.duration).toBe('15m');
    });

    it('validates set_timer with repeat', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'set_timer',
          timer: {
            name: 'heartbeat',
            duration: '30s',
            onExpire: { topic: 'health.check', data: {} },
            repeat: { interval: '30s', maxCount: 10 },
          },
        }],
      }));

      const action = rule.actions[0] as { type: 'set_timer'; timer: { repeat?: { interval: string | number; maxCount?: number } } };
      expect(action.timer.repeat).toEqual({ interval: '30s', maxCount: 10 });
    });

    it('validates cancel_timer action', () => {
      const rule = validateRule(minimalRule({
        actions: [{ type: 'cancel_timer', name: 'my-timer' }],
      }));

      expect(rule.actions[0]).toEqual({ type: 'cancel_timer', name: 'my-timer' });
    });

    it('validates call_service action', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'call_service',
          service: 'emailService',
          method: 'send',
          args: ['user@example.com', 'Welcome!'],
        }],
      }));

      expect(rule.actions[0]).toEqual({
        type: 'call_service',
        service: 'emailService',
        method: 'send',
        args: ['user@example.com', 'Welcome!'],
      });
    });

    it('validates call_service with default empty args', () => {
      const rule = validateRule(minimalRule({
        actions: [{
          type: 'call_service',
          service: 'cache',
          method: 'clear',
        }],
      }));

      const action = rule.actions[0] as { type: 'call_service'; args: unknown[] };
      expect(action.args).toEqual([]);
    });

    it('validates log action', () => {
      for (const level of ['debug', 'info', 'warn', 'error']) {
        const rule = validateRule(minimalRule({
          actions: [{ type: 'log', level, message: `Test ${level}` }],
        }));

        expect(rule.actions[0]).toEqual({
          type: 'log',
          level,
          message: `Test ${level}`,
        });
      }
    });

    it('throws on invalid action type', () => {
      expect(() => validateRule(minimalRule({
        actions: [{ type: 'send_email', to: 'user@test.com' }],
      }))).toThrow(/invalid action type/);
    });

    it('throws on invalid log level', () => {
      expect(() => validateRule(minimalRule({
        actions: [{ type: 'log', level: 'verbose', message: 'x' }],
      }))).toThrow(/invalid log level/);
    });

    it('throws on missing emit_event topic', () => {
      expect(() => validateRule(minimalRule({
        actions: [{ type: 'emit_event', data: {} }],
      }))).toThrow(/missing required field "topic"/);
    });
  });

  // ---------------------------------------------------------------------------
  // Error paths
  // ---------------------------------------------------------------------------

  describe('error paths', () => {
    it('includes path in error message', () => {
      try {
        validateRule({
          id: 'x',
          trigger: { type: 'event', topic: 't' },
          actions: [{ type: 'emit_event', topic: 'x', data: { nested: { ref: 123 } } }],
          conditions: [{ source: { type: 'event' }, operator: 'eq', value: 1 }],
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toContain('conditions[0]');
      }
    });

    it('reports correct path for nested temporal pattern', () => {
      try {
        validateRule(minimalRule({
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'sequence',
              events: [{ topic: 'a' }, { topic: '' }],
              within: '5m',
            },
          },
        }));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toContain('events[1]');
      }
    });
  });
});
