import { describe, it, expect } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import { RuleValidationError } from '../../src/validation/index';
import type { RuleInput } from '../../src/types/rule';

const validRule: RuleInput = {
  id: 'valid-rule',
  name: 'Valid Rule',
  priority: 10,
  enabled: true,
  tags: [],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [],
  actions: [{ type: 'set_fact', key: 'order:processed', value: true }]
};

describe('Engine Validation Integration', () => {
  describe('registerRule with validation', () => {
    it('registers a valid rule', async () => {
      const engine = await RuleEngine.start({ name: 'val-valid' });

      const rule = engine.registerRule(validRule);

      expect(rule.id).toBe('valid-rule');
      expect(rule.name).toBe('Valid Rule');

      await engine.stop();
    });

    it('throws RuleValidationError for rule missing id', async () => {
      const engine = await RuleEngine.start({ name: 'val-no-id' });

      const invalid = { name: 'No ID', trigger: { type: 'event', topic: 'x' } } as unknown as RuleInput;

      expect(() => engine.registerRule(invalid)).toThrow(RuleValidationError);

      await engine.stop();
    });

    it('throws RuleValidationError for rule missing name', async () => {
      const engine = await RuleEngine.start({ name: 'val-no-name' });

      const invalid = { id: 'no-name', trigger: { type: 'event', topic: 'x' } } as unknown as RuleInput;

      expect(() => engine.registerRule(invalid)).toThrow(RuleValidationError);

      await engine.stop();
    });

    it('throws RuleValidationError for rule missing trigger', async () => {
      const engine = await RuleEngine.start({ name: 'val-no-trigger' });

      const invalid = { id: 'no-trigger', name: 'No Trigger' } as unknown as RuleInput;

      expect(() => engine.registerRule(invalid)).toThrow(RuleValidationError);

      await engine.stop();
    });

    it('throws RuleValidationError for invalid trigger type', async () => {
      const engine = await RuleEngine.start({ name: 'val-bad-trigger' });

      const invalid = {
        id: 'bad-trigger',
        name: 'Bad Trigger',
        priority: 1,
        enabled: true,
        tags: [],
        trigger: { type: 'unknown_type' },
        conditions: [],
        actions: []
      } as unknown as RuleInput;

      expect(() => engine.registerRule(invalid)).toThrow(RuleValidationError);

      await engine.stop();
    });

    it('includes validation issues in the error', async () => {
      const engine = await RuleEngine.start({ name: 'val-issues' });

      const invalid = {} as unknown as RuleInput;

      try {
        engine.registerRule(invalid);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RuleValidationError);
        const validationError = err as RuleValidationError;
        expect(validationError.issues.length).toBeGreaterThan(0);
        expect(validationError.statusCode).toBe(400);
        expect(validationError.code).toBe('RULE_VALIDATION_ERROR');

        const paths = validationError.issues.map(i => i.path);
        expect(paths).toContain('id');
        expect(paths).toContain('name');
        expect(paths).toContain('trigger');
      }

      await engine.stop();
    });

    it('skips validation when skipValidation is true', async () => {
      const engine = await RuleEngine.start({ name: 'val-skip' });

      // Missing optional fields but still has required structure
      const minimal: RuleInput = {
        id: 'skip-val',
        name: 'Skip Validation',
        priority: 1,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'x' },
        conditions: [],
        actions: []
      };

      const rule = engine.registerRule(minimal, { skipValidation: true });
      expect(rule.id).toBe('skip-val');

      await engine.stop();
    });

    it('does not register invalid rule into the engine', async () => {
      const engine = await RuleEngine.start({ name: 'val-no-register' });

      const invalid = { id: 'ghost' } as unknown as RuleInput;

      expect(() => engine.registerRule(invalid)).toThrow(RuleValidationError);
      expect(engine.getRule('ghost')).toBeUndefined();
      expect(engine.getStats().rulesCount).toBe(0);

      await engine.stop();
    });
  });

  describe('validateRule (dry-run)', () => {
    it('returns valid result for a correct rule', async () => {
      const engine = await RuleEngine.start({ name: 'val-dry-ok' });

      const result = engine.validateRule(validRule);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      await engine.stop();
    });

    it('returns errors for invalid input', async () => {
      const engine = await RuleEngine.start({ name: 'val-dry-err' });

      const result = engine.validateRule({ id: 123, name: null });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      await engine.stop();
    });

    it('returns errors for non-object input', async () => {
      const engine = await RuleEngine.start({ name: 'val-dry-str' });

      const result = engine.validateRule('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('object');

      await engine.stop();
    });

    it('does not register the rule', async () => {
      const engine = await RuleEngine.start({ name: 'val-dry-no-reg' });

      engine.validateRule(validRule);

      expect(engine.getRule('valid-rule')).toBeUndefined();
      expect(engine.getStats().rulesCount).toBe(0);

      await engine.stop();
    });

    it('returns warnings separately from errors', async () => {
      const engine = await RuleEngine.start({ name: 'val-dry-warn' });

      const ruleWithFloatPriority = {
        ...validRule,
        id: 'float-priority',
        priority: 3.14
      };

      const result = engine.validateRule(ruleWithFloatPriority);

      // Float priority is a warning, not an error
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.path.includes('priority'))).toBe(true);

      await engine.stop();
    });
  });

  describe('backwards compatibility', () => {
    it('registerRule without options works as before', async () => {
      const engine = await RuleEngine.start({ name: 'val-compat' });

      const rule = engine.registerRule(validRule);

      expect(rule.id).toBe(validRule.id);
      expect(rule.name).toBe(validRule.name);

      await engine.stop();
    });

    it('existing valid rules continue to register', async () => {
      const engine = await RuleEngine.start({ name: 'val-existing' });

      const rules: RuleInput[] = [
        {
          id: 'event-rule',
          name: 'Event Rule',
          priority: 10,
          enabled: true,
          tags: ['test'],
          trigger: { type: 'event', topic: 'order.*' },
          conditions: [
            { source: { type: 'fact', pattern: 'customer:status' }, operator: 'eq', value: 'active' }
          ],
          actions: [
            { type: 'set_fact', key: 'order:validated', value: true },
            { type: 'emit_event', topic: 'order.validated', data: {} }
          ]
        },
        {
          id: 'fact-rule',
          name: 'Fact Rule',
          priority: 5,
          enabled: true,
          tags: [],
          trigger: { type: 'fact', pattern: 'inventory:*' },
          conditions: [],
          actions: [
            { type: 'log', message: 'inventory changed', level: 'info' }
          ]
        },
        {
          id: 'timer-rule',
          name: 'Timer Rule',
          priority: 1,
          enabled: false,
          tags: ['scheduled'],
          trigger: { type: 'timer', name: 'daily-check' },
          conditions: [],
          actions: [
            { type: 'set_fact', key: 'check:last_run', value: true }
          ]
        }
      ];

      for (const input of rules) {
        const registered = engine.registerRule(input);
        expect(registered.id).toBe(input.id);
      }

      expect(engine.getStats().rulesCount).toBe(3);

      await engine.stop();
    });
  });
});
