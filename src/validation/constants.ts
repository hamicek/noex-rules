/**
 * Shared validation constants.
 *
 * Single source of truth for allowed trigger types, operators, action types,
 * etc.  Used by the shared validator, CLI validator and YAML schema.
 *
 * @module
 */

export const TRIGGER_TYPES = ['event', 'fact', 'timer', 'temporal'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TEMPORAL_PATTERN_TYPES = ['sequence', 'absence', 'count', 'aggregate'] as const;
export type TemporalPatternType = (typeof TEMPORAL_PATTERN_TYPES)[number];

export const CONDITION_OPERATORS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'exists', 'not_exists',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const CONDITION_SOURCE_TYPES = ['event', 'fact', 'context', 'lookup', 'baseline'] as const;
export type ConditionSourceType = (typeof CONDITION_SOURCE_TYPES)[number];

export const BASELINE_COMPARISONS = ['above', 'below', 'outside', 'above_percentile', 'below_percentile'] as const;
export type BaselineComparisonConst = (typeof BASELINE_COMPARISONS)[number];

export const BASELINE_METHODS = ['moving_average', 'ewma', 'zscore', 'percentile'] as const;
export type BaselineMethodConst = (typeof BASELINE_METHODS)[number];

export const SEASONAL_PERIODS = ['hourly', 'daily', 'weekly', 'none'] as const;
export type SeasonalPeriodConst = (typeof SEASONAL_PERIODS)[number];

export const ACTION_TYPES = [
  'set_fact', 'delete_fact', 'emit_event',
  'set_timer', 'cancel_timer', 'call_service', 'log',
  'conditional', 'for_each',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const AGGREGATE_FUNCTIONS = ['sum', 'avg', 'min', 'max', 'count'] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

export const COMPARISONS = ['gte', 'lte', 'eq'] as const;
export type Comparison = (typeof COMPARISONS)[number];

export const UNARY_OPERATORS = ['exists', 'not_exists'] as const;
export type UnaryOperator = (typeof UNARY_OPERATORS)[number];

export const GOAL_TYPES = ['fact', 'event'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
export type GoalOperator = (typeof GOAL_OPERATORS)[number];

/** Matches a duration string with unit: `<digits><unit>` where unit is ms|s|m|h|d|w|y. */
export const DURATION_RE = /^\d+(ms|s|m|h|d|w|y)$/;

/** Checks whether a string is a valid duration (unit-based or pure numeric ms). */
export function isValidDuration(value: string): boolean {
  return DURATION_RE.test(value) || /^\d+$/.test(value);
}
