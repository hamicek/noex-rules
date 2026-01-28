/**
 * Validační služba pro CLI.
 * Validuje pravidla podle schématu a sémantických pravidel.
 */

import type { ValidationIssue } from '../utils/errors.js';

/** Podporované typy triggerů */
const TRIGGER_TYPES = ['event', 'fact', 'timer', 'temporal'] as const;

/** Podporované typy temporálních vzorů */
const TEMPORAL_PATTERN_TYPES = ['sequence', 'absence', 'count', 'aggregate'] as const;

/** Podporované operátory podmínek */
const CONDITION_OPERATORS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'exists', 'not_exists'
] as const;

/** Podporované typy zdrojů podmínek */
const CONDITION_SOURCE_TYPES = ['fact', 'event', 'context'] as const;

/** Podporované typy akcí */
const ACTION_TYPES = [
  'set_fact', 'delete_fact', 'emit_event',
  'set_timer', 'cancel_timer', 'call_service', 'log'
] as const;

/** Podporované úrovně logování */
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** Podporované agregační funkce */
const AGGREGATE_FUNCTIONS = ['sum', 'avg', 'min', 'max', 'count'] as const;

/** Podporovaná porovnání pro temporal patterns */
const COMPARISONS = ['gte', 'lte', 'eq'] as const;

/** Options pro validátor */
export interface ValidatorOptions {
  /** Strict mode - kontroluje nepoužité proměnné a další best practices */
  strict: boolean;
}

/** Výsledek validace */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Typ pravidla z JSON souboru */
type RuleInput = Record<string, unknown>;

/**
 * Validátor pravidel.
 */
export class RuleValidator {
  private readonly options: ValidatorOptions;
  private errors: ValidationIssue[] = [];
  private warnings: ValidationIssue[] = [];
  private definedAliases = new Set<string>();
  private usedAliases = new Set<string>();

  constructor(options: Partial<ValidatorOptions> = {}) {
    this.options = {
      strict: options.strict ?? false
    };
  }

  /**
   * Validuje jedno pravidlo.
   */
  validate(rule: unknown): ValidationResult {
    this.reset();

    if (!this.isObject(rule)) {
      this.addError('', 'Rule must be an object');
      return this.buildResult();
    }

    this.validateRequiredFields(rule as RuleInput);
    this.validateOptionalFields(rule as RuleInput);

    if (this.hasProperty(rule, 'trigger')) {
      this.validateTrigger((rule as RuleInput)['trigger'], 'trigger');
    }

    if (this.hasProperty(rule, 'conditions')) {
      this.validateConditions((rule as RuleInput)['conditions'], 'conditions');
    }

    if (this.hasProperty(rule, 'actions')) {
      this.validateActions((rule as RuleInput)['actions'], 'actions');
    }

    if (this.options.strict) {
      this.checkUnusedAliases();
    }

    return this.buildResult();
  }

  /**
   * Validuje pole pravidel.
   */
  validateMany(rules: unknown): ValidationResult {
    this.reset();

    if (!Array.isArray(rules)) {
      this.addError('', 'Input must be an array of rules');
      return this.buildResult();
    }

    const ids = new Set<string>();

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const prefix = `[${i}]`;

      if (!this.isObject(rule)) {
        this.addError(prefix, 'Rule must be an object');
        continue;
      }

      const ruleObj = rule as RuleInput;

      // Check for duplicate IDs
      if (this.hasProperty(rule, 'id') && typeof ruleObj['id'] === 'string') {
        const id = ruleObj['id'];
        if (ids.has(id)) {
          this.addError(`${prefix}.id`, `Duplicate rule ID: ${id}`);
        } else {
          ids.add(id);
        }
      }

      // Validate individual rule with prefix
      this.validateRuleWithPrefix(ruleObj, prefix);
    }

    return this.buildResult();
  }

  private validateRuleWithPrefix(rule: RuleInput, prefix: string): void {
    this.definedAliases.clear();
    this.usedAliases.clear();

    this.validateRequiredFieldsWithPrefix(rule, prefix);
    this.validateOptionalFieldsWithPrefix(rule, prefix);

    if (this.hasProperty(rule, 'trigger')) {
      this.validateTrigger(rule['trigger'], `${prefix}.trigger`);
    }

    if (this.hasProperty(rule, 'conditions')) {
      this.validateConditions(rule['conditions'], `${prefix}.conditions`);
    }

    if (this.hasProperty(rule, 'actions')) {
      this.validateActions(rule['actions'], `${prefix}.actions`);
    }

    if (this.options.strict) {
      this.checkUnusedAliasesWithPrefix(prefix);
    }
  }

  private reset(): void {
    this.errors = [];
    this.warnings = [];
    this.definedAliases.clear();
    this.usedAliases.clear();
  }

  private validateRequiredFields(rule: RuleInput): void {
    this.validateRequiredFieldsWithPrefix(rule, '');
  }

  private validateRequiredFieldsWithPrefix(rule: RuleInput, prefix: string): void {
    const sep = prefix ? '.' : '';

    if (!this.hasProperty(rule, 'id')) {
      this.addError(`${prefix}${sep}id`, 'Required field "id" is missing');
    } else if (typeof rule['id'] !== 'string') {
      this.addError(`${prefix}${sep}id`, 'Field "id" must be a string');
    } else if (rule['id'].trim() === '') {
      this.addError(`${prefix}${sep}id`, 'Field "id" cannot be empty');
    }

    if (!this.hasProperty(rule, 'name')) {
      this.addError(`${prefix}${sep}name`, 'Required field "name" is missing');
    } else if (typeof rule['name'] !== 'string') {
      this.addError(`${prefix}${sep}name`, 'Field "name" must be a string');
    } else if (rule['name'].trim() === '') {
      this.addError(`${prefix}${sep}name`, 'Field "name" cannot be empty');
    }

    if (!this.hasProperty(rule, 'trigger')) {
      this.addError(`${prefix}${sep}trigger`, 'Required field "trigger" is missing');
    }
  }

  private validateOptionalFields(rule: RuleInput): void {
    this.validateOptionalFieldsWithPrefix(rule, '');
  }

  private validateOptionalFieldsWithPrefix(rule: RuleInput, prefix: string): void {
    const sep = prefix ? '.' : '';

    if (this.hasProperty(rule, 'description') && typeof rule['description'] !== 'string') {
      this.addError(`${prefix}${sep}description`, 'Field "description" must be a string');
    }

    if (this.hasProperty(rule, 'priority')) {
      if (typeof rule['priority'] !== 'number') {
        this.addError(`${prefix}${sep}priority`, 'Field "priority" must be a number');
      } else if (!Number.isInteger(rule['priority'])) {
        this.addWarning(`${prefix}${sep}priority`, 'Field "priority" should be an integer');
      }
    }

    if (this.hasProperty(rule, 'enabled') && typeof rule['enabled'] !== 'boolean') {
      this.addError(`${prefix}${sep}enabled`, 'Field "enabled" must be a boolean');
    }

    if (this.hasProperty(rule, 'tags')) {
      const tags = rule['tags'];
      if (!Array.isArray(tags)) {
        this.addError(`${prefix}${sep}tags`, 'Field "tags" must be an array');
      } else {
        for (let i = 0; i < tags.length; i++) {
          if (typeof tags[i] !== 'string') {
            this.addError(`${prefix}${sep}tags[${i}]`, 'Tag must be a string');
          }
        }
      }
    }
  }

  private validateTrigger(trigger: unknown, path: string): void {
    if (!this.isObject(trigger)) {
      this.addError(path, 'Trigger must be an object');
      return;
    }

    const triggerObj = trigger as Record<string, unknown>;

    if (!this.hasProperty(trigger, 'type')) {
      this.addError(`${path}.type`, 'Trigger must have a "type" field');
      return;
    }

    const type = triggerObj['type'];
    if (typeof type !== 'string') {
      this.addError(`${path}.type`, 'Trigger type must be a string');
      return;
    }

    if (!this.isValidTriggerType(type)) {
      this.addError(`${path}.type`, `Invalid trigger type: ${type}. Valid types: ${TRIGGER_TYPES.join(', ')}`);
      return;
    }

    switch (type) {
      case 'event':
        this.validateEventTrigger(triggerObj, path);
        break;
      case 'fact':
        this.validateFactTrigger(triggerObj, path);
        break;
      case 'timer':
        this.validateTimerTrigger(triggerObj, path);
        break;
      case 'temporal':
        this.validateTemporalTrigger(triggerObj, path);
        break;
    }
  }

  private validateEventTrigger(trigger: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(trigger, 'topic')) {
      this.addError(`${path}.topic`, 'Event trigger must have a "topic" field');
    } else if (typeof trigger['topic'] !== 'string') {
      this.addError(`${path}.topic`, 'Event trigger topic must be a string');
    } else if (trigger['topic'].trim() === '') {
      this.addError(`${path}.topic`, 'Event trigger topic cannot be empty');
    }
  }

  private validateFactTrigger(trigger: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(trigger, 'pattern')) {
      this.addError(`${path}.pattern`, 'Fact trigger must have a "pattern" field');
    } else if (typeof trigger['pattern'] !== 'string') {
      this.addError(`${path}.pattern`, 'Fact trigger pattern must be a string');
    } else if (trigger['pattern'].trim() === '') {
      this.addError(`${path}.pattern`, 'Fact trigger pattern cannot be empty');
    }
  }

  private validateTimerTrigger(trigger: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(trigger, 'name')) {
      this.addError(`${path}.name`, 'Timer trigger must have a "name" field');
    } else if (typeof trigger['name'] !== 'string') {
      this.addError(`${path}.name`, 'Timer trigger name must be a string');
    } else if (trigger['name'].trim() === '') {
      this.addError(`${path}.name`, 'Timer trigger name cannot be empty');
    }
  }

  private validateTemporalTrigger(trigger: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(trigger, 'pattern')) {
      this.addError(`${path}.pattern`, 'Temporal trigger must have a "pattern" field');
      return;
    }

    this.validateTemporalPattern(trigger['pattern'], `${path}.pattern`);
  }

  private validateTemporalPattern(pattern: unknown, path: string): void {
    if (!this.isObject(pattern)) {
      this.addError(path, 'Temporal pattern must be an object');
      return;
    }

    const patternObj = pattern as Record<string, unknown>;

    if (!this.hasProperty(pattern, 'type')) {
      this.addError(`${path}.type`, 'Temporal pattern must have a "type" field');
      return;
    }

    const type = patternObj['type'];
    if (typeof type !== 'string') {
      this.addError(`${path}.type`, 'Temporal pattern type must be a string');
      return;
    }

    if (!this.isValidTemporalPatternType(type)) {
      this.addError(`${path}.type`, `Invalid temporal pattern type: ${type}. Valid types: ${TEMPORAL_PATTERN_TYPES.join(', ')}`);
      return;
    }

    switch (type) {
      case 'sequence':
        this.validateSequencePattern(patternObj, path);
        break;
      case 'absence':
        this.validateAbsencePattern(patternObj, path);
        break;
      case 'count':
        this.validateCountPattern(patternObj, path);
        break;
      case 'aggregate':
        this.validateAggregatePattern(patternObj, path);
        break;
    }
  }

  private validateSequencePattern(pattern: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(pattern, 'events')) {
      this.addError(`${path}.events`, 'Sequence pattern must have an "events" field');
    } else if (!Array.isArray(pattern['events'])) {
      this.addError(`${path}.events`, 'Sequence pattern events must be an array');
    } else {
      const events = pattern['events'] as unknown[];
      if (events.length < 2) {
        this.addError(`${path}.events`, 'Sequence pattern must have at least 2 events');
      }
      for (let i = 0; i < events.length; i++) {
        this.validateEventMatcher(events[i], `${path}.events[${i}]`);
      }
    }

    this.validateTimeWindow(pattern, 'within', path);
  }

  private validateAbsencePattern(pattern: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(pattern, 'after')) {
      this.addError(`${path}.after`, 'Absence pattern must have an "after" field');
    } else {
      this.validateEventMatcher(pattern['after'], `${path}.after`);
    }

    if (!this.hasProperty(pattern, 'expected')) {
      this.addError(`${path}.expected`, 'Absence pattern must have an "expected" field');
    } else {
      this.validateEventMatcher(pattern['expected'], `${path}.expected`);
    }

    this.validateTimeWindow(pattern, 'within', path);
  }

  private validateCountPattern(pattern: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(pattern, 'event')) {
      this.addError(`${path}.event`, 'Count pattern must have an "event" field');
    } else {
      this.validateEventMatcher(pattern['event'], `${path}.event`);
    }

    if (!this.hasProperty(pattern, 'threshold')) {
      this.addError(`${path}.threshold`, 'Count pattern must have a "threshold" field');
    } else if (typeof pattern['threshold'] !== 'number' || pattern['threshold'] < 1) {
      this.addError(`${path}.threshold`, 'Count pattern threshold must be a positive number');
    }

    if (this.hasProperty(pattern, 'comparison')) {
      const comparison = pattern['comparison'];
      if (typeof comparison !== 'string' || !COMPARISONS.includes(comparison as typeof COMPARISONS[number])) {
        this.addError(`${path}.comparison`, `Invalid comparison: ${comparison}. Valid values: ${COMPARISONS.join(', ')}`);
      }
    }

    this.validateTimeWindow(pattern, 'window', path);
  }

  private validateAggregatePattern(pattern: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(pattern, 'event')) {
      this.addError(`${path}.event`, 'Aggregate pattern must have an "event" field');
    } else {
      this.validateEventMatcher(pattern['event'], `${path}.event`);
    }

    if (!this.hasProperty(pattern, 'field')) {
      this.addError(`${path}.field`, 'Aggregate pattern must have a "field" field');
    } else if (typeof pattern['field'] !== 'string') {
      this.addError(`${path}.field`, 'Aggregate pattern field must be a string');
    }

    if (!this.hasProperty(pattern, 'function')) {
      this.addError(`${path}.function`, 'Aggregate pattern must have a "function" field');
    } else {
      const fn = pattern['function'];
      if (typeof fn !== 'string' || !AGGREGATE_FUNCTIONS.includes(fn as typeof AGGREGATE_FUNCTIONS[number])) {
        this.addError(`${path}.function`, `Invalid aggregate function: ${fn}. Valid values: ${AGGREGATE_FUNCTIONS.join(', ')}`);
      }
    }

    if (!this.hasProperty(pattern, 'threshold')) {
      this.addError(`${path}.threshold`, 'Aggregate pattern must have a "threshold" field');
    } else if (typeof pattern['threshold'] !== 'number') {
      this.addError(`${path}.threshold`, 'Aggregate pattern threshold must be a number');
    }

    if (this.hasProperty(pattern, 'comparison')) {
      const comparison = pattern['comparison'];
      if (typeof comparison !== 'string' || !COMPARISONS.includes(comparison as typeof COMPARISONS[number])) {
        this.addError(`${path}.comparison`, `Invalid comparison: ${comparison}. Valid values: ${COMPARISONS.join(', ')}`);
      }
    }

    this.validateTimeWindow(pattern, 'window', path);
  }

  private validateEventMatcher(matcher: unknown, path: string): void {
    if (!this.isObject(matcher)) {
      this.addError(path, 'Event matcher must be an object');
      return;
    }

    const matcherObj = matcher as Record<string, unknown>;

    if (!this.hasProperty(matcher, 'topic')) {
      this.addError(`${path}.topic`, 'Event matcher must have a "topic" field');
    } else if (typeof matcherObj['topic'] !== 'string') {
      this.addError(`${path}.topic`, 'Event matcher topic must be a string');
    }

    if (this.hasProperty(matcher, 'as')) {
      const alias = matcherObj['as'];
      if (typeof alias !== 'string') {
        this.addError(`${path}.as`, 'Event matcher alias must be a string');
      } else {
        this.definedAliases.add(alias);
      }
    }
  }

  private validateTimeWindow(obj: Record<string, unknown>, field: string, path: string): void {
    if (!this.hasProperty(obj, field)) {
      this.addError(`${path}.${field}`, `Field "${field}" is required`);
      return;
    }

    const value = obj[field];
    if (typeof value !== 'string' && typeof value !== 'number') {
      this.addError(`${path}.${field}`, `Field "${field}" must be a string (e.g., "5m") or number (milliseconds)`);
      return;
    }

    if (typeof value === 'string' && !this.isValidDuration(value)) {
      this.addError(`${path}.${field}`, `Invalid duration format: ${value}. Use formats like "5m", "1h", "7d"`);
    }

    if (typeof value === 'number' && value <= 0) {
      this.addError(`${path}.${field}`, `Duration must be positive`);
    }
  }

  private isValidDuration(value: string): boolean {
    return /^\d+[smhdwMy]$/.test(value) || /^\d+$/.test(value);
  }

  private validateConditions(conditions: unknown, path: string): void {
    if (!Array.isArray(conditions)) {
      this.addError(path, 'Conditions must be an array');
      return;
    }

    for (let i = 0; i < conditions.length; i++) {
      this.validateCondition(conditions[i], `${path}[${i}]`);
    }
  }

  private validateCondition(condition: unknown, path: string): void {
    if (!this.isObject(condition)) {
      this.addError(path, 'Condition must be an object');
      return;
    }

    const conditionObj = condition as Record<string, unknown>;

    // Validate source
    if (!this.hasProperty(condition, 'source')) {
      this.addError(`${path}.source`, 'Condition must have a "source" field');
    } else {
      this.validateConditionSource(conditionObj['source'], `${path}.source`);
    }

    // Validate operator
    if (!this.hasProperty(condition, 'operator')) {
      this.addError(`${path}.operator`, 'Condition must have an "operator" field');
    } else {
      const operator = conditionObj['operator'];
      if (typeof operator !== 'string') {
        this.addError(`${path}.operator`, 'Condition operator must be a string');
      } else if (!this.isValidOperator(operator)) {
        this.addError(`${path}.operator`, `Invalid operator: ${operator}. Valid operators: ${CONDITION_OPERATORS.join(', ')}`);
      }
    }

    // Validate value (not required for exists/not_exists)
    const operator = conditionObj['operator'];
    if (typeof operator === 'string' && !['exists', 'not_exists'].includes(operator)) {
      if (!this.hasProperty(condition, 'value')) {
        this.addError(`${path}.value`, 'Condition must have a "value" field');
      } else {
        this.validateConditionValue(conditionObj['value'], `${path}.value`);
      }
    }
  }

  private validateConditionSource(source: unknown, path: string): void {
    if (!this.isObject(source)) {
      this.addError(path, 'Condition source must be an object');
      return;
    }

    const sourceObj = source as Record<string, unknown>;

    if (!this.hasProperty(source, 'type')) {
      this.addError(`${path}.type`, 'Condition source must have a "type" field');
      return;
    }

    const type = sourceObj['type'];
    if (typeof type !== 'string') {
      this.addError(`${path}.type`, 'Condition source type must be a string');
      return;
    }

    if (!CONDITION_SOURCE_TYPES.includes(type as typeof CONDITION_SOURCE_TYPES[number])) {
      this.addError(`${path}.type`, `Invalid source type: ${type}. Valid types: ${CONDITION_SOURCE_TYPES.join(', ')}`);
      return;
    }

    switch (type) {
      case 'fact':
        if (!this.hasProperty(source, 'pattern')) {
          this.addError(`${path}.pattern`, 'Fact source must have a "pattern" field');
        } else if (typeof sourceObj['pattern'] !== 'string') {
          this.addError(`${path}.pattern`, 'Fact source pattern must be a string');
        }
        break;
      case 'event':
        if (!this.hasProperty(source, 'field')) {
          this.addError(`${path}.field`, 'Event source must have a "field" field');
        } else if (typeof sourceObj['field'] !== 'string') {
          this.addError(`${path}.field`, 'Event source field must be a string');
        }
        break;
      case 'context':
        if (!this.hasProperty(source, 'key')) {
          this.addError(`${path}.key`, 'Context source must have a "key" field');
        } else if (typeof sourceObj['key'] !== 'string') {
          this.addError(`${path}.key`, 'Context source key must be a string');
        }
        break;
    }
  }

  private validateConditionValue(value: unknown, path: string): void {
    // Check for reference
    if (this.isObject(value) && this.hasProperty(value, 'ref')) {
      const ref = (value as Record<string, unknown>)['ref'];
      if (typeof ref !== 'string') {
        this.addError(`${path}.ref`, 'Reference must be a string');
      } else {
        this.usedAliases.add(ref);
      }
    }
  }

  private validateActions(actions: unknown, path: string): void {
    if (!Array.isArray(actions)) {
      this.addError(path, 'Actions must be an array');
      return;
    }

    if (actions.length === 0) {
      this.addWarning(path, 'Rule has no actions');
    }

    for (let i = 0; i < actions.length; i++) {
      this.validateAction(actions[i], `${path}[${i}]`);
    }
  }

  private validateAction(action: unknown, path: string): void {
    if (!this.isObject(action)) {
      this.addError(path, 'Action must be an object');
      return;
    }

    const actionObj = action as Record<string, unknown>;

    if (!this.hasProperty(action, 'type')) {
      this.addError(`${path}.type`, 'Action must have a "type" field');
      return;
    }

    const type = actionObj['type'];
    if (typeof type !== 'string') {
      this.addError(`${path}.type`, 'Action type must be a string');
      return;
    }

    if (!ACTION_TYPES.includes(type as typeof ACTION_TYPES[number])) {
      this.addError(`${path}.type`, `Invalid action type: ${type}. Valid types: ${ACTION_TYPES.join(', ')}`);
      return;
    }

    switch (type) {
      case 'set_fact':
        this.validateSetFactAction(actionObj, path);
        break;
      case 'delete_fact':
        this.validateDeleteFactAction(actionObj, path);
        break;
      case 'emit_event':
        this.validateEmitEventAction(actionObj, path);
        break;
      case 'set_timer':
        this.validateSetTimerAction(actionObj, path);
        break;
      case 'cancel_timer':
        this.validateCancelTimerAction(actionObj, path);
        break;
      case 'call_service':
        this.validateCallServiceAction(actionObj, path);
        break;
      case 'log':
        this.validateLogAction(actionObj, path);
        break;
    }
  }

  private validateSetFactAction(action: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(action, 'key')) {
      this.addError(`${path}.key`, 'set_fact action must have a "key" field');
    } else if (typeof action['key'] !== 'string') {
      this.addError(`${path}.key`, 'set_fact action key must be a string');
    }

    if (!this.hasProperty(action, 'value')) {
      this.addError(`${path}.value`, 'set_fact action must have a "value" field');
    } else {
      this.checkForReferenceUsage(action['value']);
    }
  }

  private validateDeleteFactAction(action: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(action, 'key')) {
      this.addError(`${path}.key`, 'delete_fact action must have a "key" field');
    } else if (typeof action['key'] !== 'string') {
      this.addError(`${path}.key`, 'delete_fact action key must be a string');
    }
  }

  private validateEmitEventAction(action: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(action, 'topic')) {
      this.addError(`${path}.topic`, 'emit_event action must have a "topic" field');
    } else if (typeof action['topic'] !== 'string') {
      this.addError(`${path}.topic`, 'emit_event action topic must be a string');
    }

    if (!this.hasProperty(action, 'data')) {
      this.addError(`${path}.data`, 'emit_event action must have a "data" field');
    } else if (!this.isObject(action['data'])) {
      this.addError(`${path}.data`, 'emit_event action data must be an object');
    } else {
      this.checkForReferenceUsageInObject(action['data'] as Record<string, unknown>);
    }
  }

  private validateSetTimerAction(action: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(action, 'timer')) {
      this.addError(`${path}.timer`, 'set_timer action must have a "timer" field');
      return;
    }

    const timer = action['timer'];
    if (!this.isObject(timer)) {
      this.addError(`${path}.timer`, 'set_timer action timer must be an object');
      return;
    }

    const timerObj = timer as Record<string, unknown>;

    if (!this.hasProperty(timer, 'name')) {
      this.addError(`${path}.timer.name`, 'Timer must have a "name" field');
    } else if (typeof timerObj['name'] !== 'string') {
      this.addError(`${path}.timer.name`, 'Timer name must be a string');
    }

    if (!this.hasProperty(timer, 'duration')) {
      this.addError(`${path}.timer.duration`, 'Timer must have a "duration" field');
    } else {
      const duration = timerObj['duration'];
      if (typeof duration === 'string' && !this.isValidDuration(duration)) {
        this.addError(`${path}.timer.duration`, `Invalid duration format: ${duration}`);
      } else if (typeof duration === 'number' && duration <= 0) {
        this.addError(`${path}.timer.duration`, 'Timer duration must be positive');
      } else if (typeof duration !== 'string' && typeof duration !== 'number') {
        this.addError(`${path}.timer.duration`, 'Timer duration must be a string or number');
      }
    }

    if (!this.hasProperty(timer, 'onExpire')) {
      this.addError(`${path}.timer.onExpire`, 'Timer must have an "onExpire" field');
    } else if (this.isObject(timerObj['onExpire'])) {
      const onExpire = timerObj['onExpire'] as Record<string, unknown>;
      if (!this.hasProperty(onExpire, 'topic')) {
        this.addError(`${path}.timer.onExpire.topic`, 'Timer onExpire must have a "topic" field');
      }
      if (!this.hasProperty(onExpire, 'data')) {
        this.addError(`${path}.timer.onExpire.data`, 'Timer onExpire must have a "data" field');
      }
    } else {
      this.addError(`${path}.timer.onExpire`, 'Timer onExpire must be an object');
    }
  }

  private validateCancelTimerAction(action: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(action, 'name')) {
      this.addError(`${path}.name`, 'cancel_timer action must have a "name" field');
    } else if (typeof action['name'] !== 'string') {
      this.addError(`${path}.name`, 'cancel_timer action name must be a string');
    }
  }

  private validateCallServiceAction(action: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(action, 'service')) {
      this.addError(`${path}.service`, 'call_service action must have a "service" field');
    } else if (typeof action['service'] !== 'string') {
      this.addError(`${path}.service`, 'call_service action service must be a string');
    }

    if (!this.hasProperty(action, 'method')) {
      this.addError(`${path}.method`, 'call_service action must have a "method" field');
    } else if (typeof action['method'] !== 'string') {
      this.addError(`${path}.method`, 'call_service action method must be a string');
    }

    if (this.hasProperty(action, 'args') && !Array.isArray(action['args'])) {
      this.addError(`${path}.args`, 'call_service action args must be an array');
    }
  }

  private validateLogAction(action: Record<string, unknown>, path: string): void {
    if (!this.hasProperty(action, 'level')) {
      this.addError(`${path}.level`, 'log action must have a "level" field');
    } else {
      const level = action['level'];
      if (typeof level !== 'string' || !LOG_LEVELS.includes(level as typeof LOG_LEVELS[number])) {
        this.addError(`${path}.level`, `Invalid log level: ${level}. Valid levels: ${LOG_LEVELS.join(', ')}`);
      }
    }

    if (!this.hasProperty(action, 'message')) {
      this.addError(`${path}.message`, 'log action must have a "message" field');
    } else if (typeof action['message'] !== 'string') {
      this.addError(`${path}.message`, 'log action message must be a string');
    }
  }

  private checkForReferenceUsage(value: unknown): void {
    if (this.isObject(value) && this.hasProperty(value, 'ref')) {
      const ref = (value as Record<string, unknown>)['ref'];
      if (typeof ref === 'string') {
        this.usedAliases.add(ref);
      }
    }
  }

  private checkForReferenceUsageInObject(obj: Record<string, unknown>): void {
    for (const value of Object.values(obj)) {
      this.checkForReferenceUsage(value);
    }
  }

  private checkUnusedAliases(): void {
    this.checkUnusedAliasesWithPrefix('');
  }

  private checkUnusedAliasesWithPrefix(prefix: string): void {
    for (const alias of this.definedAliases) {
      if (!this.usedAliases.has(alias)) {
        const sep = prefix ? '.' : '';
        this.addWarning(`${prefix}${sep}trigger`, `Alias "${alias}" is defined but never used`);
      }
    }
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasProperty(obj: unknown, prop: string): boolean {
    return this.isObject(obj) && prop in obj;
  }

  private isValidTriggerType(type: string): type is typeof TRIGGER_TYPES[number] {
    return TRIGGER_TYPES.includes(type as typeof TRIGGER_TYPES[number]);
  }

  private isValidTemporalPatternType(type: string): type is typeof TEMPORAL_PATTERN_TYPES[number] {
    return TEMPORAL_PATTERN_TYPES.includes(type as typeof TEMPORAL_PATTERN_TYPES[number]);
  }

  private isValidOperator(operator: string): operator is typeof CONDITION_OPERATORS[number] {
    return CONDITION_OPERATORS.includes(operator as typeof CONDITION_OPERATORS[number]);
  }

  private addError(path: string, message: string): void {
    this.errors.push({ path: path || '(root)', message, severity: 'error' });
  }

  private addWarning(path: string, message: string): void {
    this.warnings.push({ path: path || '(root)', message, severity: 'warning' });
  }

  private buildResult(): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: [...this.errors],
      warnings: [...this.warnings]
    };
  }
}

/**
 * Vytvoří instanci validátoru s výchozím nastavením.
 */
export function createValidator(options?: Partial<ValidatorOptions>): RuleValidator {
  return new RuleValidator(options);
}
