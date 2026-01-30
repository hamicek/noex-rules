import { describe, it, expect, beforeEach } from 'vitest';
import { RuleManager } from '../../../src/core/rule-manager';
import type { RuleInput } from '../../../src/types/rule';

const createRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  id: 'rule-1',
  name: 'Test Rule',
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'fact', pattern: 'trigger:key' },
  conditions: [],
  actions: [],
  ...overrides
});

describe('RuleManager — reverse index', () => {
  let manager: RuleManager;

  beforeEach(() => {
    manager = new RuleManager();
  });

  // --- set_fact indexace ---

  describe('getByFactAction()', () => {
    it('vrátí pravidlo s přesným set_fact klíčem', () => {
      manager.register(createRule({
        id: 'set-tier',
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }]
      }));

      const results = manager.getByFactAction('customer:tier');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('set-tier');
    });

    it('vrátí prázdné pole pokud žádné pravidlo neprodukuje daný fakt', () => {
      manager.register(createRule({
        id: 'set-tier',
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }]
      }));

      const results = manager.getByFactAction('order:status');

      expect(results).toHaveLength(0);
    });

    it('vrátí více pravidel produkujících stejný fakt', () => {
      manager.register(createRule({
        id: 'rule-a',
        name: 'Rule A',
        priority: 50,
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'gold' }]
      }));
      manager.register(createRule({
        id: 'rule-b',
        name: 'Rule B',
        priority: 200,
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }]
      }));

      const results = manager.getByFactAction('customer:tier');

      expect(results).toHaveLength(2);
      // Seřazeno podle priority (vyšší první)
      expect(results[0].id).toBe('rule-b');
      expect(results[1].id).toBe('rule-a');
    });

    it('vrátí pravidlo s více set_fact akcemi', () => {
      manager.register(createRule({
        id: 'multi-action',
        actions: [
          { type: 'set_fact', key: 'customer:tier', value: 'vip' },
          { type: 'set_fact', key: 'customer:discount', value: 0.2 },
        ]
      }));

      expect(manager.getByFactAction('customer:tier')).toHaveLength(1);
      expect(manager.getByFactAction('customer:discount')).toHaveLength(1);
    });

    it('ignoruje disabled pravidla', () => {
      manager.register(createRule({
        id: 'disabled-rule',
        enabled: false,
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }]
      }));

      const results = manager.getByFactAction('customer:tier');

      expect(results).toHaveLength(0);
    });

    it('ignoruje pravidla v disabled skupině', () => {
      manager.registerGroup({ id: 'grp', name: 'Group', enabled: false });
      manager.register(createRule({
        id: 'grouped-rule',
        group: 'grp',
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }]
      }));

      const results = manager.getByFactAction('customer:tier');

      expect(results).toHaveLength(0);
    });

    it('vrátí pravidlo po enable skupiny', () => {
      manager.registerGroup({ id: 'grp', name: 'Group', enabled: false });
      manager.register(createRule({
        id: 'grouped-rule',
        group: 'grp',
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }]
      }));

      expect(manager.getByFactAction('customer:tier')).toHaveLength(0);

      manager.enableGroup('grp');

      expect(manager.getByFactAction('customer:tier')).toHaveLength(1);
    });

    it('matchuje template klíč s ${...} jako wildcard', () => {
      manager.register(createRule({
        id: 'template-rule',
        actions: [{ type: 'set_fact', key: 'customer:${event.customerId}:tier', value: 'vip' }]
      }));

      const results = manager.getByFactAction('customer:123:tier');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('template-rule');
    });

    it('matchuje template klíč s více ${...} placeholdery', () => {
      manager.register(createRule({
        id: 'multi-template',
        actions: [{ type: 'set_fact', key: '${context.prefix}:${event.id}:status', value: 'done' }]
      }));

      const results = manager.getByFactAction('order:456:status');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('multi-template');
    });

    it('nematchuje template klíč proti nekompatibilnímu klíči', () => {
      manager.register(createRule({
        id: 'template-rule',
        actions: [{ type: 'set_fact', key: 'customer:${event.id}:tier', value: 'vip' }]
      }));

      // Chybí třetí segment
      expect(manager.getByFactAction('customer:123')).toHaveLength(0);
      // Jiný prefix
      expect(manager.getByFactAction('order:123:tier')).toHaveLength(0);
    });

    it('indexuje set_fact z vnořené conditional akce (then)', () => {
      manager.register(createRule({
        id: 'conditional-then',
        actions: [{
          type: 'conditional',
          conditions: [{ source: { type: 'fact', pattern: 'x' }, operator: 'exists', value: true }],
          then: [{ type: 'set_fact', key: 'result:status', value: 'ok' }],
        }]
      }));

      const results = manager.getByFactAction('result:status');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('conditional-then');
    });

    it('indexuje set_fact z vnořené conditional akce (else)', () => {
      manager.register(createRule({
        id: 'conditional-else',
        actions: [{
          type: 'conditional',
          conditions: [{ source: { type: 'fact', pattern: 'x' }, operator: 'exists', value: true }],
          then: [{ type: 'log', level: 'info', message: 'noop' }],
          else: [{ type: 'set_fact', key: 'fallback:status', value: 'failed' }],
        }]
      }));

      const results = manager.getByFactAction('fallback:status');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('conditional-else');
    });

    it('indexuje set_fact z hluboce vnořených conditional akcí', () => {
      manager.register(createRule({
        id: 'deep-nested',
        actions: [{
          type: 'conditional',
          conditions: [{ source: { type: 'fact', pattern: 'x' }, operator: 'exists', value: true }],
          then: [{
            type: 'conditional',
            conditions: [{ source: { type: 'fact', pattern: 'y' }, operator: 'exists', value: true }],
            then: [{ type: 'set_fact', key: 'deep:fact', value: 42 }],
          }],
        }]
      }));

      const results = manager.getByFactAction('deep:fact');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('deep-nested');
    });

    it('nevrací duplicity pokud pravidlo má více akcí se stejným klíčem', () => {
      manager.register(createRule({
        id: 'dup-actions',
        actions: [
          { type: 'set_fact', key: 'customer:tier', value: 'gold' },
          { type: 'set_fact', key: 'customer:tier', value: 'vip' },
        ]
      }));

      const results = manager.getByFactAction('customer:tier');

      expect(results).toHaveLength(1);
    });

    it('neindexuje akce jiného typu než set_fact', () => {
      manager.register(createRule({
        id: 'other-actions',
        actions: [
          { type: 'delete_fact', key: 'customer:tier' },
          { type: 'log', level: 'info', message: 'done' },
        ]
      }));

      const results = manager.getByFactAction('customer:tier');

      expect(results).toHaveLength(0);
    });
  });

  // --- emit_event indexace ---

  describe('getByEventAction()', () => {
    it('vrátí pravidlo s přesným emit_event topikem', () => {
      manager.register(createRule({
        id: 'emit-order',
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }]
      }));

      const results = manager.getByEventAction('order.completed');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('emit-order');
    });

    it('vrátí prázdné pole pokud žádné pravidlo neemituje daný event', () => {
      manager.register(createRule({
        id: 'emit-order',
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }]
      }));

      const results = manager.getByEventAction('payment.received');

      expect(results).toHaveLength(0);
    });

    it('vrátí více pravidel emitujících stejný event', () => {
      manager.register(createRule({
        id: 'rule-a',
        name: 'Rule A',
        priority: 50,
        actions: [{ type: 'emit_event', topic: 'notification.send', data: { type: 'email' } }]
      }));
      manager.register(createRule({
        id: 'rule-b',
        name: 'Rule B',
        priority: 200,
        actions: [{ type: 'emit_event', topic: 'notification.send', data: { type: 'sms' } }]
      }));

      const results = manager.getByEventAction('notification.send');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('rule-b');
      expect(results[1].id).toBe('rule-a');
    });

    it('matchuje template topic s ${...} jako wildcard', () => {
      manager.register(createRule({
        id: 'template-event',
        actions: [{ type: 'emit_event', topic: '${context.domain}.completed', data: {} }]
      }));

      const results = manager.getByEventAction('order.completed');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('template-event');
    });

    it('ignoruje disabled pravidla', () => {
      manager.register(createRule({
        id: 'disabled-emit',
        enabled: false,
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }]
      }));

      const results = manager.getByEventAction('order.completed');

      expect(results).toHaveLength(0);
    });

    it('indexuje emit_event z vnořené conditional akce', () => {
      manager.register(createRule({
        id: 'conditional-emit',
        actions: [{
          type: 'conditional',
          conditions: [{ source: { type: 'fact', pattern: 'x' }, operator: 'exists', value: true }],
          then: [{ type: 'emit_event', topic: 'alert.triggered', data: {} }],
        }]
      }));

      const results = manager.getByEventAction('alert.triggered');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('conditional-emit');
    });

    it('nevrací duplicity pokud pravidlo emituje stejný topic vícekrát', () => {
      manager.register(createRule({
        id: 'dup-emit',
        actions: [
          { type: 'emit_event', topic: 'order.completed', data: { source: 'a' } },
          { type: 'emit_event', topic: 'order.completed', data: { source: 'b' } },
        ]
      }));

      const results = manager.getByEventAction('order.completed');

      expect(results).toHaveLength(1);
    });
  });

  // --- Unregister ---

  describe('unregister() — reverse index cleanup', () => {
    it('odstraní pravidlo z exact fact action indexu', () => {
      manager.register(createRule({
        id: 'to-remove',
        actions: [{ type: 'set_fact', key: 'customer:tier', value: 'vip' }]
      }));

      expect(manager.getByFactAction('customer:tier')).toHaveLength(1);

      manager.unregister('to-remove');

      expect(manager.getByFactAction('customer:tier')).toHaveLength(0);
    });

    it('odstraní pravidlo z template fact action indexu', () => {
      manager.register(createRule({
        id: 'to-remove',
        actions: [{ type: 'set_fact', key: 'customer:${id}:tier', value: 'vip' }]
      }));

      expect(manager.getByFactAction('customer:123:tier')).toHaveLength(1);

      manager.unregister('to-remove');

      expect(manager.getByFactAction('customer:123:tier')).toHaveLength(0);
    });

    it('odstraní pravidlo z exact event action indexu', () => {
      manager.register(createRule({
        id: 'to-remove',
        actions: [{ type: 'emit_event', topic: 'order.completed', data: {} }]
      }));

      expect(manager.getByEventAction('order.completed')).toHaveLength(1);

      manager.unregister('to-remove');

      expect(manager.getByEventAction('order.completed')).toHaveLength(0);
    });

    it('odstraní pravidlo z template event action indexu', () => {
      manager.register(createRule({
        id: 'to-remove',
        actions: [{ type: 'emit_event', topic: '${domain}.completed', data: {} }]
      }));

      expect(manager.getByEventAction('order.completed')).toHaveLength(1);

      manager.unregister('to-remove');

      expect(manager.getByEventAction('order.completed')).toHaveLength(0);
    });

    it('odstraní pravidlo z conditional action indexu', () => {
      manager.register(createRule({
        id: 'to-remove',
        actions: [{
          type: 'conditional',
          conditions: [{ source: { type: 'fact', pattern: 'x' }, operator: 'exists', value: true }],
          then: [{ type: 'set_fact', key: 'nested:fact', value: true }],
          else: [{ type: 'emit_event', topic: 'nested.event', data: {} }],
        }]
      }));

      expect(manager.getByFactAction('nested:fact')).toHaveLength(1);
      expect(manager.getByEventAction('nested.event')).toHaveLength(1);

      manager.unregister('to-remove');

      expect(manager.getByFactAction('nested:fact')).toHaveLength(0);
      expect(manager.getByEventAction('nested.event')).toHaveLength(0);
    });

    it('neovlivní ostatní pravidla při odregistraci', () => {
      manager.register(createRule({
        id: 'keep',
        name: 'Keep',
        actions: [{ type: 'set_fact', key: 'shared:key', value: 1 }]
      }));
      manager.register(createRule({
        id: 'remove',
        name: 'Remove',
        actions: [{ type: 'set_fact', key: 'shared:key', value: 2 }]
      }));

      manager.unregister('remove');

      const results = manager.getByFactAction('shared:key');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('keep');
    });
  });

  // --- Kombinované scénáře ---

  describe('kombinované scénáře', () => {
    it('pravidlo s oběma typy akcí je nalezitelné oběma metodami', () => {
      manager.register(createRule({
        id: 'dual-action',
        actions: [
          { type: 'set_fact', key: 'order:status', value: 'completed' },
          { type: 'emit_event', topic: 'order.completed', data: {} },
        ]
      }));

      expect(manager.getByFactAction('order:status')).toHaveLength(1);
      expect(manager.getByEventAction('order.completed')).toHaveLength(1);
    });

    it('pravidlo bez set_fact/emit_event akcí se neobjeví v reverse indexu', () => {
      manager.register(createRule({
        id: 'no-produce',
        actions: [
          { type: 'log', level: 'info', message: 'hello' },
          { type: 'delete_fact', key: 'old:key' },
        ]
      }));

      expect(manager.getByFactAction('old:key')).toHaveLength(0);
      expect(manager.getByEventAction('old:key')).toHaveLength(0);
    });

    it('pravidlo bez akcí se neobjeví v reverse indexu', () => {
      manager.register(createRule({
        id: 'no-actions',
        actions: []
      }));

      expect(manager.getByFactAction('anything')).toHaveLength(0);
      expect(manager.getByEventAction('anything')).toHaveLength(0);
    });

    it('restore z persistence správně reindexuje akce', async () => {
      // Registruj pravidla
      manager.register(createRule({
        id: 'persisted-fact',
        actions: [{ type: 'set_fact', key: 'persisted:value', value: 1 }]
      }));
      manager.register(createRule({
        id: 'persisted-event',
        actions: [{ type: 'emit_event', topic: 'persisted.event', data: {} }]
      }));

      // Simuluj persistence save/load cycle
      const savedRules = manager.getAll();
      const savedGroups = manager.getAllGroups();

      // Nový manager
      const newManager = new RuleManager();
      const mockPersistence = {
        load: async () => ({ rules: savedRules, groups: savedGroups }),
        save: async () => {},
      };
      newManager.setPersistence(mockPersistence);
      await newManager.restore();

      expect(newManager.getByFactAction('persisted:value')).toHaveLength(1);
      expect(newManager.getByEventAction('persisted.event')).toHaveLength(1);
    });

    it('seřadí výsledky podle priority (descending)', () => {
      manager.register(createRule({
        id: 'low-prio',
        name: 'Low',
        priority: 10,
        actions: [{ type: 'set_fact', key: 'shared:key', value: 'a' }]
      }));
      manager.register(createRule({
        id: 'high-prio',
        name: 'High',
        priority: 500,
        actions: [{ type: 'set_fact', key: 'shared:key', value: 'b' }]
      }));
      manager.register(createRule({
        id: 'mid-prio',
        name: 'Mid',
        priority: 100,
        actions: [{ type: 'set_fact', key: 'shared:key', value: 'c' }]
      }));

      const results = manager.getByFactAction('shared:key');

      expect(results.map(r => r.id)).toEqual(['high-prio', 'mid-prio', 'low-prio']);
    });

    it('kombinuje exact a template match bez duplicit', () => {
      // Pravidlo s exact klíčem
      manager.register(createRule({
        id: 'exact-rule',
        name: 'Exact',
        priority: 100,
        actions: [{ type: 'set_fact', key: 'customer:123:tier', value: 'gold' }]
      }));
      // Pravidlo s template klíčem matchujícím stejný pattern
      manager.register(createRule({
        id: 'template-rule',
        name: 'Template',
        priority: 200,
        actions: [{ type: 'set_fact', key: 'customer:${id}:tier', value: 'vip' }]
      }));

      const results = manager.getByFactAction('customer:123:tier');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('template-rule');
      expect(results[1].id).toBe('exact-rule');
    });

    it('enable/disable pravidla ovlivní reverse index výsledky', () => {
      manager.register(createRule({
        id: 'toggle-rule',
        actions: [{ type: 'set_fact', key: 'toggle:fact', value: true }]
      }));

      expect(manager.getByFactAction('toggle:fact')).toHaveLength(1);

      manager.disable('toggle-rule');
      expect(manager.getByFactAction('toggle:fact')).toHaveLength(0);

      manager.enable('toggle-rule');
      expect(manager.getByFactAction('toggle:fact')).toHaveLength(1);
    });
  });
});
