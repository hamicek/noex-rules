import { describe, it, expect } from 'vitest';
import { RuleInputValidator } from '../../../src/validation/rule-validator.js';

const minimalRule = {
  id: 'test-1',
  name: 'Test Rule',
  trigger: { type: 'event', topic: 'order.created' },
};

const validLookup = {
  name: 'credit',
  service: 'creditService',
  method: 'getScore',
  args: [{ ref: 'event.customerId' }],
};

describe('RuleInputValidator — lookups', () => {
  const v = new RuleInputValidator();

  describe('lookups array', () => {
    it('should pass when lookups is omitted', () => {
      const result = v.validate(minimalRule);
      expect(result.valid).toBe(true);
    });

    it('should pass with an empty lookups array', () => {
      const result = v.validate({ ...minimalRule, lookups: [] });
      expect(result.valid).toBe(true);
    });

    it('should pass with a valid lookup', () => {
      const result = v.validate({ ...minimalRule, lookups: [validLookup] });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when lookups is not an array', () => {
      const result = v.validate({ ...minimalRule, lookups: 'not-array' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'lookups' && e.message.includes('must be an array'))).toBe(true);
    });

    it('should fail when lookup element is not an object', () => {
      const result = v.validate({ ...minimalRule, lookups: ['bad'] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'lookups[0]' && e.message.includes('must be an object'))).toBe(true);
    });
  });

  describe('required fields', () => {
    it('should fail when name is missing', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ service: 'svc', method: 'fn' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'lookups[0].name')).toBe(true);
    });

    it('should fail when name is not a string', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 42, service: 'svc', method: 'fn' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].name' && e.message.includes('must be a string'),
      )).toBe(true);
    });

    it('should fail when name is empty', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: '  ', service: 'svc', method: 'fn' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].name' && e.message.includes('cannot be empty'),
      )).toBe(true);
    });

    it('should fail when service is missing', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', method: 'fn' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'lookups[0].service')).toBe(true);
    });

    it('should fail when service is not a string', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: true, method: 'fn' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].service' && e.message.includes('must be a string'),
      )).toBe(true);
    });

    it('should fail when service is empty', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: '', method: 'fn' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].service' && e.message.includes('cannot be empty'),
      )).toBe(true);
    });

    it('should fail when method is missing', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'lookups[0].method')).toBe(true);
    });

    it('should fail when method is not a string', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 123 }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].method' && e.message.includes('must be a string'),
      )).toBe(true);
    });

    it('should fail when method is empty', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: '  ' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].method' && e.message.includes('cannot be empty'),
      )).toBe(true);
    });

    it('should report all missing required fields at once', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{}],
      });
      expect(result.valid).toBe(false);
      const lookupErrors = result.errors.filter(e => e.path.startsWith('lookups[0]'));
      expect(lookupErrors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('unique names', () => {
    it('should fail when lookup names are duplicated', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [
          { name: 'credit', service: 'svc1', method: 'fn1' },
          { name: 'credit', service: 'svc2', method: 'fn2' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[1].name' && e.message.includes('Duplicate lookup name'),
      )).toBe(true);
    });

    it('should pass when lookup names are distinct', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [
          { name: 'credit', service: 'svc1', method: 'fn1' },
          { name: 'fraud', service: 'svc2', method: 'fn2' },
        ],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('args', () => {
    it('should pass when args is omitted', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn' }],
      });
      expect(result.valid).toBe(true);
    });

    it('should pass when args is an empty array', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', args: [] }],
      });
      expect(result.valid).toBe(true);
    });

    it('should pass when args contains mixed types', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', args: [1, 'two', { ref: 'event.id' }] }],
      });
      expect(result.valid).toBe(true);
    });

    it('should fail when args is not an array', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', args: 'bad' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].args' && e.message.includes('must be an array'),
      )).toBe(true);
    });
  });

  describe('cache', () => {
    it('should pass when cache is omitted', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn' }],
      });
      expect(result.valid).toBe(true);
    });

    it('should pass with a valid duration string ttl', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: '5m' } }],
      });
      expect(result.valid).toBe(true);
    });

    it('should pass with a numeric millisecond ttl', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: 30000 } }],
      });
      expect(result.valid).toBe(true);
    });

    it('should pass with a pure numeric string ttl (ms)', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: '5000' } }],
      });
      expect(result.valid).toBe(true);
    });

    it('should fail when cache is not an object', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: 'bad' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].cache' && e.message.includes('must be an object'),
      )).toBe(true);
    });

    it('should fail when ttl is missing', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: {} }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].cache.ttl' && e.message.includes('must have a "ttl" field'),
      )).toBe(true);
    });

    it('should fail when ttl is an invalid duration string', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: 'forever' } }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].cache.ttl' && e.message.includes('Invalid cache ttl duration'),
      )).toBe(true);
    });

    it('should fail when ttl is zero', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: 0 } }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].cache.ttl' && e.message.includes('positive number'),
      )).toBe(true);
    });

    it('should fail when ttl is negative', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: -100 } }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].cache.ttl' && e.message.includes('positive number'),
      )).toBe(true);
    });

    it('should fail when ttl is not a string or number', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: true } }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].cache.ttl' && e.message.includes('must be a string or number'),
      )).toBe(true);
    });

    it('should fail when ttl is Infinity', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', cache: { ttl: Infinity } }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].cache.ttl' && e.message.includes('positive number'),
      )).toBe(true);
    });
  });

  describe('onError', () => {
    it('should pass when onError is omitted', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn' }],
      });
      expect(result.valid).toBe(true);
    });

    it('should pass with onError "skip"', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', onError: 'skip' }],
      });
      expect(result.valid).toBe(true);
    });

    it('should pass with onError "fail"', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', onError: 'fail' }],
      });
      expect(result.valid).toBe(true);
    });

    it('should fail when onError is not a string', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', onError: 42 }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].onError' && e.message.includes('must be a string'),
      )).toBe(true);
    });

    it('should fail when onError is an invalid strategy', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'x', service: 'svc', method: 'fn', onError: 'retry' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.path === 'lookups[0].onError' && e.message.includes('Invalid onError strategy'),
      )).toBe(true);
    });
  });

  describe('full integration', () => {
    it('should pass a fully-specified lookup', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{
          name: 'credit',
          service: 'creditService',
          method: 'getScore',
          args: [{ ref: 'event.customerId' }],
          cache: { ttl: '5m' },
          onError: 'skip',
        }],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate multiple lookups independently', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [
          { name: 'ok', service: 'svc', method: 'fn' },
          { name: 'bad', service: 'svc', method: 'fn', cache: { ttl: 'invalid' } },
        ],
      });
      expect(result.valid).toBe(false);
      // The first lookup should not cause errors
      expect(result.errors.every(e => !e.path.startsWith('lookups[0]'))).toBe(true);
      // The second lookup has the cache error
      expect(result.errors.some(e => e.path === 'lookups[1].cache.ttl')).toBe(true);
    });

    it('should validate lookups alongside conditions and actions', () => {
      const result = v.validate({
        ...minimalRule,
        lookups: [{ name: 'credit', service: 'creditService', method: 'getScore' }],
        conditions: [{
          source: { type: 'lookup', name: 'credit' },
          operator: 'gte',
          value: 700,
        }],
        actions: [{
          type: 'emit_event',
          topic: 'order.approved',
          data: { score: { ref: 'lookup.credit' } },
        }],
      });
      expect(result.valid).toBe(true);
    });
  });
});
