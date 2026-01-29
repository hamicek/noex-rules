/**
 * Main rule input validator.
 *
 * Validates one or many rule inputs and returns all issues (errors + warnings)
 * rather than throwing on the first problem.  Logic is extracted from the CLI
 * `RuleValidator` which was the most complete implementation.
 *
 * @module
 */

import { IssueCollector, isObject, hasProperty } from './types.js';
import type { ValidationResult } from './types.js';
import { validateTrigger } from './validators/trigger.js';
import { validateConditions } from './validators/condition.js';
import { validateActions } from './validators/action.js';

/** Options for {@link RuleInputValidator}. */
export interface ValidatorOptions {
  /** When true, reports unused aliases as warnings. */
  strict?: boolean;
}

type RuleRecord = Record<string, unknown>;

/**
 * Validates rule inputs against the expected schema.
 *
 * ```ts
 * const v = new RuleInputValidator();
 * const result = v.validate(unknownInput);
 * if (!result.valid) { … }
 * ```
 */
export class RuleInputValidator {
  private readonly strict: boolean;

  constructor(options: ValidatorOptions = {}) {
    this.strict = options.strict ?? false;
  }

  /** Validates a single rule input. */
  validate(input: unknown): ValidationResult {
    const collector = new IssueCollector();

    if (!isObject(input)) {
      collector.addError('', 'Rule must be an object');
      return collector.toResult();
    }

    this.validateRule(input, '', collector);
    return collector.toResult();
  }

  /** Validates an array of rule inputs, including duplicate-ID detection. */
  validateMany(inputs: unknown): ValidationResult {
    const collector = new IssueCollector();

    if (!Array.isArray(inputs)) {
      collector.addError('', 'Input must be an array of rules');
      return collector.toResult();
    }

    const ids = new Set<string>();

    for (let i = 0; i < inputs.length; i++) {
      const rule = inputs[i];
      const prefix = `[${i}]`;

      if (!isObject(rule)) {
        collector.addError(prefix, 'Rule must be an object');
        continue;
      }

      if (hasProperty(rule, 'id') && typeof rule['id'] === 'string') {
        const id = rule['id'];
        if (ids.has(id)) {
          collector.addError(`${prefix}.id`, `Duplicate rule ID: ${id}`);
        } else {
          ids.add(id);
        }
      }

      collector.clearAliases();
      this.validateRule(rule, prefix, collector);
    }

    return collector.toResult();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private validateRule(rule: RuleRecord, prefix: string, collector: IssueCollector): void {
    this.validateRequiredFields(rule, prefix, collector);
    this.validateOptionalFields(rule, prefix, collector);

    if (hasProperty(rule, 'trigger')) {
      validateTrigger(rule['trigger'], this.fieldPath(prefix, 'trigger'), collector);
    }

    if (hasProperty(rule, 'conditions')) {
      validateConditions(rule['conditions'], this.fieldPath(prefix, 'conditions'), collector);
    }

    if (hasProperty(rule, 'actions')) {
      validateActions(rule['actions'], this.fieldPath(prefix, 'actions'), collector);
    }

    if (this.strict) {
      this.checkUnusedAliases(prefix, collector);
    }
  }

  private validateRequiredFields(
    rule: RuleRecord,
    prefix: string,
    collector: IssueCollector,
  ): void {
    if (!hasProperty(rule, 'id')) {
      collector.addError(this.fieldPath(prefix, 'id'), 'Required field "id" is missing');
    } else if (typeof rule['id'] !== 'string') {
      collector.addError(this.fieldPath(prefix, 'id'), 'Field "id" must be a string');
    } else if (rule['id'].trim() === '') {
      collector.addError(this.fieldPath(prefix, 'id'), 'Field "id" cannot be empty');
    }

    if (!hasProperty(rule, 'name')) {
      collector.addError(this.fieldPath(prefix, 'name'), 'Required field "name" is missing');
    } else if (typeof rule['name'] !== 'string') {
      collector.addError(this.fieldPath(prefix, 'name'), 'Field "name" must be a string');
    } else if (rule['name'].trim() === '') {
      collector.addError(this.fieldPath(prefix, 'name'), 'Field "name" cannot be empty');
    }

    if (!hasProperty(rule, 'trigger')) {
      collector.addError(this.fieldPath(prefix, 'trigger'), 'Required field "trigger" is missing');
    }
  }

  private validateOptionalFields(
    rule: RuleRecord,
    prefix: string,
    collector: IssueCollector,
  ): void {
    if (hasProperty(rule, 'description') && typeof rule['description'] !== 'string') {
      collector.addError(
        this.fieldPath(prefix, 'description'),
        'Field "description" must be a string',
      );
    }

    if (hasProperty(rule, 'priority')) {
      if (typeof rule['priority'] !== 'number') {
        collector.addError(
          this.fieldPath(prefix, 'priority'),
          'Field "priority" must be a number',
        );
      } else if (!Number.isInteger(rule['priority'])) {
        collector.addWarning(
          this.fieldPath(prefix, 'priority'),
          'Field "priority" should be an integer',
        );
      }
    }

    if (hasProperty(rule, 'enabled') && typeof rule['enabled'] !== 'boolean') {
      collector.addError(
        this.fieldPath(prefix, 'enabled'),
        'Field "enabled" must be a boolean',
      );
    }

    if (hasProperty(rule, 'tags')) {
      const tags = rule['tags'];
      if (!Array.isArray(tags)) {
        collector.addError(this.fieldPath(prefix, 'tags'), 'Field "tags" must be an array');
      } else {
        for (let i = 0; i < tags.length; i++) {
          if (typeof tags[i] !== 'string') {
            collector.addError(this.fieldPath(prefix, `tags[${i}]`), 'Tag must be a string');
          }
        }
      }
    }

    if (hasProperty(rule, 'group')) {
      if (typeof rule['group'] !== 'string') {
        collector.addError(this.fieldPath(prefix, 'group'), 'Field "group" must be a string');
      } else if (rule['group'].trim() === '') {
        collector.addError(this.fieldPath(prefix, 'group'), 'Field "group" cannot be empty');
      }
    }
  }

  private checkUnusedAliases(prefix: string, collector: IssueCollector): void {
    for (const alias of collector.definedAliases) {
      if (!collector.usedAliases.has(alias)) {
        collector.addWarning(
          this.fieldPath(prefix, 'trigger'),
          `Alias "${alias}" is defined but never used`,
        );
      }
    }
  }

  private fieldPath(prefix: string, field: string): string {
    return prefix ? `${prefix}.${field}` : field;
  }
}
