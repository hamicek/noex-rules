import { describe, it, expect } from 'vitest';
import { validateRule, YamlValidationError } from '../../../../src/dsl/yaml/schema';

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
// group field in validateRule
// ---------------------------------------------------------------------------

describe('validateRule — group field', () => {
  it('parses group field when present', () => {
    const rule = validateRule(minimalRule({ group: 'billing' }));
    expect(rule.group).toBe('billing');
  });

  it('omits group when not present in input', () => {
    const rule = validateRule(minimalRule());
    expect(rule.group).toBeUndefined();
  });

  it('preserves group alongside other optional fields', () => {
    const rule = validateRule(minimalRule({
      name: 'Invoice Check',
      description: 'Validates invoices',
      priority: 10,
      tags: ['billing'],
      group: 'billing',
    }));

    expect(rule.group).toBe('billing');
    expect(rule.name).toBe('Invoice Check');
    expect(rule.description).toBe('Validates invoices');
    expect(rule.priority).toBe(10);
    expect(rule.tags).toEqual(['billing']);
  });

  it('throws YamlValidationError when group is not a string', () => {
    expect(() => validateRule(minimalRule({ group: 42 })))
      .toThrow(YamlValidationError);
  });

  it('throws YamlValidationError when group is an empty string', () => {
    expect(() => validateRule(minimalRule({ group: '' })))
      .toThrow(YamlValidationError);
  });

  it('throws YamlValidationError when group is a boolean', () => {
    expect(() => validateRule(minimalRule({ group: true })))
      .toThrow(YamlValidationError);
  });

  it('includes correct path in error for invalid group', () => {
    try {
      validateRule(minimalRule({ group: 123 }));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(YamlValidationError);
      expect((err as YamlValidationError).path).toBe('rule.group');
    }
  });

  it('includes correct path with custom prefix', () => {
    try {
      validateRule(minimalRule({ group: null }), 'rules[0]');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(YamlValidationError);
      expect((err as YamlValidationError).path).toBe('rules[0].group');
    }
  });
});
