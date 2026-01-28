import { describe, it, expect } from 'vitest';
import { setFact, deleteFact } from '../../../../src/dsl/action/fact-actions';
import { ref } from '../../../../src/dsl/helpers/ref';

describe('setFact', () => {
  it('creates set_fact action with literal value', () => {
    const action = setFact('customer:123:vip', true).build();

    expect(action).toEqual({
      type: 'set_fact',
      key: 'customer:123:vip',
      value: true,
    });
  });

  it('creates set_fact action with ref value', () => {
    const action = setFact('order:status', ref('event.status')).build();

    expect(action).toEqual({
      type: 'set_fact',
      key: 'order:status',
      value: { ref: 'event.status' },
    });
  });

  it('supports interpolation patterns in key', () => {
    const action = setFact('order:${event.orderId}:processed', true).build();
    expect(action.key).toBe('order:${event.orderId}:processed');
  });

  it('handles various value types', () => {
    expect(setFact('key', 'string').build().value).toBe('string');
    expect(setFact('key', 42).build().value).toBe(42);
    expect(setFact('key', null).build().value).toBe(null);
    expect(setFact('key', { nested: 'object' }).build().value).toEqual({ nested: 'object' });
    expect(setFact('key', [1, 2, 3]).build().value).toEqual([1, 2, 3]);
  });
});

describe('deleteFact', () => {
  it('creates delete_fact action', () => {
    const action = deleteFact('customer:123:temp').build();

    expect(action).toEqual({
      type: 'delete_fact',
      key: 'customer:123:temp',
    });
  });

  it('supports interpolation patterns in key', () => {
    const action = deleteFact('order:${event.orderId}:pending').build();
    expect(action.key).toBe('order:${event.orderId}:pending');
  });
});
