import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraceCollector } from '../../../src/debugging/trace-collector.js';
import { Profiler } from '../../../src/debugging/profiler.js';

describe('Profiler', () => {
  let traceCollector: TraceCollector;
  let profiler: Profiler;

  beforeEach(() => {
    traceCollector = new TraceCollector({ enabled: true });
    profiler = new Profiler(traceCollector);
  });

  describe('basic functionality', () => {
    it('should start with empty profiles', () => {
      expect(profiler.getRuleProfiles()).toHaveLength(0);
    });

    it('should return undefined for unknown rule', () => {
      expect(profiler.getRuleProfile('unknown-rule')).toBeUndefined();
    });

    it('should create profile on first rule_triggered event', () => {
      traceCollector.record('rule_triggered', { triggerType: 'event' }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule'
      });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile).toBeDefined();
      expect(profile!.ruleId).toBe('rule-1');
      expect(profile!.ruleName).toBe('Test Rule');
      expect(profile!.triggerCount).toBe(1);
    });
  });

  describe('trigger counting', () => {
    it('should count multiple triggers', () => {
      for (let i = 0; i < 5; i++) {
        traceCollector.record('rule_triggered', { triggerType: 'event' }, {
          ruleId: 'rule-1',
          ruleName: 'Test Rule'
        });
      }

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.triggerCount).toBe(5);
    });

    it('should track lastTriggeredAt', () => {
      const now = Date.now();
      traceCollector.record('rule_triggered', { triggerType: 'event' }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule',
        timestamp: now
      });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.lastTriggeredAt).toBe(now);
    });
  });

  describe('execution tracking', () => {
    it('should track rule_executed events', () => {
      traceCollector.record('rule_triggered', { triggerType: 'event' }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule'
      });
      traceCollector.record('rule_executed', { actionsCount: 2 }, {
        ruleId: 'rule-1',
        ruleName: 'Test Rule',
        durationMs: 50
      });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.executionCount).toBe(1);
      expect(profile!.totalTimeMs).toBe(50);
      expect(profile!.avgTimeMs).toBe(50);
    });

    it('should calculate min/max execution times', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 50 });

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 30 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.minTimeMs).toBe(10);
      expect(profile!.maxTimeMs).toBe(50);
      expect(profile!.avgTimeMs).toBeCloseTo(30, 1);
    });

    it('should track lastExecutedAt', () => {
      const now = Date.now();
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, {
        ruleId: 'rule-1',
        timestamp: now,
        durationMs: 10
      });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.lastExecutedAt).toBe(now);
    });
  });

  describe('skip tracking', () => {
    it('should track rule_skipped events', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_skipped', { reason: 'conditions_not_met' }, {
        ruleId: 'rule-1',
        durationMs: 5
      });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.skipCount).toBe(1);
      expect(profile!.executionCount).toBe(0);
    });

    it('should calculate pass rate correctly', () => {
      // 3 triggers, 2 executions, 1 skip = 66.67% pass rate
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_skipped', { reason: 'conditions_not_met' }, { ruleId: 'rule-1' });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.passRate).toBeCloseTo(0.6667, 2);
    });
  });

  describe('condition profiling', () => {
    it('should track condition evaluations', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('condition_evaluated', {
        conditionIndex: 0,
        source: { type: 'fact', pattern: 'user.*' },
        operator: 'eq',
        actualValue: 'active',
        expectedValue: 'active',
        passed: true
      }, { ruleId: 'rule-1', durationMs: 2 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.conditionProfiles).toHaveLength(1);
      expect(profile!.conditionProfiles[0].conditionIndex).toBe(0);
      expect(profile!.conditionProfiles[0].evaluationCount).toBe(1);
      expect(profile!.conditionProfiles[0].passCount).toBe(1);
      expect(profile!.conditionProfiles[0].passRate).toBe(1);
    });

    it('should track failed conditions', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('condition_evaluated', {
        conditionIndex: 0,
        passed: true
      }, { ruleId: 'rule-1', durationMs: 1 });
      traceCollector.record('condition_evaluated', {
        conditionIndex: 0,
        passed: false
      }, { ruleId: 'rule-1', durationMs: 1 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.conditionProfiles[0].passCount).toBe(1);
      expect(profile!.conditionProfiles[0].failCount).toBe(1);
      expect(profile!.conditionProfiles[0].passRate).toBe(0.5);
    });

    it('should track multiple conditions separately', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('condition_evaluated', { conditionIndex: 0, passed: true }, { ruleId: 'rule-1', durationMs: 1 });
      traceCollector.record('condition_evaluated', { conditionIndex: 1, passed: false }, { ruleId: 'rule-1', durationMs: 2 });
      traceCollector.record('condition_evaluated', { conditionIndex: 2, passed: true }, { ruleId: 'rule-1', durationMs: 3 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.conditionProfiles).toHaveLength(3);
      expect(profile!.conditionProfiles[0].conditionIndex).toBe(0);
      expect(profile!.conditionProfiles[1].conditionIndex).toBe(1);
      expect(profile!.conditionProfiles[2].conditionIndex).toBe(2);
    });

    it('should aggregate condition evaluation time', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('condition_evaluated', { conditionIndex: 0, passed: true }, { ruleId: 'rule-1', durationMs: 5 });
      traceCollector.record('condition_evaluated', { conditionIndex: 1, passed: true }, { ruleId: 'rule-1', durationMs: 10 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.conditionEvalTimeMs).toBe(15);
    });
  });

  describe('action profiling', () => {
    it('should track successful action completions', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('action_completed', {
        actionIndex: 0,
        actionType: 'set_fact',
        output: { key: 'foo', value: 'bar' }
      }, { ruleId: 'rule-1', durationMs: 15 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.actionProfiles).toHaveLength(1);
      expect(profile!.actionProfiles[0].actionIndex).toBe(0);
      expect(profile!.actionProfiles[0].actionType).toBe('set_fact');
      expect(profile!.actionProfiles[0].executionCount).toBe(1);
      expect(profile!.actionProfiles[0].successCount).toBe(1);
      expect(profile!.actionProfiles[0].successRate).toBe(1);
    });

    it('should track failed actions', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('action_failed', {
        actionIndex: 0,
        actionType: 'http_request',
        error: 'Connection refused'
      }, { ruleId: 'rule-1', durationMs: 100 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.actionProfiles[0].failureCount).toBe(1);
      expect(profile!.actionProfiles[0].successRate).toBe(0);
    });

    it('should track action min/max times', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('action_completed', { actionIndex: 0, actionType: 'set_fact' }, { ruleId: 'rule-1', durationMs: 5 });
      traceCollector.record('action_completed', { actionIndex: 0, actionType: 'set_fact' }, { ruleId: 'rule-1', durationMs: 20 });
      traceCollector.record('action_completed', { actionIndex: 0, actionType: 'set_fact' }, { ruleId: 'rule-1', durationMs: 10 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.actionProfiles[0].minTimeMs).toBe(5);
      expect(profile!.actionProfiles[0].maxTimeMs).toBe(20);
      expect(profile!.actionProfiles[0].avgTimeMs).toBeCloseTo(11.67, 1);
    });

    it('should aggregate action execution time', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('action_completed', { actionIndex: 0, actionType: 'set_fact' }, { ruleId: 'rule-1', durationMs: 10 });
      traceCollector.record('action_completed', { actionIndex: 1, actionType: 'emit_event' }, { ruleId: 'rule-1', durationMs: 20 });

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.actionExecTimeMs).toBe(30);
    });
  });

  describe('getSlowestRules', () => {
    it('should return rules sorted by average time descending', () => {
      // Rule 1: avg 10ms
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Fast Rule' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });

      // Rule 2: avg 50ms
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Slow Rule' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-2', durationMs: 50 });

      // Rule 3: avg 30ms
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-3', ruleName: 'Medium Rule' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-3', durationMs: 30 });

      const slowest = profiler.getSlowestRules(10);
      expect(slowest).toHaveLength(3);
      expect(slowest[0].ruleId).toBe('rule-2');
      expect(slowest[1].ruleId).toBe('rule-3');
      expect(slowest[2].ruleId).toBe('rule-1');
    });

    it('should exclude rules with no executions', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Executed' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Skipped' });
      traceCollector.record('rule_skipped', {}, { ruleId: 'rule-2' });

      const slowest = profiler.getSlowestRules(10);
      expect(slowest).toHaveLength(1);
      expect(slowest[0].ruleId).toBe('rule-1');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        traceCollector.record('rule_triggered', {}, { ruleId: `rule-${i}`, ruleName: `Rule ${i}` });
        traceCollector.record('rule_executed', {}, { ruleId: `rule-${i}`, durationMs: i * 10 });
      }

      const slowest = profiler.getSlowestRules(3);
      expect(slowest).toHaveLength(3);
    });
  });

  describe('getHottestRules', () => {
    it('should return rules sorted by trigger count descending', () => {
      // Rule 1: 5 triggers
      for (let i = 0; i < 5; i++) {
        traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Hot Rule' });
      }

      // Rule 2: 2 triggers
      for (let i = 0; i < 2; i++) {
        traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Cold Rule' });
      }

      // Rule 3: 10 triggers
      for (let i = 0; i < 10; i++) {
        traceCollector.record('rule_triggered', {}, { ruleId: 'rule-3', ruleName: 'Hottest Rule' });
      }

      const hottest = profiler.getHottestRules(10);
      expect(hottest).toHaveLength(3);
      expect(hottest[0].ruleId).toBe('rule-3');
      expect(hottest[0].triggerCount).toBe(10);
      expect(hottest[1].ruleId).toBe('rule-1');
      expect(hottest[2].ruleId).toBe('rule-2');
    });
  });

  describe('getLowestPassRate', () => {
    it('should return rules sorted by pass rate ascending', () => {
      // Rule 1: 100% pass rate
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Perfect' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });

      // Rule 2: 50% pass rate
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Half' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-2', durationMs: 10 });
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Half' });
      traceCollector.record('rule_skipped', {}, { ruleId: 'rule-2' });

      // Rule 3: 0% pass rate
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-3', ruleName: 'Failing' });
      traceCollector.record('rule_skipped', {}, { ruleId: 'rule-3' });

      const lowest = profiler.getLowestPassRate(10);
      expect(lowest).toHaveLength(3);
      expect(lowest[0].ruleId).toBe('rule-3');
      expect(lowest[0].passRate).toBe(0);
      expect(lowest[1].ruleId).toBe('rule-2');
      expect(lowest[2].ruleId).toBe('rule-1');
    });
  });

  describe('getSummary', () => {
    it('should return correct summary statistics', () => {
      // Rule 1: 3 triggers, 2 executions, total 30ms
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Rule 1' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Rule 1' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 20 });
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Rule 1' });
      traceCollector.record('rule_skipped', {}, { ruleId: 'rule-1' });

      // Rule 2: 2 triggers, 2 executions, total 100ms
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Rule 2' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-2', durationMs: 40 });
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Rule 2' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-2', durationMs: 60 });

      const summary = profiler.getSummary();

      expect(summary.totalRulesProfiled).toBe(2);
      expect(summary.totalTriggers).toBe(5);
      expect(summary.totalExecutions).toBe(4);
      expect(summary.totalTimeMs).toBe(130);
      expect(summary.avgRuleTimeMs).toBeCloseTo(32.5, 1);
      expect(summary.slowestRule?.ruleId).toBe('rule-2');
      expect(summary.hottestRule?.ruleId).toBe('rule-1');
    });

    it('should handle empty profiler', () => {
      const summary = profiler.getSummary();

      expect(summary.totalRulesProfiled).toBe(0);
      expect(summary.totalTriggers).toBe(0);
      expect(summary.totalExecutions).toBe(0);
      expect(summary.avgRuleTimeMs).toBe(0);
      expect(summary.slowestRule).toBeNull();
      expect(summary.hottestRule).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear all profiling data', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });
      traceCollector.record('condition_evaluated', { conditionIndex: 0, passed: true }, { ruleId: 'rule-1' });
      traceCollector.record('action_completed', { actionIndex: 0, actionType: 'set_fact' }, { ruleId: 'rule-1' });

      expect(profiler.getRuleProfiles()).toHaveLength(1);

      profiler.reset();

      expect(profiler.getRuleProfiles()).toHaveLength(0);
      expect(profiler.getSummary().totalRulesProfiled).toBe(0);
    });

    it('should reset profilingStartedAt', () => {
      const beforeReset = profiler.getSummary().profilingStartedAt;

      // Wait a bit to ensure timestamp changes
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      profiler.reset();

      const afterReset = profiler.getSummary().profilingStartedAt;
      expect(afterReset).toBeGreaterThanOrEqual(beforeReset);

      vi.useRealTimers();
    });
  });

  describe('stop', () => {
    it('should stop receiving new trace entries', () => {
      profiler.stop();

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });

      expect(profiler.getRuleProfiles()).toHaveLength(0);
    });
  });

  describe('multiple rules', () => {
    it('should track profiles for multiple rules independently', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Rule 1' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1', durationMs: 10 });
      traceCollector.record('condition_evaluated', { conditionIndex: 0, passed: true }, { ruleId: 'rule-1', durationMs: 1 });

      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-2', ruleName: 'Rule 2' });
      traceCollector.record('rule_skipped', {}, { ruleId: 'rule-2' });

      const profiles = profiler.getRuleProfiles();
      expect(profiles).toHaveLength(2);

      const rule1 = profiler.getRuleProfile('rule-1');
      expect(rule1!.executionCount).toBe(1);
      expect(rule1!.skipCount).toBe(0);
      expect(rule1!.conditionProfiles).toHaveLength(1);

      const rule2 = profiler.getRuleProfile('rule-2');
      expect(rule2!.executionCount).toBe(0);
      expect(rule2!.skipCount).toBe(1);
      expect(rule2!.conditionProfiles).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle entries without durationMs', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1', ruleName: 'Test' });
      traceCollector.record('rule_executed', {}, { ruleId: 'rule-1' }); // No durationMs

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.executionCount).toBe(1);
      expect(profile!.totalTimeMs).toBe(0);
      expect(profile!.minTimeMs).toBe(0);
      expect(profile!.maxTimeMs).toBe(0);
    });

    it('should handle entries without ruleName', () => {
      traceCollector.record('rule_triggered', {}, { ruleId: 'rule-1' }); // No ruleName

      const profile = profiler.getRuleProfile('rule-1');
      expect(profile!.ruleName).toBe('rule-1'); // Falls back to ruleId
    });

    it('should ignore entries without ruleId', () => {
      traceCollector.record('event_emitted', { eventId: 'evt-1' }, {}); // No ruleId

      expect(profiler.getRuleProfiles()).toHaveLength(0);
    });
  });
});
