import { describe, it, expect } from 'vitest';
import { RuleBuilder } from '../../src/dsl/builder/rule-builder.js';
import { DslValidationError } from '../../src/dsl/helpers/errors.js';

describe('RuleBuilder — .group()', () => {
  function minimalBuilder(id = 'test-rule') {
    return RuleBuilder.create(id)
      .name('Test Rule')
      .when({ type: 'event', topic: 'test.event' })
      .then({ type: 'emit_event', topic: 'out', data: {} });
  }

  it('sets group on the built rule', () => {
    const rule = minimalBuilder()
      .group('billing')
      .build();

    expect(rule.group).toBe('billing');
  });

  it('chains fluently', () => {
    const builder = minimalBuilder();
    const result = builder.group('billing');
    expect(result).toBe(builder);
  });

  it('omits group when not set', () => {
    const rule = minimalBuilder().build();
    expect(rule).not.toHaveProperty('group');
  });

  it('throws DslValidationError for empty string', () => {
    expect(() => {
      minimalBuilder().group('');
    }).toThrow(DslValidationError);
  });

  it('throws DslValidationError for non-string value', () => {
    expect(() => {
      minimalBuilder().group(123 as unknown as string);
    }).toThrow(DslValidationError);
  });

  it('error message mentions Group ID', () => {
    try {
      minimalBuilder().group('');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DslValidationError);
      expect((err as DslValidationError).message).toContain('Group ID');
    }
  });

  it('allows setting group before other methods', () => {
    const rule = RuleBuilder.create('r1')
      .group('billing')
      .name('Rule')
      .when({ type: 'event', topic: 'test' })
      .then({ type: 'emit_event', topic: 'out', data: {} })
      .build();

    expect(rule.group).toBe('billing');
    expect(rule.name).toBe('Rule');
  });

  it('last .group() call wins', () => {
    const rule = minimalBuilder()
      .group('first')
      .group('second')
      .build();

    expect(rule.group).toBe('second');
  });
});
