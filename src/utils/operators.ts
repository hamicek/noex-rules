import type { RuleCondition } from '../types/condition.js';

/** Cache pro RegExp objekty v matches operátoru */
const matchesRegexCache = new Map<string, RegExp>();

/**
 * Vyčistí cache regex objektů. Užitečné pro testy.
 */
export function clearMatchesCache(): void {
  matchesRegexCache.clear();
}

/**
 * Vyhodnotí podmínku s danou hodnotou.
 */
export function evaluateCondition(
  condition: RuleCondition,
  value: unknown,
  compareValue: unknown
): boolean {
  switch (condition.operator) {
    case 'eq':
      return value === compareValue;

    case 'neq':
      return value !== compareValue;

    case 'gt':
      return typeof value === 'number' && typeof compareValue === 'number' && value > compareValue;

    case 'gte':
      return typeof value === 'number' && typeof compareValue === 'number' && value >= compareValue;

    case 'lt':
      return typeof value === 'number' && typeof compareValue === 'number' && value < compareValue;

    case 'lte':
      return typeof value === 'number' && typeof compareValue === 'number' && value <= compareValue;

    case 'in':
      return Array.isArray(compareValue) && compareValue.includes(value);

    case 'not_in':
      return Array.isArray(compareValue) && !compareValue.includes(value);

    case 'contains':
      if (typeof value === 'string' && typeof compareValue === 'string') {
        return value.includes(compareValue);
      }
      if (Array.isArray(value)) {
        return value.includes(compareValue);
      }
      return false;

    case 'not_contains':
      if (typeof value === 'string' && typeof compareValue === 'string') {
        return !value.includes(compareValue);
      }
      if (Array.isArray(value)) {
        return !value.includes(compareValue);
      }
      return true;

    case 'matches':
      if (typeof value === 'string' && typeof compareValue === 'string') {
        let regex = matchesRegexCache.get(compareValue);
        if (!regex) {
          try {
            regex = new RegExp(compareValue);
            matchesRegexCache.set(compareValue, regex);
          } catch {
            return false;
          }
        }
        return regex.test(value);
      }
      return false;

    case 'exists':
      return value !== undefined && value !== null;

    case 'not_exists':
      return value === undefined || value === null;

    default:
      return false;
  }
}
