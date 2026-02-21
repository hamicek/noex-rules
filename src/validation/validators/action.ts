/**
 * Action validation.
 *
 * @module
 */

import { ACTION_TYPES, LOG_LEVELS, isValidDuration } from '../constants.js';
import type { IssueCollector } from '../types.js';
import { isObject, hasProperty } from '../types.js';
import { validateConditions } from './condition.js';

export function validateActions(
  actions: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!Array.isArray(actions)) {
    collector.addError(path, 'Actions must be an array');
    return;
  }

  if (actions.length === 0) {
    collector.addWarning(path, 'Rule has no actions');
  }

  for (let i = 0; i < actions.length; i++) {
    validateAction(actions[i], `${path}[${i}]`, collector);
  }
}

export function validateAction(
  action: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isObject(action)) {
    collector.addError(path, 'Action must be an object');
    return;
  }

  if (!hasProperty(action, 'type')) {
    collector.addError(`${path}.type`, 'Action must have a "type" field');
    return;
  }

  const type = action['type'];
  if (typeof type !== 'string') {
    collector.addError(`${path}.type`, 'Action type must be a string');
    return;
  }

  if (!(ACTION_TYPES as readonly string[]).includes(type)) {
    collector.addError(
      `${path}.type`,
      `Invalid action type: ${type}. Valid types: ${ACTION_TYPES.join(', ')}`,
    );
    return;
  }

  switch (type) {
    case 'set_fact':
      validateSetFactAction(action, path, collector);
      break;
    case 'delete_fact':
      validateDeleteFactAction(action, path, collector);
      break;
    case 'emit_event':
      validateEmitEventAction(action, path, collector);
      break;
    case 'set_timer':
      validateSetTimerAction(action, path, collector);
      break;
    case 'cancel_timer':
      validateCancelTimerAction(action, path, collector);
      break;
    case 'call_service':
      validateCallServiceAction(action, path, collector);
      break;
    case 'log':
      validateLogAction(action, path, collector);
      break;
    case 'conditional':
      validateConditionalAction(action, path, collector);
      break;
    case 'try_catch':
      validateTryCatchAction(action, path, collector);
      break;
  }
}

// ---------------------------------------------------------------------------
// Individual action validators
// ---------------------------------------------------------------------------

function validateSetFactAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'key')) {
    collector.addError(`${path}.key`, 'set_fact action must have a "key" field');
  } else if (typeof action['key'] !== 'string') {
    collector.addError(`${path}.key`, 'set_fact action key must be a string');
  }

  if (!hasProperty(action, 'value')) {
    collector.addError(`${path}.value`, 'set_fact action must have a "value" field');
  } else {
    checkForReferenceUsage(action['value'], collector);
  }
}

function validateDeleteFactAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'key')) {
    collector.addError(`${path}.key`, 'delete_fact action must have a "key" field');
  } else if (typeof action['key'] !== 'string') {
    collector.addError(`${path}.key`, 'delete_fact action key must be a string');
  }
}

function validateEmitEventAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'topic')) {
    collector.addError(`${path}.topic`, 'emit_event action must have a "topic" field');
  } else if (typeof action['topic'] !== 'string') {
    collector.addError(`${path}.topic`, 'emit_event action topic must be a string');
  }

  if (!hasProperty(action, 'data')) {
    collector.addError(`${path}.data`, 'emit_event action must have a "data" field');
  } else if (!isObject(action['data'])) {
    collector.addError(`${path}.data`, 'emit_event action data must be an object');
  } else {
    checkForReferenceUsageInObject(action['data'] as Record<string, unknown>, collector);
  }
}

function validateSetTimerAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'timer')) {
    collector.addError(`${path}.timer`, 'set_timer action must have a "timer" field');
    return;
  }

  const timer = action['timer'];
  if (!isObject(timer)) {
    collector.addError(`${path}.timer`, 'set_timer action timer must be an object');
    return;
  }

  if (!hasProperty(timer, 'name')) {
    collector.addError(`${path}.timer.name`, 'Timer must have a "name" field');
  } else if (typeof timer['name'] !== 'string') {
    collector.addError(`${path}.timer.name`, 'Timer name must be a string');
  }

  if (!hasProperty(timer, 'duration')) {
    collector.addError(`${path}.timer.duration`, 'Timer must have a "duration" field');
  } else {
    const duration = timer['duration'];
    if (typeof duration === 'string' && !isValidDuration(duration)) {
      collector.addError(`${path}.timer.duration`, `Invalid duration format: ${duration}`);
    } else if (typeof duration === 'number' && duration <= 0) {
      collector.addError(`${path}.timer.duration`, 'Timer duration must be positive');
    } else if (typeof duration !== 'string' && typeof duration !== 'number') {
      collector.addError(`${path}.timer.duration`, 'Timer duration must be a string or number');
    }
  }

  if (!hasProperty(timer, 'onExpire')) {
    collector.addError(`${path}.timer.onExpire`, 'Timer must have an "onExpire" field');
  } else if (isObject(timer['onExpire'])) {
    const onExpire = timer['onExpire'] as Record<string, unknown>;
    if (!hasProperty(onExpire, 'topic')) {
      collector.addError(`${path}.timer.onExpire.topic`, 'Timer onExpire must have a "topic" field');
    }
    if (!hasProperty(onExpire, 'data')) {
      collector.addError(`${path}.timer.onExpire.data`, 'Timer onExpire must have a "data" field');
    }
  } else {
    collector.addError(`${path}.timer.onExpire`, 'Timer onExpire must be an object');
  }
}

function validateCancelTimerAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'name')) {
    collector.addError(`${path}.name`, 'cancel_timer action must have a "name" field');
  } else if (typeof action['name'] !== 'string') {
    collector.addError(`${path}.name`, 'cancel_timer action name must be a string');
  }
}

function validateCallServiceAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'service')) {
    collector.addError(`${path}.service`, 'call_service action must have a "service" field');
  } else if (typeof action['service'] !== 'string') {
    collector.addError(`${path}.service`, 'call_service action service must be a string');
  }

  if (!hasProperty(action, 'method')) {
    collector.addError(`${path}.method`, 'call_service action must have a "method" field');
  } else if (typeof action['method'] !== 'string') {
    collector.addError(`${path}.method`, 'call_service action method must be a string');
  }

  if (hasProperty(action, 'args') && !Array.isArray(action['args'])) {
    collector.addError(`${path}.args`, 'call_service action args must be an array');
  }
}

function validateLogAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'level')) {
    collector.addError(`${path}.level`, 'log action must have a "level" field');
  } else {
    const level = action['level'];
    if (typeof level !== 'string' || !(LOG_LEVELS as readonly string[]).includes(level)) {
      collector.addError(
        `${path}.level`,
        `Invalid log level: ${String(level)}. Valid levels: ${LOG_LEVELS.join(', ')}`,
      );
    }
  }

  if (!hasProperty(action, 'message')) {
    collector.addError(`${path}.message`, 'log action must have a "message" field');
  } else if (typeof action['message'] !== 'string') {
    collector.addError(`${path}.message`, 'log action message must be a string');
  }
}

function validateConditionalAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'conditions')) {
    collector.addError(`${path}.conditions`, 'conditional action must have a "conditions" field');
  } else if (!Array.isArray(action['conditions'])) {
    collector.addError(`${path}.conditions`, 'conditional action conditions must be an array');
  } else if (action['conditions'].length === 0) {
    collector.addError(`${path}.conditions`, 'conditional action conditions must not be empty');
  } else {
    validateConditions(action['conditions'], `${path}.conditions`, collector);
  }

  if (!hasProperty(action, 'then')) {
    collector.addError(`${path}.then`, 'conditional action must have a "then" field');
  } else if (!Array.isArray(action['then'])) {
    collector.addError(`${path}.then`, 'conditional action then must be an array');
  } else if (action['then'].length === 0) {
    collector.addError(`${path}.then`, 'conditional action then must not be empty');
  } else {
    for (let i = 0; i < action['then'].length; i++) {
      validateAction(action['then'][i], `${path}.then[${i}]`, collector);
    }
  }

  if (hasProperty(action, 'else')) {
    if (!Array.isArray(action['else'])) {
      collector.addError(`${path}.else`, 'conditional action else must be an array');
    } else if (action['else'].length === 0) {
      collector.addWarning(`${path}.else`, 'conditional action else is empty');
    } else {
      for (let i = 0; i < action['else'].length; i++) {
        validateAction(action['else'][i], `${path}.else[${i}]`, collector);
      }
    }
  }
}

function validateTryCatchAction(
  action: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(action, 'try')) {
    collector.addError(`${path}.try`, 'try_catch action must have a "try" field');
  } else if (!Array.isArray(action['try'])) {
    collector.addError(`${path}.try`, 'try_catch action try must be an array');
  } else if (action['try'].length === 0) {
    collector.addError(`${path}.try`, 'try_catch action try must not be empty');
  } else {
    for (let i = 0; i < action['try'].length; i++) {
      validateAction(action['try'][i], `${path}.try[${i}]`, collector);
    }
  }

  const hasCatch = hasProperty(action, 'catch');
  const hasFinally = hasProperty(action, 'finally');

  if (!hasCatch && !hasFinally) {
    collector.addError(path, 'try_catch action must have at least "catch" or "finally"');
  }

  if (hasCatch) {
    if (!isObject(action['catch'])) {
      collector.addError(`${path}.catch`, 'try_catch action catch must be an object');
    } else {
      const catchObj = action['catch'] as Record<string, unknown>;
      if (!hasProperty(catchObj, 'actions')) {
        collector.addError(`${path}.catch.actions`, 'try_catch catch must have an "actions" field');
      } else if (!Array.isArray(catchObj['actions'])) {
        collector.addError(`${path}.catch.actions`, 'try_catch catch actions must be an array');
      } else if (catchObj['actions'].length === 0) {
        collector.addError(`${path}.catch.actions`, 'try_catch catch actions must not be empty');
      } else {
        for (let i = 0; i < catchObj['actions'].length; i++) {
          validateAction(catchObj['actions'][i], `${path}.catch.actions[${i}]`, collector);
        }
      }

      if (hasProperty(catchObj, 'as') && typeof catchObj['as'] !== 'string') {
        collector.addError(`${path}.catch.as`, 'try_catch catch as must be a string');
      }
    }
  }

  if (hasFinally) {
    if (!Array.isArray(action['finally'])) {
      collector.addError(`${path}.finally`, 'try_catch action finally must be an array');
    } else if (action['finally'].length === 0) {
      collector.addWarning(`${path}.finally`, 'try_catch action finally is empty');
    } else {
      for (let i = 0; i < action['finally'].length; i++) {
        validateAction(action['finally'][i], `${path}.finally[${i}]`, collector);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reference tracking
// ---------------------------------------------------------------------------

function checkForReferenceUsage(value: unknown, collector: IssueCollector): void {
  if (isObject(value) && hasProperty(value, 'ref')) {
    const ref = value['ref'];
    if (typeof ref === 'string') {
      collector.usedAliases.add(ref);
    }
  }
}

function checkForReferenceUsageInObject(
  obj: Record<string, unknown>,
  collector: IssueCollector,
): void {
  for (const value of Object.values(obj)) {
    checkForReferenceUsage(value, collector);
  }
}
