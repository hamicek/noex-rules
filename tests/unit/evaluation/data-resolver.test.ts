import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataResolver, DataResolutionError } from '../../../src/evaluation/data-resolver';
import { LookupCache } from '../../../src/evaluation/lookup-cache';
import type { DataRequirement } from '../../../src/types/lookup';
import type { InterpolationContext } from '../../../src/utils/interpolation';

function createCtx(overrides?: Partial<InterpolationContext>): InterpolationContext {
  return {
    trigger: { type: 'event', data: {} },
    facts: { get: () => undefined },
    variables: new Map(),
    ...overrides,
  };
}

function createService(methods: Record<string, (...args: unknown[]) => unknown>) {
  return methods;
}

describe('DataResolver', () => {
  let cache: LookupCache;
  let services: Map<string, unknown>;
  let resolver: DataResolver;

  beforeEach(() => {
    cache = new LookupCache();
    services = new Map();
    resolver = new DataResolver(services, cache);
  });

  describe('resolveAll', () => {
    it('returns empty result for empty requirements', async () => {
      const result = await resolver.resolveAll([], createCtx());

      expect(result.lookups.size).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toBe(false);
    });

    it('resolves a single lookup', async () => {
      const creditService = createService({
        getScore: vi.fn().mockResolvedValue(750),
      });
      services.set('creditService', creditService);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: ['user-123'],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.lookups.get('credit')).toBe(750);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toBe(false);
      expect(creditService.getScore).toHaveBeenCalledWith('user-123');
    });

    it('resolves multiple lookups in parallel', async () => {
      const callOrder: string[] = [];

      const creditService = createService({
        getScore: vi.fn().mockImplementation(async () => {
          callOrder.push('credit-start');
          await new Promise(r => setTimeout(r, 10));
          callOrder.push('credit-end');
          return 750;
        }),
      });

      const fraudService = createService({
        checkRisk: vi.fn().mockImplementation(async () => {
          callOrder.push('fraud-start');
          await new Promise(r => setTimeout(r, 10));
          callOrder.push('fraud-end');
          return { riskLevel: 'low' };
        }),
      });

      services.set('creditService', creditService);
      services.set('fraudService', fraudService);

      const requirements: DataRequirement[] = [
        { name: 'credit', service: 'creditService', method: 'getScore', args: ['user-1'] },
        { name: 'fraud', service: 'fraudService', method: 'checkRisk', args: ['user@test.com'] },
      ];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.lookups.get('credit')).toBe(750);
      expect(result.lookups.get('fraud')).toEqual({ riskLevel: 'low' });
      expect(result.skipped).toBe(false);

      // Both should start before either ends (parallel execution)
      expect(callOrder.indexOf('credit-start')).toBeLessThan(callOrder.indexOf('fraud-end'));
      expect(callOrder.indexOf('fraud-start')).toBeLessThan(callOrder.indexOf('credit-end'));
    });

    it('resolves ref arguments from interpolation context', async () => {
      const creditService = createService({
        getScore: vi.fn().mockResolvedValue(800),
      });
      services.set('creditService', creditService);

      const ctx = createCtx({
        trigger: { type: 'event', data: { customerId: 'cust-42', amount: 500 } },
      });

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [{ ref: 'event.customerId' }, { ref: 'event.amount' }],
      }];

      const result = await resolver.resolveAll(requirements, ctx);

      expect(result.lookups.get('credit')).toBe(800);
      expect(creditService.getScore).toHaveBeenCalledWith('cust-42', 500);
    });

    it('handles null return values from services', async () => {
      const svc = createService({
        lookup: vi.fn().mockResolvedValue(null),
      });
      services.set('svc', svc);

      const requirements: DataRequirement[] = [{
        name: 'data',
        service: 'svc',
        method: 'lookup',
        args: [],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.lookups.get('data')).toBeNull();
      expect(result.lookups.has('data')).toBe(true);
    });

    it('handles falsy return values (0, false, empty string)', async () => {
      const svc = createService({
        getZero: vi.fn().mockResolvedValue(0),
        getFalse: vi.fn().mockResolvedValue(false),
        getEmpty: vi.fn().mockResolvedValue(''),
      });
      services.set('svc', svc);

      const requirements: DataRequirement[] = [
        { name: 'zero', service: 'svc', method: 'getZero', args: [] },
        { name: 'bool', service: 'svc', method: 'getFalse', args: [] },
        { name: 'str', service: 'svc', method: 'getEmpty', args: [] },
      ];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.lookups.get('zero')).toBe(0);
      expect(result.lookups.get('bool')).toBe(false);
      expect(result.lookups.get('str')).toBe('');
    });
  });

  describe('caching', () => {
    it('caches result when cache config is provided', async () => {
      const svc = createService({
        getScore: vi.fn().mockResolvedValue(750),
      });
      services.set('creditService', svc);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: ['user-1'],
        cache: { ttl: '5m' },
      }];

      await resolver.resolveAll(requirements, createCtx());
      await resolver.resolveAll(requirements, createCtx());

      expect(svc.getScore).toHaveBeenCalledTimes(1);
    });

    it('does not cache when no cache config is present', async () => {
      const svc = createService({
        getScore: vi.fn().mockResolvedValue(750),
      });
      services.set('creditService', svc);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: ['user-1'],
      }];

      await resolver.resolveAll(requirements, createCtx());
      await resolver.resolveAll(requirements, createCtx());

      expect(svc.getScore).toHaveBeenCalledTimes(2);
    });

    it('uses resolved args for cache key', async () => {
      const svc = createService({
        getScore: vi.fn().mockResolvedValue(750),
      });
      services.set('creditService', svc);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [{ ref: 'event.customerId' }],
        cache: { ttl: '5m' },
      }];

      // First call with customerId = 'cust-1'
      await resolver.resolveAll(requirements, createCtx({
        trigger: { type: 'event', data: { customerId: 'cust-1' } },
      }));

      // Second call with same customerId — cache hit
      await resolver.resolveAll(requirements, createCtx({
        trigger: { type: 'event', data: { customerId: 'cust-1' } },
      }));

      // Third call with different customerId — cache miss
      await resolver.resolveAll(requirements, createCtx({
        trigger: { type: 'event', data: { customerId: 'cust-2' } },
      }));

      expect(svc.getScore).toHaveBeenCalledTimes(2);
      expect(svc.getScore).toHaveBeenCalledWith('cust-1');
      expect(svc.getScore).toHaveBeenCalledWith('cust-2');
    });
  });

  describe('error handling', () => {
    it('skips rule by default when lookup fails (onError: skip)', async () => {
      const svc = createService({
        getScore: vi.fn().mockRejectedValue(new Error('Service unavailable')),
      });
      services.set('creditService', svc);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.skipped).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.lookupName).toBe('credit');
      expect(result.errors[0]!.service).toBe('creditService');
      expect(result.errors[0]!.method).toBe('getScore');
      expect(result.errors[0]!.message).toContain('Service unavailable');
      expect(result.lookups.has('credit')).toBe(false);
    });

    it('skips rule when lookup with explicit onError: skip fails', async () => {
      const svc = createService({
        check: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      services.set('fraudService', svc);

      const requirements: DataRequirement[] = [{
        name: 'fraud',
        service: 'fraudService',
        method: 'check',
        args: [],
        onError: 'skip',
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.skipped).toBe(true);
      expect(result.errors).toHaveLength(1);
    });

    it('throws when lookup with onError: fail fails', async () => {
      const svc = createService({
        getScore: vi.fn().mockRejectedValue(new Error('Critical failure')),
      });
      services.set('creditService', svc);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [],
        onError: 'fail',
      }];

      await expect(resolver.resolveAll(requirements, createCtx()))
        .rejects.toThrow(DataResolutionError);

      await expect(resolver.resolveAll(requirements, createCtx()))
        .rejects.toThrow('Lookup "credit" failed: Critical failure');
    });

    it('throws error with correct properties for onError: fail', async () => {
      const svc = createService({
        getScore: vi.fn().mockRejectedValue(new Error('down')),
      });
      services.set('creditService', svc);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [],
        onError: 'fail',
      }];

      try {
        await resolver.resolveAll(requirements, createCtx());
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DataResolutionError);
        const e = err as DataResolutionError;
        expect(e.lookupName).toBe('credit');
        expect(e.service).toBe('creditService');
        expect(e.method).toBe('getScore');
        expect(e.cause).toBeInstanceOf(Error);
        expect(e.cause.message).toBe('down');
      }
    });

    it('handles non-Error rejection reasons', async () => {
      const svc = createService({
        getScore: vi.fn().mockRejectedValue('string error'),
      });
      services.set('creditService', svc);

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.skipped).toBe(true);
      expect(result.errors[0]!.cause.message).toBe('string error');
    });

    it('throws when service is not registered', async () => {
      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'unknownService',
        method: 'getScore',
        args: [],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.skipped).toBe(true);
      expect(result.errors[0]!.message).toContain('Service "unknownService" is not registered');
    });

    it('throws when method does not exist on service', async () => {
      services.set('creditService', { otherMethod: () => 42 });

      const requirements: DataRequirement[] = [{
        name: 'credit',
        service: 'creditService',
        method: 'getScore',
        args: [],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.skipped).toBe(true);
      expect(result.errors[0]!.message).toContain('Method "getScore" not found on service "creditService"');
    });

    it('collects errors from multiple failed lookups with onError: skip', async () => {
      const svc1 = createService({ get: vi.fn().mockRejectedValue(new Error('err1')) });
      const svc2 = createService({ get: vi.fn().mockRejectedValue(new Error('err2')) });
      services.set('svc1', svc1);
      services.set('svc2', svc2);

      const requirements: DataRequirement[] = [
        { name: 'a', service: 'svc1', method: 'get', args: [], onError: 'skip' },
        { name: 'b', service: 'svc2', method: 'get', args: [], onError: 'skip' },
      ];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.skipped).toBe(true);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map(e => e.lookupName)).toEqual(['a', 'b']);
    });

    it('returns successful lookups alongside skipped ones', async () => {
      const creditService = createService({
        getScore: vi.fn().mockResolvedValue(750),
      });
      const fraudService = createService({
        check: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      services.set('creditService', creditService);
      services.set('fraudService', fraudService);

      const requirements: DataRequirement[] = [
        { name: 'credit', service: 'creditService', method: 'getScore', args: [] },
        { name: 'fraud', service: 'fraudService', method: 'check', args: [], onError: 'skip' },
      ];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.skipped).toBe(true);
      expect(result.lookups.get('credit')).toBe(750);
      expect(result.lookups.has('fraud')).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('service method binding', () => {
    it('calls method with correct this context', async () => {
      const service = {
        multiplier: 10,
        calculate(value: number) {
          return Promise.resolve(value * this.multiplier);
        },
      };
      services.set('calcService', service);

      const requirements: DataRequirement[] = [{
        name: 'result',
        service: 'calcService',
        method: 'calculate',
        args: [5],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.lookups.get('result')).toBe(50);
    });

    it('handles synchronous service methods', async () => {
      const svc = createService({
        syncMethod: vi.fn().mockReturnValue(42),
      });
      services.set('svc', svc);

      const requirements: DataRequirement[] = [{
        name: 'data',
        service: 'svc',
        method: 'syncMethod',
        args: [],
      }];

      const result = await resolver.resolveAll(requirements, createCtx());

      expect(result.lookups.get('data')).toBe(42);
    });
  });
});
