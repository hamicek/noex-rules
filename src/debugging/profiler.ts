import type { TraceCollector } from './trace-collector.js';
import type { DebugTraceEntry, TraceSubscriber } from './types.js';

/**
 * Performance profile for a single condition within a rule.
 */
export interface ConditionProfile {
  conditionIndex: number;
  evaluationCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  passCount: number;
  failCount: number;
  passRate: number;
}

/**
 * Performance profile for a single action within a rule.
 */
export interface ActionProfile {
  actionIndex: number;
  actionType: string;
  executionCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

/**
 * Aggregated performance profile for a rule.
 */
export interface RuleProfile {
  ruleId: string;
  ruleName: string;
  triggerCount: number;
  executionCount: number;
  skipCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  conditionEvalTimeMs: number;
  actionExecTimeMs: number;
  conditionProfiles: ConditionProfile[];
  actionProfiles: ActionProfile[];
  passRate: number;
  lastTriggeredAt: number;
  lastExecutedAt: number | null;
}

/**
 * Summary statistics across all rules.
 */
export interface ProfilingSummary {
  totalRulesProfiled: number;
  totalTriggers: number;
  totalExecutions: number;
  totalTimeMs: number;
  avgRuleTimeMs: number;
  slowestRule: { ruleId: string; ruleName: string; avgTimeMs: number } | null;
  hottestRule: { ruleId: string; ruleName: string; triggerCount: number } | null;
  profilingStartedAt: number;
  lastActivityAt: number | null;
}

interface RuleMetrics {
  ruleId: string;
  ruleName: string;
  triggerCount: number;
  executionCount: number;
  skipCount: number;
  totalTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  conditionEvalTimeMs: number;
  actionExecTimeMs: number;
  executionTimes: number[];
  lastTriggeredAt: number;
  lastExecutedAt: number | null;
}

interface ConditionMetrics {
  evaluationCount: number;
  totalTimeMs: number;
  passCount: number;
  failCount: number;
}

interface ActionMetrics {
  actionType: string;
  executionCount: number;
  totalTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  successCount: number;
  failureCount: number;
}

/**
 * Aggregates performance metrics from trace entries.
 *
 * Subscribes to the TraceCollector and builds per-rule, per-condition,
 * and per-action statistics in real-time.
 */
export class Profiler {
  private readonly traceCollector: TraceCollector;
  private readonly ruleMetrics = new Map<string, RuleMetrics>();
  private readonly conditionMetrics = new Map<string, Map<number, ConditionMetrics>>();
  private readonly actionMetrics = new Map<string, Map<number, ActionMetrics>>();
  private readonly maxExecutionTimeSamples: number;

  private unsubscribe: (() => void) | null = null;
  private profilingStartedAt: number;
  private lastActivityAt: number | null = null;

  constructor(traceCollector: TraceCollector, options: { maxExecutionTimeSamples?: number; processExisting?: boolean } = {}) {
    this.traceCollector = traceCollector;
    this.maxExecutionTimeSamples = options.maxExecutionTimeSamples ?? 1000;
    this.profilingStartedAt = Date.now();

    if (options.processExisting !== false) {
      this.processExistingEntries();
    }

    this.subscribe();
  }

  private processExistingEntries(): void {
    const existingEntries = this.traceCollector.query({});
    for (const entry of existingEntries) {
      this.processEntry(entry);
    }
  }

  /**
   * Get performance profile for a specific rule.
   */
  getRuleProfile(ruleId: string): RuleProfile | undefined {
    const metrics = this.ruleMetrics.get(ruleId);
    if (!metrics) return undefined;

    return this.buildRuleProfile(metrics);
  }

  /**
   * Get performance profiles for all profiled rules.
   */
  getRuleProfiles(): RuleProfile[] {
    return Array.from(this.ruleMetrics.values()).map(m => this.buildRuleProfile(m));
  }

  /**
   * Get the slowest rules by average execution time.
   */
  getSlowestRules(limit = 10): RuleProfile[] {
    return this.getRuleProfiles()
      .filter(p => p.executionCount > 0)
      .sort((a, b) => b.avgTimeMs - a.avgTimeMs)
      .slice(0, limit);
  }

  /**
   * Get the most frequently triggered rules.
   */
  getHottestRules(limit = 10): RuleProfile[] {
    return this.getRuleProfiles()
      .sort((a, b) => b.triggerCount - a.triggerCount)
      .slice(0, limit);
  }

  /**
   * Get rules with the lowest pass rate (conditions often fail).
   */
  getLowestPassRate(limit = 10): RuleProfile[] {
    return this.getRuleProfiles()
      .filter(p => p.triggerCount > 0)
      .sort((a, b) => a.passRate - b.passRate)
      .slice(0, limit);
  }

  /**
   * Get rules with the highest failure rate in actions.
   */
  getHighestActionFailureRate(limit = 10): RuleProfile[] {
    return this.getRuleProfiles()
      .filter(p => {
        const totalActions = p.actionProfiles.reduce((sum, ap) => sum + ap.executionCount, 0);
        return totalActions > 0;
      })
      .sort((a, b) => {
        const aFailRate = this.calculateActionFailureRate(a);
        const bFailRate = this.calculateActionFailureRate(b);
        return bFailRate - aFailRate;
      })
      .slice(0, limit);
  }

  /**
   * Get summary statistics across all profiled rules.
   */
  getSummary(): ProfilingSummary {
    const profiles = this.getRuleProfiles();

    const totalTriggers = profiles.reduce((sum, p) => sum + p.triggerCount, 0);
    const totalExecutions = profiles.reduce((sum, p) => sum + p.executionCount, 0);
    const totalTimeMs = profiles.reduce((sum, p) => sum + p.totalTimeMs, 0);

    let slowestRule: ProfilingSummary['slowestRule'] = null;
    let hottestRule: ProfilingSummary['hottestRule'] = null;

    for (const profile of profiles) {
      if (profile.executionCount > 0) {
        if (!slowestRule || profile.avgTimeMs > slowestRule.avgTimeMs) {
          slowestRule = {
            ruleId: profile.ruleId,
            ruleName: profile.ruleName,
            avgTimeMs: profile.avgTimeMs
          };
        }
      }

      if (!hottestRule || profile.triggerCount > hottestRule.triggerCount) {
        hottestRule = {
          ruleId: profile.ruleId,
          ruleName: profile.ruleName,
          triggerCount: profile.triggerCount
        };
      }
    }

    return {
      totalRulesProfiled: profiles.length,
      totalTriggers,
      totalExecutions,
      totalTimeMs,
      avgRuleTimeMs: totalExecutions > 0 ? totalTimeMs / totalExecutions : 0,
      slowestRule,
      hottestRule,
      profilingStartedAt: this.profilingStartedAt,
      lastActivityAt: this.lastActivityAt
    };
  }

  /**
   * Reset all profiling data.
   */
  reset(): void {
    this.ruleMetrics.clear();
    this.conditionMetrics.clear();
    this.actionMetrics.clear();
    this.profilingStartedAt = Date.now();
    this.lastActivityAt = null;
  }

  /**
   * Stop profiling and unsubscribe from trace collector.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private subscribe(): void {
    const handler: TraceSubscriber = (entry) => {
      this.processEntry(entry);
    };

    this.unsubscribe = this.traceCollector.subscribe(handler);
  }

  private processEntry(entry: DebugTraceEntry): void {
    if (!entry.ruleId) return;

    this.lastActivityAt = entry.timestamp;

    switch (entry.type) {
      case 'rule_triggered':
        this.handleRuleTriggered(entry);
        break;
      case 'rule_executed':
        this.handleRuleExecuted(entry);
        break;
      case 'rule_skipped':
        this.handleRuleSkipped(entry);
        break;
      case 'condition_evaluated':
        this.handleConditionEvaluated(entry);
        break;
      case 'action_completed':
        this.handleActionCompleted(entry);
        break;
      case 'action_failed':
        this.handleActionFailed(entry);
        break;
    }
  }

  private getOrCreateRuleMetrics(ruleId: string, ruleName: string): RuleMetrics {
    let metrics = this.ruleMetrics.get(ruleId);
    if (!metrics) {
      metrics = {
        ruleId,
        ruleName,
        triggerCount: 0,
        executionCount: 0,
        skipCount: 0,
        totalTimeMs: 0,
        minTimeMs: Infinity,
        maxTimeMs: 0,
        conditionEvalTimeMs: 0,
        actionExecTimeMs: 0,
        executionTimes: [],
        lastTriggeredAt: 0,
        lastExecutedAt: null
      };
      this.ruleMetrics.set(ruleId, metrics);
    }
    return metrics;
  }

  private handleRuleTriggered(entry: DebugTraceEntry): void {
    const metrics = this.getOrCreateRuleMetrics(entry.ruleId!, entry.ruleName ?? entry.ruleId!);
    metrics.triggerCount++;
    metrics.lastTriggeredAt = entry.timestamp;
  }

  private handleRuleExecuted(entry: DebugTraceEntry): void {
    const metrics = this.getOrCreateRuleMetrics(entry.ruleId!, entry.ruleName ?? entry.ruleId!);
    metrics.executionCount++;
    metrics.lastExecutedAt = entry.timestamp;

    if (entry.durationMs !== undefined) {
      metrics.totalTimeMs += entry.durationMs;
      metrics.minTimeMs = Math.min(metrics.minTimeMs, entry.durationMs);
      metrics.maxTimeMs = Math.max(metrics.maxTimeMs, entry.durationMs);

      if (metrics.executionTimes.length >= this.maxExecutionTimeSamples) {
        metrics.executionTimes.shift();
      }
      metrics.executionTimes.push(entry.durationMs);
    }
  }

  private handleRuleSkipped(entry: DebugTraceEntry): void {
    const metrics = this.getOrCreateRuleMetrics(entry.ruleId!, entry.ruleName ?? entry.ruleId!);
    metrics.skipCount++;

    if (entry.durationMs !== undefined) {
      metrics.conditionEvalTimeMs += entry.durationMs;
    }
  }

  private handleConditionEvaluated(entry: DebugTraceEntry): void {
    const ruleId = entry.ruleId!;
    const conditionIndex = entry.details.conditionIndex as number;
    const passed = entry.details.passed as boolean;

    let ruleConditions = this.conditionMetrics.get(ruleId);
    if (!ruleConditions) {
      ruleConditions = new Map();
      this.conditionMetrics.set(ruleId, ruleConditions);
    }

    let metrics = ruleConditions.get(conditionIndex);
    if (!metrics) {
      metrics = {
        evaluationCount: 0,
        totalTimeMs: 0,
        passCount: 0,
        failCount: 0
      };
      ruleConditions.set(conditionIndex, metrics);
    }

    metrics.evaluationCount++;
    if (entry.durationMs !== undefined) {
      metrics.totalTimeMs += entry.durationMs;

      const ruleMetrics = this.ruleMetrics.get(ruleId);
      if (ruleMetrics) {
        ruleMetrics.conditionEvalTimeMs += entry.durationMs;
      }
    }

    if (passed) {
      metrics.passCount++;
    } else {
      metrics.failCount++;
    }
  }

  private handleActionCompleted(entry: DebugTraceEntry): void {
    const ruleId = entry.ruleId!;
    const actionIndex = entry.details.actionIndex as number;
    const actionType = entry.details.actionType as string;

    const metrics = this.getOrCreateActionMetrics(ruleId, actionIndex, actionType);
    metrics.executionCount++;
    metrics.successCount++;

    if (entry.durationMs !== undefined) {
      metrics.totalTimeMs += entry.durationMs;
      metrics.minTimeMs = Math.min(metrics.minTimeMs, entry.durationMs);
      metrics.maxTimeMs = Math.max(metrics.maxTimeMs, entry.durationMs);

      const ruleMetrics = this.ruleMetrics.get(ruleId);
      if (ruleMetrics) {
        ruleMetrics.actionExecTimeMs += entry.durationMs;
      }
    }
  }

  private handleActionFailed(entry: DebugTraceEntry): void {
    const ruleId = entry.ruleId!;
    const actionIndex = entry.details.actionIndex as number;
    const actionType = entry.details.actionType as string;

    const metrics = this.getOrCreateActionMetrics(ruleId, actionIndex, actionType);
    metrics.executionCount++;
    metrics.failureCount++;

    if (entry.durationMs !== undefined) {
      metrics.totalTimeMs += entry.durationMs;
      metrics.minTimeMs = Math.min(metrics.minTimeMs, entry.durationMs);
      metrics.maxTimeMs = Math.max(metrics.maxTimeMs, entry.durationMs);

      const ruleMetrics = this.ruleMetrics.get(ruleId);
      if (ruleMetrics) {
        ruleMetrics.actionExecTimeMs += entry.durationMs;
      }
    }
  }

  private getOrCreateActionMetrics(ruleId: string, actionIndex: number, actionType: string): ActionMetrics {
    let ruleActions = this.actionMetrics.get(ruleId);
    if (!ruleActions) {
      ruleActions = new Map();
      this.actionMetrics.set(ruleId, ruleActions);
    }

    let metrics = ruleActions.get(actionIndex);
    if (!metrics) {
      metrics = {
        actionType,
        executionCount: 0,
        totalTimeMs: 0,
        minTimeMs: Infinity,
        maxTimeMs: 0,
        successCount: 0,
        failureCount: 0
      };
      ruleActions.set(actionIndex, metrics);
    }

    return metrics;
  }

  private buildRuleProfile(metrics: RuleMetrics): RuleProfile {
    const conditionProfiles = this.buildConditionProfiles(metrics.ruleId);
    const actionProfiles = this.buildActionProfiles(metrics.ruleId);

    const minTimeMs = metrics.minTimeMs === Infinity ? 0 : metrics.minTimeMs;

    return {
      ruleId: metrics.ruleId,
      ruleName: metrics.ruleName,
      triggerCount: metrics.triggerCount,
      executionCount: metrics.executionCount,
      skipCount: metrics.skipCount,
      totalTimeMs: metrics.totalTimeMs,
      avgTimeMs: metrics.executionCount > 0 ? metrics.totalTimeMs / metrics.executionCount : 0,
      minTimeMs,
      maxTimeMs: metrics.maxTimeMs,
      conditionEvalTimeMs: metrics.conditionEvalTimeMs,
      actionExecTimeMs: metrics.actionExecTimeMs,
      conditionProfiles,
      actionProfiles,
      passRate: metrics.triggerCount > 0 ? metrics.executionCount / metrics.triggerCount : 0,
      lastTriggeredAt: metrics.lastTriggeredAt,
      lastExecutedAt: metrics.lastExecutedAt
    };
  }

  private buildConditionProfiles(ruleId: string): ConditionProfile[] {
    const ruleConditions = this.conditionMetrics.get(ruleId);
    if (!ruleConditions) return [];

    return Array.from(ruleConditions.entries())
      .map(([conditionIndex, metrics]) => ({
        conditionIndex,
        evaluationCount: metrics.evaluationCount,
        totalTimeMs: metrics.totalTimeMs,
        avgTimeMs: metrics.evaluationCount > 0 ? metrics.totalTimeMs / metrics.evaluationCount : 0,
        passCount: metrics.passCount,
        failCount: metrics.failCount,
        passRate: metrics.evaluationCount > 0 ? metrics.passCount / metrics.evaluationCount : 0
      }))
      .sort((a, b) => a.conditionIndex - b.conditionIndex);
  }

  private buildActionProfiles(ruleId: string): ActionProfile[] {
    const ruleActions = this.actionMetrics.get(ruleId);
    if (!ruleActions) return [];

    return Array.from(ruleActions.entries())
      .map(([actionIndex, metrics]) => ({
        actionIndex,
        actionType: metrics.actionType,
        executionCount: metrics.executionCount,
        totalTimeMs: metrics.totalTimeMs,
        avgTimeMs: metrics.executionCount > 0 ? metrics.totalTimeMs / metrics.executionCount : 0,
        minTimeMs: metrics.executionCount > 0 ? metrics.minTimeMs : 0,
        maxTimeMs: metrics.maxTimeMs,
        successCount: metrics.successCount,
        failureCount: metrics.failureCount,
        successRate: metrics.executionCount > 0 ? metrics.successCount / metrics.executionCount : 0
      }))
      .sort((a, b) => a.actionIndex - b.actionIndex);
  }

  private calculateActionFailureRate(profile: RuleProfile): number {
    const totalExecutions = profile.actionProfiles.reduce((sum, ap) => sum + ap.executionCount, 0);
    const totalFailures = profile.actionProfiles.reduce((sum, ap) => sum + ap.failureCount, 0);
    return totalExecutions > 0 ? totalFailures / totalExecutions : 0;
  }
}
