import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../../src/validation/rule-validator.js';

function makeRule(actions: unknown) {
  return {
    id: 'test-1',
    name: 'Test',
    trigger: { type: 'event', topic: 'test' },
    actions,
  };
}

const validCondition = {
  source: { type: 'event', field: 'amount' },
  operator: 'gte',
  value: 100,
};

const validThenAction = {
  type: 'emit_event',
  topic: 'premium.process',
  data: { orderId: 'abc' },
};

const validElseAction = {
  type: 'emit_event',
  topic: 'standard.process',
  data: { orderId: 'abc' },
};

describe('conditional action validation', () => {
  const v = new RuleInputValidator();

  describe('valid conditional actions', () => {
    it('should pass with conditions + then (no else)', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [validThenAction],
      }]));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass with conditions + then + else', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [validThenAction],
        else: [validElseAction],
      }]));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass with multiple conditions (AND logic)', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [
          validCondition,
          { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true },
        ],
        then: [validThenAction],
      }]));
      expect(result.valid).toBe(true);
    });

    it('should pass with multiple actions in then branch', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [
          validThenAction,
          { type: 'set_fact', key: 'processed', value: true },
        ],
      }]));
      expect(result.valid).toBe(true);
    });

    it('should pass with multiple actions in else branch', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [validThenAction],
        else: [
          validElseAction,
          { type: 'log', level: 'info', message: 'Standard processing' },
        ],
      }]));
      expect(result.valid).toBe(true);
    });
  });

  describe('conditions field', () => {
    it('should fail when conditions is missing', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        then: [validThenAction],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].conditions')).toBe(true);
    });

    it('should fail when conditions is not an array', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: validCondition,
        then: [validThenAction],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'actions[0].conditions' && e.message.includes('must be an array'),
      )).toBe(true);
    });

    it('should fail when conditions is empty', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [],
        then: [validThenAction],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'actions[0].conditions' && e.message.includes('must not be empty'),
      )).toBe(true);
    });

    it('should fail when a condition is invalid', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [{ source: { type: 'event', field: 'x' }, operator: 'INVALID', value: 1 }],
        then: [validThenAction],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid operator'))).toBe(true);
    });
  });

  describe('then field', () => {
    it('should fail when then is missing', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].then')).toBe(true);
    });

    it('should fail when then is not an array', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: validThenAction,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'actions[0].then' && e.message.includes('must be an array'),
      )).toBe(true);
    });

    it('should fail when then is empty', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'actions[0].then' && e.message.includes('must not be empty'),
      )).toBe(true);
    });

    it('should fail when then contains invalid action', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [{ type: 'emit_event' }],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.startsWith('actions[0].then[0]'))).toBe(true);
    });
  });

  describe('else field', () => {
    it('should warn when else is empty array', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [validThenAction],
        else: [],
      }]));
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w =>
        w.path === 'actions[0].else' && w.message.includes('empty'),
      )).toBe(true);
    });

    it('should fail when else is not an array', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [validThenAction],
        else: validElseAction,
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'actions[0].else' && e.message.includes('must be an array'),
      )).toBe(true);
    });

    it('should fail when else contains invalid action', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [validThenAction],
        else: [{ type: 'set_fact' }],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.startsWith('actions[0].else[0]'))).toBe(true);
    });
  });

  describe('nested conditionals', () => {
    it('should pass with nested conditional in then', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [{
          type: 'conditional',
          conditions: [{ source: { type: 'fact', pattern: 'vip' }, operator: 'eq', value: true }],
          then: [validThenAction],
        }],
      }]));
      expect(result.valid).toBe(true);
    });

    it('should pass with nested conditional in else', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [validThenAction],
        else: [{
          type: 'conditional',
          conditions: [{ source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'silver' }],
          then: [{ type: 'emit_event', topic: 'silver.process', data: {} }],
          else: [{ type: 'emit_event', topic: 'default.process', data: {} }],
        }],
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when deeply nested conditional is invalid', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [{
          type: 'conditional',
          conditions: [],
          then: [validThenAction],
        }],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'actions[0].then[0].conditions' && e.message.includes('must not be empty'),
      )).toBe(true);
    });

    it('should fail when deeply nested then action is invalid', () => {
      const result = v.validate(makeRule([{
        type: 'conditional',
        conditions: [validCondition],
        then: [{
          type: 'conditional',
          conditions: [{ source: { type: 'event', field: 'x' }, operator: 'eq', value: 1 }],
          then: [{ type: 'log' }],
        }],
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.startsWith('actions[0].then[0].then[0]'))).toBe(true);
    });
  });

  describe('mixed with other actions', () => {
    it('should validate conditional alongside regular actions', () => {
      const result = v.validate(makeRule([
        { type: 'log', level: 'info', message: 'Before conditional' },
        {
          type: 'conditional',
          conditions: [validCondition],
          then: [validThenAction],
          else: [validElseAction],
        },
        { type: 'set_fact', key: 'processed', value: true },
      ]));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
