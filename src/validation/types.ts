/**
 * Validation types and internal utilities.
 *
 * @module
 */

/** Single validation issue (error or warning). */
export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/** Result of a validation run. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Internal helper for accumulating validation issues.
 *
 * Sub-validators receive an instance and call {@link addError}/{@link addWarning}.
 * Alias tracking (`definedAliases` / `usedAliases`) is used by temporal and
 * condition/action validators so the orchestrator can detect unused aliases.
 */
export class IssueCollector {
  private readonly _errors: ValidationIssue[] = [];
  private readonly _warnings: ValidationIssue[] = [];

  readonly definedAliases = new Set<string>();
  readonly usedAliases = new Set<string>();

  addError(path: string, message: string): void {
    this._errors.push({ path: path || '(root)', message, severity: 'error' });
  }

  addWarning(path: string, message: string): void {
    this._warnings.push({ path: path || '(root)', message, severity: 'warning' });
  }

  clearAliases(): void {
    this.definedAliases.clear();
    this.usedAliases.clear();
  }

  toResult(): ValidationResult {
    return {
      valid: this._errors.length === 0,
      errors: [...this._errors],
      warnings: [...this._warnings],
    };
  }
}

/** Type guard: value is a non-null, non-array object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks whether `obj` has a given property (non-null, non-array object check included). */
export function hasProperty(obj: unknown, prop: string): boolean {
  return isObject(obj) && prop in obj;
}
