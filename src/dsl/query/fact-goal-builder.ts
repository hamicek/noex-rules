import type { FactGoal } from '../../types/backward.js';
import type { GoalBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';
import { DslValidationError } from '../helpers/errors.js';

/**
 * Fluent builder for backward chaining fact goals.
 *
 * A fact goal asks: "Can this fact be achieved (produced by some rule chain)?"
 *
 * Without calling any operator method, the builder produces an existence
 * check — the goal is achieved if the fact exists with any value.
 *
 * @example
 * ```typescript
 * factGoal('customer:123:tier').equals('vip')
 * factGoal('order:456:status').exists()
 * factGoal('sensor:temp').gte(100)
 * ```
 */
export class FactGoalBuilder implements GoalBuilder {
  private readonly key: string;
  private goalValue?: unknown;
  private goalOperator?: FactGoal['operator'];
  private hasValue = false;

  constructor(key: string) {
    this.key = key;
  }

  /**
   * Checks that the fact exists (any value).
   *
   * This is the default behavior — calling `exists()` is optional
   * and serves only as a readability aid.
   */
  exists(): FactGoalBuilder {
    return this;
  }

  /**
   * Checks that the fact value equals the expected value.
   */
  equals(value: unknown): FactGoalBuilder {
    this.setValue('eq', value);
    return this;
  }

  /**
   * Checks that the fact value does not equal the given value.
   */
  neq(value: unknown): FactGoalBuilder {
    this.setValue('neq', value);
    return this;
  }

  /**
   * Checks that the fact value is greater than the given number.
   */
  gt(value: number): FactGoalBuilder {
    this.requireNumber(value, 'gt');
    this.setValue('gt', value);
    return this;
  }

  /**
   * Checks that the fact value is greater than or equal to the given number.
   */
  gte(value: number): FactGoalBuilder {
    this.requireNumber(value, 'gte');
    this.setValue('gte', value);
    return this;
  }

  /**
   * Checks that the fact value is less than the given number.
   */
  lt(value: number): FactGoalBuilder {
    this.requireNumber(value, 'lt');
    this.setValue('lt', value);
    return this;
  }

  /**
   * Checks that the fact value is less than or equal to the given number.
   */
  lte(value: number): FactGoalBuilder {
    this.requireNumber(value, 'lte');
    this.setValue('lte', value);
    return this;
  }

  build(): FactGoal {
    const goal: FactGoal = { type: 'fact', key: this.key };

    if (this.hasValue) {
      goal.value = this.goalValue;
      goal.operator = this.goalOperator;
    }

    return goal;
  }

  private setValue(operator: FactGoal['operator'], value: unknown): void {
    this.goalOperator = operator;
    this.goalValue = value;
    this.hasValue = true;
  }

  private requireNumber(value: unknown, method: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DslValidationError(
        `factGoal("${this.key}").${method}() value must be a finite number, got ${value}`,
      );
    }
  }
}

/**
 * Creates a {@link FactGoalBuilder} for a backward chaining fact goal.
 *
 * @param key - The fact key (or pattern) to query.
 * @returns A {@link FactGoalBuilder} with fluent operator methods.
 *
 * @example
 * ```typescript
 * factGoal('customer:123:tier').equals('vip')
 * factGoal('order:456:status').exists()
 * factGoal('sensor:temp').gte(100)
 *
 * const result = engine.query(factGoal('customer:tier'));
 * ```
 */
export function factGoal(key: string): FactGoalBuilder {
  requireNonEmptyString(key, 'factGoal() key');
  return new FactGoalBuilder(key);
}
