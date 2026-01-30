/**
 * Lookup validation.
 *
 * Validates the optional `lookups` array on a rule input — each lookup must
 * declare a unique name, a service, a method, and optionally args, cache and
 * onError strategy.
 *
 * @module
 */

import { isValidDuration } from '../constants.js';
import type { IssueCollector } from '../types.js';
import { isObject, hasProperty } from '../types.js';

const LOOKUP_ERROR_STRATEGIES = ['skip', 'fail'] as const;

export function validateLookups(
  lookups: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!Array.isArray(lookups)) {
    collector.addError(path, 'Lookups must be an array');
    return;
  }

  const names = new Set<string>();

  for (let i = 0; i < lookups.length; i++) {
    validateLookup(lookups[i], `${path}[${i}]`, collector, names);
  }
}

function validateLookup(
  lookup: unknown,
  path: string,
  collector: IssueCollector,
  names: Set<string>,
): void {
  if (!isObject(lookup)) {
    collector.addError(path, 'Lookup must be an object');
    return;
  }

  // name — required, non-empty string, unique
  if (!hasProperty(lookup, 'name')) {
    collector.addError(`${path}.name`, 'Lookup must have a "name" field');
  } else if (typeof lookup['name'] !== 'string') {
    collector.addError(`${path}.name`, 'Lookup name must be a string');
  } else if (lookup['name'].trim() === '') {
    collector.addError(`${path}.name`, 'Lookup name cannot be empty');
  } else {
    const name = lookup['name'];
    if (names.has(name)) {
      collector.addError(`${path}.name`, `Duplicate lookup name: ${name}`);
    } else {
      names.add(name);
    }
  }

  // service — required, non-empty string
  if (!hasProperty(lookup, 'service')) {
    collector.addError(`${path}.service`, 'Lookup must have a "service" field');
  } else if (typeof lookup['service'] !== 'string') {
    collector.addError(`${path}.service`, 'Lookup service must be a string');
  } else if (lookup['service'].trim() === '') {
    collector.addError(`${path}.service`, 'Lookup service cannot be empty');
  }

  // method — required, non-empty string
  if (!hasProperty(lookup, 'method')) {
    collector.addError(`${path}.method`, 'Lookup must have a "method" field');
  } else if (typeof lookup['method'] !== 'string') {
    collector.addError(`${path}.method`, 'Lookup method must be a string');
  } else if (lookup['method'].trim() === '') {
    collector.addError(`${path}.method`, 'Lookup method cannot be empty');
  }

  // args — optional, must be array
  if (hasProperty(lookup, 'args') && !Array.isArray(lookup['args'])) {
    collector.addError(`${path}.args`, 'Lookup args must be an array');
  }

  // cache — optional object with ttl
  if (hasProperty(lookup, 'cache')) {
    validateLookupCache(lookup['cache'], `${path}.cache`, collector);
  }

  // onError — optional, must be 'skip' or 'fail'
  if (hasProperty(lookup, 'onError')) {
    const onError = lookup['onError'];
    if (typeof onError !== 'string') {
      collector.addError(`${path}.onError`, 'Lookup onError must be a string');
    } else if (!(LOOKUP_ERROR_STRATEGIES as readonly string[]).includes(onError)) {
      collector.addError(
        `${path}.onError`,
        `Invalid onError strategy: ${onError}. Valid strategies: ${LOOKUP_ERROR_STRATEGIES.join(', ')}`,
      );
    }
  }
}

function validateLookupCache(
  cache: unknown,
  path: string,
  collector: IssueCollector,
): void {
  if (!isObject(cache)) {
    collector.addError(path, 'Lookup cache must be an object');
    return;
  }

  if (!hasProperty(cache, 'ttl')) {
    collector.addError(`${path}.ttl`, 'Lookup cache must have a "ttl" field');
    return;
  }

  const ttl = cache['ttl'];
  if (typeof ttl === 'number') {
    if (ttl <= 0 || !Number.isFinite(ttl)) {
      collector.addError(`${path}.ttl`, 'Lookup cache ttl must be a positive number');
    }
  } else if (typeof ttl === 'string') {
    if (!isValidDuration(ttl)) {
      collector.addError(
        `${path}.ttl`,
        `Invalid cache ttl duration: ${ttl}. Use a duration like "5m", "1h", "30s" or milliseconds`,
      );
    }
  } else {
    collector.addError(`${path}.ttl`, 'Lookup cache ttl must be a string or number');
  }
}
