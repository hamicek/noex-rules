import { describe, it, expect } from 'vitest';
import { RuleValidator, createValidator } from '../../../../src/cli/services/validator.js';

describe('RuleValidator', () => {
  describe('validate', () => {
    describe('required fields', () => {
      it('should fail when rule is not an object', () => {
        const validator = createValidator();
        const result = validator.validate('not an object');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe('Rule must be an object');
      });

      it('should fail when id is missing', () => {
        const validator = createValidator();
        const result = validator.validate({
          name: 'Test',
          trigger: { type: 'event', topic: 'test' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'id')).toBe(true);
      });

      it('should fail when name is missing', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          trigger: { type: 'event', topic: 'test' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'name')).toBe(true);
      });

      it('should fail when trigger is missing', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test'
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'trigger')).toBe(true);
      });

      it('should fail when id is empty', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: '  ',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('cannot be empty'))).toBe(true);
      });

      it('should pass with valid minimal rule', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test Rule',
          trigger: { type: 'event', topic: 'order.created' }
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('optional fields', () => {
      it('should warn when priority is not an integer', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          priority: 1.5
        });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.path === 'priority')).toBe(true);
      });

      it('should fail when enabled is not a boolean', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          enabled: 'yes'
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'enabled')).toBe(true);
      });

      it('should fail when tags is not an array', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          tags: 'not-an-array'
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'tags')).toBe(true);
      });

      it('should fail when tag is not a string', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          tags: ['valid', 123]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'tags[1]')).toBe(true);
      });
    });

    describe('trigger validation', () => {
      it('should fail when trigger type is invalid', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'invalid' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid trigger type'))).toBe(true);
      });

      it('should fail when event trigger has no topic', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'trigger.topic')).toBe(true);
      });

      it('should fail when fact trigger has no pattern', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'fact' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'trigger.pattern')).toBe(true);
      });

      it('should fail when timer trigger has no name', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'timer' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'trigger.name')).toBe(true);
      });

      it('should pass with valid event trigger', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'order.created' }
        });

        expect(result.valid).toBe(true);
      });

      it('should pass with valid fact trigger', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'fact', pattern: 'customer:*:age' }
        });

        expect(result.valid).toBe(true);
      });

      it('should pass with valid timer trigger', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'timer', name: 'payment-timeout' }
        });

        expect(result.valid).toBe(true);
      });
    });

    describe('temporal trigger validation', () => {
      it('should fail when temporal trigger has no pattern', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'temporal' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'trigger.pattern')).toBe(true);
      });

      it('should validate sequence pattern', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'sequence',
              events: [
                { topic: 'order.created' },
                { topic: 'payment.received' }
              ],
              within: '30m'
            }
          }
        });

        expect(result.valid).toBe(true);
      });

      it('should fail when sequence has less than 2 events', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'sequence',
              events: [{ topic: 'order.created' }],
              within: '30m'
            }
          }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('at least 2 events'))).toBe(true);
      });

      it('should validate absence pattern', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'absence',
              after: { topic: 'order.created' },
              expected: { topic: 'payment.received' },
              within: '24h'
            }
          }
        });

        expect(result.valid).toBe(true);
      });

      it('should validate count pattern', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'count',
              event: { topic: 'login.failed' },
              threshold: 5,
              window: '5m'
            }
          }
        });

        expect(result.valid).toBe(true);
      });

      it('should validate aggregate pattern', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'aggregate',
              event: { topic: 'transaction.completed' },
              field: 'amount',
              function: 'sum',
              threshold: 10000,
              comparison: 'gte',
              window: '1h'
            }
          }
        });

        expect(result.valid).toBe(true);
      });

      it('should fail with invalid aggregate function', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'aggregate',
              event: { topic: 'test' },
              field: 'amount',
              function: 'invalid',
              threshold: 100,
              window: '1h'
            }
          }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid aggregate function'))).toBe(true);
      });

      it('should fail with invalid duration format', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'count',
              event: { topic: 'test' },
              threshold: 5,
              window: 'invalid'
            }
          }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid duration format'))).toBe(true);
      });
    });

    describe('condition validation', () => {
      it('should fail when conditions is not an array', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: 'not-an-array'
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'conditions')).toBe(true);
      });

      it('should fail when condition has no source', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: [{ operator: 'eq', value: 10 }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'conditions[0].source')).toBe(true);
      });

      it('should fail when condition has invalid operator', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: [{
            source: { type: 'fact', pattern: 'test' },
            operator: 'invalid',
            value: 10
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid operator'))).toBe(true);
      });

      it('should fail when source type is invalid', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: [{
            source: { type: 'invalid' },
            operator: 'eq',
            value: 10
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid source type'))).toBe(true);
      });

      it('should pass with valid fact condition', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: [{
            source: { type: 'fact', pattern: 'customer:123:age' },
            operator: 'gte',
            value: 18
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should pass with valid event condition', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: [{
            source: { type: 'event', field: 'amount' },
            operator: 'gt',
            value: 100
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should pass with valid context condition', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: [{
            source: { type: 'context', key: 'userRole' },
            operator: 'in',
            value: ['admin', 'moderator']
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should not require value for exists operator', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          conditions: [{
            source: { type: 'fact', pattern: 'user:*:email' },
            operator: 'exists'
          }]
        });

        expect(result.valid).toBe(true);
      });
    });

    describe('action validation', () => {
      it('should warn when actions array is empty', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: []
        });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.message.includes('no actions'))).toBe(true);
      });

      it('should fail when action type is invalid', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{ type: 'invalid' }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid action type'))).toBe(true);
      });

      it('should validate set_fact action', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'set_fact',
            key: 'user:123:premium',
            value: true
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should fail when set_fact has no key', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'set_fact',
            value: true
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === 'actions[0].key')).toBe(true);
      });

      it('should validate emit_event action', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'emit_event',
            topic: 'notification.send',
            data: { message: 'Hello' }
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should validate set_timer action', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'set_timer',
            timer: {
              name: 'reminder',
              duration: '1h',
              onExpire: {
                topic: 'reminder.expired',
                data: {}
              }
            }
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should fail when timer has invalid duration', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'set_timer',
            timer: {
              name: 'test',
              duration: 'invalid',
              onExpire: { topic: 'test', data: {} }
            }
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid duration format'))).toBe(true);
      });

      it('should validate log action', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'log',
            level: 'info',
            message: 'Rule fired'
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should fail when log level is invalid', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'log',
            level: 'verbose',
            message: 'test'
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Invalid log level'))).toBe(true);
      });

      it('should validate call_service action', () => {
        const validator = createValidator();
        const result = validator.validate({
          id: 'test-1',
          name: 'Test',
          trigger: { type: 'event', topic: 'test' },
          actions: [{
            type: 'call_service',
            service: 'emailService',
            method: 'send',
            args: ['user@example.com', 'Hello']
          }]
        });

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateMany', () => {
    it('should fail when input is not an array', () => {
      const validator = createValidator();
      const result = validator.validateMany({ id: 'test' });

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe('Input must be an array of rules');
    });

    it('should validate multiple rules', () => {
      const validator = createValidator();
      const result = validator.validateMany([
        {
          id: 'rule-1',
          name: 'Rule 1',
          trigger: { type: 'event', topic: 'test' }
        },
        {
          id: 'rule-2',
          name: 'Rule 2',
          trigger: { type: 'fact', pattern: 'test:*' }
        }
      ]);

      expect(result.valid).toBe(true);
    });

    it('should detect duplicate IDs', () => {
      const validator = createValidator();
      const result = validator.validateMany([
        {
          id: 'duplicate',
          name: 'Rule 1',
          trigger: { type: 'event', topic: 'test' }
        },
        {
          id: 'duplicate',
          name: 'Rule 2',
          trigger: { type: 'event', topic: 'test' }
        }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate rule ID'))).toBe(true);
    });

    it('should report errors with correct path prefix', () => {
      const validator = createValidator();
      const result = validator.validateMany([
        {
          id: 'rule-1',
          name: 'Rule 1',
          trigger: { type: 'event', topic: 'test' }
        },
        {
          id: 'rule-2',
          trigger: { type: 'event', topic: 'test' }
        }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === '[1].name')).toBe(true);
    });
  });

  describe('strict mode', () => {
    it('should warn about unused aliases', () => {
      const validator = createValidator({ strict: true });
      const result = validator.validate({
        id: 'test-1',
        name: 'Test',
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'order.created', as: 'order' },
              { topic: 'payment.received' }
            ],
            within: '30m'
          }
        }
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.message.includes('never used'))).toBe(true);
    });
  });
});
