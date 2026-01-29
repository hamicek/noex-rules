import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../src/validation/rule-validator.js';

function minimalRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'emit_event', topic: 'out', data: {} }],
    ...overrides,
  };
}

describe('RuleInputValidator — group field', () => {
  const validator = new RuleInputValidator();

  it('accepts valid string group', () => {
    const result = validator.validate(minimalRule({ group: 'billing' }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts rule without group (field is optional)', () => {
    const result = validator.validate(minimalRule());
    expect(result.valid).toBe(true);
  });

  it('reports error for non-string group', () => {
    const result = validator.validate(minimalRule({ group: 42 }));
    expect(result.valid).toBe(false);

    const groupError = result.errors.find(e => e.path.includes('group'));
    expect(groupError).toBeDefined();
    expect(groupError!.message).toContain('string');
  });

  it('reports error for boolean group', () => {
    const result = validator.validate(minimalRule({ group: true }));
    expect(result.valid).toBe(false);

    const groupError = result.errors.find(e => e.path.includes('group'));
    expect(groupError).toBeDefined();
  });

  it('reports error for empty string group', () => {
    const result = validator.validate(minimalRule({ group: '  ' }));
    expect(result.valid).toBe(false);

    const groupError = result.errors.find(e => e.path.includes('group'));
    expect(groupError).toBeDefined();
    expect(groupError!.message).toContain('empty');
  });

  it('reports error for array group', () => {
    const result = validator.validate(minimalRule({ group: ['billing'] }));
    expect(result.valid).toBe(false);
  });

  it('group validation does not interfere with other validations', () => {
    const result = validator.validate(minimalRule({
      group: 'billing',
      priority: 5,
      tags: ['billing', 'finance'],
    }));
    expect(result.valid).toBe(true);
  });

  it('reports multiple errors when group and other fields are invalid', () => {
    const result = validator.validate({
      id: '',
      name: '',
      group: 42,
      trigger: { type: 'event', topic: 'test' },
      actions: [{ type: 'emit_event', topic: 'out', data: {} }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3); // id, name, group
  });
});
