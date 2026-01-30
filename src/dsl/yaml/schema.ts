/**
 * YAML schema validation and transformation into `RuleInput`.
 *
 * Provides type-safe validation of the entire rule structure with
 * path-aware error messages for easy debugging.
 *
 * Two reference syntaxes are supported:
 * - Explicit object: `{ ref: "event.orderId" }`
 * - Interpolation shorthand: `${event.orderId}`
 *
 * @module
 */

import type { RuleInput, RuleTrigger } from '../../types/rule.js';
import type { RuleCondition } from '../../types/condition.js';
import type { RuleAction } from '../../types/action.js';
import type {
  TemporalPattern,
  EventMatcher,
  SequencePattern,
  AbsencePattern,
  CountPattern,
  AggregatePattern,
} from '../../types/temporal.js';
import type { TimerConfig } from '../../types/timer.js';
import type { DataRequirement } from '../../types/lookup.js';
import { DslError } from '../helpers/errors.js';
import {
  DURATION_RE,
  TRIGGER_TYPES as TRIGGER_TYPE_VALUES,
  TEMPORAL_PATTERN_TYPES,
  CONDITION_OPERATORS as CONDITION_OPERATOR_VALUES,
  CONDITION_SOURCE_TYPES as CONDITION_SOURCE_TYPE_VALUES,
  ACTION_TYPES as ACTION_TYPE_VALUES,
  LOG_LEVELS as LOG_LEVEL_VALUES,
  AGGREGATE_FUNCTIONS as AGGREGATE_FN_VALUES,
  COMPARISONS,
  UNARY_OPERATORS as UNARY_OPERATOR_VALUES,
} from '../../validation/constants.js';

// ---------------------------------------------------------------------------
// Set-based lookups derived from shared constants
// ---------------------------------------------------------------------------

const TRIGGER_TYPES: ReadonlySet<string> = new Set(TRIGGER_TYPE_VALUES);
const TEMPORAL_TYPES: ReadonlySet<string> = new Set(TEMPORAL_PATTERN_TYPES);
const COMPARISON_OPS: ReadonlySet<string> = new Set(COMPARISONS);
const AGGREGATE_FUNCTIONS: ReadonlySet<string> = new Set(AGGREGATE_FN_VALUES);
const CONDITION_SOURCE_TYPES: ReadonlySet<string> = new Set(CONDITION_SOURCE_TYPE_VALUES);
const CONDITION_OPERATORS: ReadonlySet<string> = new Set(CONDITION_OPERATOR_VALUES);
const CONDITION_OPERATORS_MSG = CONDITION_OPERATOR_VALUES.join(', ');
const UNARY_OPERATORS: ReadonlySet<string> = new Set(UNARY_OPERATOR_VALUES);
const ACTION_TYPES: ReadonlySet<string> = new Set(ACTION_TYPE_VALUES);
const ACTION_TYPES_MSG = ACTION_TYPE_VALUES.join(', ');
const LOG_LEVELS: ReadonlySet<string> = new Set(LOG_LEVEL_VALUES);

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class YamlValidationError extends DslError {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${path}: ${message}`);
    this.name = 'YamlValidationError';
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

function get(obj: Record<string, unknown>, key: string): unknown {
  return obj[key];
}

function has(obj: Record<string, unknown>, key: string): boolean {
  return key in obj && obj[key] !== undefined && obj[key] !== null;
}

function requireField(obj: Record<string, unknown>, field: string, path: string): unknown {
  if (!has(obj, field)) {
    throw new YamlValidationError(`missing required field "${field}"`, path);
  }
  return get(obj, field);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new YamlValidationError(
      `must be a non-empty string, got ${value === '' ? 'empty string' : typeof value}`,
      path,
    );
  }
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new YamlValidationError(`must be a finite number, got ${typeof value}`, path);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new YamlValidationError(`must be a boolean, got ${typeof value}`, path);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new YamlValidationError(
      `must be an array, got ${Array.isArray(value) ? 'array' : typeof value}`,
      path,
    );
  }
  return value;
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new YamlValidationError(
      `must be an object, got ${Array.isArray(value) ? 'array' : typeof value}`,
      path,
    );
  }
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Duration validation (matches DSL validators)
// ---------------------------------------------------------------------------

function requireDuration(value: unknown, path: string): string | number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      throw new YamlValidationError(
        `must be a positive number (milliseconds), got ${value}`,
        path,
      );
    }
    return value;
  }
  if (typeof value === 'string' && DURATION_RE.test(value)) {
    return value;
  }
  throw new YamlValidationError(
    `must be a duration string (e.g. "5s", "15m", "24h") or positive number (ms), got ${JSON.stringify(value)}`,
    path,
  );
}

// ---------------------------------------------------------------------------
// Reference normalization
// ---------------------------------------------------------------------------

const REF_INTERPOLATION = /^\$\{(.+)\}$/;

/**
 * Recursively normalizes values — detects reference syntax
 * (`${path}` or `{ ref: path }`) and converts to `{ ref: path }`.
 */
export function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const match = REF_INTERPOLATION.exec(value);
    if (match) {
      return { ref: match[1] };
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    // Explicitní reference: { ref: "event.field" }
    const refVal = obj['ref'];
    if (typeof refVal === 'string') {
      let keyCount = 0;
      for (const _ in obj) { keyCount++; if (keyCount > 1) break; }
      if (keyCount === 1) {
        return { ref: refVal };
      }
    }
    // Rekurzivní normalizace vnořených objektů
    const result: Record<string, unknown> = {};
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        result[k] = normalizeValue(obj[k]);
      }
    }
    return result;
  }

  return value;
}

// ---------------------------------------------------------------------------
// EventMatcher
// ---------------------------------------------------------------------------

function validateEventMatcher(obj: unknown, path: string): EventMatcher {
  const o = requireObject(obj, path);
  const result: EventMatcher = {
    topic: requireString(requireField(o, 'topic', path), `${path}.topic`),
  };
  const filter = get(o, 'filter');
  if (filter !== undefined) {
    result.filter = requireObject(filter, `${path}.filter`) as Record<string, unknown>;
  }
  const as = get(o, 'as');
  if (as !== undefined) {
    result.as = requireString(as, `${path}.as`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Temporal patterns
// ---------------------------------------------------------------------------

function validateTemporalPattern(obj: unknown, path: string): TemporalPattern {
  const o = requireObject(obj, path);
  const type = requireString(requireField(o, 'type', path), `${path}.type`);

  if (!TEMPORAL_TYPES.has(type)) {
    throw new YamlValidationError(
      `invalid temporal pattern type "${type}". Expected: sequence, absence, count, aggregate`,
      `${path}.type`,
    );
  }

  switch (type) {
    case 'sequence':
      return validateSequencePattern(o, path);
    case 'absence':
      return validateAbsencePattern(o, path);
    case 'count':
      return validateCountPattern(o, path);
    case 'aggregate':
      return validateAggregatePattern(o, path);
    default:
      throw new YamlValidationError(`unknown temporal type "${type}"`, `${path}.type`);
  }
}

function validateSequencePattern(o: Record<string, unknown>, path: string): SequencePattern {
  const events = requireArray(requireField(o, 'events', path), `${path}.events`);
  if (events.length < 2) {
    throw new YamlValidationError('must have at least 2 events', `${path}.events`);
  }

  const result: SequencePattern = {
    type: 'sequence',
    events: events.map((e, i) => validateEventMatcher(e, `${path}.events[${i}]`)),
    within: requireDuration(requireField(o, 'within', path), `${path}.within`),
  };
  const groupBy = get(o, 'groupBy');
  if (groupBy !== undefined) result.groupBy = requireString(groupBy, `${path}.groupBy`);
  const strict = get(o, 'strict');
  if (strict !== undefined) result.strict = requireBoolean(strict, `${path}.strict`);
  return result;
}

function validateAbsencePattern(o: Record<string, unknown>, path: string): AbsencePattern {
  const result: AbsencePattern = {
    type: 'absence',
    after: validateEventMatcher(requireField(o, 'after', path), `${path}.after`),
    expected: validateEventMatcher(requireField(o, 'expected', path), `${path}.expected`),
    within: requireDuration(requireField(o, 'within', path), `${path}.within`),
  };
  const groupBy = get(o, 'groupBy');
  if (groupBy !== undefined) result.groupBy = requireString(groupBy, `${path}.groupBy`);
  return result;
}

function validateCountPattern(o: Record<string, unknown>, path: string): CountPattern {
  const comparison = requireString(requireField(o, 'comparison', path), `${path}.comparison`);
  if (!COMPARISON_OPS.has(comparison)) {
    throw new YamlValidationError(
      `invalid comparison "${comparison}". Expected: gte, lte, eq`,
      `${path}.comparison`,
    );
  }

  const result: CountPattern = {
    type: 'count',
    event: validateEventMatcher(requireField(o, 'event', path), `${path}.event`),
    threshold: requireNumber(requireField(o, 'threshold', path), `${path}.threshold`),
    comparison: comparison as 'gte' | 'lte' | 'eq',
    window: requireDuration(requireField(o, 'window', path), `${path}.window`),
  };
  const groupBy = get(o, 'groupBy');
  if (groupBy !== undefined) result.groupBy = requireString(groupBy, `${path}.groupBy`);
  const sliding = get(o, 'sliding');
  if (sliding !== undefined) result.sliding = requireBoolean(sliding, `${path}.sliding`);
  return result;
}

function validateAggregatePattern(o: Record<string, unknown>, path: string): AggregatePattern {
  const fn = requireString(requireField(o, 'function', path), `${path}.function`);
  if (!AGGREGATE_FUNCTIONS.has(fn)) {
    throw new YamlValidationError(
      `invalid function "${fn}". Expected: sum, avg, min, max, count`,
      `${path}.function`,
    );
  }

  const comparison = requireString(requireField(o, 'comparison', path), `${path}.comparison`);
  if (!COMPARISON_OPS.has(comparison)) {
    throw new YamlValidationError(
      `invalid comparison "${comparison}". Expected: gte, lte, eq`,
      `${path}.comparison`,
    );
  }

  const result: AggregatePattern = {
    type: 'aggregate',
    event: validateEventMatcher(requireField(o, 'event', path), `${path}.event`),
    field: requireString(requireField(o, 'field', path), `${path}.field`),
    function: fn as 'sum' | 'avg' | 'min' | 'max' | 'count',
    threshold: requireNumber(requireField(o, 'threshold', path), `${path}.threshold`),
    comparison: comparison as 'gte' | 'lte' | 'eq',
    window: requireDuration(requireField(o, 'window', path), `${path}.window`),
  };
  const groupBy = get(o, 'groupBy');
  if (groupBy !== undefined) result.groupBy = requireString(groupBy, `${path}.groupBy`);
  return result;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

function validateTrigger(obj: unknown, path: string): RuleTrigger {
  const o = requireObject(obj, path);
  const type = requireString(requireField(o, 'type', path), `${path}.type`);

  if (!TRIGGER_TYPES.has(type)) {
    throw new YamlValidationError(
      `invalid trigger type "${type}". Expected: event, fact, timer, temporal`,
      `${path}.type`,
    );
  }

  switch (type) {
    case 'event':
      return { type: 'event', topic: requireString(requireField(o, 'topic', path), `${path}.topic`) };
    case 'fact':
      return { type: 'fact', pattern: requireString(requireField(o, 'pattern', path), `${path}.pattern`) };
    case 'timer':
      return { type: 'timer', name: requireString(requireField(o, 'name', path), `${path}.name`) };
    case 'temporal':
      return {
        type: 'temporal',
        pattern: validateTemporalPattern(requireField(o, 'pattern', path), `${path}.pattern`),
      };
    default:
      throw new YamlValidationError(`unknown trigger type "${type}"`, `${path}.type`);
  }
}

// ---------------------------------------------------------------------------
// Condition
// ---------------------------------------------------------------------------

function validateConditionSource(obj: unknown, path: string): RuleCondition['source'] {
  const o = requireObject(obj, path);
  const type = requireString(requireField(o, 'type', path), `${path}.type`);

  if (!CONDITION_SOURCE_TYPES.has(type)) {
    throw new YamlValidationError(
      `invalid source type "${type}". Expected: event, fact, context, lookup`,
      `${path}.type`,
    );
  }

  switch (type) {
    case 'event':
      return { type: 'event', field: requireString(requireField(o, 'field', path), `${path}.field`) };
    case 'fact':
      return { type: 'fact', pattern: requireString(requireField(o, 'pattern', path), `${path}.pattern`) };
    case 'context':
      return { type: 'context', key: requireString(requireField(o, 'key', path), `${path}.key`) };
    case 'lookup': {
      const source: RuleCondition['source'] = {
        type: 'lookup',
        name: requireString(requireField(o, 'name', path), `${path}.name`),
      };
      if (has(o, 'field')) {
        (source as { type: 'lookup'; name: string; field?: string }).field =
          requireString(get(o, 'field'), `${path}.field`);
      }
      return source;
    }
    default:
      throw new YamlValidationError(`unknown source type "${type}"`, `${path}.type`);
  }
}

function validateCondition(obj: unknown, path: string): RuleCondition {
  const o = requireObject(obj, path);

  const source = validateConditionSource(requireField(o, 'source', path), `${path}.source`);
  const operator = requireString(requireField(o, 'operator', path), `${path}.operator`);

  if (!CONDITION_OPERATORS.has(operator)) {
    throw new YamlValidationError(
      `invalid operator "${operator}". Expected: ${CONDITION_OPERATORS_MSG}`,
      `${path}.operator`,
    );
  }

  if (UNARY_OPERATORS.has(operator)) {
    return { source, operator: operator as RuleCondition['operator'], value: true };
  }

  const rawValue = requireField(o, 'value', path);
  return { source, operator: operator as RuleCondition['operator'], value: normalizeValue(rawValue) };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

function validateTimerConfig(obj: unknown, path: string): TimerConfig {
  const o = requireObject(obj, path);

  const expObj = requireObject(requireField(o, 'onExpire', path), `${path}.onExpire`);
  const expData = get(expObj, 'data') ?? {};

  const config: TimerConfig = {
    name: requireString(requireField(o, 'name', path), `${path}.name`),
    duration: requireDuration(requireField(o, 'duration', path), `${path}.duration`),
    onExpire: {
      topic: requireString(requireField(expObj, 'topic', `${path}.onExpire`), `${path}.onExpire.topic`),
      data: normalizeValue(expData) as Record<string, unknown | { ref: string }>,
    },
  };

  const repeat = get(o, 'repeat');
  if (repeat !== undefined) {
    const rep = requireObject(repeat, `${path}.repeat`);
    const repeatObj: NonNullable<TimerConfig['repeat']> = {
      interval: requireDuration(requireField(rep, 'interval', `${path}.repeat`), `${path}.repeat.interval`),
    };
    const maxCount = get(rep, 'maxCount');
    if (maxCount !== undefined) {
      repeatObj.maxCount = requireNumber(maxCount, `${path}.repeat.maxCount`);
    }
    config.repeat = repeatObj;
  }

  return config;
}

function validateAction(obj: unknown, path: string): RuleAction {
  const o = requireObject(obj, path);
  const type = requireString(requireField(o, 'type', path), `${path}.type`);

  if (!ACTION_TYPES.has(type)) {
    throw new YamlValidationError(
      `invalid action type "${type}". Expected: ${ACTION_TYPES_MSG}`,
      `${path}.type`,
    );
  }

  switch (type) {
    case 'set_fact':
      return {
        type: 'set_fact',
        key: requireString(requireField(o, 'key', path), `${path}.key`),
        value: normalizeValue(requireField(o, 'value', path)),
      };

    case 'delete_fact':
      return {
        type: 'delete_fact',
        key: requireString(requireField(o, 'key', path), `${path}.key`),
      };

    case 'emit_event': {
      const rawData = get(o, 'data') ?? {};
      const data = requireObject(rawData, `${path}.data`);
      return {
        type: 'emit_event',
        topic: requireString(requireField(o, 'topic', path), `${path}.topic`),
        data: normalizeValue(data) as Record<string, unknown>,
      };
    }

    case 'set_timer':
      return {
        type: 'set_timer',
        timer: validateTimerConfig(requireField(o, 'timer', path), `${path}.timer`),
      };

    case 'cancel_timer':
      return {
        type: 'cancel_timer',
        name: requireString(requireField(o, 'name', path), `${path}.name`),
      };

    case 'call_service': {
      const args = get(o, 'args') ?? [];
      return {
        type: 'call_service',
        service: requireString(requireField(o, 'service', path), `${path}.service`),
        method: requireString(requireField(o, 'method', path), `${path}.method`),
        args: requireArray(args, `${path}.args`) as unknown[],
      };
    }

    case 'log': {
      const level = requireString(requireField(o, 'level', path), `${path}.level`);
      if (!LOG_LEVELS.has(level)) {
        throw new YamlValidationError(
          `invalid log level "${level}". Expected: debug, info, warn, error`,
          `${path}.level`,
        );
      }
      return {
        type: 'log',
        level: level as 'debug' | 'info' | 'warn' | 'error',
        message: requireString(requireField(o, 'message', path), `${path}.message`),
      };
    }

    case 'conditional': {
      // Accept singular "condition" (auto-wrap) or plural "conditions"
      const rawPlural = get(o, 'conditions');
      const rawSingular = get(o, 'condition');

      let conditions: RuleCondition[];
      if (rawPlural !== undefined) {
        const arr = requireArray(rawPlural, `${path}.conditions`);
        if (arr.length === 0) {
          throw new YamlValidationError('must have at least one condition', `${path}.conditions`);
        }
        conditions = arr.map((c, i) => validateCondition(c, `${path}.conditions[${i}]`));
      } else if (rawSingular !== undefined) {
        conditions = [validateCondition(rawSingular, `${path}.condition`)];
      } else {
        throw new YamlValidationError(
          'missing required field "conditions" (or singular "condition")',
          path,
        );
      }

      // then — required, non-empty
      const rawThen = requireField(o, 'then', path);
      const thenArr = requireArray(rawThen, `${path}.then`);
      if (thenArr.length === 0) {
        throw new YamlValidationError('must have at least one action', `${path}.then`);
      }
      const thenActions = thenArr.map((a, i) => validateAction(a, `${path}.then[${i}]`));

      // else — optional
      const rawElse = get(o, 'else');
      if (rawElse !== undefined) {
        const elseArr = requireArray(rawElse, `${path}.else`);
        const elseActions = elseArr.map((a, i) => validateAction(a, `${path}.else[${i}]`));
        return { type: 'conditional', conditions, then: thenActions, else: elseActions };
      }

      return { type: 'conditional', conditions, then: thenActions };
    }

    default:
      throw new YamlValidationError(`unknown action type "${type}"`, `${path}.type`);
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const LOOKUP_ERROR_STRATEGIES: ReadonlySet<string> = new Set(['skip', 'fail']);

function validateLookup(obj: unknown, path: string): DataRequirement {
  const o = requireObject(obj, path);

  const name = requireString(requireField(o, 'name', path), `${path}.name`);
  const service = requireString(requireField(o, 'service', path), `${path}.service`);
  const method = requireString(requireField(o, 'method', path), `${path}.method`);

  const rawArgs = get(o, 'args') ?? [];
  const args = requireArray(rawArgs, `${path}.args`).map(normalizeValue);

  const result: DataRequirement = { name, service, method, args };

  if (has(o, 'cache')) {
    const cacheObj = requireObject(get(o, 'cache'), `${path}.cache`);
    result.cache = {
      ttl: requireDuration(requireField(cacheObj, 'ttl', `${path}.cache`), `${path}.cache.ttl`),
    };
  }

  if (has(o, 'onError')) {
    const strategy = requireString(get(o, 'onError'), `${path}.onError`);
    if (!LOOKUP_ERROR_STRATEGIES.has(strategy)) {
      throw new YamlValidationError(
        `invalid onError strategy "${strategy}". Expected: skip, fail`,
        `${path}.onError`,
      );
    }
    result.onError = strategy as 'skip' | 'fail';
  }

  return result;
}

function validateLookups(arr: unknown, path: string): DataRequirement[] {
  const items = requireArray(arr, path);
  const names = new Set<string>();
  const lookups: DataRequirement[] = [];

  for (let i = 0; i < items.length; i++) {
    const lookup = validateLookup(items[i], `${path}[${i}]`);

    if (names.has(lookup.name)) {
      throw new YamlValidationError(
        `duplicate lookup name "${lookup.name}"`,
        `${path}[${i}].name`,
      );
    }

    names.add(lookup.name);
    lookups.push(lookup);
  }

  return lookups;
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

/**
 * Validates a raw object (typically from a YAML parser) and returns a
 * type-safe `RuleInput`.
 *
 * Applies defaults:
 * - `name` → id (when absent)
 * - `priority` → `0`
 * - `enabled` → `true`
 * - `tags` → `[]`
 * - `conditions` → `[]`
 *
 * @param obj  - The raw parsed object.
 * @param path - Dot-notated path prefix for error messages (default `"rule"`).
 * @returns A validated `RuleInput` object.
 * @throws {YamlValidationError} On any validation error (message includes the
 *         field path).
 */
export function validateRule(obj: unknown, path: string = 'rule'): RuleInput {
  const o = requireObject(obj, path);

  const id = requireString(requireField(o, 'id', path), `${path}.id`);

  const rawConditions = get(o, 'conditions') ?? [];
  const conditionsArr = requireArray(rawConditions, `${path}.conditions`);

  const rawActions = requireField(o, 'actions', path);
  const actionsArr = requireArray(rawActions, `${path}.actions`);
  if (actionsArr.length === 0) {
    throw new YamlValidationError('must have at least one action', `${path}.actions`);
  }

  const rawTags = get(o, 'tags') ?? [];
  const tagsArr = requireArray(rawTags, `${path}.tags`);

  const nameVal = get(o, 'name');
  const priorityVal = get(o, 'priority');
  const enabledVal = get(o, 'enabled');
  const descriptionVal = get(o, 'description');

  const rule: RuleInput = {
    id,
    name: typeof nameVal === 'string' && nameVal.length > 0 ? nameVal : id,
    priority: priorityVal !== undefined ? requireNumber(priorityVal, `${path}.priority`) : 0,
    enabled: enabledVal !== undefined ? requireBoolean(enabledVal, `${path}.enabled`) : true,
    tags: tagsArr.map((t, i) => requireString(t, `${path}.tags[${i}]`)),
    trigger: validateTrigger(requireField(o, 'trigger', path), `${path}.trigger`),
    conditions: conditionsArr.map((c, i) => validateCondition(c, `${path}.conditions[${i}]`)),
    actions: actionsArr.map((a, i) => validateAction(a, `${path}.actions[${i}]`)),
  };

  if (descriptionVal !== undefined) {
    rule.description = requireString(descriptionVal, `${path}.description`);
  }

  const groupVal = get(o, 'group');
  if (groupVal !== undefined) {
    rule.group = requireString(groupVal, `${path}.group`);
  }

  if (has(o, 'lookups')) {
    rule.lookups = validateLookups(get(o, 'lookups'), `${path}.lookups`);
  }

  return rule;
}
