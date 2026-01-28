import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../../src/validation/rule-validator.js';

const minimalRule = {
  id: 'test-1',
  name: 'Test Rule',
  trigger: { type: 'event', topic: 'order.created' },
};

describe('RuleInputValidator', () => {
  describe('validate', () => {
    describe('required fields', () => {
      it('should fail when rule is not an object', () => {
        const v = new RuleInputValidator();
        const result = v.validate('not an object');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.message).toBe('Rule must be an object');
      });

      it('should fail when rule is null', () => {
        const v = new RuleInputValidator();
        expect(v.validate(null).valid).toBe(false);
      });

      it('should fail when rule is an array', () => {
        const v = new RuleInputValidator();
        expect(v.validate([]).valid).toBe(false);
      });

      it('should fail when id is missing', () => {
        const v = new RuleInputValidator();
        const result = v.validate({
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'id')).toBe(true);
      });

      it('should fail when id is not a string', () => {
        const v = new RuleInputValidator();
        const result = v.validate({
          id: 123,
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'id' && e.message.includes('must be a string'))).toBe(true);
      });

      it('should fail when id is empty', () => {
        const v = new RuleInputValidator();
        const result = v.validate({
          id: '  ',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('cannot be empty'))).toBe(true);
      });

      it('should fail when name is missing', () => {
        const v = new RuleInputValidator();
        const result = v.validate({
          id: 'test-1',
          trigger: { type: 'event', topic: 'test' },
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'name')).toBe(true);
      });

      it('should fail when trigger is missing', () => {
        const v = new RuleInputValidator();
        const result = v.validate({
          id: 'test-1',
          name: 'Test',
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'trigger')).toBe(true);
      });

      it('should pass with valid minimal rule', () => {
        const v = new RuleInputValidator();
        const result = v.validate(minimalRule);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should collect all required-field errors at once', () => {
        const v = new RuleInputValidator();
        const result = v.validate({});

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('optional fields', () => {
      it('should fail when description is not a string', () => {
        const v = new RuleInputValidator();
        const result = v.validate({ ...minimalRule, description: 42 });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'description')).toBe(true);
      });

      it('should pass with valid description', () => {
        const v = new RuleInputValidator();
        expect(v.validate({ ...minimalRule, description: 'A rule' }).valid).toBe(true);
      });

      it('should fail when priority is not a number', () => {
        const v = new RuleInputValidator();
        const result = v.validate({ ...minimalRule, priority: 'high' });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'priority')).toBe(true);
      });

      it('should warn when priority is not an integer', () => {
        const v = new RuleInputValidator();
        const result = v.validate({ ...minimalRule, priority: 1.5 });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.path === 'priority')).toBe(true);
      });

      it('should fail when enabled is not a boolean', () => {
        const v = new RuleInputValidator();
        const result = v.validate({ ...minimalRule, enabled: 'yes' });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'enabled')).toBe(true);
      });

      it('should fail when tags is not an array', () => {
        const v = new RuleInputValidator();
        const result = v.validate({ ...minimalRule, tags: 'not-an-array' });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'tags')).toBe(true);
      });

      it('should fail when tag element is not a string', () => {
        const v = new RuleInputValidator();
        const result = v.validate({ ...minimalRule, tags: ['valid', 123] });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'tags[1]')).toBe(true);
      });

      it('should pass with valid optional fields', () => {
        const v = new RuleInputValidator();
        const result = v.validate({
          ...minimalRule,
          description: 'Desc',
          priority: 10,
          enabled: false,
          tags: ['tag1', 'tag2'],
        });
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateMany', () => {
    it('should fail when input is not an array', () => {
      const v = new RuleInputValidator();
      const result = v.validateMany({ id: 'test' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.message).toBe('Input must be an array of rules');
    });

    it('should validate multiple valid rules', () => {
      const v = new RuleInputValidator();
      const result = v.validateMany([
        { id: 'rule-1', name: 'Rule 1', trigger: { type: 'event', topic: 'test' } },
        { id: 'rule-2', name: 'Rule 2', trigger: { type: 'fact', pattern: 'test:*' } },
      ]);

      expect(result.valid).toBe(true);
    });

    it('should detect duplicate IDs', () => {
      const v = new RuleInputValidator();
      const result = v.validateMany([
        { id: 'dup', name: 'Rule 1', trigger: { type: 'event', topic: 'test' } },
        { id: 'dup', name: 'Rule 2', trigger: { type: 'event', topic: 'test' } },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate rule ID'))).toBe(true);
    });

    it('should report errors with correct path prefix', () => {
      const v = new RuleInputValidator();
      const result = v.validateMany([
        { id: 'rule-1', name: 'Rule 1', trigger: { type: 'event', topic: 'test' } },
        { id: 'rule-2', trigger: { type: 'event', topic: 'test' } },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === '[1].name')).toBe(true);
    });

    it('should reject non-object elements', () => {
      const v = new RuleInputValidator();
      const result = v.validateMany(['not-an-object']);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === '[0]')).toBe(true);
    });
  });

  describe('strict mode', () => {
    it('should warn about unused aliases', () => {
      const v = new RuleInputValidator({ strict: true });
      const result = v.validate({
        id: 'test-1',
        name: 'Test',
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'order.created', as: 'order' },
              { topic: 'payment.received' },
            ],
            within: '30m',
          },
        },
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.message.includes('never used'))).toBe(true);
    });

    it('should not warn when alias is used in condition ref', () => {
      const v = new RuleInputValidator({ strict: true });
      const result = v.validate({
        id: 'test-1',
        name: 'Test',
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'order.created', as: 'order' },
              { topic: 'payment.received' },
            ],
            within: '30m',
          },
        },
        conditions: [{
          source: { type: 'event', field: 'amount' },
          operator: 'gt',
          value: { ref: 'order' },
        }],
      });

      expect(result.warnings.some(w => w.message.includes('never used'))).toBe(false);
    });

    it('should not warn when alias is used in action ref', () => {
      const v = new RuleInputValidator({ strict: true });
      const result = v.validate({
        id: 'test-1',
        name: 'Test',
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'order.created', as: 'order' },
              { topic: 'payment.received' },
            ],
            within: '30m',
          },
        },
        actions: [{
          type: 'set_fact',
          key: 'order:processed',
          value: { ref: 'order' },
        }],
      });

      expect(result.warnings.some(w => w.message.includes('never used'))).toBe(false);
    });

    it('should not warn when strict mode is off', () => {
      const v = new RuleInputValidator({ strict: false });
      const result = v.validate({
        id: 'test-1',
        name: 'Test',
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'order.created', as: 'order' },
              { topic: 'payment.received' },
            ],
            within: '30m',
          },
        },
      });

      expect(result.warnings).toHaveLength(0);
    });
  });
});
