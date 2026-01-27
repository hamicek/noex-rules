import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAdapter, SQLiteAdapter } from '@hamicek/noex';
import { RulePersistence } from '../../../src/persistence/rule-persistence';
import type { Rule } from '../../../src/types/rule';

const createTestRule = (id: string, overrides: Partial<Rule> = {}): Rule => ({
  id,
  name: `Rule ${id}`,
  description: `Test rule ${id}`,
  priority: 100,
  enabled: true,
  version: 1,
  tags: ['test'],
  trigger: { type: 'fact', pattern: `test:${id}:*` },
  conditions: [],
  actions: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('RulePersistence', () => {
  describe('with MemoryAdapter', () => {
    let adapter: MemoryAdapter;
    let persistence: RulePersistence;

    beforeEach(() => {
      adapter = new MemoryAdapter();
      persistence = new RulePersistence(adapter);
    });

    describe('save()', () => {
      it('saves rules to storage', async () => {
        const rules = [createTestRule('rule-1'), createTestRule('rule-2')];

        await persistence.save(rules);

        const exists = await persistence.exists();
        expect(exists).toBe(true);
      });

      it('overwrites previous rules on subsequent saves', async () => {
        await persistence.save([createTestRule('rule-1')]);
        await persistence.save([createTestRule('rule-2'), createTestRule('rule-3')]);

        const loaded = await persistence.load();

        expect(loaded).toHaveLength(2);
        expect(loaded.map(r => r.id)).toEqual(['rule-2', 'rule-3']);
      });

      it('saves empty array when no rules provided', async () => {
        await persistence.save([]);

        const loaded = await persistence.load();
        expect(loaded).toEqual([]);
      });
    });

    describe('load()', () => {
      it('loads saved rules', async () => {
        const rules = [
          createTestRule('rule-1', { priority: 50 }),
          createTestRule('rule-2', { priority: 100 }),
        ];
        await persistence.save(rules);

        const loaded = await persistence.load();

        expect(loaded).toHaveLength(2);
        expect(loaded[0].id).toBe('rule-1');
        expect(loaded[0].priority).toBe(50);
        expect(loaded[1].id).toBe('rule-2');
        expect(loaded[1].priority).toBe(100);
      });

      it('returns empty array when no rules saved', async () => {
        const loaded = await persistence.load();

        expect(loaded).toEqual([]);
      });

      it('preserves all rule properties', async () => {
        const rule = createTestRule('complex-rule', {
          description: 'Complex test rule',
          tags: ['billing', 'critical'],
          trigger: { type: 'event', topic: 'order.created' },
          conditions: [{ type: 'fact', key: 'customer:{{id}}:vip', operator: 'equals', value: true }],
          actions: [{ type: 'set_fact', key: 'customer:{{id}}:discount', value: 0.2 }],
        });
        await persistence.save([rule]);

        const [loaded] = await persistence.load();

        expect(loaded.id).toBe('complex-rule');
        expect(loaded.description).toBe('Complex test rule');
        expect(loaded.tags).toEqual(['billing', 'critical']);
        expect(loaded.trigger).toEqual({ type: 'event', topic: 'order.created' });
        expect(loaded.conditions).toHaveLength(1);
        expect(loaded.actions).toHaveLength(1);
      });

      it('returns empty array for schema version mismatch', async () => {
        const v1Persistence = new RulePersistence(adapter, { schemaVersion: 1 });
        await v1Persistence.save([createTestRule('rule-1')]);

        const v2Persistence = new RulePersistence(adapter, { schemaVersion: 2 });
        const loaded = await v2Persistence.load();

        expect(loaded).toEqual([]);
      });
    });

    describe('clear()', () => {
      it('removes all persisted rules', async () => {
        await persistence.save([createTestRule('rule-1')]);

        const result = await persistence.clear();

        expect(result).toBe(true);
        expect(await persistence.exists()).toBe(false);
      });

      it('returns false when nothing to clear', async () => {
        const result = await persistence.clear();

        expect(result).toBe(false);
      });
    });

    describe('exists()', () => {
      it('returns false when no rules saved', async () => {
        expect(await persistence.exists()).toBe(false);
      });

      it('returns true after saving rules', async () => {
        await persistence.save([createTestRule('rule-1')]);

        expect(await persistence.exists()).toBe(true);
      });

      it('returns false after clear', async () => {
        await persistence.save([createTestRule('rule-1')]);
        await persistence.clear();

        expect(await persistence.exists()).toBe(false);
      });
    });

    describe('configuration', () => {
      it('uses default key "rules"', () => {
        expect(persistence.getKey()).toBe('rules');
      });

      it('uses custom key when provided', () => {
        const customPersistence = new RulePersistence(adapter, { key: 'my-custom-rules' });

        expect(customPersistence.getKey()).toBe('my-custom-rules');
      });

      it('uses default schema version 1', () => {
        expect(persistence.getSchemaVersion()).toBe(1);
      });

      it('uses custom schema version when provided', () => {
        const customPersistence = new RulePersistence(adapter, { schemaVersion: 5 });

        expect(customPersistence.getSchemaVersion()).toBe(5);
      });

      it('isolates data by key', async () => {
        const persistence1 = new RulePersistence(adapter, { key: 'engine-1' });
        const persistence2 = new RulePersistence(adapter, { key: 'engine-2' });

        await persistence1.save([createTestRule('rule-1')]);
        await persistence2.save([createTestRule('rule-2')]);

        const loaded1 = await persistence1.load();
        const loaded2 = await persistence2.load();

        expect(loaded1).toHaveLength(1);
        expect(loaded1[0].id).toBe('rule-1');
        expect(loaded2).toHaveLength(1);
        expect(loaded2[0].id).toBe('rule-2');
      });
    });
  });

  // SQLiteAdapter používá require() interně, což nefunguje v ESM prostředí vitest
  // Tyto testy lze spustit v integračním prostředí
  describe.skip('with SQLiteAdapter', () => {
    let adapter: SQLiteAdapter;
    let persistence: RulePersistence;

    beforeEach(() => {
      adapter = new SQLiteAdapter({ filename: ':memory:' });
      persistence = new RulePersistence(adapter);
    });

    afterEach(async () => {
      await adapter.close?.();
    });

    it('saves and loads rules', async () => {
      const rules = [createTestRule('sqlite-rule-1'), createTestRule('sqlite-rule-2')];

      await persistence.save(rules);
      const loaded = await persistence.load();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('sqlite-rule-1');
      expect(loaded[1].id).toBe('sqlite-rule-2');
    });

    it('preserves rule data types correctly', async () => {
      const rule = createTestRule('typed-rule', {
        priority: 150,
        enabled: false,
        version: 3,
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
      });

      await persistence.save([rule]);
      const [loaded] = await persistence.load();

      expect(loaded.priority).toBe(150);
      expect(loaded.enabled).toBe(false);
      expect(loaded.version).toBe(3);
      expect(loaded.createdAt).toBe(1700000000000);
      expect(loaded.updatedAt).toBe(1700000001000);
    });

    it('handles rules with all trigger types', async () => {
      const rules = [
        createTestRule('fact-rule', { trigger: { type: 'fact', pattern: 'customer:*:status' } }),
        createTestRule('event-rule', { trigger: { type: 'event', topic: 'order.created' } }),
        createTestRule('timer-rule', { trigger: { type: 'timer', name: 'daily-cleanup' } }),
        createTestRule('temporal-rule', {
          trigger: {
            type: 'temporal',
            pattern: {
              type: 'sequence',
              events: [{ topic: 'a' }, { topic: 'b' }],
              within: '5m',
            },
          },
        }),
      ];

      await persistence.save(rules);
      const loaded = await persistence.load();

      expect(loaded).toHaveLength(4);
      expect(loaded[0].trigger.type).toBe('fact');
      expect(loaded[1].trigger.type).toBe('event');
      expect(loaded[2].trigger.type).toBe('timer');
      expect(loaded[3].trigger.type).toBe('temporal');
    });

    it('handles large number of rules', async () => {
      const rules = Array.from({ length: 100 }, (_, i) => createTestRule(`rule-${i}`));

      await persistence.save(rules);
      const loaded = await persistence.load();

      expect(loaded).toHaveLength(100);
    });
  });
});
