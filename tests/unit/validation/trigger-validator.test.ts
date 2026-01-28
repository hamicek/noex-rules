import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../../src/validation/rule-validator.js';

function makeRule(trigger: unknown) {
  return { id: 'test-1', name: 'Test', trigger };
}

describe('trigger validation', () => {
  const v = new RuleInputValidator();

  describe('general', () => {
    it('should fail when trigger is not an object', () => {
      const result = v.validate(makeRule('string'));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger')).toBe(true);
    });

    it('should fail when trigger type is missing', () => {
      const result = v.validate(makeRule({}));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger.type')).toBe(true);
    });

    it('should fail when trigger type is not a string', () => {
      const result = v.validate(makeRule({ type: 42 }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger.type')).toBe(true);
    });

    it('should fail when trigger type is invalid', () => {
      const result = v.validate(makeRule({ type: 'invalid' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid trigger type'))).toBe(true);
    });
  });

  describe('event trigger', () => {
    it('should pass with valid event trigger', () => {
      const result = v.validate(makeRule({ type: 'event', topic: 'order.created' }));
      expect(result.valid).toBe(true);
    });

    it('should fail when topic is missing', () => {
      const result = v.validate(makeRule({ type: 'event' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger.topic')).toBe(true);
    });

    it('should fail when topic is not a string', () => {
      const result = v.validate(makeRule({ type: 'event', topic: 123 }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger.topic')).toBe(true);
    });

    it('should fail when topic is empty', () => {
      const result = v.validate(makeRule({ type: 'event', topic: '  ' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('cannot be empty'))).toBe(true);
    });
  });

  describe('fact trigger', () => {
    it('should pass with valid fact trigger', () => {
      const result = v.validate(makeRule({ type: 'fact', pattern: 'customer:*:age' }));
      expect(result.valid).toBe(true);
    });

    it('should fail when pattern is missing', () => {
      const result = v.validate(makeRule({ type: 'fact' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger.pattern')).toBe(true);
    });

    it('should fail when pattern is not a string', () => {
      const result = v.validate(makeRule({ type: 'fact', pattern: 42 }));
      expect(result.valid).toBe(false);
    });

    it('should fail when pattern is empty', () => {
      const result = v.validate(makeRule({ type: 'fact', pattern: '   ' }));
      expect(result.valid).toBe(false);
    });
  });

  describe('timer trigger', () => {
    it('should pass with valid timer trigger', () => {
      const result = v.validate(makeRule({ type: 'timer', name: 'payment-timeout' }));
      expect(result.valid).toBe(true);
    });

    it('should fail when name is missing', () => {
      const result = v.validate(makeRule({ type: 'timer' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger.name')).toBe(true);
    });

    it('should fail when name is not a string', () => {
      const result = v.validate(makeRule({ type: 'timer', name: 42 }));
      expect(result.valid).toBe(false);
    });

    it('should fail when name is empty', () => {
      const result = v.validate(makeRule({ type: 'timer', name: '' }));
      expect(result.valid).toBe(false);
    });
  });

  describe('temporal trigger', () => {
    it('should fail when pattern is missing', () => {
      const result = v.validate(makeRule({ type: 'temporal' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'trigger.pattern')).toBe(true);
    });

    it('should pass with valid temporal trigger', () => {
      const result = v.validate(makeRule({
        type: 'temporal',
        pattern: {
          type: 'sequence',
          events: [{ topic: 'a' }, { topic: 'b' }],
          within: '5m',
        },
      }));
      expect(result.valid).toBe(true);
    });
  });
});
