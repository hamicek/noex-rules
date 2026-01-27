import { describe, it, expect } from 'vitest';
import {
  interpolate,
  resolve,
  resolveRef,
  resolveObject,
  type InterpolationContext,
} from '../../../src/utils/interpolation';

/**
 * Creates a minimal InterpolationContext for testing.
 */
function createContext(overrides: Partial<{
  triggerType: string;
  triggerData: Record<string, unknown>;
  facts: Map<string, { value: unknown }>;
  matchedEvents: Array<{ data: Record<string, unknown> }>;
  variables: Map<string, unknown>;
}> = {}): InterpolationContext {
  const facts = overrides.facts ?? new Map();
  return {
    trigger: {
      type: overrides.triggerType ?? 'event',
      data: overrides.triggerData ?? {},
    },
    facts: {
      get: (key: string) => facts.get(key),
    },
    matchedEvents: overrides.matchedEvents,
    variables: overrides.variables ?? new Map(),
  };
}

describe('interpolate', () => {
  it('returns unchanged string without placeholders', () => {
    const ctx = createContext();
    expect(interpolate('hello world', ctx)).toBe('hello world');
    expect(interpolate('', ctx)).toBe('');
    expect(interpolate('no-vars-here', ctx)).toBe('no-vars-here');
  });

  it('replaces single placeholder with event data', () => {
    const ctx = createContext({
      triggerData: { orderId: 'ORD-123', amount: 99.50 },
    });
    expect(interpolate('order:${event.orderId}', ctx)).toBe('order:ORD-123');
    expect(interpolate('amount:${event.amount}', ctx)).toBe('amount:99.5');
  });

  it('replaces multiple placeholders', () => {
    const ctx = createContext({
      triggerData: { userId: 'U1', action: 'login' },
    });
    expect(interpolate('user:${event.userId}:${event.action}', ctx))
      .toBe('user:U1:login');
  });

  it('replaces nested path references', () => {
    const ctx = createContext({
      triggerData: {
        customer: { name: 'Alice', address: { city: 'Prague' } },
      },
    });
    expect(interpolate('name:${event.customer.name}', ctx)).toBe('name:Alice');
    expect(interpolate('city:${event.customer.address.city}', ctx)).toBe('city:Prague');
  });

  it('replaces fact references', () => {
    const facts = new Map<string, { value: unknown }>([
      ['customer:123:status', { value: 'active' }],
    ]);
    const ctx = createContext({ facts });
    expect(interpolate('status:${fact.customer:123:status}', ctx)).toBe('status:active');
  });

  it('replaces variable references', () => {
    const variables = new Map<string, unknown>([
      ['counter', 42],
      ['data', { nested: 'value' }],
    ]);
    const ctx = createContext({ variables });
    expect(interpolate('count:${var.counter}', ctx)).toBe('count:42');
    expect(interpolate('nested:${var.data.nested}', ctx)).toBe('nested:value');
  });

  it('converts undefined to empty string', () => {
    const ctx = createContext();
    expect(interpolate('missing:${event.nonexistent}', ctx)).toBe('missing:');
  });

  it('converts null to empty string', () => {
    const ctx = createContext({
      triggerData: { nullValue: null },
    });
    expect(interpolate('null:${event.nullValue}', ctx)).toBe('null:');
  });

  it('converts objects to string', () => {
    const ctx = createContext({
      triggerData: { obj: { a: 1 } },
    });
    expect(interpolate('obj:${event.obj}', ctx)).toBe('obj:[object Object]');
  });

  it('converts arrays to string', () => {
    const ctx = createContext({
      triggerData: { arr: [1, 2, 3] },
    });
    expect(interpolate('arr:${event.arr}', ctx)).toBe('arr:1,2,3');
  });

  it('handles adjacent placeholders', () => {
    const ctx = createContext({
      triggerData: { a: 'X', b: 'Y' },
    });
    expect(interpolate('${event.a}${event.b}', ctx)).toBe('XY');
  });
});

describe('resolve', () => {
  it('returns non-ref values unchanged', () => {
    const ctx = createContext();
    expect(resolve('plain string', ctx)).toBe('plain string');
    expect(resolve(42, ctx)).toBe(42);
    expect(resolve(null, ctx)).toBe(null);
    expect(resolve(undefined, ctx)).toBe(undefined);
    expect(resolve({ notRef: 'value' }, ctx)).toEqual({ notRef: 'value' });
  });

  it('resolves object with ref property', () => {
    const ctx = createContext({
      triggerData: { orderId: 'ORD-456' },
    });
    expect(resolve({ ref: 'event.orderId' }, ctx)).toBe('ORD-456');
  });

  it('resolves nested ref paths', () => {
    const ctx = createContext({
      triggerData: { order: { item: { name: 'Widget' } } },
    });
    expect(resolve({ ref: 'event.order.item.name' }, ctx)).toBe('Widget');
  });

  it('returns undefined for missing ref paths', () => {
    const ctx = createContext();
    expect(resolve({ ref: 'event.missing.path' }, ctx)).toBe(undefined);
  });
});

describe('resolveRef', () => {
  describe('event/trigger source', () => {
    it('resolves event.field references', () => {
      const ctx = createContext({
        triggerData: { userId: 'U789', status: 'active' },
      });
      expect(resolveRef('event.userId', ctx)).toBe('U789');
      expect(resolveRef('event.status', ctx)).toBe('active');
    });

    it('resolves trigger.field references (alias for event)', () => {
      const ctx = createContext({
        triggerData: { action: 'purchase' },
      });
      expect(resolveRef('trigger.action', ctx)).toBe('purchase');
    });

    it('resolves nested event paths', () => {
      const ctx = createContext({
        triggerData: {
          payload: { items: [{ sku: 'SKU-1' }], metadata: { source: 'web' } },
        },
      });
      expect(resolveRef('event.payload.metadata.source', ctx)).toBe('web');
    });

    it('returns undefined for missing event fields', () => {
      const ctx = createContext({ triggerData: {} });
      expect(resolveRef('event.nonexistent', ctx)).toBe(undefined);
    });

    it('returns root data for event without path', () => {
      const ctx = createContext({
        triggerData: { a: 1, b: 2 },
      });
      expect(resolveRef('event', ctx)).toEqual({ a: 1, b: 2 });
    });
  });

  describe('fact source', () => {
    it('resolves fact.key references', () => {
      const facts = new Map<string, { value: unknown }>([
        ['user:123:balance', { value: 1000 }],
        ['config.timeout', { value: 30 }],
      ]);
      const ctx = createContext({ facts });
      expect(resolveRef('fact.user:123:balance', ctx)).toBe(1000);
      expect(resolveRef('fact.config.timeout', ctx)).toBe(30);
    });

    it('returns undefined for missing facts', () => {
      const ctx = createContext({ facts: new Map() });
      expect(resolveRef('fact.missing.key', ctx)).toBe(undefined);
    });

    it('handles fact with complex value', () => {
      const facts = new Map<string, { value: unknown }>([
        ['session.data', { value: { token: 'abc', expires: 3600 } }],
      ]);
      const ctx = createContext({ facts });
      expect(resolveRef('fact.session.data', ctx)).toEqual({ token: 'abc', expires: 3600 });
    });
  });

  describe('var source', () => {
    it('resolves var.name references', () => {
      const variables = new Map<string, unknown>([
        ['counter', 5],
        ['message', 'hello'],
      ]);
      const ctx = createContext({ variables });
      expect(resolveRef('var.counter', ctx)).toBe(5);
      expect(resolveRef('var.message', ctx)).toBe('hello');
    });

    it('resolves nested paths in variable values', () => {
      const variables = new Map<string, unknown>([
        ['config', { database: { host: 'localhost', port: 5432 } }],
      ]);
      const ctx = createContext({ variables });
      expect(resolveRef('var.config.database.host', ctx)).toBe('localhost');
      expect(resolveRef('var.config.database.port', ctx)).toBe(5432);
    });

    it('returns undefined for missing variables', () => {
      const ctx = createContext({ variables: new Map() });
      expect(resolveRef('var.missing', ctx)).toBe(undefined);
    });

    it('returns undefined for var without name', () => {
      const ctx = createContext({ variables: new Map([['test', 'value']]) });
      expect(resolveRef('var', ctx)).toBe(undefined);
    });

    it('returns variable root value when no nested path', () => {
      const variables = new Map<string, unknown>([
        ['obj', { a: 1, b: 2 }],
      ]);
      const ctx = createContext({ variables });
      expect(resolveRef('var.obj', ctx)).toEqual({ a: 1, b: 2 });
    });
  });

  describe('matched source', () => {
    it('resolves matched.index.field references', () => {
      const matchedEvents = [
        { data: { orderId: 'ORD-1', amount: 100 } },
        { data: { orderId: 'ORD-2', amount: 200 } },
      ];
      const ctx = createContext({ matchedEvents });
      expect(resolveRef('matched.0.orderId', ctx)).toBe('ORD-1');
      expect(resolveRef('matched.1.amount', ctx)).toBe(200);
    });

    it('resolves nested paths in matched events', () => {
      const matchedEvents = [
        { data: { customer: { name: 'Bob', tier: 'gold' } } },
      ];
      const ctx = createContext({ matchedEvents });
      expect(resolveRef('matched.0.customer.name', ctx)).toBe('Bob');
      expect(resolveRef('matched.0.customer.tier', ctx)).toBe('gold');
    });

    it('returns undefined for out-of-bounds index', () => {
      const matchedEvents = [{ data: { id: 1 } }];
      const ctx = createContext({ matchedEvents });
      expect(resolveRef('matched.5.id', ctx)).toBe(undefined);
    });

    it('returns undefined when matchedEvents is not set', () => {
      const ctx = createContext();
      expect(resolveRef('matched.0.id', ctx)).toBe(undefined);
    });

    it('returns root matched event data for index-only path', () => {
      const matchedEvents = [{ data: { x: 1, y: 2 } }];
      const ctx = createContext({ matchedEvents });
      expect(resolveRef('matched.0', ctx)).toEqual({ x: 1, y: 2 });
    });

    it('returns undefined for matched without index', () => {
      const matchedEvents = [{ data: { id: 1 } }];
      const ctx = createContext({ matchedEvents });
      expect(resolveRef('matched', ctx)).toBe(undefined);
    });
  });

  describe('unknown source', () => {
    it('throws error for unknown reference source', () => {
      const ctx = createContext();
      expect(() => resolveRef('unknown.path', ctx)).toThrow('Unknown reference source: unknown');
      expect(() => resolveRef('invalid.data.field', ctx)).toThrow('Unknown reference source: invalid');
    });
  });
});

describe('resolveObject', () => {
  it('returns object with non-ref values unchanged', () => {
    const ctx = createContext();
    const input = { name: 'test', count: 42, flag: true };
    expect(resolveObject(input, ctx)).toEqual({ name: 'test', count: 42, flag: true });
  });

  it('resolves ref values in object', () => {
    const ctx = createContext({
      triggerData: { userId: 'U100', amount: 50 },
    });
    const input = {
      user: { ref: 'event.userId' },
      value: { ref: 'event.amount' },
    };
    expect(resolveObject(input, ctx)).toEqual({ user: 'U100', value: 50 });
  });

  it('mixes resolved and literal values', () => {
    const ctx = createContext({
      triggerData: { id: 'ID-999' },
    });
    const input = {
      dynamic: { ref: 'event.id' },
      static: 'literal',
      number: 123,
    };
    expect(resolveObject(input, ctx)).toEqual({
      dynamic: 'ID-999',
      static: 'literal',
      number: 123,
    });
  });

  it('handles undefined ref values', () => {
    const ctx = createContext();
    const input = {
      missing: { ref: 'event.nonexistent' },
      present: 'value',
    };
    expect(resolveObject(input, ctx)).toEqual({
      missing: undefined,
      present: 'value',
    });
  });

  it('does not modify original object', () => {
    const ctx = createContext({
      triggerData: { val: 'resolved' },
    });
    const input = { key: { ref: 'event.val' } };
    const result = resolveObject(input, ctx);

    expect(result).toEqual({ key: 'resolved' });
    expect(input).toEqual({ key: { ref: 'event.val' } });
  });

  it('handles empty object', () => {
    const ctx = createContext();
    expect(resolveObject({}, ctx)).toEqual({});
  });

  it('resolves multiple source types', () => {
    const facts = new Map<string, { value: unknown }>([
      ['status', { value: 'active' }],
    ]);
    const variables = new Map<string, unknown>([
      ['multiplier', 2],
    ]);
    const ctx = createContext({
      triggerData: { base: 100 },
      facts,
      variables,
    });
    const input = {
      eventVal: { ref: 'event.base' },
      factVal: { ref: 'fact.status' },
      varVal: { ref: 'var.multiplier' },
    };
    expect(resolveObject(input, ctx)).toEqual({
      eventVal: 100,
      factVal: 'active',
      varVal: 2,
    });
  });
});
