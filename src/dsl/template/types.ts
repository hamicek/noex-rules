/**
 * Type definitions for the rule template system.
 *
 * Templates are parameterized rule blueprints that produce concrete
 * {@link RuleInput} objects when instantiated with specific parameter values.
 *
 * @module
 */

import type { RuleCondition } from '../../types/condition.js';
import type { RuleAction } from '../../types/action.js';
import type { RuleTrigger } from '../../types/rule.js';

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

/**
 * Supported primitive types for template parameters.
 *
 * Used for runtime type checking during parameter validation:
 * - `string`, `number`, `boolean` — checked via `typeof`
 * - `object` — non-null, non-array object
 * - `array` — checked via `Array.isArray`
 * - `any` — skips type checking entirely
 */
export type TemplateParamType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

/**
 * Definition of a single template parameter.
 *
 * Declared via {@link TemplateBuilder.param} and used during instantiation
 * to validate and apply default values.
 *
 * @example
 * ```typescript
 * const def: TemplateParameterDef = {
 *   name: 'threshold',
 *   type: 'number',
 *   default: 100,
 *   description: 'Alert threshold value',
 * };
 * ```
 */
export interface TemplateParameterDef {
  /** Unique parameter name (used as the key in the params object). */
  name: string;

  /**
   * Expected value type. When omitted, defaults to `'any'` (no type check).
   */
  type?: TemplateParamType;

  /**
   * Default value applied when the parameter is not provided during
   * instantiation. A parameter with a default is implicitly optional.
   */
  default?: unknown;

  /**
   * Custom validation function invoked after type checking.
   * Returns an error message string on failure, or `undefined` on success.
   */
  validate?: (value: unknown) => string | undefined;

  /** Human-readable description of the parameter (documentation only). */
  description?: string;
}

// ---------------------------------------------------------------------------
// Template param marker
// ---------------------------------------------------------------------------

/**
 * Compile-time marker embedded in template blueprints as a placeholder
 * for a declared parameter.
 *
 * Created by the {@link param} factory function and replaced with actual
 * values during template instantiation. Distinguished from runtime
 * {@link Ref} objects by the `__templateParam` brand key.
 */
export interface TemplateParamMarker {
  readonly __templateParam: true;
  readonly paramName: string;
}

// ---------------------------------------------------------------------------
// Template instantiation
// ---------------------------------------------------------------------------

/**
 * Record of parameter name–value pairs passed to
 * {@link RuleTemplate.instantiate}.
 */
export type TemplateParams = Record<string, unknown>;

/**
 * Options controlling template instantiation behaviour.
 */
export interface TemplateInstantiateOptions {
  /**
   * When `true`, skips parameter validation (required checks, type checks,
   * custom validators). Useful for advanced scenarios where params have
   * already been validated externally.
   */
  skipValidation?: boolean;
}

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------

/**
 * Internal rule blueprint accumulated by the template builder.
 *
 * Mirrors the shape of a rule definition but allows {@link TemplateParamMarker}
 * placeholders and function-based computed fields (for `id` and `name`)
 * anywhere in the value tree.
 *
 * The substitution engine deep-walks this structure at instantiation time,
 * replacing markers and invoking functions to produce a concrete rule.
 */
export interface TemplateBlueprintData {
  /** Rule ID — static string or function computing the ID from params. */
  id: string | ((params: TemplateParams) => string);

  /** Rule name — static string or function computing the name from params. */
  name?: string | ((params: TemplateParams) => string);

  description?: string;
  priority?: number;
  enabled?: boolean;
  tags: string[];

  /**
   * Trigger definition. Typed as `unknown` because it may contain
   * deeply nested {@link TemplateParamMarker} objects that violate the
   * strict {@link RuleTrigger} shape until substitution resolves them.
   */
  trigger?: unknown;

  /** Condition definitions (may contain param markers). */
  conditions: unknown[];

  /** Action definitions (may contain param markers). */
  actions: unknown[];
}

// ---------------------------------------------------------------------------
// Template definition
// ---------------------------------------------------------------------------

/**
 * Complete, immutable template definition produced by
 * {@link TemplateBuilder.build}.
 *
 * Contains template metadata, declared parameters, and the rule blueprint.
 * Consumed by {@link RuleTemplate} to instantiate concrete rules.
 */
export interface RuleTemplateDefinition {
  /** Unique identifier for the template. */
  templateId: string;

  /** Human-readable template name. */
  templateName?: string;

  /** Optional description of the template's purpose. */
  templateDescription?: string;

  /** Semantic version string (e.g. `"1.0.0"`). */
  templateVersion?: string;

  /** Tags for categorizing/filtering templates. */
  templateTags?: string[];

  /** Declared parameters with their definitions. */
  parameters: TemplateParameterDef[];

  /** The rule blueprint containing param markers and computed fields. */
  blueprint: TemplateBlueprintData;
}
