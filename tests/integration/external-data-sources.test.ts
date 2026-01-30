import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';

function createCreditService() {
  return {
    getScore: vi.fn().mockResolvedValue(750),
  };
}

function createFraudService() {
  return {
    checkRisk: vi.fn().mockResolvedValue({ riskLevel: 'low', score: 0.2 }),
  };
}

describe('External Data Sources Integration', () => {
  let engine: RuleEngine;

  afterEach(async () => {
    await engine.stop();
  });

  describe('basic lookup resolution', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'lookup-test',
        services: {
          creditService: createCreditService(),
          fraudService: createFraudService(),
        },
      });
    });

    it('resolves lookups before condition evaluation', async () => {
      const rule: RuleInput = {
        id: 'credit-check',
        name: 'Credit Check',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [{ ref: 'event.customerId' }],
          },
        ],
        conditions: [
          { source: { type: 'lookup', name: 'credit' }, operator: 'gte', value: 700 },
        ],
        actions: [
          { type: 'set_fact', key: 'order:approved', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { customerId: 'cust-1' });

      expect(engine.getFact('order:approved')).toBe(true);
    });

    it('resolves lookups with nested field access in conditions', async () => {
      const rule: RuleInput = {
        id: 'fraud-check',
        name: 'Fraud Check',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'fraud',
            service: 'fraudService',
            method: 'checkRisk',
            args: [{ ref: 'event.email' }],
          },
        ],
        conditions: [
          { source: { type: 'lookup', name: 'fraud', field: 'riskLevel' }, operator: 'neq', value: 'high' },
        ],
        actions: [
          { type: 'set_fact', key: 'fraud:passed', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { email: 'user@test.com' });

      expect(engine.getFact('fraud:passed')).toBe(true);
    });

    it('makes lookup values available in actions via ref', async () => {
      const rule: RuleInput = {
        id: 'store-score',
        name: 'Store Credit Score',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'customer.check' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: ['cust-42'],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'customer:credit', value: { ref: 'lookup.credit' } },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('customer.check', {});

      expect(engine.getFact('customer:credit')).toBe(750);
    });

    it('makes nested lookup values available in actions via ref', async () => {
      const rule: RuleInput = {
        id: 'store-risk',
        name: 'Store Fraud Risk',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'customer.check' },
        lookups: [
          {
            name: 'fraud',
            service: 'fraudService',
            method: 'checkRisk',
            args: ['user@test.com'],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'customer:risk', value: { ref: 'lookup.fraud.riskLevel' } },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('customer.check', {});

      expect(engine.getFact('customer:risk')).toBe('low');
    });

    it('resolves multiple lookups for a single rule', async () => {
      const rule: RuleInput = {
        id: 'multi-lookup',
        name: 'Multi Lookup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: ['cust-1'],
          },
          {
            name: 'fraud',
            service: 'fraudService',
            method: 'checkRisk',
            args: ['user@test.com'],
          },
        ],
        conditions: [
          { source: { type: 'lookup', name: 'credit' }, operator: 'gte', value: 700 },
          { source: { type: 'lookup', name: 'fraud', field: 'riskLevel' }, operator: 'neq', value: 'high' },
        ],
        actions: [
          { type: 'set_fact', key: 'all:checks:passed', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      expect(engine.getFact('all:checks:passed')).toBe(true);
    });

    it('skips rule when lookup condition is not met', async () => {
      const lowScoreService = {
        getScore: vi.fn().mockResolvedValue(400),
      };

      engine = await RuleEngine.start({
        name: 'low-score-test',
        services: { creditService: lowScoreService },
      });

      const rule: RuleInput = {
        id: 'credit-gate',
        name: 'Credit Gate',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
          },
        ],
        conditions: [
          { source: { type: 'lookup', name: 'credit' }, operator: 'gte', value: 700 },
        ],
        actions: [
          { type: 'set_fact', key: 'should:not:exist', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      expect(engine.getFact('should:not:exist')).toBeUndefined();
    });

    it('rule without lookups works as before', async () => {
      const rule: RuleInput = {
        id: 'no-lookups',
        name: 'No Lookups Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'basic:works', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('test.event', {});

      expect(engine.getFact('basic:works')).toBe(true);
    });

    it('passes event data as ref args to lookup service', async () => {
      const creditService = createCreditService();
      engine = await RuleEngine.start({
        name: 'ref-args-test',
        services: { creditService },
      });

      const rule: RuleInput = {
        id: 'ref-args',
        name: 'Ref Args',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [{ ref: 'event.customerId' }, { ref: 'event.region' }],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'lookup:done', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { customerId: 'cust-99', region: 'EU' });

      expect(creditService.getScore).toHaveBeenCalledWith('cust-99', 'EU');
      expect(engine.getFact('lookup:done')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('skips rule when lookup fails with default onError (skip)', async () => {
      const failingService = {
        getScore: vi.fn().mockRejectedValue(new Error('Service unavailable')),
      };

      engine = await RuleEngine.start({
        name: 'error-skip-test',
        services: { creditService: failingService },
      });

      const rule: RuleInput = {
        id: 'failing-lookup',
        name: 'Failing Lookup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'should:not:run', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      expect(engine.getFact('should:not:run')).toBeUndefined();
    });

    it('skips rule when lookup fails with explicit onError: skip', async () => {
      const failingService = {
        check: vi.fn().mockRejectedValue(new Error('timeout')),
      };

      engine = await RuleEngine.start({
        name: 'error-explicit-skip-test',
        services: { fraudService: failingService },
      });

      const rule: RuleInput = {
        id: 'skip-on-error',
        name: 'Skip On Error',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'fraud',
            service: 'fraudService',
            method: 'check',
            args: [],
            onError: 'skip',
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'should:not:run', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      expect(engine.getFact('should:not:run')).toBeUndefined();
    });

    it('handles lookup failure with onError: fail gracefully (rule fails, engine continues)', async () => {
      const failingService = {
        getScore: vi.fn().mockRejectedValue(new Error('Critical failure')),
      };

      engine = await RuleEngine.start({
        name: 'error-fail-test',
        services: { creditService: failingService },
      });

      const rule: RuleInput = {
        id: 'fail-on-error',
        name: 'Fail On Error',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
            onError: 'fail',
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'should:not:run', value: true },
        ],
      };

      engine.registerRule(rule);

      // Engine should not crash — the error is caught in evaluateAndExecuteRule
      await engine.emit('order.created', {});

      expect(engine.getFact('should:not:run')).toBeUndefined();
      expect(engine.isRunning).toBe(true);
    });

    it('partial lookup failure skips rule but resolves successful lookups', async () => {
      const creditService = createCreditService();
      const failingFraudService = {
        checkRisk: vi.fn().mockRejectedValue(new Error('timeout')),
      };

      engine = await RuleEngine.start({
        name: 'partial-failure-test',
        services: {
          creditService,
          fraudService: failingFraudService,
        },
      });

      const rule: RuleInput = {
        id: 'partial-fail',
        name: 'Partial Fail',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
          },
          {
            name: 'fraud',
            service: 'fraudService',
            method: 'checkRisk',
            args: [],
            onError: 'skip',
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'should:not:run', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      // Rule should be skipped because one lookup failed with onError: skip
      expect(engine.getFact('should:not:run')).toBeUndefined();
      // But the credit service was still called
      expect(creditService.getScore).toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('caches lookup results across rule evaluations', async () => {
      const creditService = createCreditService();

      engine = await RuleEngine.start({
        name: 'cache-test',
        services: { creditService },
      });

      const rule: RuleInput = {
        id: 'cached-lookup',
        name: 'Cached Lookup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: ['cust-1'],
            cache: { ttl: '5m' },
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'lookup:done', value: true },
        ],
      };

      engine.registerRule(rule);

      await engine.emit('order.created', {});
      await engine.emit('order.created', {});
      await engine.emit('order.created', {});

      // Service should be called only once due to caching
      expect(creditService.getScore).toHaveBeenCalledTimes(1);
    });

    it('does not cache when no cache config', async () => {
      const creditService = createCreditService();

      engine = await RuleEngine.start({
        name: 'no-cache-test',
        services: { creditService },
      });

      const rule: RuleInput = {
        id: 'uncached-lookup',
        name: 'Uncached Lookup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: ['cust-1'],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'lookup:done', value: true },
        ],
      };

      engine.registerRule(rule);

      await engine.emit('order.created', {});
      await engine.emit('order.created', {});

      expect(creditService.getScore).toHaveBeenCalledTimes(2);
    });

    it('cache is cleared on engine stop', async () => {
      const creditService = createCreditService();

      engine = await RuleEngine.start({
        name: 'cache-clear-test',
        services: { creditService },
      });

      const rule: RuleInput = {
        id: 'cached-rule',
        name: 'Cached Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test.event' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
            cache: { ttl: '10m' },
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'done', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('test.event', {});

      const stats = engine.getLookupCache().stats();
      expect(stats.size).toBeGreaterThan(0);

      await engine.stop();

      // Re-start engine to verify cache was cleared
      engine = await RuleEngine.start({
        name: 'cache-clear-test-2',
        services: { creditService },
      });

      expect(engine.getLookupCache().stats().size).toBe(0);
    });

    it('exposes lookup cache stats', async () => {
      engine = await RuleEngine.start({
        name: 'cache-stats-test',
        services: { creditService: createCreditService() },
      });

      const stats = engine.getLookupCache().stats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('tracing', () => {
    it('records lookup_resolved trace entry', async () => {
      engine = await RuleEngine.start({
        name: 'trace-test',
        tracing: { enabled: true },
        services: { creditService: createCreditService() },
      });

      const rule: RuleInput = {
        id: 'traced-lookup',
        name: 'Traced Lookup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'traced', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      const allTraces = engine.getTraceCollector().getByRule('traced-lookup');
      const lookupTraces = allTraces.filter(t => t.type === 'lookup_resolved');
      expect(lookupTraces.length).toBe(1);
      expect(lookupTraces[0]!.ruleId).toBe('traced-lookup');
      expect(lookupTraces[0]!.details.lookups).toEqual(['credit']);
      expect(lookupTraces[0]!.details.resolved).toEqual(['credit']);
      expect(lookupTraces[0]!.details.errors).toEqual([]);
      expect(lookupTraces[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('records rule_skipped trace on lookup failure', async () => {
      const failingService = {
        getScore: vi.fn().mockRejectedValue(new Error('Service down')),
      };

      engine = await RuleEngine.start({
        name: 'trace-skip-test',
        tracing: { enabled: true },
        services: { creditService: failingService },
      });

      const rule: RuleInput = {
        id: 'traced-skip',
        name: 'Traced Skip',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'should:not:run', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      const allTraces = engine.getTraceCollector().getByRule('traced-skip');
      const skipTraces = allTraces.filter(t => t.type === 'rule_skipped');
      expect(skipTraces.length).toBe(1);
      expect(skipTraces[0]!.details.reason).toBe('lookup_failed');

      const lookupTraces = allTraces.filter(t => t.type === 'lookup_resolved');
      expect(lookupTraces.length).toBe(1);
      expect((lookupTraces[0]!.details.errors as Array<{ lookup: string }>)[0]!.lookup).toBe('credit');
    });
  });

  describe('conditional actions with lookups', () => {
    it('passes lookup values through to conditional action conditions', async () => {
      engine = await RuleEngine.start({
        name: 'conditional-lookup-test',
        services: { creditService: createCreditService() },
      });

      const rule: RuleInput = {
        id: 'conditional-with-lookup',
        name: 'Conditional With Lookup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
          },
        ],
        conditions: [],
        actions: [
          {
            type: 'conditional',
            conditions: [
              { source: { type: 'lookup', name: 'credit' }, operator: 'gte', value: 700 },
            ],
            then: [
              { type: 'set_fact', key: 'conditional:branch', value: 'then' },
            ],
            else: [
              { type: 'set_fact', key: 'conditional:branch', value: 'else' },
            ],
          },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', {});

      // Credit score is 750 (>=700), so 'then' branch should execute
      expect(engine.getFact('conditional:branch')).toBe('then');
    });
  });

  describe('lookup values in string interpolation', () => {
    it('interpolates lookup values in fact keys', async () => {
      engine = await RuleEngine.start({
        name: 'interpolation-test',
        services: { creditService: createCreditService() },
      });

      const rule: RuleInput = {
        id: 'interpolate-lookup',
        name: 'Interpolate Lookup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'customer.check' },
        lookups: [
          {
            name: 'credit',
            service: 'creditService',
            method: 'getScore',
            args: [],
          },
        ],
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'score:${lookup.credit}', value: true },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('customer.check', {});

      expect(engine.getFact('score:750')).toBe(true);
    });
  });
});
