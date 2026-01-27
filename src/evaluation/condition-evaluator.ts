import type { RuleCondition } from '../types/condition.js';
import type { Fact } from '../types/fact.js';
import type { Event } from '../types/event.js';
import { evaluateCondition } from '../utils/operators.js';
import { getNestedValue, matchesFactPattern } from '../utils/pattern-matcher.js';
import type { FactStore } from '../core/fact-store.js';

export interface EvaluationContext {
  trigger: {
    type: 'fact' | 'event' | 'timer' | 'temporal';
    data: Record<string, unknown>;
  };
  facts: FactStore;
  variables: Map<string, unknown>;
}

/**
 * Vyhodnocuje podmínky pravidel.
 */
export class ConditionEvaluator {
  /**
   * Vyhodnotí všechny podmínky (AND logika).
   */
  evaluateAll(conditions: RuleCondition[], context: EvaluationContext): boolean {
    for (const condition of conditions) {
      if (!this.evaluate(condition, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Vyhodnotí jednu podmínku.
   */
  evaluate(condition: RuleCondition, context: EvaluationContext): boolean {
    const value = this.getSourceValue(condition.source, context);
    const compareValue = this.resolveCompareValue(condition.value, context);

    return evaluateCondition(condition, value, compareValue);
  }

  private getSourceValue(
    source: RuleCondition['source'],
    context: EvaluationContext
  ): unknown {
    switch (source.type) {
      case 'fact': {
        // Pattern matching - najdi první matchující fakt
        const facts = context.facts.query(source.pattern);
        return facts[0]?.value;
      }

      case 'event':
        return getNestedValue(context.trigger.data, source.field);

      case 'context':
        return context.variables.get(source.key);
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
          const fact = context.facts.get(path.join('.'));
          return fact?.value;
        }

        case 'event':
        case 'trigger':
          return getNestedValue(context.trigger.data, path.join('.'));

        case 'var':
          return context.variables.get(path[0] ?? '');
      }
    }

    return value;
  }
}
