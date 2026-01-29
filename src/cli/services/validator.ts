/**
 * Validační služba pro CLI.
 * Thin wrapper nad sdíleným validačním modulem (`src/validation/`).
 */

import {
  RuleInputValidator,
  type ValidationResult,
} from '../../validation/index.js';

/** Options pro validátor */
export interface ValidatorOptions {
  /** Strict mode - kontroluje nepoužité proměnné a další best practices */
  strict: boolean;
}

export type { ValidationResult };

/**
 * Validátor pravidel.
 * Deleguje na sdílený {@link RuleInputValidator}.
 */
export class RuleValidator {
  private readonly validator: RuleInputValidator;

  constructor(options: Partial<ValidatorOptions> = {}) {
    this.validator = new RuleInputValidator({ strict: options.strict ?? false });
  }

  /**
   * Validuje jedno pravidlo.
   */
  validate(rule: unknown): ValidationResult {
    return this.validator.validate(rule);
  }

  /**
   * Validuje pole pravidel.
   */
  validateMany(rules: unknown): ValidationResult {
    return this.validator.validateMany(rules);
  }
}

/**
 * Vytvoří instanci validátoru s výchozím nastavením.
 */
export function createValidator(options?: Partial<ValidatorOptions>): RuleValidator {
  return new RuleValidator(options);
}
