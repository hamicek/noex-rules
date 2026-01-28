import { describe, it, expect } from 'vitest';
import { requireNonEmptyString, requireDuration } from '../../../../src/dsl/helpers/validators';

describe('requireNonEmptyString', () => {
  it('accepts valid non-empty strings', () => {
    expect(() => requireNonEmptyString('hello', 'test')).not.toThrow();
    expect(() => requireNonEmptyString('a', 'test')).not.toThrow();
    expect(() => requireNonEmptyString('order.created', 'test')).not.toThrow();
    expect(() => requireNonEmptyString('customer:*:score', 'test')).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => requireNonEmptyString('', 'myParam')).toThrow(
      'myParam must be a non-empty string',
    );
  });

  it('rejects non-string types', () => {
    expect(() => requireNonEmptyString(undefined as any, 'x')).toThrow(
      'x must be a non-empty string',
    );
    expect(() => requireNonEmptyString(null as any, 'x')).toThrow(
      'x must be a non-empty string',
    );
    expect(() => requireNonEmptyString(42 as any, 'x')).toThrow(
      'x must be a non-empty string',
    );
    expect(() => requireNonEmptyString(true as any, 'x')).toThrow(
      'x must be a non-empty string',
    );
    expect(() => requireNonEmptyString({} as any, 'x')).toThrow(
      'x must be a non-empty string',
    );
    expect(() => requireNonEmptyString([] as any, 'x')).toThrow(
      'x must be a non-empty string',
    );
  });

  it('includes label in error message', () => {
    expect(() => requireNonEmptyString('', 'onEvent() topic')).toThrow(
      'onEvent() topic must be a non-empty string',
    );
  });
});

describe('requireDuration', () => {
  it('accepts valid string durations', () => {
    expect(() => requireDuration('100ms', 'test')).not.toThrow();
    expect(() => requireDuration('30s', 'test')).not.toThrow();
    expect(() => requireDuration('15m', 'test')).not.toThrow();
    expect(() => requireDuration('24h', 'test')).not.toThrow();
    expect(() => requireDuration('7d', 'test')).not.toThrow();
    expect(() => requireDuration('1w', 'test')).not.toThrow();
    expect(() => requireDuration('1y', 'test')).not.toThrow();
  });

  it('accepts positive numbers (milliseconds)', () => {
    expect(() => requireDuration(1, 'test')).not.toThrow();
    expect(() => requireDuration(1000, 'test')).not.toThrow();
    expect(() => requireDuration(0.5, 'test')).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => requireDuration(0, 'dur')).toThrow(
      'dur must be a positive number (milliseconds), got 0',
    );
  });

  it('rejects negative numbers', () => {
    expect(() => requireDuration(-100, 'dur')).toThrow(
      'dur must be a positive number (milliseconds), got -100',
    );
  });

  it('rejects NaN and Infinity', () => {
    expect(() => requireDuration(NaN, 'dur')).toThrow(
      'dur must be a positive number (milliseconds)',
    );
    expect(() => requireDuration(Infinity, 'dur')).toThrow(
      'dur must be a positive number (milliseconds)',
    );
    expect(() => requireDuration(-Infinity, 'dur')).toThrow(
      'dur must be a positive number (milliseconds)',
    );
  });

  it('rejects invalid string formats', () => {
    expect(() => requireDuration('abc', 'dur')).toThrow('dur must be a duration string');
    expect(() => requireDuration('', 'dur')).toThrow('dur must be a duration string');
    expect(() => requireDuration('15', 'dur')).toThrow('dur must be a duration string');
    expect(() => requireDuration('m15', 'dur')).toThrow('dur must be a duration string');
    expect(() => requireDuration('15x', 'dur')).toThrow('dur must be a duration string');
    expect(() => requireDuration('1.5m', 'dur')).toThrow('dur must be a duration string');
    expect(() => requireDuration('-5m', 'dur')).toThrow('dur must be a duration string');
  });

  it('rejects non-string/non-number types', () => {
    expect(() => requireDuration(undefined as any, 'dur')).toThrow(
      'dur must be a duration string',
    );
    expect(() => requireDuration(null as any, 'dur')).toThrow(
      'dur must be a duration string',
    );
    expect(() => requireDuration(true as any, 'dur')).toThrow(
      'dur must be a duration string',
    );
  });

  it('includes label in error message', () => {
    expect(() => requireDuration('bad', 'setTimer().after() duration')).toThrow(
      'setTimer().after() duration must be a duration string',
    );
  });
});
