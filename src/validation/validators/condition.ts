/**
 * Condition validation.
 *
 * @module
 */

import {
  CONDITION_OPERATORS,
  CONDITION_SOURCE_TYPES,
  BASELINE_COMPARISONS,
  UNARY_OPERATORS,
} from '../constants.js';
import type { IssueCollector } from '../types.js';
import { isObject, hasProperty } from '../types.js';

export function validateConditions(
  conditions: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!Array.isArray(conditions)) {
    collector.addError(path, 'Conditions must be an array');
    return;
  }

  for (let i = 0; i < conditions.length; i++) {
    validateCondition(conditions[i], `${path}[${i}]`, collector);
  }
}

export function validateCondition(
  condition: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isObject(condition)) {
    collector.addError(path, 'Condition must be an object');
    return;
  }

  if (!hasProperty(condition, 'source')) {
    collector.addError(`${path}.source`, 'Condition must have a "source" field');
  } else {
    validateConditionSource(condition['source'], `${path}.source`, collector);
  }

  if (!hasProperty(condition, 'operator')) {
    collector.addError(`${path}.operator`, 'Condition must have an "operator" field');
  } else {
    const operator = condition['operator'];
    if (typeof operator !== 'string') {
      collector.addError(`${path}.operator`, 'Condition operator must be a string');
    } else if (!(CONDITION_OPERATORS as readonly string[]).includes(operator)) {
      collector.addError(
        `${path}.operator`,
        `Invalid operator: ${operator}. Valid operators: ${CONDITION_OPERATORS.join(', ')}`,
      );
    }
  }

  const operator = condition['operator'];
  if (typeof operator === 'string' && !(UNARY_OPERATORS as readonly string[]).includes(operator)) {
    if (!hasProperty(condition, 'value')) {
      collector.addError(`${path}.value`, 'Condition must have a "value" field');
    } else {
      validateConditionValue(condition['value'], `${path}.value`, collector);
    }
  }
}

function validateConditionSource(
  source: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isObject(source)) {
    collector.addError(path, 'Condition source must be an object');
    return;
  }

  if (!hasProperty(source, 'type')) {
    collector.addError(`${path}.type`, 'Condition source must have a "type" field');
    return;
  }

  const type = source['type'];
  if (typeof type !== 'string') {
    collector.addError(`${path}.type`, 'Condition source type must be a string');
    return;
  }

  if (!(CONDITION_SOURCE_TYPES as readonly string[]).includes(type)) {
    collector.addError(
      `${path}.type`,
      `Invalid source type: ${type}. Valid types: ${CONDITION_SOURCE_TYPES.join(', ')}`,
    );
    return;
  }

  switch (type) {
    case 'fact':
      if (!hasProperty(source, 'pattern')) {
        collector.addError(`${path}.pattern`, 'Fact source must have a "pattern" field');
      } else if (typeof source['pattern'] !== 'string') {
        collector.addError(`${path}.pattern`, 'Fact source pattern must be a string');
      }
      break;
    case 'event':
      if (!hasProperty(source, 'field')) {
        collector.addError(`${path}.field`, 'Event source must have a "field" field');
      } else if (typeof source['field'] !== 'string') {
        collector.addError(`${path}.field`, 'Event source field must be a string');
      }
      break;
    case 'context':
      if (!hasProperty(source, 'key')) {
        collector.addError(`${path}.key`, 'Context source must have a "key" field');
      } else if (typeof source['key'] !== 'string') {
        collector.addError(`${path}.key`, 'Context source key must be a string');
      }
      break;
    case 'lookup':
      if (!hasProperty(source, 'name')) {
        collector.addError(`${path}.name`, 'Lookup source must have a "name" field');
      } else if (typeof source['name'] !== 'string') {
        collector.addError(`${path}.name`, 'Lookup source name must be a string');
      }
      if (hasProperty(source, 'field') && typeof source['field'] !== 'string') {
        collector.addError(`${path}.field`, 'Lookup source field must be a string');
      }
      break;
    case 'baseline':
      if (!hasProperty(source, 'metric')) {
        collector.addError(`${path}.metric`, 'Baseline source must have a "metric" field');
      } else if (typeof source['metric'] !== 'string') {
        collector.addError(`${path}.metric`, 'Baseline source metric must be a string');
      } else if (source['metric'].trim() === '') {
        collector.addError(`${path}.metric`, 'Baseline source metric cannot be empty');
      }
      if (!hasProperty(source, 'comparison')) {
        collector.addError(`${path}.comparison`, 'Baseline source must have a "comparison" field');
      } else if (typeof source['comparison'] !== 'string') {
        collector.addError(`${path}.comparison`, 'Baseline source comparison must be a string');
      } else if (!(BASELINE_COMPARISONS as readonly string[]).includes(source['comparison'])) {
        collector.addError(
          `${path}.comparison`,
          `Invalid baseline comparison: ${source['comparison']}. Valid comparisons: ${BASELINE_COMPARISONS.join(', ')}`,
        );
      }
      if (hasProperty(source, 'sensitivity')) {
        const sensitivity = source['sensitivity'];
        if (typeof sensitivity !== 'number' || !Number.isFinite(sensitivity) || sensitivity <= 0) {
          collector.addError(
            `${path}.sensitivity`,
            'Baseline source sensitivity must be a positive number',
          );
        }
      }
      break;
  }
}

function validateConditionValue(
  value: unknown,
  _path: string,
  collector: IssueCollector,
): void {
  if (isObject(value) && hasProperty(value, 'ref')) {
    const ref = value['ref'];
    if (typeof ref === 'string') {
      collector.usedAliases.add(ref);
    }
  }
}
