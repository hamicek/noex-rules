import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../../src/validation/rule-validator.js';

const minimalRule = {
  id: 'test-1',
  name: 'Test Rule',
  trigger: { type: 'event', topic: 'order.created' },
};

describe('RuleInputValidator — group field', () => {
  const v = new RuleInputValidator();

  it('should pass when group is omitted', () => {
    const result = v.validate(minimalRule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should pass when group is a valid string', () => {
    const result = v.validate({ ...minimalRule, group: 'billing' });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when group is not a string', () => {
    const result = v.validate({ ...minimalRule, group: 42 });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      path: 'group',
      message: 'Field "group" must be a string',
    });
  });

  it('should fail when group is a boolean', () => {
    const result = v.validate({ ...minimalRule, group: true });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'group' && e.message.includes('must be a string'))).toBe(true);
  });

  it('should fail when group is an empty string', () => {
    const result = v.validate({ ...minimalRule, group: '' });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      path: 'group',
      message: 'Field "group" cannot be empty',
    });
  });

  it('should fail when group is a whitespace-only string', () => {
    const result = v.validate({ ...minimalRule, group: '   ' });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'group' && e.message.includes('cannot be empty'))).toBe(true);
  });

  it('should fail when group is null', () => {
    const result = v.validate({ ...minimalRule, group: null });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'group')).toBe(true);
  });

  it('should fail when group is an object', () => {
    const result = v.validate({ ...minimalRule, group: { id: 'billing' } });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'group' && e.message.includes('must be a string'))).toBe(true);
  });

  it('should report correct path prefix in validateMany', () => {
    const result = v.validateMany([
      { ...minimalRule, id: 'rule-1', group: 'billing' },
      { ...minimalRule, id: 'rule-2', group: 123 },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      path: '[1].group',
      message: 'Field "group" must be a string',
    });
  });

  it('should pass with group alongside other optional fields', () => {
    const result = v.validate({
      ...minimalRule,
      description: 'A rule',
      priority: 10,
      enabled: true,
      tags: ['billing'],
      group: 'billing',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
