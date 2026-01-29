import { describe, it, expect } from 'vitest';
import { validateRule } from '../../src/dsl/yaml/schema.js';

function minimalRuleObj(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    trigger: { type: 'event', topic: 'test.event' },
    actions: [{ type: 'emit_event', topic: 'out', data: {} }],
    ...overrides,
  };
}

describe('validateRule — group field', () => {
  it('parses group field as string', () => {
    const rule = validateRule(minimalRuleObj({ group: 'billing' }));
    expect(rule.group).toBe('billing');
  });

  it('omits group when not present', () => {
    const rule = validateRule(minimalRuleObj());
    expect(rule).not.toHaveProperty('group');
  });

  it('throws for non-string group value', () => {
    expect(() => validateRule(minimalRuleObj({ group: 123 }))).toThrow();
  });

  it('throws for empty string group', () => {
    expect(() => validateRule(minimalRuleObj({ group: '' }))).toThrow();
  });

  it('throws for boolean group value', () => {
    expect(() => validateRule(minimalRuleObj({ group: true }))).toThrow();
  });

  it('throws for array group value', () => {
    expect(() => validateRule(minimalRuleObj({ group: ['billing'] }))).toThrow();
  });

  it('error path includes group', () => {
    try {
      validateRule(minimalRuleObj({ group: 123 }));
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('group');
    }
  });

  it('group field does not affect other validated fields', () => {
    const rule = validateRule(minimalRuleObj({
      group: 'billing',
      priority: 10,
      tags: ['important'],
    }));

    expect(rule.group).toBe('billing');
    expect(rule.priority).toBe(10);
    expect(rule.tags).toEqual(['important']);
  });
});
