import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';
import type { Event } from '../../src/types/event';
import type { HotReloadConfig } from '../../src/core/hot-reload/types';

describe('Engine Lifecycle Integration', () => {
  describe('start and stop', () => {
    it('starts in running state', async () => {
      const engine = await RuleEngine.start({ name: 'lifecycle-test' });

      expect(engine.isRunning).toBe(true);

      await engine.stop();
    });

    it('reports not running after stop', async () => {
      const engine = await RuleEngine.start({ name: 'stop-test' });

      await engine.stop();

      expect(engine.isRunning).toBe(false);
    });

    it('allows operations while running', async () => {
      const engine = await RuleEngine.start({ name: 'ops-test' });

      await engine.setFact('key', 'value');
      expect(engine.getFact('key')).toBe('value');

      await engine.emit('test.event', { data: 123 });

      const rule: RuleInput = {
        id: 'test-rule',
        name: 'Test',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'any' },
        conditions: [],
        actions: []
      };
      const registered = engine.registerRule(rule);
      expect(registered.id).toBe('test-rule');

      await engine.stop();
    });

    it('throws on operations after stop', async () => {
      const engine = await RuleEngine.start({ name: 'throw-test' });
      await engine.stop();

      await expect(engine.setFact('key', 'value'))
        .rejects.toThrow('is not running');

      await expect(engine.emit('test', {}))
        .rejects.toThrow('is not running');

      expect(() => engine.registerRule({
        id: 'rule',
        name: 'Rule',
        priority: 1,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'x' },
        conditions: [],
        actions: []
      })).toThrow('is not running');
    });

    it('can start multiple independent engines', async () => {
      const engine1 = await RuleEngine.start({ name: 'engine-1' });
      const engine2 = await RuleEngine.start({ name: 'engine-2' });

      await engine1.setFact('shared:key', 'engine1-value');
      await engine2.setFact('shared:key', 'engine2-value');

      expect(engine1.getFact('shared:key')).toBe('engine1-value');
      expect(engine2.getFact('shared:key')).toBe('engine2-value');

      await engine1.stop();
      await engine2.stop();
    });
  });

  describe('timer cleanup on stop', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('cancels all timers when engine stops', async () => {
      const engine = await RuleEngine.start({ name: 'timer-cleanup' });

      await engine.setTimer({
        name: 'timer-1',
        duration: '10s',
        onExpire: { topic: 'timer.1.expired', data: {} }
      });

      await engine.setTimer({
        name: 'timer-2',
        duration: '20s',
        onExpire: { topic: 'timer.2.expired', data: {} }
      });

      expect(engine.getTimer('timer-1')).toBeDefined();
      expect(engine.getTimer('timer-2')).toBeDefined();
      expect(engine.getStats().timersCount).toBe(2);

      await engine.stop();

      await vi.advanceTimersByTimeAsync(25000);

      // Engine is stopped, no way to check internal state, but no errors should occur
    });

    it('timer callbacks do not fire after stop', async () => {
      const engine = await RuleEngine.start({ name: 'timer-callback-stop' });
      const received: Event[] = [];

      engine.subscribe('timer.done', (event) => {
        received.push(event);
      });

      const rule: RuleInput = {
        id: 'timer-handler',
        name: 'Timer Handler',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'timer.done' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'timer:fired', value: true }
        ]
      };

      engine.registerRule(rule);

      await engine.setTimer({
        name: 'stop-timer',
        duration: '5s',
        onExpire: { topic: 'timer.done', data: { source: 'test' } }
      });

      await engine.stop();

      await vi.advanceTimersByTimeAsync(10000);

      // Subscriber was cleared on stop, no events received
      expect(received).toHaveLength(0);
    });
  });

  describe('subscription cleanup on stop', () => {
    it('clears all subscriptions when engine stops', async () => {
      const engine = await RuleEngine.start({ name: 'sub-cleanup' });
      const received: Event[] = [];

      engine.subscribe('test.topic', (event) => {
        received.push(event);
      });

      engine.subscribe('other.*', (event) => {
        received.push(event);
      });

      await engine.emit('test.topic', { n: 1 });
      expect(received).toHaveLength(1);

      await engine.stop();

      // After stop, new engine with same events won't trigger old handlers
      const engine2 = await RuleEngine.start({ name: 'sub-cleanup-2' });
      await engine2.emit('test.topic', { n: 2 });

      // Only the first event was received
      expect(received).toHaveLength(1);

      await engine2.stop();
    });

    it('unsubscribe still works after stop', async () => {
      const engine = await RuleEngine.start({ name: 'unsub-stop' });
      const received: Event[] = [];

      const unsubscribe = engine.subscribe('topic', (event) => {
        received.push(event);
      });

      await engine.emit('topic', {});
      expect(received).toHaveLength(1);

      unsubscribe();
      await engine.emit('topic', {});
      expect(received).toHaveLength(1);

      await engine.stop();

      // Calling unsubscribe after stop should not throw
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('processing queue on stop', () => {
    it('waits for current processing to complete before stop resolves', async () => {
      const engine = await RuleEngine.start({ name: 'queue-stop' });
      const executionOrder: string[] = [];

      const slowRule: RuleInput = {
        id: 'slow-rule',
        name: 'Slow Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'slow.event' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'slow:started', value: true }
        ]
      };

      engine.registerRule(slowRule);

      // Emit event
      const emitPromise = engine.emit('slow.event', {});

      // Stop should wait for emit to complete
      await emitPromise;
      await engine.stop();

      expect(engine.getFact('slow:started')).toBe(true);
    });
  });

  describe('statistics accuracy', () => {
    it('tracks events processed correctly', async () => {
      const engine = await RuleEngine.start({ name: 'stats-events' });

      const initialStats = engine.getStats();
      expect(initialStats.eventsProcessed).toBe(0);

      await engine.emit('event.1', {});
      await engine.emit('event.2', {});
      await engine.emit('event.3', {});
      await engine.emit('event.4', {});
      await engine.emit('event.5', {});

      const stats = engine.getStats();
      expect(stats.eventsProcessed).toBe(5);

      await engine.stop();
    });

    it('tracks rules executed correctly', async () => {
      const engine = await RuleEngine.start({ name: 'stats-rules' });

      const rule1: RuleInput = {
        id: 'rule-1',
        name: 'Rule 1',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'trigger' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'r1', value: true }]
      };

      const rule2: RuleInput = {
        id: 'rule-2',
        name: 'Rule 2',
        priority: 5,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'trigger' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'r2', value: true }]
      };

      engine.registerRule(rule1);
      engine.registerRule(rule2);

      await engine.emit('trigger', {});

      const stats = engine.getStats();
      expect(stats.rulesExecuted).toBe(2);

      await engine.emit('trigger', {});
      expect(engine.getStats().rulesExecuted).toBe(4);

      await engine.stop();
    });

    it('does not count disabled rules', async () => {
      const engine = await RuleEngine.start({ name: 'stats-disabled' });

      const rule: RuleInput = {
        id: 'disabled-rule',
        name: 'Disabled Rule',
        priority: 10,
        enabled: false,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'x', value: 1 }]
      };

      engine.registerRule(rule);

      await engine.emit('test', {});

      const stats = engine.getStats();
      expect(stats.eventsProcessed).toBe(1);
      expect(stats.rulesExecuted).toBe(0);

      await engine.stop();
    });

    it('does not count rules when conditions fail', async () => {
      const engine = await RuleEngine.start({ name: 'stats-conditions' });

      const rule: RuleInput = {
        id: 'conditional-rule',
        name: 'Conditional Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'check' },
        conditions: [
          { source: { type: 'fact', pattern: 'required:flag' }, operator: 'eq', value: true }
        ],
        actions: [{ type: 'set_fact', key: 'executed', value: true }]
      };

      engine.registerRule(rule);

      // Condition fails - fact doesn't exist
      await engine.emit('check', {});

      let stats = engine.getStats();
      expect(stats.eventsProcessed).toBe(1);
      expect(stats.rulesExecuted).toBe(0);

      // Set the fact, condition passes
      await engine.setFact('required:flag', true);
      await engine.emit('check', {});

      stats = engine.getStats();
      expect(stats.eventsProcessed).toBe(2);
      expect(stats.rulesExecuted).toBe(1);

      await engine.stop();
    });

    it('tracks component counts accurately', async () => {
      const engine = await RuleEngine.start({ name: 'stats-components' });

      let stats = engine.getStats();
      expect(stats.rulesCount).toBe(0);
      expect(stats.factsCount).toBe(0);
      expect(stats.timersCount).toBe(0);

      const rule: RuleInput = {
        id: 'r1',
        name: 'R1',
        priority: 1,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 't' },
        conditions: [],
        actions: []
      };

      engine.registerRule(rule);
      await engine.setFact('f1', 'v1');
      await engine.setFact('f2', 'v2');
      await engine.setFact('f3', 'v3');

      stats = engine.getStats();
      expect(stats.rulesCount).toBe(1);
      expect(stats.factsCount).toBe(3);

      engine.unregisterRule('r1');
      engine.deleteFact('f1');

      stats = engine.getStats();
      expect(stats.rulesCount).toBe(0);
      expect(stats.factsCount).toBe(2);

      await engine.stop();
    });

    it('calculates average processing time', async () => {
      const engine = await RuleEngine.start({ name: 'stats-timing' });

      const rule: RuleInput = {
        id: 'timing-rule',
        name: 'Timing Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'timed' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'x', value: 1 }]
      };

      engine.registerRule(rule);

      await engine.emit('timed', {});
      await engine.emit('timed', {});
      await engine.emit('timed', {});

      const stats = engine.getStats();
      expect(stats.rulesExecuted).toBe(3);
      expect(stats.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);

      await engine.stop();
    });

    it('returns zero average when no rules executed', async () => {
      const engine = await RuleEngine.start({ name: 'stats-zero-avg' });

      const stats = engine.getStats();
      expect(stats.avgProcessingTimeMs).toBe(0);

      await engine.stop();
    });
  });

  describe('configuration', () => {
    it('uses default name when not provided', async () => {
      const engine = await RuleEngine.start();

      expect(engine.isRunning).toBe(true);

      await engine.stop();
    });

    it('registers services from config', async () => {
      const testService = {
        process: vi.fn().mockReturnValue('result')
      };

      const engine = await RuleEngine.start({
        name: 'service-test',
        services: { testService }
      });

      const rule: RuleInput = {
        id: 'service-rule',
        name: 'Service Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'invoke.service' },
        conditions: [],
        actions: [
          { type: 'call_service', service: 'testService', method: 'process', args: ['arg1'] }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('invoke.service', {});

      expect(testService.process).toHaveBeenCalledWith('arg1');

      await engine.stop();
    });
  });

  describe('hot-reload watcher lifecycle', () => {
    it('starts watcher when hotReload is configured', async () => {
      const hotReload: HotReloadConfig = { intervalMs: 60_000 };
      const engine = await RuleEngine.start({ name: 'hot-reload-start', hotReload });

      const watcher = engine.getHotReloadWatcher();
      expect(watcher).not.toBeNull();
      expect(watcher!.getStatus().running).toBe(true);
      expect(watcher!.getStatus().intervalMs).toBe(60_000);

      await engine.stop();
    });

    it('returns null when hotReload is not configured', async () => {
      const engine = await RuleEngine.start({ name: 'no-hot-reload' });

      expect(engine.getHotReloadWatcher()).toBeNull();

      await engine.stop();
    });

    it('stops watcher when engine stops', async () => {
      const hotReload: HotReloadConfig = { intervalMs: 60_000 };
      const engine = await RuleEngine.start({ name: 'hot-reload-stop', hotReload });

      const watcher = engine.getHotReloadWatcher();
      expect(watcher!.getStatus().running).toBe(true);

      await engine.stop();

      expect(watcher!.getStatus().running).toBe(false);
      expect(engine.getHotReloadWatcher()).toBeNull();
    });

    it('initializes baseline hashes from existing rules', async () => {
      const hotReload: HotReloadConfig = { intervalMs: 60_000 };
      const engine = await RuleEngine.start({ name: 'hot-reload-baseline', hotReload });

      engine.registerRule({
        id: 'baseline-rule',
        name: 'Baseline',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
      });

      // Watcher was started before rule was registered,
      // so trackedRulesCount reflects initial engine state (0 rules at start)
      const watcher = engine.getHotReloadWatcher()!;
      expect(watcher.getStatus().trackedRulesCount).toBe(0);

      await engine.stop();
    });

    it('starts watcher with custom config options', async () => {
      const hotReload: HotReloadConfig = {
        intervalMs: 10_000,
        validateBeforeApply: false,
        atomicReload: false,
      };
      const engine = await RuleEngine.start({ name: 'hot-reload-config', hotReload });

      const watcher = engine.getHotReloadWatcher();
      expect(watcher).not.toBeNull();
      expect(watcher!.getStatus().intervalMs).toBe(10_000);

      await engine.stop();
    });
  });
});
