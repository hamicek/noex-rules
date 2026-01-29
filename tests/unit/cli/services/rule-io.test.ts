import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RulePersistence } from '../../../../src/persistence/rule-persistence.js';
import {
  RuleIOService,
  createRuleIOService,
  RuleIOValidationError,
  type ImportOptions,
  type ExportOptions
} from '../../../../src/cli/services/rule-io.js';
import type { Rule } from '../../../../src/types/rule.js';

function createValidRule(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'Test' }],
    ...overrides
  };
}

function createCompleteRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'Test description',
    priority: 0,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'Test' }],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

describe('RuleIOService', () => {
  let persistence: RulePersistence;
  let service: RuleIOService;

  beforeEach(async () => {
    const adapter = new MemoryAdapter();
    persistence = new RulePersistence(adapter);
    service = createRuleIOService(persistence);
  });

  describe('import', () => {
    it('should import a single rule', async () => {
      const rules = [createValidRule()];

      const result = await service.import(rules);

      expect(result.imported).toBe(1);
      expect(result.total).toBe(1);
      expect(result.importedIds).toContain('test-rule');

      const { rules: stored } = await persistence.load();
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe('test-rule');
    });

    it('should import multiple rules', async () => {
      const rules = [
        createValidRule({ id: 'rule-1', name: 'Rule 1' }),
        createValidRule({ id: 'rule-2', name: 'Rule 2' }),
        createValidRule({ id: 'rule-3', name: 'Rule 3' })
      ];

      const result = await service.import(rules);

      expect(result.imported).toBe(3);
      expect(result.total).toBe(3);

      const { rules: stored } = await persistence.load();
      expect(stored.length).toBe(3);
    });

    it('should replace existing rules by default', async () => {
      await persistence.save([createCompleteRule({ id: 'existing-rule' })]);

      const rules = [createValidRule({ id: 'new-rule' })];
      const result = await service.import(rules);

      expect(result.imported).toBe(1);
      expect(result.total).toBe(1);

      const { rules: stored } = await persistence.load();
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe('new-rule');
    });

    it('should merge with existing rules when merge option is true', async () => {
      await persistence.save([createCompleteRule({ id: 'existing-rule' })]);

      const rules = [createValidRule({ id: 'new-rule' })];
      const result = await service.import(rules, { merge: true });

      expect(result.imported).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.total).toBe(2);

      const { rules: stored } = await persistence.load();
      expect(stored.length).toBe(2);
      expect(stored.map((r) => r.id)).toContain('existing-rule');
      expect(stored.map((r) => r.id)).toContain('new-rule');
    });

    it('should update existing rules during merge', async () => {
      const existingRule = createCompleteRule({ id: 'shared-rule', name: 'Old Name', version: 1 });
      await persistence.save([existingRule]);

      const rules = [createValidRule({ id: 'shared-rule', name: 'New Name' })];
      const result = await service.import(rules, { merge: true });

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.updatedIds).toContain('shared-rule');

      const { rules: stored } = await persistence.load();
      expect(stored.length).toBe(1);
      expect(stored[0].name).toBe('New Name');
      expect(stored[0].version).toBe(2);
    });

    it('should normalize imported rules with defaults', async () => {
      const rules = [
        {
          id: 'minimal-rule',
          name: 'Minimal',
          trigger: { type: 'event', topic: 'test' }
        }
      ];

      await service.import(rules);

      const { rules: stored } = await persistence.load();
      expect(stored[0].priority).toBe(0);
      expect(stored[0].enabled).toBe(true);
      expect(stored[0].tags).toEqual([]);
      expect(stored[0].conditions).toEqual([]);
      expect(stored[0].actions).toEqual([]);
      expect(stored[0].version).toBe(1);
      expect(stored[0].createdAt).toBeDefined();
      expect(stored[0].updatedAt).toBeDefined();
    });

    it('should validate rules before import by default', async () => {
      const rules = [{ id: '', name: 'Invalid', trigger: {} }];

      await expect(service.import(rules)).rejects.toThrow(RuleIOValidationError);
    });

    it('should skip validation when disabled', async () => {
      const rules = [createValidRule()];

      const result = await service.import(rules, { validate: false });

      expect(result.imported).toBe(1);
    });

    it('should throw validation error with details', async () => {
      const rules = [{ name: 'Missing ID' }];

      try {
        await service.import(rules);
        expect.fail('Should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RuleIOValidationError);
        expect((err as RuleIOValidationError).message).toContain('Validation failed');
        expect((err as RuleIOValidationError).validation.errors.length).toBeGreaterThan(0);
      }
    });

    it('should preserve existing rule timestamps during merge update', async () => {
      const oldCreatedAt = Date.now() - 100000;
      const existingRule = createCompleteRule({
        id: 'rule',
        createdAt: oldCreatedAt,
        updatedAt: oldCreatedAt
      });
      await persistence.save([existingRule]);

      const rules = [createValidRule({ id: 'rule', name: 'Updated' })];
      await service.import(rules, { merge: true });

      const { rules: stored } = await persistence.load();
      expect(stored[0].createdAt).toBe(oldCreatedAt);
      expect(stored[0].updatedAt).toBeGreaterThan(oldCreatedAt);
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      await persistence.save([
        createCompleteRule({ id: 'rule-1', tags: ['production', 'critical'], enabled: true }),
        createCompleteRule({ id: 'rule-2', tags: ['development'], enabled: true }),
        createCompleteRule({ id: 'rule-3', tags: ['production'], enabled: false })
      ]);
    });

    it('should export all rules', async () => {
      const result = await service.export();

      expect(result.rules.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.filtered).toBe(3);
    });

    it('should filter by single tag', async () => {
      const result = await service.export({ tags: ['production'] });

      expect(result.filtered).toBe(2);
      expect(result.rules.map((r) => r.id)).toContain('rule-1');
      expect(result.rules.map((r) => r.id)).toContain('rule-3');
    });

    it('should filter by multiple tags (OR)', async () => {
      const result = await service.export({ tags: ['critical', 'development'] });

      expect(result.filtered).toBe(2);
      expect(result.rules.map((r) => r.id)).toContain('rule-1');
      expect(result.rules.map((r) => r.id)).toContain('rule-2');
    });

    it('should filter by enabled status', async () => {
      const result = await service.export({ enabled: true });

      expect(result.filtered).toBe(2);
      expect(result.rules.every((r) => r.enabled)).toBe(true);
    });

    it('should filter by disabled status', async () => {
      const result = await service.export({ enabled: false });

      expect(result.filtered).toBe(1);
      expect(result.rules[0].id).toBe('rule-3');
    });

    it('should combine filters', async () => {
      const result = await service.export({ tags: ['production'], enabled: true });

      expect(result.filtered).toBe(1);
      expect(result.rules[0].id).toBe('rule-1');
    });

    it('should return empty array when no rules match', async () => {
      const result = await service.export({ tags: ['nonexistent'] });

      expect(result.filtered).toBe(0);
      expect(result.rules).toEqual([]);
      expect(result.total).toBe(3);
    });

    it('should return empty when storage is empty', async () => {
      await persistence.clear();

      const result = await service.export();

      expect(result.rules).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.filtered).toBe(0);
    });
  });

  describe('previewImport', () => {
    it('should preview import without making changes', async () => {
      const rules = [createValidRule()];

      const preview = await service.previewImport(rules);

      expect(preview.valid).toBe(true);
      expect(preview.toImport.length).toBe(1);
      expect(preview.toImport[0].id).toBe('test-rule');

      const { rules: stored } = await persistence.load();
      expect(stored.length).toBe(0);
    });

    it('should show validation errors in preview', async () => {
      const rules = [{ name: 'Invalid' }];

      const preview = await service.previewImport(rules);

      expect(preview.valid).toBe(false);
      expect(preview.validationErrors.length).toBeGreaterThan(0);
    });

    it('should preview merge updates', async () => {
      await persistence.save([createCompleteRule({ id: 'existing', version: 5 })]);

      const rules = [
        createValidRule({ id: 'existing', name: 'Updated' }),
        createValidRule({ id: 'new-rule' })
      ];

      const preview = await service.previewImport(rules, { merge: true });

      expect(preview.toImport.length).toBe(1);
      expect(preview.toUpdate.length).toBe(1);
      expect(preview.toUpdate[0].oldVersion).toBe(5);
      expect(preview.toUpdate[0].newVersion).toBe(6);
    });

    it('should show unchanged rules in preview', async () => {
      await persistence.save([
        createCompleteRule({ id: 'existing-1' }),
        createCompleteRule({ id: 'existing-2' })
      ]);

      const rules = [createValidRule({ id: 'existing-1' })];

      const preview = await service.previewImport(rules, { merge: true });

      expect(preview.unchanged.length).toBe(1);
      expect(preview.unchanged[0].id).toBe('existing-2');
    });

    it('should show all as new in replace mode', async () => {
      await persistence.save([createCompleteRule({ id: 'existing' })]);

      const rules = [
        createValidRule({ id: 'rule-1' }),
        createValidRule({ id: 'rule-2' })
      ];

      const preview = await service.previewImport(rules, { merge: false });

      expect(preview.toImport.length).toBe(2);
      expect(preview.toUpdate.length).toBe(0);
      expect(preview.unchanged.length).toBe(0);
    });
  });

  describe('createRuleIOService', () => {
    it('should create service instance', () => {
      const adapter = new MemoryAdapter();
      const persistence = new RulePersistence(adapter);

      const service = createRuleIOService(persistence);

      expect(service).toBeInstanceOf(RuleIOService);
    });
  });
});
