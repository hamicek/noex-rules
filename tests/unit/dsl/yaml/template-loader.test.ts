import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  isTemplateYAML,
  loadTemplateFromYAML,
  loadTemplateFromFile,
} from '../../../../src/dsl/yaml/template-loader';
import { YamlLoadError } from '../../../../src/dsl/yaml/loader';
import { DslError } from '../../../../src/dsl/helpers/errors';
import type { RuleInput } from '../../../../src/types/rule';

const FIXTURES = resolve(__dirname, '../../../fixtures/yaml');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid template YAML for concise tests. */
function minimalTemplate(overrides: Record<string, string> = {}): string {
  const templateId = overrides['templateId'] ?? 'test-template';
  const parameters = overrides['parameters'] ?? `
      - name: topic
        type: string`;
  const blueprint = overrides['blueprint'] ?? `
      id: "rule-{{topic}}"
      trigger:
        type: event
        topic: "{{topic}}"
      actions:
        - type: emit_event
          topic: result
          data: {}`;

  return `
template:
  templateId: ${templateId}
  parameters:${parameters}
  blueprint:${blueprint}
`;
}

// ===========================================================================
// isTemplateYAML
// ===========================================================================

describe('isTemplateYAML', () => {
  it('returns true for an object with "template" key', () => {
    expect(isTemplateYAML({ template: { templateId: 'x' } })).toBe(true);
  });

  it('returns true even when template value is null', () => {
    expect(isTemplateYAML({ template: null })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isTemplateYAML(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTemplateYAML(undefined)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isTemplateYAML([{ template: {} }])).toBe(false);
  });

  it('returns false for a plain rule object', () => {
    expect(isTemplateYAML({ id: 'rule-1', trigger: {} })).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isTemplateYAML('template')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isTemplateYAML(42)).toBe(false);
  });

  it('returns false for an object with "rules" key', () => {
    expect(isTemplateYAML({ rules: [] })).toBe(false);
  });
});

// ===========================================================================
// loadTemplateFromYAML — basic loading
// ===========================================================================

describe('loadTemplateFromYAML', () => {
  describe('basic loading', () => {
    it('loads a minimal template', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      expect(template.definition.templateId).toBe('test-template');
      expect(template.definition.parameters).toHaveLength(1);
      expect(template.definition.parameters[0]!.name).toBe('topic');
      expect(template.definition.parameters[0]!.type).toBe('string');
    });

    it('returns a RuleTemplate that can be instantiated', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      const rule = template.instantiate({ topic: 'orders' });
      expect(rule.id).toBe('rule-orders');
      expect(rule.trigger).toEqual({ type: 'event', topic: 'orders' });
    });
  });

  // -----------------------------------------------------------------------
  // Template metadata
  // -----------------------------------------------------------------------

  describe('template metadata', () => {
    it('reads template name', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          name: My Template
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      expect(template.definition.templateName).toBe('My Template');
    });

    it('reads template description', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          description: A useful template
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      expect(template.definition.templateDescription).toBe('A useful template');
    });

    it('reads template version', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          version: "2.0.0"
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      expect(template.definition.templateVersion).toBe('2.0.0');
    });

    it('reads template tags', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          tags:
            - monitoring
            - alerts
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      expect(template.definition.templateTags).toEqual(['monitoring', 'alerts']);
    });

    it('omits undefined metadata from the definition', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      expect(template.definition.templateName).toBeUndefined();
      expect(template.definition.templateDescription).toBeUndefined();
      expect(template.definition.templateVersion).toBeUndefined();
      expect(template.definition.templateTags).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Parameter definitions
  // -----------------------------------------------------------------------

  describe('parameter definitions', () => {
    it('reads parameter type', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: count
              type: number
            - name: topic
              type: string
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data:
                  count: "{{count}}"
      `);

      const countDef = template.definition.parameters.find(p => p.name === 'count');
      expect(countDef!.type).toBe('number');
    });

    it('reads parameter default value', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
            - name: threshold
              type: number
              default: 100
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data:
                  t: "{{threshold}}"
      `);

      const def = template.definition.parameters.find(p => p.name === 'threshold');
      expect(def!.default).toBe(100);
    });

    it('reads parameter description', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
              description: The event topic
          blueprint:
            id: "{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      expect(template.definition.parameters[0]!.description).toBe('The event topic');
    });

    it('supports all parameter types', () => {
      const types = ['string', 'number', 'boolean', 'object', 'array', 'any'];
      for (const type of types) {
        const template = loadTemplateFromYAML(`
          template:
            templateId: t1
            parameters:
              - name: p
                type: ${type}
            blueprint:
              id: test
              trigger:
                type: event
                topic: test
              actions:
                - type: emit_event
                  topic: out
                  data: {}
        `);

        expect(template.definition.parameters[0]!.type).toBe(type);
      }
    });

    it('allows parameters without type (defaults to any at validation time)', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: value
          blueprint:
            id: test
            trigger:
              type: event
              topic: test
            actions:
              - type: emit_event
                topic: out
                data:
                  v: "{{value}}"
      `);

      expect(template.definition.parameters[0]!.type).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // {{param}} interpolation
  // -----------------------------------------------------------------------

  describe('{{param}} interpolation', () => {
    it('converts exact {{param}} to TemplateParamMarker', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      // The trigger topic should be a param marker
      const trigger = template.definition.blueprint.trigger as Record<string, unknown>;
      const topicMarker = trigger['topic'] as { __templateParam: boolean; paramName: string };
      expect(topicMarker.__templateParam).toBe(true);
      expect(topicMarker.paramName).toBe('topic');
    });

    it('converts mixed {{param}} strings to interpolation functions', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      // The id "rule-{{topic}}" should be a function
      const id = template.definition.blueprint.id;
      expect(typeof id).toBe('function');
      expect((id as (p: Record<string, unknown>) => string)({ topic: 'orders' })).toBe('rule-orders');
    });

    it('handles multiple {{param}} in a single string', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: prefix
              type: string
            - name: suffix
              type: string
          blueprint:
            id: "{{prefix}}-rule-{{suffix}}"
            trigger:
              type: event
              topic: test
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      const id = template.definition.blueprint.id;
      expect(typeof id).toBe('function');
      expect((id as (p: Record<string, unknown>) => string)({ prefix: 'a', suffix: 'b' })).toBe('a-rule-b');
    });

    it('leaves plain strings without {{param}} unchanged', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      // The action type should remain a plain string
      const action = template.definition.blueprint.actions[0] as Record<string, unknown>;
      expect(action['type']).toBe('emit_event');
      expect(action['topic']).toBe('result');
    });

    it('interpolates params in nested objects', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
            - name: field
              type: string
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            conditions:
              - source:
                  type: event
                  field: "{{field}}"
                operator: gte
                value: 100
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      const rule = template.instantiate({ topic: 'metrics', field: 'usage' });

      expect(rule.conditions[0]).toEqual({
        source: { type: 'event', field: 'usage' },
        operator: 'gte',
        value: 100,
      });
    });

    it('interpolates params in action data', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: alert
                data:
                  source: "{{topic}}"
                  nested:
                    deep: "{{topic}}"
      `);

      const rule = template.instantiate({ topic: 'cpu' });
      const action = rule.actions[0] as { type: string; data: Record<string, unknown> };
      expect(action.data['source']).toBe('cpu');
      expect((action.data['nested'] as Record<string, unknown>)['deep']).toBe('cpu');
    });

    it('interpolates params in array elements', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "r-{{topic}}"
            tags:
              - "{{topic}}"
              - alerts
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      // Tags in the blueprint may have param markers —
      // after instantiation they should be resolved.
      const rule = template.instantiate({ topic: 'cpu' });
      expect(rule.tags).toContain('cpu');
      expect(rule.tags).toContain('alerts');
    });
  });

  // -----------------------------------------------------------------------
  // Runtime reference preservation
  // -----------------------------------------------------------------------

  describe('runtime reference preservation', () => {
    it('preserves explicit { ref: ... } objects', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: alert
                data:
                  currentValue:
                    ref: event.value
                  source: "{{topic}}"
      `);

      const rule = template.instantiate({ topic: 'cpu' });
      const action = rule.actions[0] as { data: Record<string, unknown> };
      expect(action.data['currentValue']).toEqual({ ref: 'event.value' });
      expect(action.data['source']).toBe('cpu');
    });

    it('normalizes ${...} shorthand to { ref: ... }', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: alert
                data:
                  userId: "\${event.userId}"
                  source: "{{topic}}"
      `);

      const rule = template.instantiate({ topic: 'auth' });
      const action = rule.actions[0] as { data: Record<string, unknown> };
      expect(action.data['userId']).toEqual({ ref: 'event.userId' });
    });
  });

  // -----------------------------------------------------------------------
  // Blueprint metadata
  // -----------------------------------------------------------------------

  describe('blueprint metadata', () => {
    it('reads blueprint priority', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            priority: 75
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      const rule = template.instantiate({ topic: 'x' });
      expect(rule.priority).toBe(75);
    });

    it('reads blueprint enabled flag', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            enabled: false
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      const rule = template.instantiate({ topic: 'x' });
      expect(rule.enabled).toBe(false);
    });

    it('reads blueprint description', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            description: A rule for monitoring
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      const rule = template.instantiate({ topic: 'x' });
      expect(rule.description).toBe('A rule for monitoring');
    });

    it('reads blueprint name with interpolation', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "r-{{topic}}"
            name: "Alert on {{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `);

      const rule = template.instantiate({ topic: 'cpu' });
      expect(rule.name).toBe('Alert on cpu');
    });
  });

  // -----------------------------------------------------------------------
  // Default parameter handling during instantiation
  // -----------------------------------------------------------------------

  describe('defaults during instantiation', () => {
    it('applies default values for missing optional params', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
            - name: threshold
              type: number
              default: 100
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            conditions:
              - source:
                  type: event
                  field: value
                operator: gte
                value: "{{threshold}}"
            actions:
              - type: emit_event
                topic: alert
                data: {}
      `);

      const rule = template.instantiate({ topic: 'cpu' });
      const cond = rule.conditions[0] as { value: unknown };
      expect(cond.value).toBe(100);
    });

    it('allows overriding default values', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
            - name: threshold
              type: number
              default: 100
          blueprint:
            id: "r-{{topic}}"
            trigger:
              type: event
              topic: "{{topic}}"
            conditions:
              - source:
                  type: event
                  field: value
                operator: gte
                value: "{{threshold}}"
            actions:
              - type: emit_event
                topic: alert
                data: {}
      `);

      const rule = template.instantiate({ topic: 'cpu', threshold: 50 });
      const cond = rule.conditions[0] as { value: unknown };
      expect(cond.value).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple instantiations
  // -----------------------------------------------------------------------

  describe('multiple instantiations', () => {
    it('produces independent rules from the same YAML template', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      const ruleA = template.instantiate({ topic: 'alpha' });
      const ruleB = template.instantiate({ topic: 'beta' });

      expect(ruleA.id).toBe('rule-alpha');
      expect(ruleB.id).toBe('rule-beta');
      expect(ruleA.trigger).toEqual({ type: 'event', topic: 'alpha' });
      expect(ruleB.trigger).toEqual({ type: 'event', topic: 'beta' });
    });

    it('does not share mutable state between instantiations', () => {
      const template = loadTemplateFromYAML(minimalTemplate());

      const ruleA = template.instantiate({ topic: 'a' });
      const ruleB = template.instantiate({ topic: 'b' });

      ruleA.tags.push('mutated');
      expect(ruleB.tags).not.toContain('mutated');
    });
  });

  // -----------------------------------------------------------------------
  // Undeclared parameter detection
  // -----------------------------------------------------------------------

  describe('undeclared parameter detection', () => {
    it('throws when blueprint references an undeclared parameter', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            trigger:
              type: event
              topic: "{{undeclared}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "{{topic}}"
            trigger:
              type: event
              topic: "{{undeclared}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/undeclared parameter.*"undeclared"/);
    });

    it('detects undeclared params in mixed strings', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: topic
              type: string
          blueprint:
            id: "prefix-{{unknown}}-suffix"
            trigger:
              type: event
              topic: "{{topic}}"
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/undeclared parameter.*"unknown"/);
    });

    it('reports multiple undeclared params sorted', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: "{{zzz}}"
            actions:
              - type: emit_event
                topic: "{{aaa}}"
                data: {}
      `)).toThrow('"aaa", "zzz"');
    });
  });

  // -----------------------------------------------------------------------
  // Error handling — structural
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('throws on empty YAML', () => {
      expect(() => loadTemplateFromYAML('')).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML('')).toThrow(/empty/);
    });

    it('throws on null YAML', () => {
      expect(() => loadTemplateFromYAML('null')).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML('null')).toThrow(/empty/);
    });

    it('throws on YAML syntax error', () => {
      expect(() => loadTemplateFromYAML('{{invalid')).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML('{{invalid')).toThrow(/YAML syntax error/);
    });

    it('throws on array YAML', () => {
      expect(() => loadTemplateFromYAML('- id: x')).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML('- id: x')).toThrow(/"template" key/);
    });

    it('throws on scalar YAML', () => {
      expect(() => loadTemplateFromYAML('"just a string"')).toThrow(YamlLoadError);
    });

    it('throws when "template" key is missing', () => {
      expect(() => loadTemplateFromYAML('rules: []')).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML('rules: []')).toThrow(/Missing "template" key/);
    });

    it('throws when "template" is not an object', () => {
      expect(() => loadTemplateFromYAML('template: just-a-string')).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML('template: just-a-string')).toThrow(/"template" must be an object/);
    });

    it('throws when templateId is missing', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          parameters: []
          blueprint:
            id: x
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          parameters: []
          blueprint:
            id: x
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/templateId/);
    });

    it('throws when templateId is empty', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: ""
          parameters: []
          blueprint:
            id: x
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
    });

    it('throws when parameters is not an array', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: not-an-array
          blueprint:
            id: x
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: not-an-array
          blueprint:
            id: x
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/parameters.*array/);
    });

    it('throws when blueprint is missing', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
      `)).toThrow(/blueprint/);
    });

    it('throws when blueprint id is missing', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/missing required field "id"/);
    });

    it('throws when blueprint trigger is missing', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            id: test
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            id: test
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/missing required field "trigger"/);
    });

    it('throws when blueprint actions is empty', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions: []
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions: []
      `)).toThrow(/non-empty array/);
    });

    it('throws when blueprint actions is not an array', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions: not-an-array
      `)).toThrow(YamlLoadError);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling — parameter definitions
  // -----------------------------------------------------------------------

  describe('parameter definition validation', () => {
    it('throws when parameter definition is not an object', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - just-a-string
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - just-a-string
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/parameter definition must be an object/);
    });

    it('throws when parameter name is missing', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - type: string
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - type: string
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/name.*non-empty string/);
    });

    it('throws on invalid parameter type', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: p
              type: invalid
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: p
              type: invalid
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/must be one of/);
    });

    it('throws when parameter description is not a string', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: p
              description: 42
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          parameters:
            - name: p
              description: 42
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(/description.*string/);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling — metadata validation
  // -----------------------------------------------------------------------

  describe('metadata validation', () => {
    it('throws when template name is not a string', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          name: 42
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
    });

    it('throws when template description is not a string', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          description: 42
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
    });

    it('throws when template version is not a string', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          version: 42
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
    });

    it('throws when template tags is not an array', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          tags: not-array
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
    });

    it('throws when template tag element is not a string', () => {
      expect(() => loadTemplateFromYAML(`
        template:
          templateId: t1
          tags:
            - 42
          parameters: []
          blueprint:
            id: test
            trigger:
              type: event
              topic: x
            actions:
              - type: emit_event
                topic: out
                data: {}
      `)).toThrow(YamlLoadError);
    });
  });

  // -----------------------------------------------------------------------
  // Error class properties
  // -----------------------------------------------------------------------

  describe('error class', () => {
    it('throws errors that extend DslError', () => {
      try {
        loadTemplateFromYAML('');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DslError);
        expect(err).toBeInstanceOf(YamlLoadError);
      }
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end integration
  // -----------------------------------------------------------------------

  describe('end-to-end', () => {
    it('loads a full template and instantiates multiple rules', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: threshold-alert
          name: Threshold Alert
          version: "1.0.0"
          tags:
            - monitoring
          parameters:
            - name: topic
              type: string
            - name: field
              type: string
            - name: threshold
              type: number
              default: 100
            - name: alertTopic
              type: string
              default: alert.triggered
          blueprint:
            id: "alert-{{topic}}-{{field}}"
            name: "Alert: {{field}} on {{topic}}"
            priority: 50
            tags:
              - alerts
            trigger:
              type: event
              topic: "{{topic}}"
            conditions:
              - source:
                  type: event
                  field: "{{field}}"
                operator: gte
                value: "{{threshold}}"
            actions:
              - type: emit_event
                topic: "{{alertTopic}}"
                data:
                  source: "{{topic}}"
                  currentValue:
                    ref: event.value
      `);

      expect(template.definition.templateId).toBe('threshold-alert');
      expect(template.definition.templateName).toBe('Threshold Alert');
      expect(template.definition.parameters).toHaveLength(4);

      // CPU rule — override threshold
      const cpuRule = template.instantiate({
        topic: 'metrics.cpu',
        field: 'usage',
        threshold: 90,
      });

      expect(cpuRule.id).toBe('alert-metrics.cpu-usage');
      expect(cpuRule.name).toBe('Alert: usage on metrics.cpu');
      expect(cpuRule.priority).toBe(50);
      expect(cpuRule.tags).toEqual(['alerts']);
      expect(cpuRule.trigger).toEqual({ type: 'event', topic: 'metrics.cpu' });
      expect(cpuRule.conditions).toEqual([
        {
          source: { type: 'event', field: 'usage' },
          operator: 'gte',
          value: 90,
        },
      ]);
      expect(cpuRule.actions).toEqual([
        {
          type: 'emit_event',
          topic: 'alert.triggered',
          data: {
            source: 'metrics.cpu',
            currentValue: { ref: 'event.value' },
          },
        },
      ]);

      // Memory rule — use defaults
      const memRule = template.instantiate({
        topic: 'metrics.memory',
        field: 'percentage',
      });

      expect(memRule.id).toBe('alert-metrics.memory-percentage');
      expect(memRule.conditions[0]).toEqual({
        source: { type: 'event', field: 'percentage' },
        operator: 'gte',
        value: 100,
      });
      expect((memRule.actions[0] as { topic: string }).topic).toBe('alert.triggered');

      // Independence
      expect(cpuRule.id).not.toBe(memRule.id);
    });

    it('produces rules conforming to RuleInput shape', () => {
      const template = loadTemplateFromYAML(minimalTemplate());
      const rule: RuleInput = template.instantiate({ topic: 'test' });

      expect(typeof rule.id).toBe('string');
      expect(typeof rule.name).toBe('string');
      expect(typeof rule.priority).toBe('number');
      expect(typeof rule.enabled).toBe('boolean');
      expect(Array.isArray(rule.tags)).toBe(true);
      expect(rule.trigger).toBeDefined();
      expect(Array.isArray(rule.conditions)).toBe(true);
      expect(Array.isArray(rule.actions)).toBe(true);
    });

    it('template with no parameters and static blueprint', () => {
      const template = loadTemplateFromYAML(`
        template:
          templateId: static-template
          parameters: []
          blueprint:
            id: static-rule
            name: Static Rule
            trigger:
              type: event
              topic: orders
            actions:
              - type: emit_event
                topic: done
                data: {}
      `);

      const rule = template.instantiate({});
      expect(rule.id).toBe('static-rule');
      expect(rule.name).toBe('Static Rule');
    });
  });
});

// ===========================================================================
// loadTemplateFromFile
// ===========================================================================

describe('loadTemplateFromFile', () => {
  it('loads a template from a YAML file', async () => {
    const template = await loadTemplateFromFile(
      resolve(FIXTURES, 'template-threshold.yaml'),
    );

    expect(template.definition.templateId).toBe('threshold-alert');
    expect(template.definition.templateName).toBe('Threshold Alert');
    expect(template.definition.templateDescription).toBe(
      'Monitors a metric and triggers an alert',
    );
    expect(template.definition.templateVersion).toBe('1.0.0');
    expect(template.definition.templateTags).toEqual(['monitoring', 'alerts']);
    expect(template.definition.parameters).toHaveLength(2);
  });

  it('loaded template can be instantiated', async () => {
    const template = await loadTemplateFromFile(
      resolve(FIXTURES, 'template-threshold.yaml'),
    );

    const rule = template.instantiate({ topic: 'metrics.cpu' });
    expect(rule.id).toBe('alert-metrics.cpu');
    expect(rule.trigger).toEqual({ type: 'event', topic: 'metrics.cpu' });
    expect(rule.priority).toBe(50);
    expect(rule.tags).toEqual(['alerts']);

    // Default threshold applied
    const cond = rule.conditions[0] as { value: unknown };
    expect(cond.value).toBe(100);

    // Runtime ref preserved
    const action = rule.actions[0] as { data: Record<string, unknown> };
    expect(action.data['currentValue']).toEqual({ ref: 'event.value' });
    expect(action.data['source']).toBe('metrics.cpu');
  });

  it('throws YamlLoadError on non-existent file', async () => {
    await expect(
      loadTemplateFromFile('/nonexistent/path.yaml'),
    ).rejects.toThrow(YamlLoadError);
  });

  it('includes file path in error', async () => {
    try {
      await loadTemplateFromFile('/nonexistent/path.yaml');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(YamlLoadError);
      expect((err as YamlLoadError).filePath).toBe('/nonexistent/path.yaml');
    }
  });

  it('wraps structural errors with file path', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const tmpFile = resolve(FIXTURES, '_invalid_template_temp.yaml');

    try {
      await writeFile(tmpFile, 'template:\n  parameters: []');
      try {
        await loadTemplateFromFile(tmpFile);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlLoadError);
        expect((err as YamlLoadError).filePath).toBe(tmpFile);
      }
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  });
});
