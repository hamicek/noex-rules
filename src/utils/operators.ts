import type { RuleCondition } from '../types/condition.js';

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
        try {
          const regex = new RegExp(compareValue);
          return regex.test(value);
        } catch {
          return false;
        }
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
