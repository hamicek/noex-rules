import type { RuleCondition } from '../types/condition.js';
import type { RuleAction } from '../types/action.js';
import type { RuleTrigger, RuleInput } from '../types/rule.js';
import type { DataRequirement, LookupCacheConfig, LookupErrorStrategy } from '../types/lookup.js';

/**
 * A dynamic reference to a runtime value resolved during rule evaluation.
 *
 * References point to event data, facts, or context variables using
 * a dot-notated path such as `"event.orderId"` or `"fact.customer:vip"`.
 *
 * @typeParam T - The expected resolved type (used for compile-time safety only)
 *
 * @see {@link ref} — factory function for creating `Ref` instances
 */
export interface Ref<T = unknown> {
  ref: string;
  __type?: T;
}

/**
 * Union of all supported condition comparison operators.
 *
 * Derived directly from the core {@link RuleCondition} type.
 */
export type ConditionOperator = RuleCondition['operator'];

/**
 * Discriminated union describing the data source for a condition.
 *
 * Possible source types:
 * - `event`   — a field from the triggering event (`{ type: 'event', field }`)
 * - `fact`    — a value from the fact store (`{ type: 'fact', pattern }`)
 * - `context` — a context variable (`{ type: 'context', key }`)
 */
export type ConditionSource = RuleCondition['source'];

/**
 * Builder interface for conditions.
 *
 * Implemented by {@link SourceExpr} to provide a fluent operator API.
 */
export interface ConditionBuilder {
  /** Builds and returns the underlying {@link RuleCondition} object. */
  build(): RuleCondition;
}

/**
 * Builder interface for triggers.
 *
 * Implemented by event, fact, timer, and temporal trigger builders.
 */
export interface TriggerBuilder {
  /** Builds and returns the underlying {@link RuleTrigger} object. */
  build(): RuleTrigger;
}

/**
 * Builder interface for actions.
 *
 * Implemented by emit, fact, timer, service, and log action builders.
 */
export interface ActionBuilder {
  /** Builds and returns the underlying {@link RuleAction} object. */
  build(): RuleAction;
}

/**
 * Configuration object passed to {@link RuleBuilder.lookup}.
 *
 * Mirrors {@link DataRequirement} without the `name` field (provided
 * as the first argument to the builder method).
 */
export interface LookupConfig {
  /** Registered service name */
  service: string;

  /** Method name on the service */
  method: string;

  /** Arguments (may contain {@link Ref} values for runtime resolution) */
  args?: unknown[];

  /** Optional caching configuration */
  cache?: LookupCacheConfig;

  /** Behavior on error: 'skip' skips the rule, 'fail' throws. Default: 'skip' */
  onError?: LookupErrorStrategy;
}

/**
 * Internal state accumulated by {@link RuleBuilder} during the build process.
 */
export interface RuleBuildContext {
  id?: string;
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags: string[];
  group?: string;
  trigger?: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  lookups: DataRequirement[];
}

/**
 * The output of {@link RuleBuilder.build} — an alias for the core `RuleInput` type.
 */
export type BuiltRule = RuleInput;

/**
 * A value that may be either a literal `T` or a {@link Ref} resolved at runtime.
 *
 * @typeParam T - The literal value type
 */
export type ValueOrRef<T> = T | Ref<T>;
