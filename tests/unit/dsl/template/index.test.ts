import { describe, it, expect } from 'vitest';
import {
  param,
  isTemplateParam,
  substituteParams,
  validateTemplateParams,
  TemplateBuilder,
  RuleTemplate,
  TemplateValidationError,
  TemplateInstantiationError,
} from '../../../../src/dsl/template/index';
import { DslError } from '../../../../src/dsl/helpers/errors';

describe('template barrel exports', () => {
  it('exports param as a function', () => {
    expect(typeof param).toBe('function');
  });

  it('exports isTemplateParam as a function', () => {
    expect(typeof isTemplateParam).toBe('function');
  });

  it('exports substituteParams as a function', () => {
    expect(typeof substituteParams).toBe('function');
  });

  it('exports validateTemplateParams as a function', () => {
    expect(typeof validateTemplateParams).toBe('function');
  });

  it('exports TemplateBuilder as a class', () => {
    expect(typeof TemplateBuilder).toBe('function');
    const builder = new TemplateBuilder('test');
    expect(builder).toBeInstanceOf(TemplateBuilder);
  });

  it('exports RuleTemplate as a class with static create()', () => {
    expect(typeof RuleTemplate).toBe('function');
    expect(typeof RuleTemplate.create).toBe('function');
    const builder = RuleTemplate.create('test');
    expect(builder).toBeInstanceOf(TemplateBuilder);
  });

  it('exports TemplateValidationError extending DslError', () => {
    const err = new TemplateValidationError('fail', ['issue']);
    expect(err).toBeInstanceOf(TemplateValidationError);
    expect(err).toBeInstanceOf(DslError);
    expect(err).toBeInstanceOf(Error);
    expect(err.issues).toEqual(['issue']);
  });

  it('exports TemplateInstantiationError extending DslError', () => {
    const err = new TemplateInstantiationError('fail');
    expect(err).toBeInstanceOf(TemplateInstantiationError);
    expect(err).toBeInstanceOf(DslError);
    expect(err).toBeInstanceOf(Error);
  });

  it('exports work together for a complete template workflow', () => {
    const template = RuleTemplate.create('barrel-test')
      .param('topic', { type: 'string' })
      .param('level', { type: 'number', default: 50 })
      .ruleId(p => `rule-${p.topic}`)
      .name(p => `Rule for ${p.topic}`)
      .when({ type: 'event', topic: param('topic') })
      .then({
        type: 'emit_event',
        topic: 'alerts',
        data: { level: param('level') },
      })
      .build();

    expect(template).toBeInstanceOf(RuleTemplate);

    const rule = template.instantiate({ topic: 'orders' });
    expect(rule.id).toBe('rule-orders');
    expect(rule.name).toBe('Rule for orders');
    expect(rule.trigger).toEqual({ type: 'event', topic: 'orders' });
    expect(rule.actions).toEqual([
      { type: 'emit_event', topic: 'alerts', data: { level: 50 } },
    ]);
  });

  it('param() and isTemplateParam() round-trip correctly via barrel', () => {
    const marker = param('test');
    expect(isTemplateParam(marker)).toBe(true);
    expect(isTemplateParam({ not: 'a marker' })).toBe(false);
  });

  it('validateTemplateParams works via barrel', () => {
    const defs = [
      { name: 'topic', type: 'string' as const },
      { name: 'count', type: 'number' as const, default: 10 },
    ];
    const result = validateTemplateParams(defs, { topic: 'test' });
    expect(result).toEqual({ topic: 'test', count: 10 });
  });

  it('substituteParams works via barrel', () => {
    const marker = param('x');
    const result = substituteParams(marker, { x: 42 });
    expect(result).toBe(42);
  });
});
