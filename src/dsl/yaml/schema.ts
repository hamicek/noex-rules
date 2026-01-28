/**
 * Validace a transformace YAML objektu na RuleInput.
 *
 * Poskytuje typově bezpečnou validaci celé struktury pravidla
 * s cestovými chybovými hláškami pro snadné ladění.
 *
 * Podporuje dvě syntaxe pro reference:
 * - Explicitní objekt: `{ ref: "event.orderId" }`
 * - Interpolační zkratka: `${event.orderId}`
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

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class YamlValidationError extends Error {
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

const DURATION_RE = /^\d+(ms|s|m|h|d|w|y)$/;

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
 * Rekurzivně normalizuje hodnoty — detekuje referenční syntaxi
 * (`${path}` nebo `{ ref: path }`) a převádí na `{ ref: path }`.
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
    const keys = Object.keys(obj);
    const refVal = get(obj, 'ref');
    // Explicitní reference: { ref: "event.field" }
    if (keys.length === 1 && typeof refVal === 'string') {
      return { ref: refVal };
    }
    // Rekurzivní normalizace vnořených objektů
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = normalizeValue(v);
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

const TEMPORAL_TYPES: ReadonlySet<string> = new Set(['sequence', 'absence', 'count', 'aggregate']);
const COMPARISON_OPS: ReadonlySet<string> = new Set(['gte', 'lte', 'eq']);
const AGGREGATE_FUNCTIONS: ReadonlySet<string> = new Set(['sum', 'avg', 'min', 'max', 'count']);

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

const TRIGGER_TYPES: ReadonlySet<string> = new Set(['event', 'fact', 'timer', 'temporal']);

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

const CONDITION_SOURCE_TYPES: ReadonlySet<string> = new Set(['event', 'fact', 'context']);

const CONDITION_OPERATORS: ReadonlySet<string> = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'exists', 'not_exists',
]);

const UNARY_OPERATORS: ReadonlySet<string> = new Set(['exists', 'not_exists']);

function validateConditionSource(obj: unknown, path: string): RuleCondition['source'] {
  const o = requireObject(obj, path);
  const type = requireString(requireField(o, 'type', path), `${path}.type`);

  if (!CONDITION_SOURCE_TYPES.has(type)) {
    throw new YamlValidationError(
      `invalid source type "${type}". Expected: event, fact, context`,
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
      `invalid operator "${operator}". Expected: ${[...CONDITION_OPERATORS].join(', ')}`,
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

const ACTION_TYPES: ReadonlySet<string> = new Set([
  'set_fact', 'delete_fact', 'emit_event',
  'set_timer', 'cancel_timer', 'call_service', 'log',
]);

const LOG_LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);

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
      `invalid action type "${type}". Expected: ${[...ACTION_TYPES].join(', ')}`,
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

    default:
      throw new YamlValidationError(`unknown action type "${type}"`, `${path}.type`);
  }
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

/**
 * Validuje surový objekt (typicky z YAML parseru) a vrací typově bezpečný `RuleInput`.
 *
 * Aplikuje výchozí hodnoty:
 * - `name` → id (pokud chybí)
 * - `priority` → 0
 * - `enabled` → true
 * - `tags` → []
 * - `conditions` → []
 *
 * @throws {YamlValidationError} Při jakékoliv validační chybě (obsahuje cestu k poli)
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

  return rule;
}
