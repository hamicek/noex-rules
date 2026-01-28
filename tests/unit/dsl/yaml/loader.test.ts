import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadRulesFromYAML, loadRulesFromFile, YamlLoadError } from '../../../../src/dsl/yaml/loader';
import { YamlValidationError } from '../../../../src/dsl/yaml/schema';

const FIXTURES = resolve(__dirname, '../../../fixtures/yaml');

// ---------------------------------------------------------------------------
// loadRulesFromYAML
// ---------------------------------------------------------------------------

describe('loadRulesFromYAML', () => {
  describe('single rule', () => {
    it('loads a single rule object', () => {
      const rules = loadRulesFromYAML(`
        id: test-rule
        trigger:
          type: event
          topic: test.event
        actions:
          - type: emit_event
            topic: result
            data: {}
      `);

      expect(rules).toHaveLength(1);
      expect(rules[0]!.id).toBe('test-rule');
      expect(rules[0]!.trigger).toEqual({ type: 'event', topic: 'test.event' });
    });

    it('applies default values', () => {
      const rules = loadRulesFromYAML(`
        id: defaults-test
        trigger:
          type: event
          topic: x
        actions:
          - type: delete_fact
            key: k
      `);

      const rule = rules[0]!;
      expect(rule.name).toBe('defaults-test');
      expect(rule.priority).toBe(0);
      expect(rule.enabled).toBe(true);
      expect(rule.tags).toEqual([]);
      expect(rule.conditions).toEqual([]);
    });
  });

  describe('multiple rules', () => {
    it('loads rules from top-level array', () => {
      const rules = loadRulesFromYAML(`
        - id: rule-1
          trigger:
            type: event
            topic: a
          actions:
            - type: delete_fact
              key: k

        - id: rule-2
          trigger:
            type: event
            topic: b
          actions:
            - type: delete_fact
              key: k
      `);

      expect(rules).toHaveLength(2);
      expect(rules[0]!.id).toBe('rule-1');
      expect(rules[1]!.id).toBe('rule-2');
    });

    it('loads rules from "rules" wrapper', () => {
      const rules = loadRulesFromYAML(`
        rules:
          - id: wrapped-1
            trigger:
              type: event
              topic: x
            actions:
              - type: delete_fact
                key: k
          - id: wrapped-2
            trigger:
              type: fact
              pattern: "user:*"
            actions:
              - type: log
                level: info
                message: test
      `);

      expect(rules).toHaveLength(2);
      expect(rules[0]!.id).toBe('wrapped-1');
      expect(rules[1]!.id).toBe('wrapped-2');
    });
  });

  describe('reference normalization', () => {
    it('normalizes ${...} in emit data', () => {
      const rules = loadRulesFromYAML(`
        id: ref-test
        trigger:
          type: event
          topic: order.created
        actions:
          - type: emit_event
            topic: notification
            data:
              orderId: "\${event.orderId}"
              message: hello
      `);

      const action = rules[0]!.actions[0] as { type: 'emit_event'; data: Record<string, unknown> };
      expect(action.data['orderId']).toEqual({ ref: 'event.orderId' });
      expect(action.data['message']).toBe('hello');
    });

    it('normalizes explicit ref objects in data', () => {
      const rules = loadRulesFromYAML(`
        id: explicit-ref
        trigger:
          type: event
          topic: test
        actions:
          - type: emit_event
            topic: result
            data:
              userId:
                ref: event.userId
      `);

      const action = rules[0]!.actions[0] as { type: 'emit_event'; data: Record<string, unknown> };
      expect(action.data['userId']).toEqual({ ref: 'event.userId' });
    });
  });

  describe('complete rule with all features', () => {
    it('loads a rule with conditions, actions, and temporal pattern', () => {
      const rules = loadRulesFromYAML(`
        id: fraud-detection
        name: Fraud Detection Rule
        description: Detects brute force login attempts
        priority: 200
        enabled: true
        tags:
          - security
          - auth
        trigger:
          type: temporal
          pattern:
            type: sequence
            events:
              - topic: auth.login_failed
                filter:
                  method: password
              - topic: auth.login_failed
              - topic: auth.login_failed
            within: 5m
            groupBy: userId
            strict: false
        conditions:
          - source:
              type: context
              key: env
            operator: eq
            value: production
        actions:
          - type: emit_event
            topic: security.alert
            data:
              type: brute_force
              userId:
                ref: event.userId
          - type: set_fact
            key: "user:blocked"
            value: true
          - type: log
            level: warn
            message: Brute force attack detected
      `);

      expect(rules).toHaveLength(1);
      const rule = rules[0]!;
      expect(rule.id).toBe('fraud-detection');
      expect(rule.name).toBe('Fraud Detection Rule');
      expect(rule.description).toBe('Detects brute force login attempts');
      expect(rule.priority).toBe(200);
      expect(rule.tags).toEqual(['security', 'auth']);
      expect(rule.conditions).toHaveLength(1);
      expect(rule.actions).toHaveLength(3);

      const trigger = rule.trigger as { type: 'temporal'; pattern: { type: string; events: unknown[]; within: string } };
      expect(trigger.pattern.type).toBe('sequence');
      expect(trigger.pattern.events).toHaveLength(3);
      expect(trigger.pattern.within).toBe('5m');
    });
  });

  describe('error handling', () => {
    it('throws YamlLoadError on empty content', () => {
      expect(() => loadRulesFromYAML('')).toThrow(YamlLoadError);
      expect(() => loadRulesFromYAML('')).toThrow(/empty/);
    });

    it('throws YamlLoadError on null YAML', () => {
      expect(() => loadRulesFromYAML('~')).toThrow(YamlLoadError);
      expect(() => loadRulesFromYAML('null')).toThrow(YamlLoadError);
    });

    it('throws YamlLoadError on empty array', () => {
      expect(() => loadRulesFromYAML('[]')).toThrow(YamlLoadError);
      expect(() => loadRulesFromYAML('[]')).toThrow(/empty/);
    });

    it('throws YamlLoadError on empty rules array', () => {
      expect(() => loadRulesFromYAML('rules: []')).toThrow(YamlLoadError);
    });

    it('throws YamlLoadError on non-array rules', () => {
      expect(() => loadRulesFromYAML('rules: invalid')).toThrow(YamlLoadError);
      expect(() => loadRulesFromYAML('rules: invalid')).toThrow(/"rules" must be an array/);
    });

    it('throws YamlLoadError on invalid YAML syntax', () => {
      expect(() => loadRulesFromYAML('{{invalid yaml')).toThrow(YamlLoadError);
      expect(() => loadRulesFromYAML('{{invalid yaml')).toThrow(/YAML syntax error/);
    });

    it('throws YamlLoadError on scalar YAML', () => {
      expect(() => loadRulesFromYAML('"just a string"')).toThrow(YamlLoadError);
    });

    it('throws YamlValidationError on invalid rule structure', () => {
      expect(() => loadRulesFromYAML(`
        id: bad-rule
        trigger:
          type: event
          topic: x
        actions:
          - type: unknown_action
      `)).toThrow(YamlValidationError);
    });
  });

  describe('all action types', () => {
    it('supports all 7 action types in a single rule', () => {
      const rules = loadRulesFromYAML(`
        id: all-actions
        trigger:
          type: event
          topic: test
        actions:
          - type: set_fact
            key: status
            value: active
          - type: delete_fact
            key: temp
          - type: emit_event
            topic: done
            data:
              ok: true
          - type: set_timer
            timer:
              name: reminder
              duration: 1h
              onExpire:
                topic: reminder.fired
                data: {}
          - type: cancel_timer
            name: old-timer
          - type: call_service
            service: mailer
            method: send
            args:
              - "user@test.com"
              - "Hello"
          - type: log
            level: info
            message: All actions executed
      `);

      expect(rules[0]!.actions).toHaveLength(7);
      const types = rules[0]!.actions.map(a => a.type);
      expect(types).toEqual([
        'set_fact', 'delete_fact', 'emit_event',
        'set_timer', 'cancel_timer', 'call_service', 'log',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// loadRulesFromFile
// ---------------------------------------------------------------------------

describe('loadRulesFromFile', () => {
  it('loads simple rule from YAML file', async () => {
    const rules = await loadRulesFromFile(resolve(FIXTURES, 'simple.yaml'));

    expect(rules).toHaveLength(1);
    const rule = rules[0]!;
    expect(rule.id).toBe('order-notification');
    expect(rule.name).toBe('Send Order Notification');
    expect(rule.description).toBe('Notifies on large orders');
    expect(rule.priority).toBe(100);
    expect(rule.tags).toEqual(['orders', 'notifications']);
    expect(rule.trigger).toEqual({ type: 'event', topic: 'order.created' });
    expect(rule.conditions).toHaveLength(1);
    expect(rule.actions).toHaveLength(1);
  });

  it('loads multiple rules from YAML file', async () => {
    const rules = await loadRulesFromFile(resolve(FIXTURES, 'multiple.yaml'));

    expect(rules).toHaveLength(2);
    expect(rules[0]!.id).toBe('rule-welcome');
    expect(rules[1]!.id).toBe('rule-premium');
  });

  it('loads temporal pattern from YAML file', async () => {
    const rules = await loadRulesFromFile(resolve(FIXTURES, 'temporal.yaml'));

    expect(rules).toHaveLength(1);
    const rule = rules[0]!;
    expect(rule.id).toBe('payment-timeout');
    expect(rule.trigger.type).toBe('temporal');

    const trigger = rule.trigger as { type: 'temporal'; pattern: { type: string; within: string; groupBy: string } };
    expect(trigger.pattern.type).toBe('absence');
    expect(trigger.pattern.within).toBe('24h');
    expect(trigger.pattern.groupBy).toBe('orderId');
  });

  it('throws YamlLoadError on non-existent file', async () => {
    await expect(loadRulesFromFile('/nonexistent/path.yaml'))
      .rejects.toThrow(YamlLoadError);
  });

  it('includes file path in error', async () => {
    try {
      await loadRulesFromFile('/nonexistent/path.yaml');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(YamlLoadError);
      expect((err as YamlLoadError).filePath).toBe('/nonexistent/path.yaml');
    }
  });

  it('wraps validation errors with file path', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const tmpFile = resolve(FIXTURES, '_invalid_temp.yaml');

    try {
      await writeFile(tmpFile, 'id: bad\ntrigger:\n  type: event\n  topic: x\nactions: []');
      await expect(loadRulesFromFile(tmpFile)).rejects.toThrow(YamlLoadError);
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  });
});
