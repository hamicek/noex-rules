/**
 * Template builder and compiled template classes.
 *
 * The {@link TemplateBuilder} provides a fluent API for assembling parameterized
 * rule blueprints. The resulting {@link RuleTemplate} can be instantiated
 * multiple times with different parameter values to produce concrete
 * {@link RuleInput} objects.
 *
 * @module
 */

import type { RuleInput, RuleTrigger } from '../../types/rule.js';
import type { RuleCondition } from '../../types/condition.js';
import type { RuleAction } from '../../types/action.js';
import type {
  TriggerBuilder,
  ConditionBuilder,
  ActionBuilder,
} from '../types.js';
import type {
  TemplateParameterDef,
  TemplateParamType,
  TemplateParams,
  TemplateInstantiateOptions,
  TemplateBlueprintData,
  RuleTemplateDefinition,
} from './types.js';
import { isTemplateParam } from './param.js';
import { isRef } from '../helpers/ref.js';
import { substituteParams } from './substitution.js';
import { validateTemplateParams } from './validation.js';
import { TemplateInstantiationError } from './errors.js';
import { DslValidationError } from '../helpers/errors.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collects all template parameter names referenced in a value tree.
 * Skips functions (cannot statically inspect their bodies) and {@link Ref}
 * objects (runtime references, not template parameters).
 */
function collectParamNames(value: unknown, names: Set<string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'function') return;
  if (typeof value !== 'object') return;

  if (isTemplateParam(value)) {
    names.add(value.paramName);
    return;
  }

  if (isRef(value)) return;

  if (Array.isArray(value)) {
    for (const element of value) {
      collectParamNames(element, names);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    collectParamNames(obj[key], names);
  }
}

/**
 * Checks whether a value exposes a `build()` method (builder pattern).
 */
function hasBuild(value: unknown): value is { build(): unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'build' in value &&
    typeof (value as Record<string, unknown>)['build'] === 'function'
  );
}

/**
 * Applies default values for missing optional parameters without validation.
 * Used when {@link TemplateInstantiateOptions.skipValidation} is `true`.
 */
function applyDefaults(
  definitions: readonly TemplateParameterDef[],
  params: TemplateParams,
): TemplateParams {
  const merged: TemplateParams = { ...params };
  for (const def of definitions) {
    if (!(def.name in merged) && 'default' in def) {
      merged[def.name] = def.default;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// TemplateParamOptions
// ---------------------------------------------------------------------------

/**
 * Options for declaring a template parameter via {@link TemplateBuilder.param}.
 */
export interface TemplateParamOptions {
  /** Expected value type. Defaults to `'any'` (no type check) when omitted. */
  type?: TemplateParamType;

  /** Default value — makes the parameter optional during instantiation. */
  default?: unknown;

  /** Custom validation function. Returns an error message on failure. */
  validate?: (value: unknown) => string | undefined;

  /** Human-readable description (documentation only). */
  description?: string;
}

// ---------------------------------------------------------------------------
// TemplateBuilder
// ---------------------------------------------------------------------------

/**
 * Fluent builder for assembling parameterized rule templates.
 *
 * Mirrors the {@link RuleBuilder} API for defining rule structure (trigger,
 * conditions, actions) while adding template-specific methods for declaring
 * parameters and template metadata.
 *
 * Use {@link RuleTemplate.create} as the entry point.
 *
 * When defining triggers, conditions, or actions that contain {@link param}
 * markers, pass raw objects instead of using the DSL helper functions
 * (e.g. `onEvent`, `event`, `emit`) — those helpers validate their string
 * arguments eagerly and will reject param markers at definition time.
 *
 * @example
 * ```typescript
 * const template = RuleTemplate.create('threshold-alert')
 *   .templateName('Threshold Alert')
 *   .param('topic', { type: 'string' })
 *   .param('threshold', { type: 'number', default: 100 })
 *   .ruleId(p => `alert-${p.topic}`)
 *   .name(p => `Alert on ${p.topic}`)
 *   .priority(50)
 *   .when({ type: 'event', topic: param('topic') })
 *   .if({
 *     source: { type: 'event', field: param('field') },
 *     operator: 'gte',
 *     value: param('threshold'),
 *   })
 *   .then({
 *     type: 'emit_event',
 *     topic: 'alert.triggered',
 *     data: { source: param('topic') },
 *   })
 *   .build();
 * ```
 */
export class TemplateBuilder {
  private readonly _templateId: string;
  private _templateName?: string;
  private _templateDescription?: string;
  private _templateVersion?: string;
  private _templateTags?: string[];
  private readonly _parameters: TemplateParameterDef[] = [];
  private readonly _declaredNames = new Set<string>();
  private readonly _blueprint: TemplateBlueprintData;

  /** @internal Use {@link RuleTemplate.create} instead. */
  constructor(templateId: string) {
    if (!templateId || typeof templateId !== 'string') {
      throw new DslValidationError('Template ID must be a non-empty string');
    }
    this._templateId = templateId;
    this._blueprint = {
      id: templateId,
      tags: [],
      conditions: [],
      actions: [],
    };
  }

  // --- Template metadata -----------------------------------------------

  /** Sets a human-readable name for the template itself. */
  templateName(value: string): this {
    this._templateName = value;
    return this;
  }

  /** Sets a description for the template. */
  templateDescription(value: string): this {
    this._templateDescription = value;
    return this;
  }

  /** Sets a semantic version string for the template (e.g. `"1.0.0"`). */
  templateVersion(value: string): this {
    this._templateVersion = value;
    return this;
  }

  /** Appends one or more tags for categorizing/filtering templates. */
  templateTags(...values: string[]): this {
    this._templateTags = [...(this._templateTags ?? []), ...values];
    return this;
  }

  // --- Parameter declarations ------------------------------------------

  /**
   * Declares a template parameter.
   *
   * @param name - Unique parameter name.
   * @param options - Optional type, default, validator, and description.
   * @throws {DslValidationError} If `name` is empty or already declared.
   */
  param(name: string, options?: TemplateParamOptions): this {
    if (!name || typeof name !== 'string') {
      throw new DslValidationError('Parameter name must be a non-empty string');
    }
    if (this._declaredNames.has(name)) {
      throw new DslValidationError(`Duplicate parameter declaration: "${name}"`);
    }
    this._declaredNames.add(name);

    const def: TemplateParameterDef = { name };
    if (options?.type !== undefined) def.type = options.type;
    if (options != null && 'default' in options) def.default = options.default;
    if (options?.validate) def.validate = options.validate;
    if (options?.description) def.description = options.description;
    this._parameters.push(def);
    return this;
  }

  // --- Rule blueprint --------------------------------------------------

  /**
   * Sets the rule ID pattern — a static string or a function that
   * computes the ID from the instantiation parameters.
   */
  ruleId(value: string | ((params: TemplateParams) => string)): this {
    this._blueprint.id = value;
    return this;
  }

  /**
   * Sets the rule name — a static string or a function that computes
   * the name from the instantiation parameters.
   */
  name(value: string | ((params: TemplateParams) => string)): this {
    this._blueprint.name = value;
    return this;
  }

  /** Sets an optional description for the instantiated rules. */
  description(value: string): this {
    this._blueprint.description = value;
    return this;
  }

  /**
   * Sets the evaluation priority for instantiated rules.
   * @throws {DslValidationError} If `value` is not a finite number.
   */
  priority(value: number): this {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DslValidationError('Priority must be a finite number');
    }
    this._blueprint.priority = value;
    return this;
  }

  /** Enables or disables instantiated rules. */
  enabled(value: boolean): this {
    this._blueprint.enabled = value;
    return this;
  }

  /** Appends one or more tags to the instantiated rules. */
  tags(...values: string[]): this {
    this._blueprint.tags.push(...values);
    return this;
  }

  /**
   * Sets the trigger for instantiated rules.
   *
   * Accepts a {@link TriggerBuilder} (which is `.build()`-ed immediately)
   * or a raw trigger object (which may contain {@link param} markers).
   */
  when(trigger: TriggerBuilder | RuleTrigger): this {
    this._blueprint.trigger = hasBuild(trigger) ? trigger.build() : trigger;
    return this;
  }

  /**
   * Adds a condition for instantiated rules.
   *
   * Accepts a {@link ConditionBuilder} or a raw condition object
   * (which may contain {@link param} markers).
   */
  if(condition: ConditionBuilder | RuleCondition): this {
    const built = hasBuild(condition) ? condition.build() : condition;
    this._blueprint.conditions.push(built);
    return this;
  }

  /** Alias for {@link TemplateBuilder.if} — adds another condition (logical AND). */
  and(condition: ConditionBuilder | RuleCondition): this {
    return this.if(condition);
  }

  /**
   * Adds an action for instantiated rules.
   *
   * Accepts an {@link ActionBuilder} or a raw action object
   * (which may contain {@link param} markers).
   */
  then(action: ActionBuilder | RuleAction): this {
    const built = hasBuild(action) ? action.build() : action;
    this._blueprint.actions.push(built);
    return this;
  }

  /** Alias for {@link TemplateBuilder.then} — adds another action. */
  also(action: ActionBuilder | RuleAction): this {
    return this.then(action);
  }

  // --- Build -----------------------------------------------------------

  /**
   * Validates the accumulated state and produces a compiled {@link RuleTemplate}.
   *
   * Build-time checks:
   * - Trigger is required.
   * - At least one action is required.
   * - All {@link param} markers in the blueprint must reference declared parameters.
   *
   * @throws {DslValidationError} If any build-time check fails.
   */
  build(): RuleTemplate {
    if (!this._blueprint.trigger) {
      throw new DslValidationError(
        `Template "${this._templateId}": trigger is required. Use .when()`,
      );
    }

    if (this._blueprint.actions.length === 0) {
      throw new DslValidationError(
        `Template "${this._templateId}": at least one action is required. Use .then()`,
      );
    }

    // Collect all param names referenced in the blueprint's value tree.
    const referenced = new Set<string>();
    collectParamNames(this._blueprint.trigger, referenced);
    for (const c of this._blueprint.conditions) collectParamNames(c, referenced);
    for (const a of this._blueprint.actions) collectParamNames(a, referenced);
    if (typeof this._blueprint.id !== 'function') {
      collectParamNames(this._blueprint.id, referenced);
    }
    if (this._blueprint.name != null && typeof this._blueprint.name !== 'function') {
      collectParamNames(this._blueprint.name, referenced);
    }

    const undeclared: string[] = [];
    for (const name of referenced) {
      if (!this._declaredNames.has(name)) {
        undeclared.push(name);
      }
    }
    if (undeclared.length > 0) {
      undeclared.sort();
      throw new DslValidationError(
        `Template "${this._templateId}": blueprint references undeclared parameter${undeclared.length > 1 ? 's' : ''}: ${undeclared.map(n => `"${n}"`).join(', ')}`,
      );
    }

    // Snapshot the definition — detached from the builder's mutable state.
    const definition: RuleTemplateDefinition = {
      templateId: this._templateId,
      parameters: [...this._parameters],
      blueprint: {
        ...this._blueprint,
        tags: [...this._blueprint.tags],
        conditions: [...this._blueprint.conditions],
        actions: [...this._blueprint.actions],
      },
    };

    if (this._templateName != null) definition.templateName = this._templateName;
    if (this._templateDescription != null) definition.templateDescription = this._templateDescription;
    if (this._templateVersion != null) definition.templateVersion = this._templateVersion;
    if (this._templateTags != null) definition.templateTags = [...this._templateTags];

    return new RuleTemplate(definition);
  }
}

// ---------------------------------------------------------------------------
// RuleTemplate
// ---------------------------------------------------------------------------

/**
 * A compiled, immutable rule template that can be instantiated with
 * parameter values to produce concrete {@link RuleInput} objects.
 *
 * Obtain instances via {@link RuleTemplate.create} (returns a
 * {@link TemplateBuilder}) followed by `.build()`.
 *
 * @example
 * ```typescript
 * const template = RuleTemplate.create('my-template')
 *   .param('topic', { type: 'string' })
 *   .ruleId(p => `rule-${p.topic}`)
 *   .when({ type: 'event', topic: param('topic') })
 *   .then({ type: 'emit_event', topic: 'alerts', data: { src: param('topic') } })
 *   .build();
 *
 * const rule = template.instantiate({ topic: 'orders' });
 * ```
 */
export class RuleTemplate {
  /** The complete, immutable template definition. */
  readonly definition: RuleTemplateDefinition;

  constructor(definition: RuleTemplateDefinition) {
    this.definition = definition;
  }

  /**
   * Entry point for creating a new template via the fluent builder API.
   *
   * @param templateId - Unique template identifier.
   * @returns A fresh {@link TemplateBuilder} instance.
   */
  static create(templateId: string): TemplateBuilder {
    return new TemplateBuilder(templateId);
  }

  /**
   * Instantiates the template with the given parameters, producing a
   * concrete {@link RuleInput} ready for engine registration.
   *
   * @param params - Parameter name–value pairs.
   * @param options - Optional instantiation behaviour overrides.
   * @returns A fully resolved {@link RuleInput}.
   * @throws {TemplateValidationError} If parameter validation fails.
   * @throws {TemplateInstantiationError} If a param marker references
   *   a missing parameter or the resolved rule ID is invalid.
   */
  instantiate(params: TemplateParams, options?: TemplateInstantiateOptions): RuleInput {
    const mergedParams = options?.skipValidation
      ? applyDefaults(this.definition.parameters, params)
      : validateTemplateParams(this.definition.parameters, params);

    // Deep-substitute the entire blueprint.
    // substituteParams handles: param markers → values, functions → invoked,
    // refs → preserved, arrays/objects → deep-cloned with substitution.
    const resolved = substituteParams(
      this.definition.blueprint,
      mergedParams,
    ) as Record<string, unknown>;

    const id = resolved['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new TemplateInstantiationError(
        `Template "${this.definition.templateId}": resolved rule ID must be a non-empty string, got ${JSON.stringify(id)}`,
      );
    }

    const resolvedName = resolved['name'];
    const name = typeof resolvedName === 'string' ? resolvedName : id;

    const rule: RuleInput = {
      id,
      name,
      priority: (resolved['priority'] as number) ?? 0,
      enabled: (resolved['enabled'] as boolean) ?? true,
      tags: (resolved['tags'] as string[]) ?? [],
      trigger: resolved['trigger'] as RuleInput['trigger'],
      conditions: (resolved['conditions'] as RuleInput['conditions']) ?? [],
      actions: resolved['actions'] as RuleInput['actions'],
    };

    if (resolved['description'] != null) {
      rule.description = resolved['description'] as string;
    }

    return rule;
  }
}
