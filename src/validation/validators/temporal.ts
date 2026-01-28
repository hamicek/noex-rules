/**
 * Temporal pattern validation.
 *
 * @module
 */

import {
  TEMPORAL_PATTERN_TYPES,
  COMPARISONS,
  AGGREGATE_FUNCTIONS,
  isValidDuration,
} from '../constants.js';
import type { IssueCollector } from '../types.js';
import { isObject, hasProperty } from '../types.js';

export function validateTemporalPattern(
  pattern: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isObject(pattern)) {
    collector.addError(path, 'Temporal pattern must be an object');
    return;
  }

  if (!hasProperty(pattern, 'type')) {
    collector.addError(`${path}.type`, 'Temporal pattern must have a "type" field');
    return;
  }

  const type = pattern['type'];
  if (typeof type !== 'string') {
    collector.addError(`${path}.type`, 'Temporal pattern type must be a string');
    return;
  }

  if (!(TEMPORAL_PATTERN_TYPES as readonly string[]).includes(type)) {
    collector.addError(
      `${path}.type`,
      `Invalid temporal pattern type: ${type}. Valid types: ${TEMPORAL_PATTERN_TYPES.join(', ')}`,
    );
    return;
  }

  switch (type) {
    case 'sequence':
      validateSequencePattern(pattern, path, collector);
      break;
    case 'absence':
      validateAbsencePattern(pattern, path, collector);
      break;
    case 'count':
      validateCountPattern(pattern, path, collector);
      break;
    case 'aggregate':
      validateAggregatePattern(pattern, path, collector);
      break;
  }
}

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

function validateSequencePattern(
  pattern: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(pattern, 'events')) {
    collector.addError(`${path}.events`, 'Sequence pattern must have an "events" field');
  } else if (!Array.isArray(pattern['events'])) {
    collector.addError(`${path}.events`, 'Sequence pattern events must be an array');
  } else {
    const events = pattern['events'] as unknown[];
    if (events.length < 2) {
      collector.addError(`${path}.events`, 'Sequence pattern must have at least 2 events');
    }
    for (let i = 0; i < events.length; i++) {
      validateEventMatcher(events[i], `${path}.events[${i}]`, collector);
    }
  }

  validateTimeWindow(pattern, 'within', path, collector);
}

// ---------------------------------------------------------------------------
// Absence
// ---------------------------------------------------------------------------

function validateAbsencePattern(
  pattern: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(pattern, 'after')) {
    collector.addError(`${path}.after`, 'Absence pattern must have an "after" field');
  } else {
    validateEventMatcher(pattern['after'], `${path}.after`, collector);
  }

  if (!hasProperty(pattern, 'expected')) {
    collector.addError(`${path}.expected`, 'Absence pattern must have an "expected" field');
  } else {
    validateEventMatcher(pattern['expected'], `${path}.expected`, collector);
  }

  validateTimeWindow(pattern, 'within', path, collector);
}

// ---------------------------------------------------------------------------
// Count
// ---------------------------------------------------------------------------

function validateCountPattern(
  pattern: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(pattern, 'event')) {
    collector.addError(`${path}.event`, 'Count pattern must have an "event" field');
  } else {
    validateEventMatcher(pattern['event'], `${path}.event`, collector);
  }

  if (!hasProperty(pattern, 'threshold')) {
    collector.addError(`${path}.threshold`, 'Count pattern must have a "threshold" field');
  } else if (typeof pattern['threshold'] !== 'number' || pattern['threshold'] < 1) {
    collector.addError(`${path}.threshold`, 'Count pattern threshold must be a positive number');
  }

  if (hasProperty(pattern, 'comparison')) {
    const comparison = pattern['comparison'];
    if (
      typeof comparison !== 'string' ||
      !(COMPARISONS as readonly string[]).includes(comparison)
    ) {
      collector.addError(
        `${path}.comparison`,
        `Invalid comparison: ${String(comparison)}. Valid values: ${COMPARISONS.join(', ')}`,
      );
    }
  }

  validateTimeWindow(pattern, 'window', path, collector);
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

function validateAggregatePattern(
  pattern: Record<string, unknown>,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(pattern, 'event')) {
    collector.addError(`${path}.event`, 'Aggregate pattern must have an "event" field');
  } else {
    validateEventMatcher(pattern['event'], `${path}.event`, collector);
  }

  if (!hasProperty(pattern, 'field')) {
    collector.addError(`${path}.field`, 'Aggregate pattern must have a "field" field');
  } else if (typeof pattern['field'] !== 'string') {
    collector.addError(`${path}.field`, 'Aggregate pattern field must be a string');
  }

  if (!hasProperty(pattern, 'function')) {
    collector.addError(`${path}.function`, 'Aggregate pattern must have a "function" field');
  } else {
    const fn = pattern['function'];
    if (
      typeof fn !== 'string' ||
      !(AGGREGATE_FUNCTIONS as readonly string[]).includes(fn)
    ) {
      collector.addError(
        `${path}.function`,
        `Invalid aggregate function: ${String(fn)}. Valid values: ${AGGREGATE_FUNCTIONS.join(', ')}`,
      );
    }
  }

  if (!hasProperty(pattern, 'threshold')) {
    collector.addError(`${path}.threshold`, 'Aggregate pattern must have a "threshold" field');
  } else if (typeof pattern['threshold'] !== 'number') {
    collector.addError(`${path}.threshold`, 'Aggregate pattern threshold must be a number');
  }

  if (hasProperty(pattern, 'comparison')) {
    const comparison = pattern['comparison'];
    if (
      typeof comparison !== 'string' ||
      !(COMPARISONS as readonly string[]).includes(comparison)
    ) {
      collector.addError(
        `${path}.comparison`,
        `Invalid comparison: ${String(comparison)}. Valid values: ${COMPARISONS.join(', ')}`,
      );
    }
  }

  validateTimeWindow(pattern, 'window', path, collector);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateEventMatcher(
  matcher: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isObject(matcher)) {
    collector.addError(path, 'Event matcher must be an object');
    return;
  }

  if (!hasProperty(matcher, 'topic')) {
    collector.addError(`${path}.topic`, 'Event matcher must have a "topic" field');
  } else if (typeof matcher['topic'] !== 'string') {
    collector.addError(`${path}.topic`, 'Event matcher topic must be a string');
  }

  if (hasProperty(matcher, 'as')) {
    const alias = matcher['as'];
    if (typeof alias !== 'string') {
      collector.addError(`${path}.as`, 'Event matcher alias must be a string');
    } else {
      collector.definedAliases.add(alias);
    }
  }
}

function validateTimeWindow(
  obj: Record<string, unknown>,
  field: string,
  path: string,
  collector: IssueCollector,
): void {
  if (!hasProperty(obj, field)) {
    collector.addError(`${path}.${field}`, `Field "${field}" is required`);
    return;
  }

  const value = obj[field];
  if (typeof value !== 'string' && typeof value !== 'number') {
    collector.addError(
      `${path}.${field}`,
      `Field "${field}" must be a string (e.g., "5m") or number (milliseconds)`,
    );
    return;
  }

  if (typeof value === 'string' && !isValidDuration(value)) {
    collector.addError(
      `${path}.${field}`,
      `Invalid duration format: ${value}. Use formats like "5m", "1h", "7d"`,
    );
  }

  if (typeof value === 'number' && value <= 0) {
    collector.addError(`${path}.${field}`, 'Duration must be positive');
  }
}
