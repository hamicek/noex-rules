import { describe, it, expect, expectTypeOf } from 'vitest';
import type { DataRequirement, LookupCacheConfig, LookupErrorStrategy } from '../../../src/types/index.js';
import type { Rule, RuleInput } from '../../../src/types/rule.js';

describe('LookupErrorStrategy', () => {
  describe('type compatibility', () => {
    it('should accept "skip"', () => {
      const strategy: LookupErrorStrategy = 'skip';
      expect(strategy).toBe('skip');
    });

    it('should accept "fail"', () => {
      const strategy: LookupErrorStrategy = 'fail';
      expect(strategy).toBe('fail');
    });
  });

  describe('type-level assertions', () => {
    it('should be a union of skip and fail', () => {
      expectTypeOf<LookupErrorStrategy>().toEqualTypeOf<'skip' | 'fail'>();
    });
  });
});

describe('LookupCacheConfig', () => {
  describe('type compatibility', () => {
    it('should accept string ttl', () => {
      const config: LookupCacheConfig = { ttl: '5m' };
      expect(config.ttl).toBe('5m');
    });

    it('should accept numeric ttl', () => {
      const config: LookupCacheConfig = { ttl: 300_000 };
      expect(config.ttl).toBe(300_000);
    });
  });

  describe('type constraints', () => {
    it('should require ttl', () => {
      // @ts-expect-error - ttl is required
      const _invalid: LookupCacheConfig = {};
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct field types', () => {
      expectTypeOf<LookupCacheConfig['ttl']>().toEqualTypeOf<string | number>();
    });
  });
});

describe('DataRequirement', () => {
  describe('type compatibility', () => {
    it('should accept minimal valid requirement', () => {
      const req: DataRequirement = {
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [],
      };

      expect(req.name).toBe('credit');
      expect(req.service).toBe('creditService');
      expect(req.method).toBe('getScore');
      expect(req.args).toEqual([]);
      expect(req.cache).toBeUndefined();
      expect(req.onError).toBeUndefined();
    });

    it('should accept requirement with all optional fields', () => {
      const req: DataRequirement = {
        name: 'fraud',
        service: 'fraudService',
        method: 'checkRisk',
        args: ['user@example.com', 1500],
        cache: { ttl: '10m' },
        onError: 'fail',
      };

      expect(req.name).toBe('fraud');
      expect(req.args).toEqual(['user@example.com', 1500]);
      expect(req.cache).toEqual({ ttl: '10m' });
      expect(req.onError).toBe('fail');
    });

    it('should accept args with ref objects', () => {
      const req: DataRequirement = {
        name: 'pricing',
        service: 'pricingService',
        method: 'getDiscount',
        args: [{ ref: 'event.customerId' }, { ref: 'event.amount' }],
      };

      expect(req.args).toHaveLength(2);
      expect(req.args[0]).toEqual({ ref: 'event.customerId' });
    });

    it('should accept mixed literal and ref args', () => {
      const req: DataRequirement = {
        name: 'inventory',
        service: 'inventoryService',
        method: 'checkStock',
        args: [{ ref: 'event.productId' }, 'warehouse-1', 10],
      };

      expect(req.args).toHaveLength(3);
    });

    it('should accept cache with numeric ttl', () => {
      const req: DataRequirement = {
        name: 'geo',
        service: 'geoService',
        method: 'resolve',
        args: [{ ref: 'event.ip' }],
        cache: { ttl: 60_000 },
      };

      expect(req.cache?.ttl).toBe(60_000);
    });
  });

  describe('type constraints', () => {
    it('should require name', () => {
      // @ts-expect-error - name is required
      const _invalid: DataRequirement = {
        service: 'svc',
        method: 'fn',
        args: [],
      };
      expect(true).toBe(true);
    });

    it('should require service', () => {
      // @ts-expect-error - service is required
      const _invalid: DataRequirement = {
        name: 'test',
        method: 'fn',
        args: [],
      };
      expect(true).toBe(true);
    });

    it('should require method', () => {
      // @ts-expect-error - method is required
      const _invalid: DataRequirement = {
        name: 'test',
        service: 'svc',
        args: [],
      };
      expect(true).toBe(true);
    });

    it('should require args', () => {
      // @ts-expect-error - args is required
      const _invalid: DataRequirement = {
        name: 'test',
        service: 'svc',
        method: 'fn',
      };
      expect(true).toBe(true);
    });
  });

  describe('type-level assertions', () => {
    it('should have correct required field types', () => {
      expectTypeOf<DataRequirement['name']>().toEqualTypeOf<string>();
      expectTypeOf<DataRequirement['service']>().toEqualTypeOf<string>();
      expectTypeOf<DataRequirement['method']>().toEqualTypeOf<string>();
      expectTypeOf<DataRequirement['args']>().toEqualTypeOf<unknown[]>();
    });

    it('should have correct optional field types', () => {
      expectTypeOf<DataRequirement['cache']>().toEqualTypeOf<LookupCacheConfig | undefined>();
      expectTypeOf<DataRequirement['onError']>().toEqualTypeOf<LookupErrorStrategy | undefined>();
    });
  });
});

describe('Rule.lookups', () => {
  const baseRule: Rule = {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'Rule for testing lookups',
    priority: 1,
    enabled: true,
    version: 1,
    tags: [],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [],
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  describe('type compatibility', () => {
    it('should allow Rule without lookups', () => {
      expect(baseRule.lookups).toBeUndefined();
    });

    it('should allow Rule with empty lookups array', () => {
      const rule: Rule = { ...baseRule, lookups: [] };
      expect(rule.lookups).toEqual([]);
    });

    it('should allow Rule with DataRequirement[] lookups', () => {
      const rule: Rule = {
        ...baseRule,
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [{ ref: 'event.customerId' }],
            cache: { ttl: '5m' },
          },
          {
            name: 'fraud',
            service: 'fraudService',
            method: 'checkRisk',
            args: [{ ref: 'event.email' }, { ref: 'event.amount' }],
            onError: 'skip',
          },
        ],
      };

      expect(rule.lookups).toHaveLength(2);
      expect(rule.lookups![0]!.name).toBe('credit');
      expect(rule.lookups![1]!.onError).toBe('skip');
    });
  });

  describe('type-level assertions', () => {
    it('should have lookups as optional DataRequirement[]', () => {
      expectTypeOf<Rule['lookups']>().toEqualTypeOf<DataRequirement[] | undefined>();
    });
  });
});

describe('RuleInput.lookups', () => {
  const baseInput: RuleInput = {
    id: 'test-input',
    name: 'Test Input',
    priority: 1,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [],
    actions: [],
  };

  describe('type compatibility', () => {
    it('should allow RuleInput without lookups', () => {
      expect(baseInput.lookups).toBeUndefined();
    });

    it('should allow RuleInput with lookups', () => {
      const input: RuleInput = {
        ...baseInput,
        lookups: [
          {
            name: 'pricing',
            service: 'pricingService',
            method: 'getDiscount',
            args: [{ ref: 'event.productId' }],
          },
        ],
      };

      expect(input.lookups).toHaveLength(1);
      expect(input.lookups![0]!.name).toBe('pricing');
    });
  });

  describe('type-level assertions', () => {
    it('should inherit lookups type from Rule', () => {
      expectTypeOf<RuleInput['lookups']>().toEqualTypeOf<DataRequirement[] | undefined>();
    });
  });
});
