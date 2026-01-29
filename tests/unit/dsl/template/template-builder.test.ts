import { describe, it, expect } from 'vitest';
import {
  TemplateBuilder,
  RuleTemplate,
} from '../../../../src/dsl/template/template-builder';
import { param } from '../../../../src/dsl/template/param';
import { ref } from '../../../../src/dsl/helpers/ref';
import { DslValidationError, DslError } from '../../../../src/dsl/helpers/errors';
import { TemplateValidationError, TemplateInstantiationError } from '../../../../src/dsl/template/errors';
import { onEvent } from '../../../../src/dsl/trigger/event-trigger';
import { event } from '../../../../src/dsl/condition/source-expr';
import { emit } from '../../../../src/dsl/action/emit';
import type { RuleInput } from '../../../../src/types/rule';

// ---------------------------------------------------------------------------
// Helpers — minimal trigger/condition/action objects with param markers
// ---------------------------------------------------------------------------

function triggerWithParam(paramName: string) {
  return { type: 'event' as const, topic: param<string>(paramName) };
}

function conditionWithParam(fieldParam: string, thresholdParam: string) {
  return {
    source: { type: 'event' as const, field: param<string>(fieldParam) },
    operator: 'gte' as const,
    value: param(thresholdParam),
  };
}

function actionWithParam(topicParam: string) {
  return {
    type: 'emit_event' as const,
    topic: param<string>(topicParam),
    data: { source: param(topicParam) },
  };
}

/** Builds a minimal valid template for concise tests. */
function minimalBuilder() {
  return RuleTemplate.create('test-template')
    .param('topic', { type: 'string' })
    .when(triggerWithParam('topic'))
    .then(actionWithParam('topic'));
}

// ===========================================================================
// TemplateBuilder
// ===========================================================================

describe('TemplateBuilder', () => {
  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('accepts a valid template ID', () => {
      expect(() => new TemplateBuilder('valid-id')).not.toThrow();
    });

    it('throws DslValidationError for empty string ID', () => {
      expect(() => new TemplateBuilder('')).toThrow(DslValidationError);
      expect(() => new TemplateBuilder('')).toThrow('Template ID must be a non-empty string');
    });

    it('throws DslValidationError for non-string ID', () => {
      expect(() => new TemplateBuilder(42 as unknown as string)).toThrow(DslValidationError);
      expect(() => new TemplateBuilder(null as unknown as string)).toThrow(DslValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // Template metadata
  // -----------------------------------------------------------------------

  describe('template metadata', () => {
    it('stores templateName in the definition', () => {
      const template = minimalBuilder().templateName('My Template').build();
      expect(template.definition.templateName).toBe('My Template');
    });

    it('stores templateDescription', () => {
      const template = minimalBuilder().templateDescription('A description').build();
      expect(template.definition.templateDescription).toBe('A description');
    });

    it('stores templateVersion', () => {
      const template = minimalBuilder().templateVersion('2.1.0').build();
      expect(template.definition.templateVersion).toBe('2.1.0');
    });

    it('stores templateTags', () => {
      const template = minimalBuilder().templateTags('alerts', 'monitoring').build();
      expect(template.definition.templateTags).toEqual(['alerts', 'monitoring']);
    });

    it('accumulates multiple templateTags calls', () => {
      const template = minimalBuilder()
        .templateTags('a', 'b')
        .templateTags('c')
        .build();
      expect(template.definition.templateTags).toEqual(['a', 'b', 'c']);
    });

    it('omits undefined metadata fields from the definition', () => {
      const template = minimalBuilder().build();
      expect(template.definition.templateName).toBeUndefined();
      expect(template.definition.templateDescription).toBeUndefined();
      expect(template.definition.templateVersion).toBeUndefined();
      expect(template.definition.templateTags).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Parameter declarations
  // -----------------------------------------------------------------------

  describe('param()', () => {
    it('declares a parameter with just a name', () => {
      const template = minimalBuilder().build();
      const topicDef = template.definition.parameters.find(p => p.name === 'topic');
      expect(topicDef).toBeDefined();
      expect(topicDef!.name).toBe('topic');
    });

    it('stores type, default, description, and validate options', () => {
      const validator = (v: unknown) => typeof v === 'number' && v > 0 ? undefined : 'must be positive';
      const template = RuleTemplate.create('t')
        .param('count', {
          type: 'number',
          default: 10,
          description: 'Item count',
          validate: validator,
        })
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .then(actionWithParam('topic'))
        .build();

      const def = template.definition.parameters.find(p => p.name === 'count');
      expect(def).toBeDefined();
      expect(def!.type).toBe('number');
      expect(def!.default).toBe(10);
      expect(def!.description).toBe('Item count');
      expect(def!.validate).toBe(validator);
    });

    it('preserves parameter declaration order', () => {
      const template = RuleTemplate.create('t')
        .param('alpha', { type: 'string' })
        .param('beta', { type: 'number' })
        .param('gamma')
        .when(triggerWithParam('alpha'))
        .then(actionWithParam('alpha'))
        .build();

      expect(template.definition.parameters.map(p => p.name)).toEqual([
        'alpha', 'beta', 'gamma',
      ]);
    });

    it('throws on empty parameter name', () => {
      expect(() => RuleTemplate.create('t').param('')).toThrow(DslValidationError);
      expect(() => RuleTemplate.create('t').param('')).toThrow(
        'Parameter name must be a non-empty string',
      );
    });

    it('throws on non-string parameter name', () => {
      expect(() => RuleTemplate.create('t').param(123 as unknown as string)).toThrow(
        DslValidationError,
      );
    });

    it('throws on duplicate parameter name', () => {
      expect(() =>
        RuleTemplate.create('t').param('x').param('x'),
      ).toThrow(DslValidationError);
      expect(() =>
        RuleTemplate.create('t').param('x').param('x'),
      ).toThrow('Duplicate parameter declaration: "x"');
    });

    it('supports default value of undefined (explicitly provided)', () => {
      const template = RuleTemplate.create('t')
        .param('opt', { default: undefined })
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .then(actionWithParam('topic'))
        .build();

      const def = template.definition.parameters.find(p => p.name === 'opt');
      expect(def).toBeDefined();
      expect('default' in def!).toBe(true);
      expect(def!.default).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Blueprint — rule metadata
  // -----------------------------------------------------------------------

  describe('blueprint metadata', () => {
    it('defaults rule ID to template ID', () => {
      const template = minimalBuilder().build();
      expect(template.definition.blueprint.id).toBe('test-template');
    });

    it('sets static ruleId', () => {
      const template = minimalBuilder().ruleId('custom-id').build();
      expect(template.definition.blueprint.id).toBe('custom-id');
    });

    it('sets computed ruleId', () => {
      const fn = (p: Record<string, unknown>) => `alert-${p['topic']}`;
      const template = minimalBuilder().ruleId(fn).build();
      expect(template.definition.blueprint.id).toBe(fn);
    });

    it('sets static name', () => {
      const template = minimalBuilder().name('My Rule').build();
      expect(template.definition.blueprint.name).toBe('My Rule');
    });

    it('sets computed name', () => {
      const fn = (p: Record<string, unknown>) => `Rule for ${p['topic']}`;
      const template = minimalBuilder().name(fn).build();
      expect(template.definition.blueprint.name).toBe(fn);
    });

    it('sets description', () => {
      const template = minimalBuilder().description('A rule').build();
      expect(template.definition.blueprint.description).toBe('A rule');
    });

    it('sets priority', () => {
      const template = minimalBuilder().priority(50).build();
      expect(template.definition.blueprint.priority).toBe(50);
    });

    it('throws on non-finite priority', () => {
      expect(() => minimalBuilder().priority(Infinity)).toThrow(DslValidationError);
      expect(() => minimalBuilder().priority(NaN)).toThrow(DslValidationError);
      expect(() => minimalBuilder().priority('5' as unknown as number)).toThrow(DslValidationError);
    });

    it('sets enabled', () => {
      const template = minimalBuilder().enabled(false).build();
      expect(template.definition.blueprint.enabled).toBe(false);
    });

    it('accumulates tags', () => {
      const template = minimalBuilder().tags('a', 'b').tags('c').build();
      expect(template.definition.blueprint.tags).toEqual(['a', 'b', 'c']);
    });
  });

  // -----------------------------------------------------------------------
  // Blueprint — trigger, conditions, actions
  // -----------------------------------------------------------------------

  describe('when()', () => {
    it('accepts a raw trigger object with param markers', () => {
      const template = minimalBuilder().build();
      const trigger = template.definition.blueprint.trigger as Record<string, unknown>;
      expect(trigger['type']).toBe('event');
    });

    it('accepts a TriggerBuilder (static trigger)', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(onEvent('static-topic'))
        .then(actionWithParam('topic'))
        .build();

      expect(template.definition.blueprint.trigger).toEqual({
        type: 'event',
        topic: 'static-topic',
      });
    });
  });

  describe('if() and and()', () => {
    it('accepts a raw condition object with param markers', () => {
      const template = RuleTemplate.create('t')
        .param('field', { type: 'string' })
        .param('threshold', { type: 'number' })
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .if(conditionWithParam('field', 'threshold'))
        .then(actionWithParam('topic'))
        .build();

      expect(template.definition.blueprint.conditions).toHaveLength(1);
    });

    it('accepts a ConditionBuilder (static condition)', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .if(event('amount').gte(100))
        .then(actionWithParam('topic'))
        .build();

      expect(template.definition.blueprint.conditions).toHaveLength(1);
      const cond = template.definition.blueprint.conditions[0] as Record<string, unknown>;
      expect(cond['operator']).toBe('gte');
    });

    it('and() adds another condition', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .if(event('amount').gte(100))
        .and(event('status').eq('active'))
        .then(actionWithParam('topic'))
        .build();

      expect(template.definition.blueprint.conditions).toHaveLength(2);
    });
  });

  describe('then() and also()', () => {
    it('accepts a raw action object with param markers', () => {
      const template = minimalBuilder().build();
      expect(template.definition.blueprint.actions).toHaveLength(1);
    });

    it('accepts an ActionBuilder (static action)', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .then(emit('static-topic', { key: 'val' }))
        .build();

      const action = template.definition.blueprint.actions[0] as Record<string, unknown>;
      expect(action['type']).toBe('emit_event');
      expect(action['topic']).toBe('static-topic');
    });

    it('also() adds another action', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .then(emit('first', {}))
        .also(emit('second', {}))
        .build();

      expect(template.definition.blueprint.actions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Build validation
  // -----------------------------------------------------------------------

  describe('build() validation', () => {
    it('throws when trigger is missing', () => {
      expect(() =>
        RuleTemplate.create('t')
          .param('x')
          .then(emit('a', {}))
          .build(),
      ).toThrow(DslValidationError);
      expect(() =>
        RuleTemplate.create('t')
          .param('x')
          .then(emit('a', {}))
          .build(),
      ).toThrow('trigger is required');
    });

    it('throws when no actions are defined', () => {
      expect(() =>
        RuleTemplate.create('t')
          .param('x', { type: 'string' })
          .when(triggerWithParam('x'))
          .build(),
      ).toThrow(DslValidationError);
      expect(() =>
        RuleTemplate.create('t')
          .param('x', { type: 'string' })
          .when(triggerWithParam('x'))
          .build(),
      ).toThrow('at least one action is required');
    });

    it('throws when blueprint references undeclared parameters', () => {
      expect(() =>
        RuleTemplate.create('t')
          .param('topic', { type: 'string' })
          .when(triggerWithParam('topic'))
          .then(actionWithParam('undeclared'))
          .build(),
      ).toThrow(DslValidationError);
      expect(() =>
        RuleTemplate.create('t')
          .param('topic', { type: 'string' })
          .when(triggerWithParam('topic'))
          .then(actionWithParam('undeclared'))
          .build(),
      ).toThrow('undeclared parameter');
    });

    it('reports multiple undeclared parameters (sorted)', () => {
      expect(() =>
        RuleTemplate.create('t')
          .when({ type: 'event' as const, topic: param<string>('zzz') })
          .then({
            type: 'emit_event' as const,
            topic: param<string>('aaa'),
            data: {},
          })
          .build(),
      ).toThrow('"aaa", "zzz"');
    });

    it('detects undeclared params in conditions', () => {
      expect(() =>
        RuleTemplate.create('t')
          .param('topic', { type: 'string' })
          .when(triggerWithParam('topic'))
          .if(conditionWithParam('field', 'threshold'))
          .then(actionWithParam('topic'))
          .build(),
      ).toThrow('undeclared parameter');
    });

    it('build error extends DslError', () => {
      try {
        RuleTemplate.create('t').build();
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DslError);
        expect(err).toBeInstanceOf(DslValidationError);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Definition snapshot immutability
  // -----------------------------------------------------------------------

  describe('definition snapshot', () => {
    it('snapshots tags so builder mutations do not affect the template', () => {
      const builder = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .then(actionWithParam('topic'))
        .tags('initial');

      const template = builder.build();

      // Mutate builder after build
      builder.tags('extra');

      expect(template.definition.blueprint.tags).toEqual(['initial']);
    });

    it('snapshots parameters array', () => {
      const builder = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .then(actionWithParam('topic'));

      const template = builder.build();
      const paramCount = template.definition.parameters.length;

      // Adding another param to the builder should not affect the snapshot
      builder.param('extra');
      expect(template.definition.parameters).toHaveLength(paramCount);
    });

    it('snapshots templateTags', () => {
      const builder = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when(triggerWithParam('topic'))
        .then(actionWithParam('topic'))
        .templateTags('v1');

      const template = builder.build();

      builder.templateTags('v2');
      expect(template.definition.templateTags).toEqual(['v1']);
    });
  });
});

// ===========================================================================
// RuleTemplate
// ===========================================================================

describe('RuleTemplate', () => {
  // -----------------------------------------------------------------------
  // Static create()
  // -----------------------------------------------------------------------

  describe('create()', () => {
    it('returns a TemplateBuilder instance', () => {
      const builder = RuleTemplate.create('my-template');
      expect(builder).toBeInstanceOf(TemplateBuilder);
    });

    it('throws on empty ID', () => {
      expect(() => RuleTemplate.create('')).toThrow(DslValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // instantiate() — basic
  // -----------------------------------------------------------------------

  describe('instantiate()', () => {
    it('produces a valid RuleInput with substituted params', () => {
      const template = RuleTemplate.create('alert')
        .param('topic', { type: 'string' })
        .ruleId(p => `alert-${p['topic']}`)
        .name(p => `Alert on ${p['topic']}`)
        .priority(50)
        .tags('alerts')
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({
          type: 'emit_event' as const,
          topic: 'alert.triggered',
          data: { source: param('topic') },
        })
        .build();

      const rule = template.instantiate({ topic: 'metrics.cpu' });

      expect(rule.id).toBe('alert-metrics.cpu');
      expect(rule.name).toBe('Alert on metrics.cpu');
      expect(rule.priority).toBe(50);
      expect(rule.enabled).toBe(true);
      expect(rule.tags).toEqual(['alerts']);
      expect(rule.trigger).toEqual({ type: 'event', topic: 'metrics.cpu' });
      expect(rule.actions).toEqual([
        {
          type: 'emit_event',
          topic: 'alert.triggered',
          data: { source: 'metrics.cpu' },
        },
      ]);
    });

    it('substitutes params in conditions', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .param('field', { type: 'string' })
        .param('threshold', { type: 'number' })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .if({
          source: { type: 'event' as const, field: param<string>('field') },
          operator: 'gte' as const,
          value: param('threshold'),
        })
        .then({
          type: 'emit_event' as const,
          topic: 'alert',
          data: {},
        })
        .build();

      const rule = template.instantiate({
        topic: 'metrics.cpu',
        field: 'usage',
        threshold: 90,
      });

      expect(rule.conditions).toEqual([
        {
          source: { type: 'event', field: 'usage' },
          operator: 'gte',
          value: 90,
        },
      ]);
    });

    it('preserves runtime ref() objects', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({
          type: 'emit_event' as const,
          topic: 'alert',
          data: {
            source: param('topic'),
            currentValue: ref('event.value'),
          },
        })
        .build();

      const rule = template.instantiate({ topic: 'cpu' });

      const action = rule.actions[0] as { type: string; topic: string; data: Record<string, unknown> };
      expect(action.data['source']).toBe('cpu');
      expect(action.data['currentValue']).toEqual({ ref: 'event.value' });
    });

    it('defaults name to id when name is not set', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .ruleId(p => `rule-${p['topic']}`)
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      const rule = template.instantiate({ topic: 'test' });
      expect(rule.name).toBe('rule-test');
    });

    it('defaults priority to 0 when not set', () => {
      const template = minimalBuilder().build();
      const rule = template.instantiate({ topic: 'test' });
      expect(rule.priority).toBe(0);
    });

    it('defaults enabled to true when not set', () => {
      const template = minimalBuilder().build();
      const rule = template.instantiate({ topic: 'test' });
      expect(rule.enabled).toBe(true);
    });

    it('passes through description when set', () => {
      const template = minimalBuilder().description('A desc').build();
      const rule = template.instantiate({ topic: 'test' });
      expect(rule.description).toBe('A desc');
    });

    it('omits description when not set', () => {
      const template = minimalBuilder().build();
      const rule = template.instantiate({ topic: 'test' });
      expect(rule.description).toBeUndefined();
    });

    it('uses enabled: false when explicitly set', () => {
      const template = minimalBuilder().enabled(false).build();
      const rule = template.instantiate({ topic: 'test' });
      expect(rule.enabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // instantiate() — defaults
  // -----------------------------------------------------------------------

  describe('instantiate() with defaults', () => {
    it('applies default values for missing optional params', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .param('threshold', { type: 'number', default: 100 })
        .ruleId(p => `rule-${p['topic']}`)
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .if({
          source: { type: 'event' as const, field: 'value' },
          operator: 'gte' as const,
          value: param('threshold'),
        })
        .then({ type: 'emit_event' as const, topic: 'alert', data: {} })
        .build();

      const rule = template.instantiate({ topic: 'cpu' });
      const cond = rule.conditions[0] as { value: unknown };
      expect(cond.value).toBe(100);
    });

    it('allows overriding default values', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .param('threshold', { type: 'number', default: 100 })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .if({
          source: { type: 'event' as const, field: 'value' },
          operator: 'gte' as const,
          value: param('threshold'),
        })
        .then({ type: 'emit_event' as const, topic: 'alert', data: {} })
        .build();

      const rule = template.instantiate({ topic: 'cpu', threshold: 75 });
      const cond = rule.conditions[0] as { value: unknown };
      expect(cond.value).toBe(75);
    });
  });

  // -----------------------------------------------------------------------
  // instantiate() — skipValidation
  // -----------------------------------------------------------------------

  describe('instantiate() with skipValidation', () => {
    it('skips parameter validation when skipValidation is true', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      // Passing a number where string is expected — would fail validation
      const rule = template.instantiate(
        { topic: 42 as unknown as string },
        { skipValidation: true },
      );
      expect(rule.trigger).toEqual({ type: 'event', topic: 42 });
    });

    it('still applies defaults even with skipValidation', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .param('threshold', { type: 'number', default: 100 })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .if({
          source: { type: 'event' as const, field: 'x' },
          operator: 'gte' as const,
          value: param('threshold'),
        })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      const rule = template.instantiate(
        { topic: 'cpu' },
        { skipValidation: true },
      );
      const cond = rule.conditions[0] as { value: unknown };
      expect(cond.value).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // instantiate() — multiple instantiations
  // -----------------------------------------------------------------------

  describe('multiple instantiations', () => {
    it('produces independent rules from the same template', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .ruleId(p => `rule-${p['topic']}`)
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({
          type: 'emit_event' as const,
          topic: 'out',
          data: { src: param('topic') },
        })
        .build();

      const ruleA = template.instantiate({ topic: 'alpha' });
      const ruleB = template.instantiate({ topic: 'beta' });

      expect(ruleA.id).toBe('rule-alpha');
      expect(ruleB.id).toBe('rule-beta');
      expect(ruleA.trigger).toEqual({ type: 'event', topic: 'alpha' });
      expect(ruleB.trigger).toEqual({ type: 'event', topic: 'beta' });
    });

    it('does not share mutable state between instantiations', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({
          type: 'emit_event' as const,
          topic: 'out',
          data: { src: param('topic') },
        })
        .build();

      const ruleA = template.instantiate({ topic: 'a' });
      const ruleB = template.instantiate({ topic: 'b' });

      // Mutate ruleA's tags — should not affect ruleB
      ruleA.tags.push('mutated');
      expect(ruleB.tags).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // instantiate() — validation errors
  // -----------------------------------------------------------------------

  describe('instantiate() validation errors', () => {
    it('throws TemplateValidationError for missing required params', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      expect(() => template.instantiate({})).toThrow(TemplateValidationError);
    });

    it('throws TemplateValidationError for wrong param type', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      expect(() => template.instantiate({ topic: 42 })).toThrow(TemplateValidationError);
    });

    it('throws TemplateValidationError for unknown params', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      expect(() => template.instantiate({ topic: 'ok', extra: 'bad' })).toThrow(
        TemplateValidationError,
      );
    });

    it('validation error extends DslError', () => {
      const template = minimalBuilder().build();
      try {
        template.instantiate({});
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DslError);
        expect(err).toBeInstanceOf(TemplateValidationError);
      }
    });
  });

  // -----------------------------------------------------------------------
  // instantiate() — rule ID validation
  // -----------------------------------------------------------------------

  describe('instantiate() rule ID validation', () => {
    it('throws TemplateInstantiationError when resolved ID is empty', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .ruleId(() => '')
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      expect(() => template.instantiate({ topic: 'test' })).toThrow(
        TemplateInstantiationError,
      );
      expect(() => template.instantiate({ topic: 'test' })).toThrow(
        'resolved rule ID must be a non-empty string',
      );
    });

    it('instantiation error extends DslError', () => {
      const template = RuleTemplate.create('t')
        .param('topic', { type: 'string' })
        .ruleId(() => '')
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .then({ type: 'emit_event' as const, topic: 'x', data: {} })
        .build();

      try {
        template.instantiate({ topic: 'test' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DslError);
        expect(err).toBeInstanceOf(TemplateInstantiationError);
      }
    });
  });

  // -----------------------------------------------------------------------
  // instantiate() — with static builders (no param markers)
  // -----------------------------------------------------------------------

  describe('instantiate() with static builders', () => {
    it('works with onEvent trigger builder', () => {
      const template = RuleTemplate.create('t')
        .when(onEvent('orders.created'))
        .then(emit('notification.send', { msg: 'order received' }))
        .build();

      const rule = template.instantiate({});

      expect(rule.id).toBe('t');
      expect(rule.trigger).toEqual({ type: 'event', topic: 'orders.created' });
      expect(rule.actions[0]).toEqual({
        type: 'emit_event',
        topic: 'notification.send',
        data: { msg: 'order received' },
      });
    });

    it('works with condition builder and ref values', () => {
      const template = RuleTemplate.create('t')
        .when(onEvent('orders'))
        .if(event('amount').gte(100))
        .then(emit('alert', { orderId: ref('event.orderId') }))
        .build();

      const rule = template.instantiate({});

      expect(rule.conditions).toEqual([
        {
          source: { type: 'event', field: 'amount' },
          operator: 'gte',
          value: 100,
        },
      ]);
      const action = rule.actions[0] as { data: Record<string, unknown> };
      expect(action.data['orderId']).toEqual({ ref: 'event.orderId' });
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end: realistic template
  // -----------------------------------------------------------------------

  describe('end-to-end', () => {
    it('creates a threshold alert template and instantiates multiple rules', () => {
      const template = RuleTemplate.create('threshold-alert')
        .templateName('Threshold Alert')
        .templateVersion('1.0.0')
        .templateTags('monitoring')
        .param('topic', { type: 'string' })
        .param('field', { type: 'string' })
        .param('threshold', { type: 'number', default: 100 })
        .param('alertTopic', { type: 'string', default: 'alert.triggered' })
        .ruleId(p => `alert-${p['topic']}-${p['field']}`)
        .name(p => `Alert: ${p['field']} > ${p['threshold']} on ${p['topic']}`)
        .description('Monitors a metric field and triggers an alert')
        .priority(50)
        .tags('alerts')
        .when({ type: 'event' as const, topic: param<string>('topic') })
        .if({
          source: { type: 'event' as const, field: param<string>('field') },
          operator: 'gte' as const,
          value: param('threshold'),
        })
        .then({
          type: 'emit_event' as const,
          topic: param<string>('alertTopic'),
          data: {
            source: param('topic'),
            currentValue: ref('event.value'),
          },
        })
        .build();

      // Verify template definition
      expect(template.definition.templateId).toBe('threshold-alert');
      expect(template.definition.templateName).toBe('Threshold Alert');
      expect(template.definition.parameters).toHaveLength(4);

      // Instantiate CPU rule
      const cpuRule = template.instantiate({
        topic: 'metrics.cpu',
        field: 'usage',
        threshold: 90,
      });

      expect(cpuRule.id).toBe('alert-metrics.cpu-usage');
      expect(cpuRule.name).toBe('Alert: usage > 90 on metrics.cpu');
      expect(cpuRule.priority).toBe(50);
      expect(cpuRule.enabled).toBe(true);
      expect(cpuRule.tags).toEqual(['alerts']);
      expect(cpuRule.description).toBe('Monitors a metric field and triggers an alert');
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
          topic: 'alert.triggered', // default
          data: {
            source: 'metrics.cpu',
            currentValue: { ref: 'event.value' },
          },
        },
      ]);

      // Instantiate memory rule (uses defaults)
      const memRule = template.instantiate({
        topic: 'metrics.memory',
        field: 'percentage',
      });

      expect(memRule.id).toBe('alert-metrics.memory-percentage');
      expect(memRule.name).toBe('Alert: percentage > 100 on metrics.memory');
      expect(memRule.conditions[0]).toEqual({
        source: { type: 'event', field: 'percentage' },
        operator: 'gte',
        value: 100, // default threshold
      });
      expect((memRule.actions[0] as { topic: string }).topic).toBe('alert.triggered');

      // Verify independence
      expect(cpuRule.id).not.toBe(memRule.id);
      expect(cpuRule.trigger).not.toBe(memRule.trigger);
    });

    it('produces rules conforming to RuleInput shape', () => {
      const template = minimalBuilder().build();
      const rule: RuleInput = template.instantiate({ topic: 'test' });

      // All required RuleInput fields present
      expect(typeof rule.id).toBe('string');
      expect(typeof rule.name).toBe('string');
      expect(typeof rule.priority).toBe('number');
      expect(typeof rule.enabled).toBe('boolean');
      expect(Array.isArray(rule.tags)).toBe(true);
      expect(rule.trigger).toBeDefined();
      expect(Array.isArray(rule.conditions)).toBe(true);
      expect(Array.isArray(rule.actions)).toBe(true);
    });

    it('template with no parameters works (static template)', () => {
      const template = RuleTemplate.create('static-rule')
        .ruleId('my-rule')
        .name('My Rule')
        .when(onEvent('orders'))
        .then(emit('done', {}))
        .build();

      const rule = template.instantiate({});
      expect(rule.id).toBe('my-rule');
      expect(rule.name).toBe('My Rule');
    });
  });
});
