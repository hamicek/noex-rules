/**
 * Error thrown when rule validation fails.
 *
 * Compatible with the API error handler (`statusCode` + `code` pattern).
 *
 * @module
 */

import type { ValidationIssue } from './types.js';

export class RuleValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'RULE_VALIDATION_ERROR';
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = 'RuleValidationError';
    this.issues = issues;
  }

  /** Exposes issues as `details` for the API error handler. */
  get details(): ValidationIssue[] {
    return this.issues;
  }
}
