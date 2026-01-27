import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RuleEngine } from '../../src/core/rule-engine';
import { RulePersistence } from '../../src/persistence/rule-persistence';
import type { RuleInput } from '../../src/types/rule';

const createTestRule = (id: string, overrides: Partial<RuleInput> = {}): RuleInput => ({
  id,
  name: `Rule ${id}`,
  priority: 100,
  enabled: true,
  tags: ['test'],
  trigger: { type: 'event', topic: `test.${id}` },
  conditions: [],
  actions: [{ type: 'set_fact', key: `executed:${id}`, value: true }],
  ...overrides,
});

describe('RuleEngine Persistence Integration', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  describe('start() with persistence', () => {
    it('creates engine with persistence configured', async () => {
      const engine = await RuleEngine.start({
        name: 'persist-test',
        persistence: { adapter },
      });

      expect(engine.isRunning).toBe(true);
      expect(engine.getRules()).toHaveLength(0);

      await engine.stop();
    });

    it('restores rules from persistence on start', async () => {
      // Nejprve uložíme pravidla přímo do persistence
      const persistence = new RulePersistence(adapter);
      await persistence.save([
        {
          ...createTestRule('restored-1'),
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any,
        {
          ...createTestRule('restored-2'),
          version: 2,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any,
      ]);

      // Spustíme engine s persistence
      const engine = await RuleEngine.start({
        name: 'restore-test',
        persistence: { adapter },
      });

      const rules = engine.getRules();
      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['restored-1', 'restored-2']);

      await engine.stop();
    });

    it('uses custom persistence key', async () => {
      const persistence = new RulePersistence(adapter, { key: 'custom-key' });
      await persistence.save([
        {
          ...createTestRule('custom-rule'),
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any,
      ]);

      const engine = await RuleEngine.start({
        name: 'custom-key-test',
        persistence: { adapter, key: 'custom-key' },
      });

      expect(engine.getRules()).toHaveLength(1);
      expect(engine.getRule('custom-rule')).toBeDefined();

      await engine.stop();
    });

    it('respects schema version on restore', async () => {
      // Uložíme s verzí 1
      const v1Persistence = new RulePersistence(adapter, { schemaVersion: 1 });
      await v1Persistence.save([
        {
          ...createTestRule('v1-rule'),
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any,
      ]);

      // Spustíme s verzí 2 - data by měla být ignorována
      const engine = await RuleEngine.start({
        name: 'schema-test',
        persistence: { adapter, schemaVersion: 2 },
      });

      expect(engine.getRules()).toHaveLength(0);

      await engine.stop();
    });
  });

  describe('stop() with persistence', () => {
    it('persists rules on stop', async () => {
      const engine = await RuleEngine.start({
        name: 'stop-persist-test',
        persistence: { adapter },
      });

      engine.registerRule(createTestRule('rule-1'));
      engine.registerRule(createTestRule('rule-2'));

      await engine.stop();

      // Ověříme, že pravidla byla uložena
      const persistence = new RulePersistence(adapter);
      const saved = await persistence.load();
      expect(saved).toHaveLength(2);
      expect(saved.map(r => r.id).sort()).toEqual(['rule-1', 'rule-2']);
    });

    it('persists rule changes made during session', async () => {
      // Uložíme počáteční pravidla
      const persistence = new RulePersistence(adapter);
      await persistence.save([
        {
          ...createTestRule('initial-rule', { enabled: true }),
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any,
      ]);

      const engine = await RuleEngine.start({
        name: 'changes-test',
        persistence: { adapter },
      });

      // Provedeme změny
      engine.disableRule('initial-rule');
      engine.registerRule(createTestRule('new-rule'));

      await engine.stop();

      // Ověříme uložené změny
      const saved = await persistence.load();
      expect(saved).toHaveLength(2);

      const initialRule = saved.find(r => r.id === 'initial-rule');
      expect(initialRule?.enabled).toBe(false);

      const newRule = saved.find(r => r.id === 'new-rule');
      expect(newRule).toBeDefined();
    });
  });

  describe('full restart scenario', () => {
    it('maintains rules across engine restart', async () => {
      // První instance - vytvoříme pravidla
      const engine1 = await RuleEngine.start({
        name: 'restart-test',
        persistence: { adapter },
      });

      engine1.registerRule(createTestRule('persistent-rule-1'));
      engine1.registerRule(createTestRule('persistent-rule-2', { priority: 50 }));

      await engine1.stop();

      // Druhá instance - pravidla by měla být obnovena
      const engine2 = await RuleEngine.start({
        name: 'restart-test',
        persistence: { adapter },
      });

      const rules = engine2.getRules();
      expect(rules).toHaveLength(2);

      const rule1 = engine2.getRule('persistent-rule-1');
      const rule2 = engine2.getRule('persistent-rule-2');

      expect(rule1).toBeDefined();
      expect(rule1?.name).toBe('Rule persistent-rule-1');
      expect(rule2).toBeDefined();
      expect(rule2?.priority).toBe(50);

      await engine2.stop();
    });

    it('executes restored rules correctly', async () => {
      // První instance - vytvoříme pravidlo
      const engine1 = await RuleEngine.start({
        name: 'exec-test',
        persistence: { adapter },
      });

      engine1.registerRule(createTestRule('exec-rule', {
        trigger: { type: 'event', topic: 'test.trigger' },
        actions: [{ type: 'set_fact', key: 'rule:executed', value: true }],
      }));

      await engine1.stop();

      // Druhá instance - pravidlo by mělo fungovat
      const engine2 = await RuleEngine.start({
        name: 'exec-test',
        persistence: { adapter },
      });

      expect(engine2.getFact('rule:executed')).toBeUndefined();

      await engine2.emit('test.trigger', {});

      expect(engine2.getFact('rule:executed')).toBe(true);

      await engine2.stop();
    });

    it('preserves rule versions across restarts', async () => {
      const engine1 = await RuleEngine.start({
        name: 'version-test',
        persistence: { adapter },
      });

      const rule1 = engine1.registerRule(createTestRule('v-rule-1'));
      const rule2 = engine1.registerRule(createTestRule('v-rule-2'));
      const rule3 = engine1.registerRule(createTestRule('v-rule-3'));

      expect(rule1.version).toBe(1);
      expect(rule2.version).toBe(2);
      expect(rule3.version).toBe(3);

      await engine1.stop();

      // Druhá instance - nová pravidla by měla mít vyšší verze
      const engine2 = await RuleEngine.start({
        name: 'version-test',
        persistence: { adapter },
      });

      const newRule = engine2.registerRule(createTestRule('v-rule-4'));
      expect(newRule.version).toBe(4);

      await engine2.stop();
    });

    it('handles unregister and re-register across restarts', async () => {
      const engine1 = await RuleEngine.start({
        name: 'unreg-test',
        persistence: { adapter },
      });

      engine1.registerRule(createTestRule('temp-rule'));
      engine1.registerRule(createTestRule('keep-rule'));
      engine1.unregisterRule('temp-rule');

      await engine1.stop();

      const engine2 = await RuleEngine.start({
        name: 'unreg-test',
        persistence: { adapter },
      });

      expect(engine2.getRule('temp-rule')).toBeUndefined();
      expect(engine2.getRule('keep-rule')).toBeDefined();
      expect(engine2.getRules()).toHaveLength(1);

      await engine2.stop();
    });
  });

  describe('engine without persistence', () => {
    it('works normally without persistence config', async () => {
      const engine = await RuleEngine.start({
        name: 'no-persist-test',
      });

      engine.registerRule(createTestRule('volatile-rule'));
      expect(engine.getRules()).toHaveLength(1);

      await engine.stop();
    });

    it('does not persist rules when persistence is not configured', async () => {
      const engine = await RuleEngine.start({
        name: 'no-persist-test',
      });

      engine.registerRule(createTestRule('volatile-rule'));
      await engine.stop();

      // Ověříme, že adapter je stále prázdný
      const persistence = new RulePersistence(adapter);
      const saved = await persistence.load();
      expect(saved).toHaveLength(0);
    });
  });

  describe('automatic persistence on rule changes', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('auto-persists after registerRule', async () => {
      const engine = await RuleEngine.start({
        name: 'auto-persist-test',
        persistence: { adapter },
      });

      engine.registerRule(createTestRule('auto-rule'));

      // Čekáme na debounce
      await vi.advanceTimersByTimeAsync(20);

      const persistence = new RulePersistence(adapter);
      const saved = await persistence.load();
      expect(saved).toHaveLength(1);

      vi.useRealTimers();
      await engine.stop();
    });

    it('auto-persists after enableRule', async () => {
      const persistence = new RulePersistence(adapter);
      await persistence.save([
        {
          ...createTestRule('toggle-rule', { enabled: false }),
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any,
      ]);

      const engine = await RuleEngine.start({
        name: 'enable-test',
        persistence: { adapter },
      });

      engine.enableRule('toggle-rule');

      await vi.advanceTimersByTimeAsync(20);

      const saved = await persistence.load();
      expect(saved[0].enabled).toBe(true);

      vi.useRealTimers();
      await engine.stop();
    });

    it('auto-persists after disableRule', async () => {
      const persistence = new RulePersistence(adapter);
      await persistence.save([
        {
          ...createTestRule('toggle-rule', { enabled: true }),
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any,
      ]);

      const engine = await RuleEngine.start({
        name: 'disable-test',
        persistence: { adapter },
      });

      engine.disableRule('toggle-rule');

      await vi.advanceTimersByTimeAsync(20);

      const saved = await persistence.load();
      expect(saved[0].enabled).toBe(false);

      vi.useRealTimers();
      await engine.stop();
    });
  });

  describe('multiple engines with different persistence keys', () => {
    it('isolates rules by persistence key', async () => {
      const engine1 = await RuleEngine.start({
        name: 'engine-1',
        persistence: { adapter, key: 'engine-1-rules' },
      });

      const engine2 = await RuleEngine.start({
        name: 'engine-2',
        persistence: { adapter, key: 'engine-2-rules' },
      });

      engine1.registerRule(createTestRule('e1-rule'));
      engine2.registerRule(createTestRule('e2-rule-1'));
      engine2.registerRule(createTestRule('e2-rule-2'));

      await engine1.stop();
      await engine2.stop();

      // Restart engines a ověříme izolaci
      const engine1Restarted = await RuleEngine.start({
        name: 'engine-1',
        persistence: { adapter, key: 'engine-1-rules' },
      });

      const engine2Restarted = await RuleEngine.start({
        name: 'engine-2',
        persistence: { adapter, key: 'engine-2-rules' },
      });

      expect(engine1Restarted.getRules()).toHaveLength(1);
      expect(engine1Restarted.getRule('e1-rule')).toBeDefined();

      expect(engine2Restarted.getRules()).toHaveLength(2);
      expect(engine2Restarted.getRule('e2-rule-1')).toBeDefined();
      expect(engine2Restarted.getRule('e2-rule-2')).toBeDefined();

      await engine1Restarted.stop();
      await engine2Restarted.stop();
    });
  });
});
