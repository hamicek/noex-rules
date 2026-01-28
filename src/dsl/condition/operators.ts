import type { RuleCondition } from '../../types/condition.js';
import type { ConditionSource, ConditionBuilder, ValueOrRef } from '../types.js';
import { normalizeValue } from '../helpers/ref.js';
import { DslValidationError } from '../helpers/errors.js';

/**
 * Source expression s podporou operátorů.
 * Umožňuje fluent API: event('amount').gte(100)
 */
export class SourceExpr implements ConditionBuilder {
  private source: ConditionSource;
  private operator?: RuleCondition['operator'];
  private value?: unknown;

  constructor(source: ConditionSource) {
    this.source = source;
  }

  /** Rovná se */
  eq<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'eq';
    this.value = normalizeValue(value);
    return this;
  }

  /** Nerovná se */
  neq<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'neq';
    this.value = normalizeValue(value);
    return this;
  }

  /** Větší než */
  gt<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'gt';
    this.value = normalizeValue(value);
    return this;
  }

  /** Větší nebo rovno */
  gte<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'gte';
    this.value = normalizeValue(value);
    return this;
  }

  /** Menší než */
  lt<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'lt';
    this.value = normalizeValue(value);
    return this;
  }

  /** Menší nebo rovno */
  lte<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'lte';
    this.value = normalizeValue(value);
    return this;
  }

  /** Je v seznamu */
  in<T>(values: ValueOrRef<T[]>): SourceExpr {
    this.operator = 'in';
    this.value = normalizeValue(values);
    return this;
  }

  /** Není v seznamu */
  notIn<T>(values: ValueOrRef<T[]>): SourceExpr {
    this.operator = 'not_in';
    this.value = normalizeValue(values);
    return this;
  }

  /** Obsahuje */
  contains<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'contains';
    this.value = normalizeValue(value);
    return this;
  }

  /** Neobsahuje */
  notContains<T>(value: ValueOrRef<T>): SourceExpr {
    this.operator = 'not_contains';
    this.value = normalizeValue(value);
    return this;
  }

  /** Odpovídá regex patternu */
  matches(pattern: string | RegExp): SourceExpr {
    this.operator = 'matches';
    this.value = pattern instanceof RegExp ? pattern.source : pattern;
    return this;
  }

  /** Hodnota existuje (není undefined/null) */
  exists(): SourceExpr {
    this.operator = 'exists';
    this.value = true;
    return this;
  }

  /** Hodnota neexistuje (je undefined/null) */
  notExists(): SourceExpr {
    this.operator = 'not_exists';
    this.value = true;
    return this;
  }

  /**
   * Sestaví RuleCondition objekt.
   *
   * @throws {DslValidationError} Pokud nebyl nastaven operátor
   */
  build(): RuleCondition {
    if (!this.operator) {
      const src = this.source;
      const hint =
        src.type === 'event' ? `event("${src.field}")`
        : src.type === 'fact' ? `fact("${src.pattern}")`
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
