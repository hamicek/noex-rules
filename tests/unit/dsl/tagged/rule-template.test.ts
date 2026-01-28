import { describe, it, expect } from 'vitest';
import { rule } from '../../../../src/dsl/tagged/rule-template';

describe('rule tagged template', () => {
  it('creates rule from template literal', () => {
    const result = rule`
      id: simple-rule
      WHEN event test.event
      THEN emit test.result
    `;

    expect(result).toEqual({
      id: 'simple-rule',
      name: 'simple-rule',
      priority: 0,
      enabled: true,
      tags: [],
      trigger: { type: 'event', topic: 'test.event' },
      conditions: [],
      actions: [{ type: 'emit_event', topic: 'test.result', data: {} }],
    });
  });

  it('handles string interpolation for values', () => {
    const topic = 'order.created';
    const threshold = 100;

    const result = rule`
      id: dynamic-rule
      WHEN event ${topic}
      IF event.amount >= ${threshold}
      THEN emit result
    `;

    expect(result.trigger).toEqual({ type: 'event', topic: 'order.created' });
    expect(result.conditions[0]).toEqual({
      source: { type: 'event', field: 'amount' },
      operator: 'gte',
      value: 100,
    });
  });

  it('handles interpolation in id and name', () => {
    const prefix = 'order';
    const result = rule`
      id: ${prefix}-notification
      name: ${prefix} Notification Rule
      WHEN event ${prefix}.created
      THEN emit ${prefix}.processed
    `;

    expect(result.id).toBe('order-notification');
    expect(result.name).toBe('order Notification Rule');
  });

  it('handles interpolation in tags', () => {
    const tag = 'critical';
    const result = rule`
      id: test
      tags: orders, ${tag}
      WHEN event test
      THEN emit result
    `;

    expect(result.tags).toEqual(['orders', 'critical']);
  });

  it('handles interpolation in action data', () => {
    const message = 'Hello World';
    const result = rule`
      id: test
      WHEN event test
      THEN emit notification { message: "${message}" }
    `;

    expect(result.actions).toEqual([
      {
        type: 'emit_event',
        topic: 'notification',
        data: { message: 'Hello World' },
      },
    ]);
  });

  it('builds complete rule with all features', () => {
    const result = rule`
      id: order-notification
      name: Send Order Notification
      description: Notifies on large orders
      priority: 100
      tags: orders, notifications
      enabled: true

      WHEN event order.created
      IF event.amount >= 100
      AND event.status == "confirmed"
      THEN emit notification.send { orderId: event.orderId, message: "Large order!" }
      THEN setFact order:notified true
      THEN log info "Order notification sent"
    `;

    expect(result.id).toBe('order-notification');
    expect(result.name).toBe('Send Order Notification');
    expect(result.description).toBe('Notifies on large orders');
    expect(result.priority).toBe(100);
    expect(result.tags).toEqual(['orders', 'notifications']);
    expect(result.enabled).toBe(true);
    expect(result.trigger).toEqual({ type: 'event', topic: 'order.created' });
    expect(result.conditions).toHaveLength(2);
    expect(result.actions).toHaveLength(3);
  });

  it('throws on invalid template', () => {
    expect(() => rule`
      WHEN event test
      THEN emit result
    `).toThrow(/id.*required/i);
  });

  it('returns RuleInput compatible object', () => {
    const result = rule`
      id: compat-test
      WHEN event test
      THEN emit result
    `;

    // Ověření struktury odpovídající RuleInput
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('priority');
    expect(result).toHaveProperty('enabled');
    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('trigger');
    expect(result).toHaveProperty('conditions');
    expect(result).toHaveProperty('actions');
  });
});
