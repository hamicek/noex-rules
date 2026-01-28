/**
 * Trigger validation.
 *
 * @module
 */

import { TRIGGER_TYPES } from '../constants.js';
import type { IssueCollector } from '../types.js';
import { isObject, hasProperty } from '../types.js';
import { validateTemporalPattern } from './temporal.js';

export function validateTrigger(
  trigger: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isObject(trigger)) {
    collector.addError(path, 'Trigger must be an object');
    return;
  }

  if (!hasProperty(trigger, 'type')) {
    collector.addError(`${path}.type`, 'Trigger must have a "type" field');
    return;
  }

  const type = trigger['type'];
  if (typeof type !== 'string') {
    collector.addError(`${path}.type`, 'Trigger type must be a string');
    return;
  }

  if (!(TRIGGER_TYPES as readonly string[]).includes(type)) {
    collector.addError(
      `${path}.type`,
      `Invalid trigger type: ${type}. Valid types: ${TRIGGER_TYPES.join(', ')}`,
    );
    return;
  }

  switch (type) {
    case 'event':
      validateEventTrigger(trigger, path, collector);
      break;
    case 'fact':
      validateFactTrigger(trigger, path, collector);
      break;
    case 'timer':
      validateTimerTrigger(trigger, path, collector);
      break;
    case 'temporal':
      validateTemporalTrigger(trigger, path, collector);
      break;
  }
}

function validateEventTrigger(
  trigger: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(trigger, 'topic')) {
    collector.addError(`${path}.topic`, 'Event trigger must have a "topic" field');
  } else if (typeof trigger['topic'] !== 'string') {
    collector.addError(`${path}.topic`, 'Event trigger topic must be a string');
  } else if (trigger['topic'].trim() === '') {
    collector.addError(`${path}.topic`, 'Event trigger topic cannot be empty');
  }
}

function validateFactTrigger(
  trigger: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(trigger, 'pattern')) {
    collector.addError(`${path}.pattern`, 'Fact trigger must have a "pattern" field');
  } else if (typeof trigger['pattern'] !== 'string') {
    collector.addError(`${path}.pattern`, 'Fact trigger pattern must be a string');
  } else if (trigger['pattern'].trim() === '') {
    collector.addError(`${path}.pattern`, 'Fact trigger pattern cannot be empty');
  }
}

function validateTimerTrigger(
  trigger: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(trigger, 'name')) {
    collector.addError(`${path}.name`, 'Timer trigger must have a "name" field');
  } else if (typeof trigger['name'] !== 'string') {
    collector.addError(`${path}.name`, 'Timer trigger name must be a string');
  } else if (trigger['name'].trim() === '') {
    collector.addError(`${path}.name`, 'Timer trigger name cannot be empty');
  }
}

function validateTemporalTrigger(
  trigger: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(trigger, 'pattern')) {
    collector.addError(`${path}.pattern`, 'Temporal trigger must have a "pattern" field');
    return;
  }

  validateTemporalPattern(trigger['pattern'], `${path}.pattern`, collector);
}
