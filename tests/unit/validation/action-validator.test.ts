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

describe('action validation', () => {
  const v = new RuleInputValidator();

  describe('actions array', () => {
    it('should fail when actions is not an array', () => {
      const result = v.validate(makeRule('not-an-array'));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions')).toBe(true);
    });

    it('should warn when actions array is empty', () => {
      const result = v.validate(makeRule([]));
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.message.includes('no actions'))).toBe(true);
    });
  });

  describe('action object', () => {
    it('should fail when action is not an object', () => {
      const result = v.validate(makeRule([42]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0]')).toBe(true);
    });

    it('should fail when action type is missing', () => {
      const result = v.validate(makeRule([{ key: 'test' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].type')).toBe(true);
    });

    it('should fail when action type is invalid', () => {
      const result = v.validate(makeRule([{ type: 'invalid' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid action type'))).toBe(true);
    });
  });

  describe('set_fact', () => {
    it('should pass with valid set_fact', () => {
      const result = v.validate(makeRule([{
        type: 'set_fact',
        key: 'user:123:premium',
        value: true,
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when key is missing', () => {
      const result = v.validate(makeRule([{ type: 'set_fact', value: true }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].key')).toBe(true);
    });

    it('should fail when key is not a string', () => {
      const result = v.validate(makeRule([{ type: 'set_fact', key: 42, value: true }]));
      expect(result.valid).toBe(false);
    });

    it('should fail when value is missing', () => {
      const result = v.validate(makeRule([{ type: 'set_fact', key: 'k' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].value')).toBe(true);
    });
  });

  describe('delete_fact', () => {
    it('should pass with valid delete_fact', () => {
      const result = v.validate(makeRule([{ type: 'delete_fact', key: 'user:123:premium' }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when key is missing', () => {
      const result = v.validate(makeRule([{ type: 'delete_fact' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].key')).toBe(true);
    });
  });

  describe('emit_event', () => {
    it('should pass with valid emit_event', () => {
      const result = v.validate(makeRule([{
        type: 'emit_event',
        topic: 'notification.send',
        data: { message: 'Hello' },
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when topic is missing', () => {
      const result = v.validate(makeRule([{
        type: 'emit_event',
        data: {},
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].topic')).toBe(true);
    });

    it('should fail when data is missing', () => {
      const result = v.validate(makeRule([{
        type: 'emit_event',
        topic: 'test',
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].data')).toBe(true);
    });

    it('should fail when data is not an object', () => {
      const result = v.validate(makeRule([{
        type: 'emit_event',
        topic: 'test',
        data: 'not-object',
      }]));
      expect(result.valid).toBe(false);
    });
  });

  describe('set_timer', () => {
    const validTimer = {
      name: 'reminder',
      duration: '1h',
      onExpire: { topic: 'reminder.expired', data: {} },
    };

    it('should pass with valid set_timer', () => {
      const result = v.validate(makeRule([{ type: 'set_timer', timer: validTimer }]));
      expect(result.valid).toBe(true);
    });

    it('should pass with numeric duration', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { ...validTimer, duration: 5000 },
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when timer is missing', () => {
      const result = v.validate(makeRule([{ type: 'set_timer' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].timer')).toBe(true);
    });

    it('should fail when timer is not an object', () => {
      const result = v.validate(makeRule([{ type: 'set_timer', timer: 'string' }]));
      expect(result.valid).toBe(false);
    });

    it('should fail when timer name is missing', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { duration: '1h', onExpire: { topic: 't', data: {} } },
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].timer.name')).toBe(true);
    });

    it('should fail when duration is invalid string', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { ...validTimer, duration: 'invalid' },
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid duration format'))).toBe(true);
    });

    it('should fail when duration is negative number', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { ...validTimer, duration: -1 },
      }]));
      expect(result.valid).toBe(false);
    });

    it('should fail when duration is zero', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { ...validTimer, duration: 0 },
      }]));
      expect(result.valid).toBe(false);
    });

    it('should fail when duration has wrong type', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { ...validTimer, duration: true },
      }]));
      expect(result.valid).toBe(false);
    });

    it('should fail when onExpire is missing', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { name: 'test', duration: '1h' },
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].timer.onExpire')).toBe(true);
    });

    it('should fail when onExpire is not an object', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { name: 'test', duration: '1h', onExpire: 'string' },
      }]));
      expect(result.valid).toBe(false);
    });

    it('should fail when onExpire has no topic', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { name: 'test', duration: '1h', onExpire: { data: {} } },
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].timer.onExpire.topic')).toBe(true);
    });

    it('should fail when onExpire has no data', () => {
      const result = v.validate(makeRule([{
        type: 'set_timer',
        timer: { name: 'test', duration: '1h', onExpire: { topic: 'test' } },
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].timer.onExpire.data')).toBe(true);
    });
  });

  describe('cancel_timer', () => {
    it('should pass with valid cancel_timer', () => {
      const result = v.validate(makeRule([{ type: 'cancel_timer', name: 'reminder' }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when name is missing', () => {
      const result = v.validate(makeRule([{ type: 'cancel_timer' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].name')).toBe(true);
    });
  });

  describe('call_service', () => {
    it('should pass with valid call_service', () => {
      const result = v.validate(makeRule([{
        type: 'call_service',
        service: 'emailService',
        method: 'send',
        args: ['user@example.com', 'Hello'],
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when service is missing', () => {
      const result = v.validate(makeRule([{
        type: 'call_service',
        method: 'send',
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].service')).toBe(true);
    });

    it('should fail when method is missing', () => {
      const result = v.validate(makeRule([{
        type: 'call_service',
        service: 'svc',
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].method')).toBe(true);
    });

    it('should fail when args is not an array', () => {
      const result = v.validate(makeRule([{
        type: 'call_service',
        service: 'svc',
        method: 'run',
        args: 'not-array',
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].args')).toBe(true);
    });

    it('should pass when args is omitted', () => {
      const result = v.validate(makeRule([{
        type: 'call_service',
        service: 'svc',
        method: 'run',
      }]));
      expect(result.valid).toBe(true);
    });
  });

  describe('log', () => {
    it('should pass with valid log', () => {
      const result = v.validate(makeRule([{
        type: 'log',
        level: 'info',
        message: 'Rule fired',
      }]));
      expect(result.valid).toBe(true);
    });

    it('should fail when level is missing', () => {
      const result = v.validate(makeRule([{ type: 'log', message: 'test' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].level')).toBe(true);
    });

    it('should fail when level is invalid', () => {
      const result = v.validate(makeRule([{
        type: 'log',
        level: 'verbose',
        message: 'test',
      }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid log level'))).toBe(true);
    });

    it('should fail when message is missing', () => {
      const result = v.validate(makeRule([{ type: 'log', level: 'info' }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'actions[0].message')).toBe(true);
    });

    it('should fail when message is not a string', () => {
      const result = v.validate(makeRule([{ type: 'log', level: 'info', message: 42 }]));
      expect(result.valid).toBe(false);
    });

    for (const level of ['debug', 'info', 'warn', 'error']) {
      it(`should pass with level "${level}"`, () => {
        const result = v.validate(makeRule([{ type: 'log', level, message: 'msg' }]));
        expect(result.valid).toBe(true);
      });
    }
  });
});
