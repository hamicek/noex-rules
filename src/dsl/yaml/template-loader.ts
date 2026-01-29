/**
 * YAML loader for rule template definitions.
 *
 * Parses YAML files with a `template` top-level key and produces compiled
 * {@link RuleTemplate} instances. Template parameter placeholders use the
 * `{{paramName}}` syntax:
 *
 * - **Exact match** (`"{{topic}}"`) → {@link TemplateParamMarker}
 * - **Mixed string** (`"alert-{{topic}}"`) → interpolation function
 *   invoked at instantiation time
 *
 * Runtime references (`${path}` or `{ ref: path }`) are preserved for
 * rule evaluation — they are not template parameters.
 *
 * @example
 * ```typescript
 * import { loadTemplateFromYAML, loadTemplateFromFile } from 'noex-rules/dsl';
 *
 * const template = loadTemplateFromYAML(`
 *   template:
 *     templateId: threshold-alert
 *     name: Threshold Alert
 *     parameters:
 *       - name: topic
 *         type: string
 *       - name: threshold
 *         type: number
 *         default: 100
 *     blueprint:
 *       id: "alert-{{topic}}"
 *       name: "Alert on {{topic}}"
 *       trigger:
 *         type: event
 *         topic: "{{topic}}"
 *       conditions:
 *         - source: { type: event, field: value }
 *           operator: gte
 *           value: "{{threshold}}"
 *       actions:
 *         - type: emit_event
 *           topic: alert.triggered
 *           data: { source: "{{topic}}" }
 * `);
 *
 * const rule = template.instantiate({ topic: 'metrics.cpu', threshold: 90 });
 * ```
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import type {
  TemplateParameterDef,
  TemplateParamType,
  TemplateParamMarker,
  TemplateParams,
  TemplateBlueprintData,
  RuleTemplateDefinition,
} from '../template/types.js';
import { RuleTemplate } from '../template/template-builder.js';
import { YamlLoadError } from './loader.js';
import { normalizeValue } from './schema.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches an exact `{{paramName}}` string (entire value). */
const EXACT_PARAM_RE = /^\{\{(\w+)\}\}$/;

/** Detects whether a string contains at least one `{{paramName}}` placeholder. */
const HAS_PARAM_RE = /\{\{\w+\}\}/;

/** Global variant for `String.prototype.replace` — replaces all occurrences. */
const PARAM_REPLACE_RE = /\{\{(\w+)\}\}/g;

const VALID_PARAM_TYPES: ReadonlySet<string> = new Set([
  'string', 'number', 'boolean', 'object', 'array', 'any',
]);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Checks whether a parsed YAML value represents a template definition
 * (has a `template` top-level key).
 *
 * Useful for distinguishing template YAML from plain rule YAML before
 * choosing which loader to invoke.
 *
 * @param parsed - The value returned by `yaml.parse()` (or equivalent).
 * @returns `true` if `parsed` is a non-array object with a `template` key.
 */
export function isTemplateYAML(parsed: unknown): boolean {
  return (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'template' in (parsed as Record<string, unknown>)
  );
}

// ---------------------------------------------------------------------------
// Template parameter interpolation
// ---------------------------------------------------------------------------

/**
 * Recursively walks a value tree, converting `{{paramName}}` placeholders
 * and normalizing runtime references.
 *
 * String handling:
 * - `"{{param}}"` (exact) → `TemplateParamMarker`
 * - `"prefix-{{param}}"` (mixed) → `(params) => interpolatedString`
 * - `"${event.x}"` (reference shorthand) → `{ ref: "event.x" }`
 * - Plain string → returned as-is
 *
 * Object handling:
 * - `{ ref: "path" }` (single-key) → preserved as runtime reference
 * - Other objects → recursed property-by-property
 *
 * @param value - The blueprint value to process.
 * @param referencedParams - Optional collector for all parameter names
 *   encountered during the walk (used for undeclared-param validation).
 * @returns The processed value with markers and interpolation functions.
 */
function interpolateParams(value: unknown, referencedParams?: Set<string>): unknown {
  if (typeof value === 'string') {
    // Exact template parameter: "{{paramName}}"
    const exact = EXACT_PARAM_RE.exec(value);
    if (exact) {
      const paramName = exact[1]!;
      referencedParams?.add(paramName);
      return { __templateParam: true, paramName } as TemplateParamMarker;
    }

    // Mixed template string: "prefix-{{param}}-suffix"
    if (HAS_PARAM_RE.test(value)) {
      const template = value;
      // Collect all referenced param names for validation.
      const re = /\{\{(\w+)\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(template)) !== null) {
        referencedParams?.add(match[1]!);
      }
      return (params: TemplateParams): string =>
        template.replace(PARAM_REPLACE_RE, (_, name: string) => String(params[name] ?? ''));
    }

    // No template params — delegate to reference normalization (${...} → { ref })
    return normalizeValue(value);
  }

  if (Array.isArray(value)) {
    return value.map(element => interpolateParams(element, referencedParams));
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    // Explicit runtime reference: { ref: "event.field" }
    const refVal = obj['ref'];
    if (typeof refVal === 'string') {
      let keyCount = 0;
      for (const _ in obj) {
        keyCount++;
        if (keyCount > 1) break;
      }
      if (keyCount === 1) {
        return { ref: refVal };
      }
    }

    // Generic object — recurse each property.
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = interpolateParams(obj[key], referencedParams);
    }
    return result;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates and converts raw YAML parameter definition objects into
 * typed {@link TemplateParameterDef} instances.
 */
function validateParameterDefs(
  raw: unknown[],
  path: string,
): TemplateParameterDef[] {
  return raw.map((item, i) => {
    const p = `${path}[${i}]`;

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new YamlLoadError(`${p}: parameter definition must be an object`);
    }

    const obj = item as Record<string, unknown>;

    // name — required
    const name = obj['name'];
    if (typeof name !== 'string' || name.length === 0) {
      throw new YamlLoadError(`${p}.name: must be a non-empty string`);
    }

    const def: TemplateParameterDef = { name };

    // type — optional, must be a known type
    const type = obj['type'];
    if (type !== undefined) {
      if (typeof type !== 'string' || !VALID_PARAM_TYPES.has(type)) {
        throw new YamlLoadError(
          `${p}.type: must be one of ${[...VALID_PARAM_TYPES].join(', ')}, got "${String(type)}"`,
        );
      }
      def.type = type as TemplateParamType;
    }

    // default — optional, any value
    if ('default' in obj) {
      def.default = obj['default'];
    }

    // description — optional string
    const description = obj['description'];
    if (description !== undefined) {
      if (typeof description !== 'string') {
        throw new YamlLoadError(`${p}.description: must be a string`);
      }
      def.description = description;
    }

    return def;
  });
}

/**
 * Validates the structural requirements of a blueprint and converts
 * `{{param}}` placeholders into markers / interpolation functions.
 */
function buildBlueprint(
  raw: unknown,
  path: string,
  referencedParams: Set<string>,
): TemplateBlueprintData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new YamlLoadError(`${path}: must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  // id — required
  if (obj['id'] === undefined || obj['id'] === null) {
    throw new YamlLoadError(`${path}: missing required field "id"`);
  }

  // trigger — required
  if (obj['trigger'] === undefined || obj['trigger'] === null) {
    throw new YamlLoadError(`${path}: missing required field "trigger"`);
  }

  // actions — required, non-empty array
  const rawActions = obj['actions'];
  if (!Array.isArray(rawActions) || rawActions.length === 0) {
    throw new YamlLoadError(`${path}.actions: must be a non-empty array`);
  }

  // Interpolate the entire blueprint tree.
  const interpolated = interpolateParams(obj, referencedParams) as Record<string, unknown>;

  const blueprint: TemplateBlueprintData = {
    id: interpolated['id'] as TemplateBlueprintData['id'],
    tags: [],
    conditions: [],
    actions: interpolated['actions'] as unknown[],
  };

  if (interpolated['name'] !== undefined) {
    blueprint.name = interpolated['name'] as string | ((params: TemplateParams) => string);
  }
  if (interpolated['description'] !== undefined) {
    blueprint.description = interpolated['description'] as string;
  }
  if (interpolated['priority'] !== undefined) {
    blueprint.priority = interpolated['priority'] as number;
  }
  if (interpolated['enabled'] !== undefined) {
    blueprint.enabled = interpolated['enabled'] as boolean;
  }
  if (interpolated['tags'] !== undefined) {
    blueprint.tags = interpolated['tags'] as string[];
  }
  if (interpolated['trigger'] !== undefined) {
    blueprint.trigger = interpolated['trigger'];
  }
  if (interpolated['conditions'] !== undefined) {
    blueprint.conditions = interpolated['conditions'] as unknown[];
  }

  return blueprint;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a YAML string containing a template definition and returns a
 * compiled {@link RuleTemplate}.
 *
 * Expected top-level shape:
 * ```yaml
 * template:
 *   templateId: my-template
 *   parameters:
 *     - name: topic
 *       type: string
 *   blueprint:
 *     id: "rule-{{topic}}"
 *     trigger: { type: event, topic: "{{topic}}" }
 *     actions: [...]
 * ```
 *
 * @param yamlContent - Raw YAML string.
 * @returns A compiled {@link RuleTemplate} ready for instantiation.
 * @throws {YamlLoadError} On YAML syntax errors, missing/invalid fields,
 *   or undeclared template parameters in the blueprint.
 */
export function loadTemplateFromYAML(yamlContent: string): RuleTemplate {
  let parsed: unknown;
  try {
    parsed = parse(yamlContent);
  } catch (err) {
    throw new YamlLoadError(
      `YAML syntax error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (parsed === null || parsed === undefined) {
    throw new YamlLoadError('YAML content is empty');
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new YamlLoadError('Template YAML must be an object with a "template" key');
  }

  const root = parsed as Record<string, unknown>;
  const templateObj = root['template'];

  if (templateObj === undefined) {
    throw new YamlLoadError('Missing "template" key at top level');
  }

  if (typeof templateObj !== 'object' || templateObj === null || Array.isArray(templateObj)) {
    throw new YamlLoadError('"template" must be an object');
  }

  const tpl = templateObj as Record<string, unknown>;
  const path = 'template';

  // templateId — required
  const templateId = tpl['templateId'];
  if (typeof templateId !== 'string' || templateId.length === 0) {
    throw new YamlLoadError(`${path}.templateId: must be a non-empty string`);
  }

  // parameters — required array
  const rawParams = tpl['parameters'];
  if (!Array.isArray(rawParams)) {
    throw new YamlLoadError(`${path}.parameters: must be an array`);
  }
  const parameters = validateParameterDefs(rawParams, `${path}.parameters`);

  // blueprint — required
  const rawBlueprint = tpl['blueprint'];
  if (rawBlueprint === undefined) {
    throw new YamlLoadError(`${path}: missing required field "blueprint"`);
  }

  // Build the blueprint and collect referenced parameter names.
  const referencedParams = new Set<string>();
  const blueprint = buildBlueprint(rawBlueprint, `${path}.blueprint`, referencedParams);

  // Validate that all referenced params are declared.
  const declaredNames = new Set(parameters.map(p => p.name));
  const undeclared = [...referencedParams].filter(name => !declaredNames.has(name));
  if (undeclared.length > 0) {
    undeclared.sort();
    throw new YamlLoadError(
      `${path}: blueprint references undeclared parameter${undeclared.length > 1 ? 's' : ''}: ${undeclared.map(n => `"${n}"`).join(', ')}`,
    );
  }

  // Assemble the definition.
  const definition: RuleTemplateDefinition = {
    templateId,
    parameters,
    blueprint,
  };

  // Template metadata — all optional.
  const templateName = tpl['name'];
  if (templateName !== undefined) {
    if (typeof templateName !== 'string') {
      throw new YamlLoadError(`${path}.name: must be a string`);
    }
    definition.templateName = templateName;
  }

  const templateDescription = tpl['description'];
  if (templateDescription !== undefined) {
    if (typeof templateDescription !== 'string') {
      throw new YamlLoadError(`${path}.description: must be a string`);
    }
    definition.templateDescription = templateDescription;
  }

  const templateVersion = tpl['version'];
  if (templateVersion !== undefined) {
    if (typeof templateVersion !== 'string') {
      throw new YamlLoadError(`${path}.version: must be a string`);
    }
    definition.templateVersion = templateVersion;
  }

  const templateTags = tpl['tags'];
  if (templateTags !== undefined) {
    if (!Array.isArray(templateTags)) {
      throw new YamlLoadError(`${path}.tags: must be an array`);
    }
    for (let i = 0; i < templateTags.length; i++) {
      if (typeof templateTags[i] !== 'string') {
        throw new YamlLoadError(`${path}.tags[${i}]: must be a string`);
      }
    }
    definition.templateTags = templateTags as string[];
  }

  return new RuleTemplate(definition);
}

/**
 * Reads a YAML file from disk and returns a compiled {@link RuleTemplate}.
 *
 * @param filePath - Path to the YAML file.
 * @returns A compiled {@link RuleTemplate} ready for instantiation.
 * @throws {YamlLoadError} On file read errors, YAML syntax errors,
 *   or template validation errors.
 */
export async function loadTemplateFromFile(filePath: string): Promise<RuleTemplate> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new YamlLoadError(
      `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }

  try {
    return loadTemplateFromYAML(content);
  } catch (err) {
    if (err instanceof YamlLoadError) {
      throw new YamlLoadError(err.message, filePath);
    }
    throw err;
  }
}
