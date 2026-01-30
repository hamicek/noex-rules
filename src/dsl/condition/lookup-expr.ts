import { SourceExpr } from './operators.js';
import { requireNonEmptyString } from '../helpers/validators.js';
import { DslValidationError } from '../helpers/errors.js';

/**
 * Creates a {@link SourceExpr} targeting a resolved external lookup result.
 *
 * Supports plain lookup names and dot-notated field access:
 * - `lookup('credit')` → `{ type: 'lookup', name: 'credit' }`
 * - `lookup('fraud.riskLevel')` → `{ type: 'lookup', name: 'fraud', field: 'riskLevel' }`
 *
 * @param nameAndField - Lookup name, optionally followed by a dot-notated field path.
 * @returns A {@link SourceExpr} ready for operator chaining.
 *
 * @example
 * lookup('credit').gte(700)
 * lookup('fraud.riskLevel').neq('high')
 */
export function lookup(nameAndField: string): SourceExpr {
  requireNonEmptyString(nameAndField, 'lookup() nameAndField');

  const dotIndex = nameAndField.indexOf('.');
  if (dotIndex === -1) {
    return new SourceExpr({ type: 'lookup', name: nameAndField });
  }

  const name = nameAndField.substring(0, dotIndex);
  const field = nameAndField.substring(dotIndex + 1);

  if (name.length === 0) {
    throw new DslValidationError('lookup() name part must not be empty');
  }
  if (field.length === 0) {
    throw new DslValidationError('lookup() field part must not be empty');
  }

  return new SourceExpr({ type: 'lookup', name, field });
}
