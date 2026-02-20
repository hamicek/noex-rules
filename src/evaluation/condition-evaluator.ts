import type { RuleCondition } from '../types/condition.js';
import type { Fact } from '../types/fact.js';
import type { Event } from '../types/event.js';
import { evaluateCondition } from '../utils/operators.js';
import { getNestedValue, matchesFactPattern } from '../utils/pattern-matcher.js';
import type { FactStore } from '../core/fact-store.js';
import type { BaselineStore } from '../baseline/baseline-store.js';
import { interpolate, type InterpolationContext } from '../utils/interpolation.js';
import type { ConditionEvaluationCallback, ConditionEvaluationResult } from '../debugging/types.js';

export interface EvaluationContext {
  trigger: {
    type: 'fact' | 'event' | 'timer' | 'temporal';
    data: Record<string, unknown>;
  };
  facts: FactStore;
  variables: Map<string, unknown>;
  lookups?: Map<string, unknown>;
  baselineStore?: BaselineStore;
}

/** Options for condition evaluation with optional tracing */
export interface EvaluationOptions {
  /** Callback invoked after each condition evaluation */
  onConditionEvaluated?: ConditionEvaluationCallback;
}

/**
 * Vyhodnocuje podmínky pravidel.
 */
export class ConditionEvaluator {
  /**
   * Vyhodnotí všechny podmínky (AND logika).
   */
  evaluateAll(
    conditions: RuleCondition[],
    context: EvaluationContext,
    options?: EvaluationOptions
  ): boolean {
    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i]!;
      if (!this.evaluate(condition, context, i, options)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Vyhodnotí jednu podmínku.
   */
  evaluate(
    condition: RuleCondition,
    context: EvaluationContext,
    conditionIndex = 0,
    options?: EvaluationOptions
  ): boolean {
    const startTime = performance.now();

    const actualValue = this.getSourceValue(condition.source, context);
    const expectedValue = this.resolveCompareValue(condition.value, context);
    const result = evaluateCondition(condition, actualValue, expectedValue);

    if (options?.onConditionEvaluated) {
      const durationMs = performance.now() - startTime;

      const traceResult: ConditionEvaluationResult = {
        conditionIndex,
        source: this.buildSourceInfo(condition.source),
        operator: condition.operator,
        actualValue,
        expectedValue,
        result,
        durationMs
      };

      options.onConditionEvaluated(traceResult);
    }

    return result;
  }

  /**
   * Builds a serializable source info object for tracing.
   */
  private buildSourceInfo(source: RuleCondition['source']): ConditionEvaluationResult['source'] {
    switch (source.type) {
      case 'fact':
        return { type: 'fact', pattern: source.pattern };
      case 'event':
        return { type: 'event', field: source.field };
      case 'context':
        return { type: 'context', key: source.key };
      case 'lookup':
        return { type: 'lookup', name: source.name, ...(source.field !== undefined && { field: source.field }) };
      case 'baseline':
        return { type: 'baseline', metric: source.metric };
    }
  }

  private getSourceValue(
    source: RuleCondition['source'],
    context: EvaluationContext
  ): unknown {
    switch (source.type) {
      case 'fact': {
        // Interpolate pattern before querying (supports ${event.orderId} etc.)
        const interpolatedPattern = interpolate(source.pattern, context as InterpolationContext);
        // Pattern matching - najdi první matchující fakt
        const facts = context.facts.query(interpolatedPattern);
        return facts[0]?.value;
      }

      case 'event':
        return getNestedValue(context.trigger.data, source.field);

      case 'context': {
        const dotIdx = source.key.indexOf('.');
        if (dotIdx === -1) return context.variables.get(source.key);
        const varName = source.key.slice(0, dotIdx);
        const varPath = source.key.slice(dotIdx + 1);
        const varRoot = context.variables.get(varName);
        return varRoot !== undefined ? getNestedValue(varRoot, varPath) : undefined;
      }

      case 'lookup': {
        const result = context.lookups?.get(source.name);
        if (source.field) {
          return getNestedValue(result, source.field);
        }
        return result;
      }

      case 'baseline': {
        const store = context.baselineStore;
        if (!store) return undefined;
        const metricConfig = store.getMetricConfig(source.metric);
        if (!metricConfig) return undefined;
        const currentValue = getNestedValue(context.trigger.data, metricConfig.field);
        if (typeof currentValue !== 'number') return undefined;
        const anomaly = store.checkAnomaly(
          source.metric,
          currentValue,
          source.comparison,
          source.sensitivity,
        );
        return anomaly?.isAnomaly;
      }
    }
  }

  private resolveCompareValue(
    value: unknown,
    context: EvaluationContext
  ): unknown {
    if (value && typeof value === 'object' && 'ref' in value) {
      const ref = (value as { ref: string }).ref;
      const [source, ...path] = ref.split('.');

      switch (source) {
        case 'fact': {
          // Interpolate fact key to support dynamic references
          const factKey = interpolate(path.join('.'), context as InterpolationContext);
          const fact = context.facts.get(factKey);
          return fact?.value;
        }

        case 'event':
        case 'trigger':
          return getNestedValue(context.trigger.data, path.join('.'));

        case 'var':
          return context.variables.get(path[0] ?? '');

        case 'lookup': {
          const lookupName = path[0];
          if (lookupName === undefined) return undefined;
          const lookupResult = context.lookups?.get(lookupName);
          if (path.length <= 1) return lookupResult;
          return getNestedValue(lookupResult, path.slice(1).join('.'));
        }

        case 'baseline': {
          const store = context.baselineStore;
          if (!store) return undefined;
          const metricName = path[0];
          if (metricName === undefined) return undefined;
          const stats = store.getBaseline(metricName);
          if (!stats) return undefined;
          if (path.length <= 1) return stats;
          return getNestedValue(stats as unknown as Record<string, unknown>, path.slice(1).join('.'));
        }
      }
    }

    return value;
  }
}
