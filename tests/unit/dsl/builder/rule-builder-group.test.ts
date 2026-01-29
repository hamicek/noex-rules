import { describe, it, expect } from 'vitest';
import { Rule } from '../../../../src/dsl/builder/rule-builder';
import { onEvent } from '../../../../src/dsl/trigger/event-trigger';
import { emit } from '../../../../src/dsl/action';

describe('RuleBuilder .group()', () => {
  const minimal = () =>
    Rule.create('test').when(onEvent('test')).then(emit('result'));

  it('sets group on the built rule', () => {
    const rule = minimal().group('billing').build();

    expect(rule.group).toBe('billing');
  });

  it('is chainable and preserves fluent order', () => {
    const rule = Rule.create('order-check')
      .name('Order Check')
      .tags('orders')
      .group('billing')
      .when(onEvent('order.created'))
      .then(emit('notification.send'))
      .build();

    expect(rule.group).toBe('billing');
    expect(rule.name).toBe('Order Check');
    expect(rule.tags).toEqual(['orders']);
  });

  it('omits group from output when not set', () => {
    const rule = minimal().build();

    expect(rule).not.toHaveProperty('group');
  });

  it('throws for empty string', () => {
    expect(() => minimal().group('')).toThrow(
      'Group ID must be a non-empty string',
    );
  });

  it('throws for non-string value', () => {
    expect(() => minimal().group(null as unknown as string)).toThrow(
      'Group ID must be a non-empty string',
    );
    expect(() => minimal().group(undefined as unknown as string)).toThrow(
      'Group ID must be a non-empty string',
    );
    expect(() => minimal().group(42 as unknown as string)).toThrow(
      'Group ID must be a non-empty string',
    );
  });

  it('last call wins when called multiple times', () => {
    const rule = minimal().group('first').group('second').build();

    expect(rule.group).toBe('second');
  });
});
