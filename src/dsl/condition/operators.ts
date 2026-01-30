import type { RuleCondition } from '../../types/condition.js';
import type { ConditionSource, ConditionBuilder, ValueOrRef } from '../types.js';
import { normalizeValue } from '../helpers/ref.js';
import { DslValidationError } from '../helpers/errors.js';

/**
 * Fluent condition expression with chainable comparison operators.
 *
 * Created via the {@link event}, {@link fact}, or {@link context} helper
 * functions. Call one operator method and then pass the expression to
 * {@link RuleBuilder.if} or {@link RuleBuilder.and}.
 *
 * @example
 * ```typescript
 * event('amount').gte(100)
 * fact('customer:vip').eq(true)
 * context('threshold').lte(ref('event.value'))
 * ```
 */
export class SourceExpr implements ConditionBuilder {
  private source: ConditionSource;
  private operator?: RuleCondition['operator'];
  private value?: unknown;

  constructor(source: ConditionSource) {
    this.source = source;
  }

  /**
   * Equal — matches when the source value strictly equals `value`.
   *
   * @param value - Literal or {@link ref} to compare against.
   * @returns `this` for chaining.
   */
  eq<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'eq';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Not equal — matches when the source value does not equal `value`.
   *
   * @param value - Literal or {@link ref} to compare against.
   * @returns `this` for chaining.
   */
  neq<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'neq';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Greater than — matches when the source value is greater than `value`.
   *
   * @param value - Literal or {@link ref} to compare against.
   * @returns `this` for chaining.
   */
  gt<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'gt';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Greater than or equal — matches when the source value is &ge; `value`.
   *
   * @param value - Literal or {@link ref} to compare against.
   * @returns `this` for chaining.
   */
  gte<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'gte';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Less than — matches when the source value is less than `value`.
   *
   * @param value - Literal or {@link ref} to compare against.
   * @returns `this` for chaining.
   */
  lt<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'lt';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Less than or equal — matches when the source value is &le; `value`.
   *
   * @param value - Literal or {@link ref} to compare against.
   * @returns `this` for chaining.
   */
  lte<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'lte';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Membership — matches when the source value is contained in `values`.
   *
   * @param values - Array literal or {@link ref} resolving to an array.
   * @returns `this` for chaining.
   */
  in<T>(values: ValueOrRef<T[]>): SourceExpr {
    this.operator = 'in';
    this.value = normalizeValue(values);
    return this;
  }

  /**
   * Exclusion — matches when the source value is NOT in `values`.
   *
   * @param values - Array literal or {@link ref} resolving to an array.
   * @returns `this` for chaining.
   */
  notIn<T>(values: ValueOrRef<T[]>): SourceExpr {
    this.operator = 'not_in';
    this.value = normalizeValue(values);
    return this;
  }

  /**
   * Contains — matches when the source (array/string) contains `value`.
   *
   * @param value - Literal or {@link ref} to search for.
   * @returns `this` for chaining.
   */
  contains<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'contains';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Not contains — matches when the source does NOT contain `value`.
   *
   * @param value - Literal or {@link ref} to search for.
   * @returns `this` for chaining.
   */
  notContains<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'not_contains';
    this.value = normalizeValue(value);
    return this;
  }

  /**
   * Regex match — matches when the source string matches `pattern`.
   *
   * @param pattern - A regex string or `RegExp` (only the `source` is used).
   * @returns `this` for chaining.
   */
  matches(pattern: string | RegExp): SourceExpr {
    this.operator = 'matches';
    this.value = pattern instanceof RegExp ? pattern.source : pattern;
    return this;
  }

  /**
   * Existence check — matches when the source value is defined
   * (not `undefined` / `null`).
   *
   * @returns `this` for chaining.
   */
  exists(): SourceExpr {
    this.operator = 'exists';
    this.value = true;
    return this;
  }

  /**
   * Non-existence check — matches when the source value is `undefined`
   * or `null`.
   *
   * @returns `this` for chaining.
   */
  notExists(): SourceExpr {
    this.operator = 'not_exists';
    this.value = true;
    return this;
  }

  /**
   * Builds the final {@link RuleCondition} object.
   *
   * @returns The assembled condition ready for the rule engine.
   * @throws {DslValidationError} If no operator has been set.
   */
  build(): RuleCondition {
    if (!this.operator) {
      const src = this.source;
      const hint =
        src.type === 'event' ? `event("${src.field}")`
        : src.type === 'fact' ? `fact("${src.pattern}")`
        : src.type === 'lookup' ? `lookup("${src.name}")`
        : src.type === 'baseline' ? `baseline("${src.metric}")`
        : `context("${src.key}")`;
      throw new DslValidationError(
        `Condition on ${hint}: operator not specified. Use .eq(), .gte(), etc.`,
      );
    }

    return {
      source: this.source,
      operator: this.operator,
      value: this.value,
    };
  }
}
