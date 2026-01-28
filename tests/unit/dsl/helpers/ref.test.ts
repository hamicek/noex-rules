import { describe, it, expect } from 'vitest';
import { ref, isRef, normalizeValue } from '../../../../src/dsl/helpers/ref';

describe('ref', () => {
  it('creates reference object with ref property', () => {
    const r = ref('event.orderId');
    expect(r).toEqual({ ref: 'event.orderId' });
  });

  it('creates typed reference', () => {
    const r = ref<number>('event.amount');
    expect(r.ref).toBe('event.amount');
  });

  it('creates references for different sources', () => {
    expect(ref('event.field')).toEqual({ ref: 'event.field' });
    expect(ref('fact.key')).toEqual({ ref: 'fact.key' });
    expect(ref('var.name')).toEqual({ ref: 'var.name' });
    expect(ref('matched.0.data')).toEqual({ ref: 'matched.0.data' });
  });
});

describe('isRef', () => {
  it('returns true for ref objects', () => {
    expect(isRef({ ref: 'event.id' })).toBe(true);
    expect(isRef(ref('fact.key'))).toBe(true);
  });

  it('returns false for non-ref values', () => {
    expect(isRef('string')).toBe(false);
    expect(isRef(42)).toBe(false);
    expect(isRef(null)).toBe(false);
    expect(isRef(undefined)).toBe(false);
    expect(isRef({})).toBe(false);
    expect(isRef({ other: 'prop' })).toBe(false);
    expect(isRef({ ref: 123 })).toBe(false); // ref must be string
  });

  it('returns false for arrays', () => {
    expect(isRef([])).toBe(false);
    expect(isRef(['ref'])).toBe(false);
  });
});

describe('normalizeValue', () => {
  it('returns ref object as { ref: string }', () => {
    const r = ref('event.id');
    expect(normalizeValue(r)).toEqual({ ref: 'event.id' });
  });

  it('returns literal values unchanged', () => {
    expect(normalizeValue('string')).toBe('string');
    expect(normalizeValue(42)).toBe(42);
    expect(normalizeValue(true)).toBe(true);
    expect(normalizeValue(null)).toBe(null);
    expect(normalizeValue(undefined)).toBe(undefined);
  });

  it('returns non-ref objects unchanged', () => {
    const obj = { key: 'value' };
    expect(normalizeValue(obj)).toBe(obj);
  });

  it('returns arrays unchanged', () => {
    const arr = [1, 2, 3];
    expect(normalizeValue(arr)).toBe(arr);
  });
});
