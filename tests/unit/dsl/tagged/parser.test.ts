import { describe, it, expect } from 'vitest';
import { parseRuleTemplate, ParseError } from '../../../../src/dsl/tagged/parser';

// ---------------------------------------------------------------------------
// Helper: minimální validní template
// ---------------------------------------------------------------------------

function minimal(extra = ''): string {
  return `
    id: test-rule
    WHEN event test.topic
    ${extra}
    THEN emit result
  `;
}

// ===========================================================================
// Properties
// ===========================================================================

describe('parseRuleTemplate', () => {
  describe('properties', () => {
    it('parses id', () => {
      const rule = parseRuleTemplate(minimal());
      expect(rule.id).toBe('test-rule');
    });

    it('parses name', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        name: My Rule Name
        WHEN event test
        THEN emit result
      `);
      expect(rule.name).toBe('My Rule Name');
    });

    it('uses id as name when name is omitted', () => {
      const rule = parseRuleTemplate(minimal());
      expect(rule.name).toBe('test-rule');
    });

    it('parses description', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        description: This rule does something important
        WHEN event test
        THEN emit result
      `);
      expect(rule.description).toBe('This rule does something important');
    });

    it('parses priority', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        priority: 100
        WHEN event test
        THEN emit result
      `);
      expect(rule.priority).toBe(100);
    });

    it('parses negative priority', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        priority: -5
        WHEN event test
        THEN emit result
      `);
      expect(rule.priority).toBe(-5);
    });

    it('defaults priority to 0', () => {
      const rule = parseRuleTemplate(minimal());
      expect(rule.priority).toBe(0);
    });

    it('throws for non-numeric priority', () => {
      expect(() => parseRuleTemplate(`
        id: my-rule
        priority: high
        WHEN event test
        THEN emit result
      `)).toThrow(ParseError);
    });

    it('parses enabled true', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        enabled: true
        WHEN event test
        THEN emit result
      `);
      expect(rule.enabled).toBe(true);
    });

    it('parses enabled false', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        enabled: false
        WHEN event test
        THEN emit result
      `);
      expect(rule.enabled).toBe(false);
    });

    it('defaults enabled to true', () => {
      const rule = parseRuleTemplate(minimal());
      expect(rule.enabled).toBe(true);
    });

    it('throws for invalid enabled value', () => {
      expect(() => parseRuleTemplate(`
        id: my-rule
        enabled: yes
        WHEN event test
        THEN emit result
      `)).toThrow(ParseError);
    });

    it('parses single tag', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        tags: orders
        WHEN event test
        THEN emit result
      `);
      expect(rule.tags).toEqual(['orders']);
    });

    it('parses multiple tags', () => {
      const rule = parseRuleTemplate(`
        id: my-rule
        tags: orders, notifications, critical
        WHEN event test
        THEN emit result
      `);
      expect(rule.tags).toEqual(['orders', 'notifications', 'critical']);
    });

    it('defaults tags to empty array', () => {
      const rule = parseRuleTemplate(minimal());
      expect(rule.tags).toEqual([]);
    });

    it('throws for unknown property', () => {
      expect(() => parseRuleTemplate(`
        id: my-rule
        unknown: value
        WHEN event test
        THEN emit result
      `)).toThrow(ParseError);
    });
  });

  // =========================================================================
  // Triggers
  // =========================================================================

  describe('triggers', () => {
    it('parses event trigger', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event order.created
        THEN emit result
      `);
      expect(rule.trigger).toEqual({ type: 'event', topic: 'order.created' });
    });

    it('parses event trigger with glob pattern', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event order.*
        THEN emit result
      `);
      expect(rule.trigger).toEqual({ type: 'event', topic: 'order.*' });
    });

    it('parses fact trigger', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN fact customer:*:creditScore
        THEN emit result
      `);
      expect(rule.trigger).toEqual({ type: 'fact', pattern: 'customer:*:creditScore' });
    });

    it('parses timer trigger', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN timer payment-timeout
        THEN emit result
      `);
      expect(rule.trigger).toEqual({ type: 'timer', name: 'payment-timeout' });
    });

    it('throws for unknown trigger type', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN cron daily
        THEN emit result
      `)).toThrow(/Unknown trigger type "cron"/);
    });

    it('throws for missing trigger target', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event
        THEN emit result
      `)).toThrow(/Invalid WHEN clause/);
    });

    it('overwrites trigger when specified multiple times', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event first.topic
        WHEN event second.topic
        THEN emit result
      `);
      expect(rule.trigger).toEqual({ type: 'event', topic: 'second.topic' });
    });
  });

  // =========================================================================
  // Conditions
  // =========================================================================

  describe('conditions', () => {
    it('parses equality condition (==)', () => {
      const rule = parseRuleTemplate(minimal('IF event.status == "active"'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'status' }, operator: 'eq', value: 'active' },
      ]);
    });

    it('parses inequality condition (!=)', () => {
      const rule = parseRuleTemplate(minimal('IF event.status != "cancelled"'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'status' }, operator: 'neq', value: 'cancelled' },
      ]);
    });

    it('parses greater than (>)', () => {
      const rule = parseRuleTemplate(minimal('IF event.amount > 100'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'amount' }, operator: 'gt', value: 100 },
      ]);
    });

    it('parses greater than or equal (>=)', () => {
      const rule = parseRuleTemplate(minimal('IF event.amount >= 100'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
      ]);
    });

    it('parses less than (<)', () => {
      const rule = parseRuleTemplate(minimal('IF event.amount < 50'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'amount' }, operator: 'lt', value: 50 },
      ]);
    });

    it('parses less than or equal (<=)', () => {
      const rule = parseRuleTemplate(minimal('IF event.amount <= 50'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'amount' }, operator: 'lte', value: 50 },
      ]);
    });

    it('parses in operator', () => {
      const rule = parseRuleTemplate(minimal('IF event.status in ["pending", "active"]'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'status' }, operator: 'in', value: ['pending', 'active'] },
      ]);
    });

    it('parses not_in operator', () => {
      const rule = parseRuleTemplate(minimal('IF event.status not_in ["cancelled", "expired"]'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'status' }, operator: 'not_in', value: ['cancelled', 'expired'] },
      ]);
    });

    it('parses contains operator', () => {
      const rule = parseRuleTemplate(minimal('IF event.tags contains "urgent"'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'tags' }, operator: 'contains', value: 'urgent' },
      ]);
    });

    it('parses not_contains operator', () => {
      const rule = parseRuleTemplate(minimal('IF event.tags not_contains "spam"'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'tags' }, operator: 'not_contains', value: 'spam' },
      ]);
    });

    it('parses matches operator', () => {
      const rule = parseRuleTemplate(minimal('IF event.email matches /.*@gmail\\.com/'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'email' }, operator: 'matches', value: '.*@gmail\\.com' },
      ]);
    });

    it('parses exists operator (unary)', () => {
      const rule = parseRuleTemplate(minimal('IF event.metadata exists'));
      expect(rule.conditions).toEqual([
        { source: { type: 'event', field: 'metadata' }, operator: 'exists', value: true },
      ]);
    });

    it('parses not_exists operator (unary)', () => {
      const rule = parseRuleTemplate(minimal('IF context.tempData not_exists'));
      expect(rule.conditions).toEqual([
        { source: { type: 'context', key: 'tempData' }, operator: 'not_exists', value: true },
      ]);
    });

    it('parses event source', () => {
      const rule = parseRuleTemplate(minimal('IF event.amount >= 100'));
      expect(rule.conditions[0].source).toEqual({ type: 'event', field: 'amount' });
    });

    it('parses event source with dot notation', () => {
      const rule = parseRuleTemplate(minimal('IF event.customer.name == "John"'));
      expect(rule.conditions[0].source).toEqual({ type: 'event', field: 'customer.name' });
    });

    it('parses fact source', () => {
      const rule = parseRuleTemplate(minimal('IF fact.customer:vip == true'));
      expect(rule.conditions[0].source).toEqual({ type: 'fact', pattern: 'customer:vip' });
    });

    it('parses context source', () => {
      const rule = parseRuleTemplate(minimal('IF context.threshold <= 100'));
      expect(rule.conditions[0].source).toEqual({ type: 'context', key: 'threshold' });
    });

    it('parses boolean value', () => {
      const rule = parseRuleTemplate(minimal('IF event.active == true'));
      expect(rule.conditions[0].value).toBe(true);
    });

    it('parses false value', () => {
      const rule = parseRuleTemplate(minimal('IF event.active == false'));
      expect(rule.conditions[0].value).toBe(false);
    });

    it('parses null value', () => {
      const rule = parseRuleTemplate(minimal('IF event.data == null'));
      expect(rule.conditions[0].value).toBe(null);
    });

    it('parses numeric value', () => {
      const rule = parseRuleTemplate(minimal('IF event.amount >= 99.5'));
      expect(rule.conditions[0].value).toBe(99.5);
    });

    it('parses negative numeric value', () => {
      const rule = parseRuleTemplate(minimal('IF event.balance > -100'));
      expect(rule.conditions[0].value).toBe(-100);
    });

    it('parses string value in quotes', () => {
      const rule = parseRuleTemplate(minimal('IF event.status == "hello world"'));
      expect(rule.conditions[0].value).toBe('hello world');
    });

    it('parses array value', () => {
      const rule = parseRuleTemplate(minimal('IF event.code in [1, 2, 3]'));
      expect(rule.conditions[0].value).toEqual([1, 2, 3]);
    });

    it('parses empty array value', () => {
      const rule = parseRuleTemplate(minimal('IF event.tags not_in []'));
      expect(rule.conditions[0].value).toEqual([]);
    });

    it('supports multiple conditions with IF and AND', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event order.created
        IF event.amount >= 100
        AND event.status == "confirmed"
        AND event.currency == "USD"
        THEN emit result
      `);
      expect(rule.conditions).toHaveLength(3);
      expect(rule.conditions[0].operator).toBe('gte');
      expect(rule.conditions[1].operator).toBe('eq');
      expect(rule.conditions[2].operator).toBe('eq');
    });

    it('conditions are optional', () => {
      const rule = parseRuleTemplate(minimal());
      expect(rule.conditions).toEqual([]);
    });

    it('throws for unknown operator', () => {
      expect(() => parseRuleTemplate(minimal('IF event.x === 5'))).toThrow(/Unknown operator/);
    });

    it('throws for missing value on binary operator', () => {
      expect(() => parseRuleTemplate(minimal('IF event.x =='))).toThrow(/requires a value/);
    });

    it('throws for invalid source (no dot)', () => {
      expect(() => parseRuleTemplate(minimal('IF amount >= 100'))).toThrow(/Invalid source/);
    });

    it('throws for unknown source type', () => {
      expect(() => parseRuleTemplate(minimal('IF data.field == 1'))).toThrow(/Unknown source type/);
    });
  });

  // =========================================================================
  // Actions
  // =========================================================================

  describe('actions', () => {
    it('parses emit with topic only', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN emit notification.send
      `);
      expect(rule.actions).toEqual([
        { type: 'emit_event', topic: 'notification.send', data: {} },
      ]);
    });

    it('parses emit with data object', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN emit notification.send { message: "Hello", count: 5 }
      `);
      expect(rule.actions).toEqual([
        {
          type: 'emit_event',
          topic: 'notification.send',
          data: { message: 'Hello', count: 5 },
        },
      ]);
    });

    it('parses emit with ref values in data', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN emit order.processed { orderId: event.orderId, customer: fact.customerId }
      `);
      expect(rule.actions).toEqual([
        {
          type: 'emit_event',
          topic: 'order.processed',
          data: {
            orderId: { ref: 'event.orderId' },
            customer: { ref: 'fact.customerId' },
          },
        },
      ]);
    });

    it('parses emit with empty data object', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN emit notification.send {}
      `);
      expect(rule.actions).toEqual([
        { type: 'emit_event', topic: 'notification.send', data: {} },
      ]);
    });

    it('parses emit with mixed literal and ref data', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN emit result { id: event.orderId, status: "processed", amount: 100 }
      `);
      const action = rule.actions[0] as { type: 'emit_event'; data: Record<string, unknown> };
      expect(action.data.id).toEqual({ ref: 'event.orderId' });
      expect(action.data.status).toBe('processed');
      expect(action.data.amount).toBe(100);
    });

    it('parses setFact with string value', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN setFact order:status "processed"
      `);
      expect(rule.actions).toEqual([
        { type: 'set_fact', key: 'order:status', value: 'processed' },
      ]);
    });

    it('parses setFact with boolean value', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN setFact order:active true
      `);
      expect(rule.actions).toEqual([
        { type: 'set_fact', key: 'order:active', value: true },
      ]);
    });

    it('parses setFact with numeric value', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN setFact counter 42
      `);
      expect(rule.actions).toEqual([
        { type: 'set_fact', key: 'counter', value: 42 },
      ]);
    });

    it('parses setFact with ref value', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN setFact order:total event.amount
      `);
      expect(rule.actions).toEqual([
        { type: 'set_fact', key: 'order:total', value: { ref: 'event.amount' } },
      ]);
    });

    it('parses deleteFact', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN deleteFact temp:data
      `);
      expect(rule.actions).toEqual([
        { type: 'delete_fact', key: 'temp:data' },
      ]);
    });

    it('parses log with quoted message', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN log info "Order processed successfully"
      `);
      expect(rule.actions).toEqual([
        { type: 'log', level: 'info', message: 'Order processed successfully' },
      ]);
    });

    it('parses log with unquoted message', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN log warn Something happened
      `);
      expect(rule.actions).toEqual([
        { type: 'log', level: 'warn', message: 'Something happened' },
      ]);
    });

    it('parses log with all levels', () => {
      for (const level of ['debug', 'info', 'warn', 'error'] as const) {
        const rule = parseRuleTemplate(`
          id: test
          WHEN event test
          THEN log ${level} test message
        `);
        expect(rule.actions[0]).toEqual({
          type: 'log',
          level,
          message: 'test message',
        });
      }
    });

    it('parses cancelTimer', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event test
        THEN cancelTimer payment-timeout
      `);
      expect(rule.actions).toEqual([
        { type: 'cancel_timer', name: 'payment-timeout' },
      ]);
    });

    it('supports multiple actions', () => {
      const rule = parseRuleTemplate(`
        id: test
        WHEN event order.created
        THEN emit notification.send { orderId: event.orderId }
        THEN setFact order:processed true
        THEN log info "Order processed"
      `);
      expect(rule.actions).toHaveLength(3);
      expect(rule.actions[0].type).toBe('emit_event');
      expect(rule.actions[1].type).toBe('set_fact');
      expect(rule.actions[2].type).toBe('log');
    });

    it('throws for unknown action type', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN unknown action
      `)).toThrow(/Unknown action "unknown"/);
    });

    it('throws for emit without topic', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN emit
      `)).toThrow(/emit requires a topic/);
    });

    it('throws for setFact without value', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN setFact key
      `)).toThrow(/setFact requires a value/);
    });

    it('throws for deleteFact without key', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN deleteFact
      `)).toThrow(/deleteFact requires a key/);
    });

    it('throws for log without message', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN log info
      `)).toThrow(/log requires a message/);
    });

    it('throws for log with invalid level', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN log verbose test
      `)).toThrow(/Invalid log level "verbose"/);
    });

    it('throws for cancelTimer without name', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN cancelTimer
      `)).toThrow(/cancelTimer requires a timer name/);
    });
  });

  // =========================================================================
  // Complete rules
  // =========================================================================

  describe('complete rules', () => {
    it('builds minimal rule', () => {
      const rule = parseRuleTemplate(`
        id: minimal
        WHEN event trigger
        THEN emit action
      `);
      expect(rule).toEqual({
        id: 'minimal',
        name: 'minimal',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'trigger' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'action', data: {} }],
      });
    });

    it('builds full rule with all properties', () => {
      const rule = parseRuleTemplate(`
        id: order-notification
        name: Send Order Notification
        description: Sends notification for large orders
        priority: 100
        enabled: true
        tags: orders, notifications

        WHEN event order.created
        IF event.amount >= 100
        AND event.status == "confirmed"
        THEN emit notification.send { orderId: event.orderId, message: "Large order!" }
        THEN setFact order:notified true
      `);

      expect(rule).toEqual({
        id: 'order-notification',
        name: 'Send Order Notification',
        description: 'Sends notification for large orders',
        priority: 100,
        enabled: true,
        tags: ['orders', 'notifications'],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
          { source: { type: 'event', field: 'status' }, operator: 'eq', value: 'confirmed' },
        ],
        actions: [
          {
            type: 'emit_event',
            topic: 'notification.send',
            data: {
              orderId: { ref: 'event.orderId' },
              message: 'Large order!',
            },
          },
          {
            type: 'set_fact',
            key: 'order:notified',
            value: true,
          },
        ],
      });
    });

    it('produces identical output to fluent builder', () => {
      // Tento test ověřuje, že template a builder produkují stejný výstup
      const fromTemplate = parseRuleTemplate(`
        id: test-rule
        name: Test Rule
        priority: 50
        tags: testing

        WHEN event order.created
        IF event.amount >= 100
        THEN emit notification.send { orderId: event.orderId }
      `);

      // Ekvivalent fluent builderu:
      expect(fromTemplate.id).toBe('test-rule');
      expect(fromTemplate.name).toBe('Test Rule');
      expect(fromTemplate.priority).toBe(50);
      expect(fromTemplate.tags).toEqual(['testing']);
      expect(fromTemplate.trigger).toEqual({ type: 'event', topic: 'order.created' });
      expect(fromTemplate.conditions).toEqual([
        { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
      ]);
      expect(fromTemplate.actions).toEqual([
        {
          type: 'emit_event',
          topic: 'notification.send',
          data: { orderId: { ref: 'event.orderId' } },
        },
      ]);
    });
  });

  // =========================================================================
  // Whitespace and comments
  // =========================================================================

  describe('whitespace and comments', () => {
    it('skips empty lines', () => {
      const rule = parseRuleTemplate(`

        id: test

        WHEN event test

        THEN emit result

      `);
      expect(rule.id).toBe('test');
    });

    it('skips # comments', () => {
      const rule = parseRuleTemplate(`
        # This is a comment
        id: test
        # Another comment
        WHEN event test
        THEN emit result
      `);
      expect(rule.id).toBe('test');
    });

    it('skips // comments', () => {
      const rule = parseRuleTemplate(`
        // This is a comment
        id: test
        // Another comment
        WHEN event test
        THEN emit result
      `);
      expect(rule.id).toBe('test');
    });

    it('handles mixed indentation', () => {
      const rule = parseRuleTemplate(`
id: test
  WHEN event test
      THEN emit result
      `);
      expect(rule.id).toBe('test');
    });
  });

  // =========================================================================
  // Validation
  // =========================================================================

  describe('validation', () => {
    it('throws for missing id', () => {
      expect(() => parseRuleTemplate(`
        WHEN event test
        THEN emit result
      `)).toThrow(/id.*required/i);
    });

    it('throws for missing WHEN clause', () => {
      expect(() => parseRuleTemplate(`
        id: test
        THEN emit result
      `)).toThrow(/WHEN clause is required/);
    });

    it('throws for missing THEN clause', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
      `)).toThrow(/at least one THEN clause is required/);
    });

    it('throws for unrecognized syntax', () => {
      expect(() => parseRuleTemplate(`
        id: test
        WHEN event test
        THEN emit result
        invalid line without colon
      `)).toThrow(ParseError);
    });
  });

  // =========================================================================
  // Error messages
  // =========================================================================

  describe('error messages', () => {
    it('includes line number in ParseError', () => {
      try {
        parseRuleTemplate(`
          id: test
          WHEN event test
          THEN emit result
          THEN unknown action
        `);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        expect((e as ParseError).line).toBe(5);
      }
    });

    it('includes source line in ParseError', () => {
      try {
        parseRuleTemplate(`
          id: test
          WHEN cron daily
          THEN emit result
        `);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        expect((e as ParseError).source).toBe('WHEN cron daily');
      }
    });

    it('has descriptive error name', () => {
      try {
        parseRuleTemplate(`
          id: test
          WHEN event test
          THEN bogus
        `);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        expect((e as ParseError).name).toBe('ParseError');
      }
    });
  });
});
