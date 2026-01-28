/**
 * Shared rule validation module.
 *
 * @module
 */

// Types
export type { ValidationIssue, ValidationResult } from './types.js';

// Constants
export {
  TRIGGER_TYPES,
  TEMPORAL_PATTERN_TYPES,
  CONDITION_OPERATORS,
  CONDITION_SOURCE_TYPES,
  ACTION_TYPES,
  LOG_LEVELS,
  AGGREGATE_FUNCTIONS,
  COMPARISONS,
  UNARY_OPERATORS,
  DURATION_RE,
  isValidDuration,
} from './constants.js';
export type {
  TriggerType,
  TemporalPatternType,
  ConditionOperator,
  ConditionSourceType,
  ActionType,
  LogLevel,
  AggregateFunction,
  Comparison,
  UnaryOperator,
} from './constants.js';

// Validator
export { RuleInputValidator } from './rule-validator.js';
export type { ValidatorOptions } from './rule-validator.js';

// Error
export { RuleValidationError } from './rule-validation-error.js';
