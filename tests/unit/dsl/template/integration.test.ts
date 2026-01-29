import { describe, it, expect } from 'vitest';
import { RuleTemplate } from '../../../../src/dsl/template/template-builder';
import { param } from '../../../../src/dsl/template/param';
import { ref } from '../../../../src/dsl/helpers/ref';
import { loadTemplateFromYAML } from '../../../../src/dsl/yaml/template-loader';
import { RuleInputValidator } from '../../../../src/validation/rule-validator';
import type { RuleInput } from '../../../../src/types/rule';

// ---------------------------------------------------------------------------
// Shared validator instance
// ---------------------------------------------------------------------------

const validator = new RuleInputValidator();
const strictValidator = new RuleInputValidator({ strict: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a realistic threshold-alert template via the builder API. */
function buildAlertTemplate() {
  return RuleTemplate.create('threshold-alert')
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
}

/** Equivalent template defined in YAML. */
function loadAlertTemplateYAML() {
  return loadTemplateFromYAML(`
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
    name: "Alert: {{field}} > {{threshold}} on {{topic}}"
    description: Monitors a metric field and triggers an alert
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
}

// ===========================================================================
// Builder API → RuleInputValidator
// ===========================================================================

describe('Integration: Builder API → RuleInputValidator', () => {
  it('instantiated rule passes validation', () => {
    const template = buildAlertTemplate();
    const rule = template.instantiate({
      topic: 'metrics.cpu',
      field: 'usage',
      threshold: 90,
    });

    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('instantiated rule passes strict validation', () => {
    const template = buildAlertTemplate();
    const rule = template.instantiate({
      topic: 'metrics.cpu',
      field: 'usage',
      threshold: 90,
    });

    const result = strictValidator.validate(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rule with all defaults applied passes validation', () => {
    const template = buildAlertTemplate();
    const rule = template.instantiate({
      topic: 'metrics.memory',
      field: 'percentage',
    });

    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('multiple instantiations all produce valid rules', () => {
    const template = buildAlertTemplate();
    const configs = [
      { topic: 'metrics.cpu', field: 'usage', threshold: 90 },
      { topic: 'metrics.memory', field: 'percentage' },
      { topic: 'metrics.disk', field: 'used', threshold: 80, alertTopic: 'disk.alert' },
    ];

    const rules = configs.map(params => template.instantiate(params));

    for (const rule of rules) {
      const result = validator.validate(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('multiple rules pass validateMany with unique IDs', () => {
    const template = buildAlertTemplate();
    const rules = [
      template.instantiate({ topic: 'cpu', field: 'usage', threshold: 90 }),
      template.instantiate({ topic: 'memory', field: 'percentage' }),
      template.instantiate({ topic: 'disk', field: 'used', threshold: 80 }),
    ];

    const result = validator.validateMany(rules);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateMany detects duplicate IDs from same-param instantiations', () => {
    const template = buildAlertTemplate();
    const params = { topic: 'cpu', field: 'usage', threshold: 90 };
    const rules = [
      template.instantiate(params),
      template.instantiate(params),
    ];

    const result = validator.validateMany(rules);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate rule ID'))).toBe(true);
  });

  it('preserves runtime ref() objects through the full pipeline', () => {
    const template = buildAlertTemplate();
    const rule = template.instantiate({
      topic: 'metrics.cpu',
      field: 'usage',
      threshold: 90,
    });

    const action = rule.actions[0] as { data: Record<string, unknown> };
    expect(action.data['currentValue']).toEqual({ ref: 'event.value' });

    const result = validator.validate(rule);
    expect(result.valid).toBe(true);
  });

  it('static template (no parameters) produces a valid rule', () => {
    const template = RuleTemplate.create('static-rule')
      .ruleId('order-notification')
      .name('Order Notification')
      .priority(10)
      .when({ type: 'event' as const, topic: 'orders.created' })
      .then({
        type: 'emit_event' as const,
        topic: 'notification.send',
        data: { msg: 'New order received' },
      })
      .build();

    const rule = template.instantiate({});
    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(rule.id).toBe('order-notification');
    expect(rule.name).toBe('Order Notification');
  });
});

// ===========================================================================
// YAML API → RuleInputValidator
// ===========================================================================

describe('Integration: YAML → RuleInputValidator', () => {
  it('YAML-loaded template produces a rule that passes validation', () => {
    const template = loadAlertTemplateYAML();
    const rule = template.instantiate({
      topic: 'metrics.cpu',
      field: 'usage',
      threshold: 90,
    });

    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('YAML-loaded template with defaults passes validation', () => {
    const template = loadAlertTemplateYAML();
    const rule = template.instantiate({
      topic: 'metrics.memory',
      field: 'percentage',
    });

    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('multiple YAML-instantiated rules pass validateMany', () => {
    const template = loadAlertTemplateYAML();
    const rules = [
      template.instantiate({ topic: 'cpu', field: 'usage', threshold: 90 }),
      template.instantiate({ topic: 'memory', field: 'percentage' }),
      template.instantiate({ topic: 'disk', field: 'used', threshold: 80 }),
    ];

    const result = validator.validateMany(rules);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('YAML template preserves runtime references through validation', () => {
    const template = loadAlertTemplateYAML();
    const rule = template.instantiate({
      topic: 'metrics.cpu',
      field: 'usage',
    });

    const action = rule.actions[0] as { data: Record<string, unknown> };
    expect(action.data['currentValue']).toEqual({ ref: 'event.value' });

    const result = validator.validate(rule);
    expect(result.valid).toBe(true);
  });

  it('static YAML template (no params) produces a valid rule', () => {
    const template = loadTemplateFromYAML(`
template:
  templateId: static-yaml
  parameters: []
  blueprint:
    id: static-rule
    name: Static YAML Rule
    trigger:
      type: event
      topic: orders.created
    actions:
      - type: emit_event
        topic: notification.send
        data:
          msg: order received
`);

    const rule = template.instantiate({});
    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(rule.id).toBe('static-rule');
    expect(rule.name).toBe('Static YAML Rule');
  });
});

// ===========================================================================
// Builder ↔ YAML equivalence
// ===========================================================================

describe('Integration: Builder ↔ YAML equivalence', () => {
  it('builder and YAML templates produce structurally equivalent rules', () => {
    const builderTemplate = buildAlertTemplate();
    const yamlTemplate = loadAlertTemplateYAML();

    const params = { topic: 'metrics.cpu', field: 'usage', threshold: 90 };
    const builderRule = builderTemplate.instantiate(params);
    const yamlRule = yamlTemplate.instantiate(params);

    expect(builderRule.id).toBe(yamlRule.id);
    expect(builderRule.name).toBe(yamlRule.name);
    expect(builderRule.priority).toBe(yamlRule.priority);
    expect(builderRule.enabled).toBe(yamlRule.enabled);
    expect(builderRule.tags).toEqual(yamlRule.tags);
    expect(builderRule.description).toBe(yamlRule.description);
    expect(builderRule.trigger).toEqual(yamlRule.trigger);
    expect(builderRule.conditions).toEqual(yamlRule.conditions);
    expect(builderRule.actions).toEqual(yamlRule.actions);
  });

  it('both pathways produce rules with identical validator results', () => {
    const builderTemplate = buildAlertTemplate();
    const yamlTemplate = loadAlertTemplateYAML();

    const params = { topic: 'metrics.disk', field: 'used', threshold: 80 };
    const builderResult = validator.validate(builderTemplate.instantiate(params));
    const yamlResult = validator.validate(yamlTemplate.instantiate(params));

    expect(builderResult.valid).toBe(yamlResult.valid);
    expect(builderResult.errors.length).toBe(yamlResult.errors.length);
  });

  it('both pathways produce equivalent defaults-only rules', () => {
    const builderTemplate = buildAlertTemplate();
    const yamlTemplate = loadAlertTemplateYAML();

    const params = { topic: 'metrics.memory', field: 'percentage' };
    const builderRule = builderTemplate.instantiate(params);
    const yamlRule = yamlTemplate.instantiate(params);

    expect(builderRule.id).toBe(yamlRule.id);
    expect(builderRule.trigger).toEqual(yamlRule.trigger);
    expect(builderRule.conditions).toEqual(yamlRule.conditions);
    expect(builderRule.actions).toEqual(yamlRule.actions);
  });
});

// ===========================================================================
// Complex scenarios
// ===========================================================================

describe('Integration: complex scenarios', () => {
  it('template with multiple conditions and actions produces valid rules', () => {
    const template = RuleTemplate.create('multi-rule')
      .param('topic', { type: 'string' })
      .param('minAmount', { type: 'number', default: 100 })
      .param('status', { type: 'string', default: 'active' })
      .ruleId(p => `multi-${p['topic']}`)
      .name(p => `Multi-condition rule: ${p['topic']}`)
      .priority(75)
      .tags('complex', 'multi')
      .when({ type: 'event' as const, topic: param<string>('topic') })
      .if({
        source: { type: 'event' as const, field: 'amount' },
        operator: 'gte' as const,
        value: param('minAmount'),
      })
      .and({
        source: { type: 'event' as const, field: 'status' },
        operator: 'eq' as const,
        value: param('status'),
      })
      .then({
        type: 'emit_event' as const,
        topic: 'alert.high-value',
        data: {
          source: param('topic'),
          amount: ref('event.amount'),
        },
      })
      .also({
        type: 'set_fact' as const,
        key: 'last-alert',
        value: ref('event.id'),
      })
      .build();

    const rule = template.instantiate({
      topic: 'orders.created',
      minAmount: 500,
    });

    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(rule.conditions).toHaveLength(2);
    expect(rule.actions).toHaveLength(2);
    expect(rule.tags).toEqual(['complex', 'multi']);
  });

  it('template with fact trigger produces valid rules', () => {
    const template = RuleTemplate.create('fact-watcher')
      .param('pattern', { type: 'string' })
      .param('threshold', { type: 'number' })
      .ruleId(p => `fact-${p['pattern']}`)
      .name(p => `Watch fact: ${p['pattern']}`)
      .when({ type: 'fact' as const, pattern: param<string>('pattern') })
      .if({
        source: { type: 'fact' as const, pattern: param<string>('pattern') },
        operator: 'gte' as const,
        value: param('threshold'),
      })
      .then({
        type: 'emit_event' as const,
        topic: 'fact.alert',
        data: { pattern: param('pattern') },
      })
      .build();

    const rule = template.instantiate({ pattern: 'sensor:*:temp', threshold: 40 });
    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(rule.id).toBe('fact-sensor:*:temp');
    expect(rule.trigger).toEqual({ type: 'fact', pattern: 'sensor:*:temp' });
  });

  it('template with custom validator — instantiate succeeds with valid params', () => {
    const template = RuleTemplate.create('validated-template')
      .param('port', {
        type: 'number',
        validate: v => {
          const n = v as number;
          if (n < 1 || n > 65535) return 'port must be between 1 and 65535';
          return undefined;
        },
      })
      .ruleId(p => `monitor-port-${p['port']}`)
      .name(p => `Port Monitor: ${p['port']}`)
      .when({ type: 'event' as const, topic: 'network.scan' })
      .then({
        type: 'emit_event' as const,
        topic: 'port.alert',
        data: { port: param('port') },
      })
      .build();

    const rule = template.instantiate({ port: 8080 });
    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(rule.id).toBe('monitor-port-8080');
  });

  it('batch creation: template fleet generates valid unique rules', () => {
    const template = RuleTemplate.create('service-monitor')
      .param('service', { type: 'string' })
      .param('interval', { type: 'string', default: '5m' })
      .ruleId(p => `monitor-${p['service']}`)
      .name(p => `Monitor: ${p['service']}`)
      .when({ type: 'event' as const, topic: param<string>('service') })
      .then({
        type: 'emit_event' as const,
        topic: 'monitoring.check',
        data: {
          service: param('service'),
          interval: param('interval'),
        },
      })
      .build();

    const services = ['auth', 'payments', 'inventory', 'shipping', 'analytics'];
    const rules = services.map(service => template.instantiate({ service }));

    const result = validator.validateMany(rules);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const ids = rules.map(r => r.id);
    expect(new Set(ids).size).toBe(services.length);
  });

  it('YAML template with all blueprint fields produces valid rules', () => {
    const template = loadTemplateFromYAML(`
template:
  templateId: full-blueprint
  name: Full Blueprint Template
  description: Tests every blueprint field
  version: "2.0.0"
  tags:
    - comprehensive
    - test
  parameters:
    - name: topic
      type: string
    - name: alertLevel
      type: string
      default: warn
  blueprint:
    id: "full-{{topic}}"
    name: "Full Rule: {{topic}}"
    description: "Comprehensive rule for {{topic}}"
    priority: 42
    enabled: true
    tags:
      - generated
      - "{{alertLevel}}"
    trigger:
      type: event
      topic: "{{topic}}"
    conditions:
      - source:
          type: event
          field: severity
        operator: gte
        value: 5
    actions:
      - type: emit_event
        topic: "alerts.{{alertLevel}}"
        data:
          origin: "{{topic}}"
          timestamp:
            ref: event.timestamp
`);

    const rule = template.instantiate({ topic: 'security.login' });
    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(rule.id).toBe('full-security.login');
    expect(rule.name).toBe('Full Rule: security.login');
    expect(rule.description).toBe('Comprehensive rule for security.login');
    expect(rule.priority).toBe(42);
    expect(rule.enabled).toBe(true);
    expect(rule.tags).toContain('generated');
    expect(rule.tags).toContain('warn');

    const action = rule.actions[0] as { topic: string; data: Record<string, unknown> };
    expect(action.topic).toBe('alerts.warn');
    expect(action.data['timestamp']).toEqual({ ref: 'event.timestamp' });
  });

  it('disabled rule from template passes validation', () => {
    const template = RuleTemplate.create('disabled-rule')
      .param('topic', { type: 'string' })
      .ruleId(p => `disabled-${p['topic']}`)
      .name(p => `Disabled: ${p['topic']}`)
      .enabled(false)
      .when({ type: 'event' as const, topic: param<string>('topic') })
      .then({
        type: 'emit_event' as const,
        topic: 'noop',
        data: {},
      })
      .build();

    const rule = template.instantiate({ topic: 'test' });
    const result = validator.validate(rule);

    expect(result.valid).toBe(true);
    expect(rule.enabled).toBe(false);
  });
});

// ===========================================================================
// RuleInput shape contract
// ===========================================================================

describe('Integration: RuleInput shape contract', () => {
  it('all required RuleInput fields are present', () => {
    const template = buildAlertTemplate();
    const rule: RuleInput = template.instantiate({
      topic: 'test',
      field: 'value',
    });

    expect(typeof rule.id).toBe('string');
    expect(rule.id.length).toBeGreaterThan(0);
    expect(typeof rule.name).toBe('string');
    expect(rule.name.length).toBeGreaterThan(0);
    expect(typeof rule.priority).toBe('number');
    expect(typeof rule.enabled).toBe('boolean');
    expect(Array.isArray(rule.tags)).toBe(true);
    expect(rule.trigger).toBeDefined();
    expect(typeof rule.trigger.type).toBe('string');
    expect(Array.isArray(rule.conditions)).toBe(true);
    expect(Array.isArray(rule.actions)).toBe(true);
    expect(rule.actions.length).toBeGreaterThan(0);
  });

  it('optional description is set when template defines it', () => {
    const template = buildAlertTemplate();
    const rule = template.instantiate({ topic: 't', field: 'f' });

    expect(rule.description).toBe('Monitors a metric field and triggers an alert');
  });

  it('optional description is omitted when template does not define it', () => {
    const template = RuleTemplate.create('no-desc')
      .param('topic', { type: 'string' })
      .when({ type: 'event' as const, topic: param<string>('topic') })
      .then({ type: 'emit_event' as const, topic: 'x', data: {} })
      .build();

    const rule = template.instantiate({ topic: 'test' });

    expect(rule.description).toBeUndefined();
  });
});
