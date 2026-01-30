import { describe, it, expect, expectTypeOf } from 'vitest';
import type { DataRequirement, LookupCacheConfig, LookupErrorStrategy } from '../../../src/types/index.js';

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
