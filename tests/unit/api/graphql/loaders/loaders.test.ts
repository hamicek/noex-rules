import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuleEngine } from '../../../../../src/core/rule-engine';
import { createLoaders, type GraphQLLoaders } from '../../../../../src/api/graphql/loaders';
import type { RuleInput } from '../../../../../src/types';

function testRule(id: string, group?: string): RuleInput {
  return {
    id,
    name: `Rule ${id}`,
    priority: 0,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'test' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'ok' }],
    ...(group !== undefined && { group }),
  };
}

describe('GraphQL DataLoaders', () => {
  let engine: RuleEngine;
  let loaders: GraphQLLoaders;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'loader-test' });
    loaders = createLoaders(engine);
  });

  afterEach(async () => {
    await engine.stop();
  });

  // ─── groupLoader ─────────────────────────────────────────────────

  describe('groupLoader', () => {
    it('loads existing group by id', async () => {
      engine.createGroup({ id: 'g1', name: 'Alpha' });

      const group = await loaders.groupLoader.load('g1');
      expect(group).not.toBeNull();
      expect(group!.id).toBe('g1');
      expect(group!.name).toBe('Alpha');
    });

    it('returns null for non-existent group', async () => {
      const group = await loaders.groupLoader.load('missing');
      expect(group).toBeNull();
    });

    it('deduplicates multiple loads of the same id', async () => {
      engine.createGroup({ id: 'g1', name: 'Dedup' });
      const spy = vi.spyOn(engine, 'getGroups');

      const [a, b, c] = await Promise.all([
        loaders.groupLoader.load('g1'),
        loaders.groupLoader.load('g1'),
        loaders.groupLoader.load('g1'),
      ]);

      expect(a).toBe(b);
      expect(b).toBe(c);
      // DataLoader batches all loads into a single batch call
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('batches multiple different ids into one fetch', async () => {
      engine.createGroup({ id: 'g1', name: 'One' });
      engine.createGroup({ id: 'g2', name: 'Two' });
      engine.createGroup({ id: 'g3', name: 'Three' });
      const spy = vi.spyOn(engine, 'getGroups');

      const [a, b, c] = await Promise.all([
        loaders.groupLoader.load('g1'),
        loaders.groupLoader.load('g2'),
        loaders.groupLoader.load('g3'),
      ]);

      expect(a!.name).toBe('One');
      expect(b!.name).toBe('Two');
      expect(c!.name).toBe('Three');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('preserves request order when some ids are missing', async () => {
      engine.createGroup({ id: 'exists', name: 'E' });

      const [a, b] = await Promise.all([
        loaders.groupLoader.load('missing'),
        loaders.groupLoader.load('exists'),
      ]);

      expect(a).toBeNull();
      expect(b).not.toBeNull();
      expect(b!.id).toBe('exists');
    });
  });

  // ─── groupRulesLoader ────────────────────────────────────────────

  describe('groupRulesLoader', () => {
    it('loads rules for a group', async () => {
      engine.createGroup({ id: 'g1', name: 'G1' });
      engine.registerRule(testRule('r1', 'g1'));
      engine.registerRule(testRule('r2', 'g1'));

      const rules = await loaders.groupRulesLoader.load('g1');
      expect(rules).toHaveLength(2);
      expect([...rules].map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('returns empty array for group with no rules', async () => {
      engine.createGroup({ id: 'empty', name: 'Empty' });

      const rules = await loaders.groupRulesLoader.load('empty');
      expect(rules).toEqual([]);
    });

    it('returns empty array for non-existent group', async () => {
      const rules = await loaders.groupRulesLoader.load('ghost');
      expect(rules).toEqual([]);
    });

    it('batches multiple group lookups into one fetch', async () => {
      engine.createGroup({ id: 'g1', name: 'G1' });
      engine.createGroup({ id: 'g2', name: 'G2' });
      engine.registerRule(testRule('r1', 'g1'));
      engine.registerRule(testRule('r2', 'g2'));
      engine.registerRule(testRule('r3', 'g1'));
      const spy = vi.spyOn(engine, 'getRules');

      const [g1Rules, g2Rules] = await Promise.all([
        loaders.groupRulesLoader.load('g1'),
        loaders.groupRulesLoader.load('g2'),
      ]);

      expect(g1Rules).toHaveLength(2);
      expect(g2Rules).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('excludes rules without a group', async () => {
      engine.createGroup({ id: 'g1', name: 'G1' });
      engine.registerRule(testRule('grouped', 'g1'));
      engine.registerRule(testRule('ungrouped'));

      const rules = await loaders.groupRulesLoader.load('g1');
      expect(rules).toHaveLength(1);
      expect(rules[0]!.id).toBe('grouped');
    });

    it('deduplicates same group id in one tick', async () => {
      engine.createGroup({ id: 'g1', name: 'G1' });
      engine.registerRule(testRule('r1', 'g1'));
      const spy = vi.spyOn(engine, 'getRules');

      const [a, b] = await Promise.all([
        loaders.groupRulesLoader.load('g1'),
        loaders.groupRulesLoader.load('g1'),
      ]);

      expect(a).toBe(b);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── per-request isolation ────────────────────────────────────────

  describe('per-request isolation', () => {
    it('separate createLoaders calls have independent caches', async () => {
      engine.createGroup({ id: 'g1', name: 'G1' });
      engine.createGroup({ id: 'g2', name: 'G2' });

      const loaders1 = createLoaders(engine);
      const loaders2 = createLoaders(engine);

      const spy = vi.spyOn(engine, 'getGroups');

      // Load g1 in loaders1 → triggers batch
      await loaders1.groupLoader.load('g1');
      expect(spy).toHaveBeenCalledTimes(1);

      // Load g1 again in loaders1 → served from cache, no new batch
      await loaders1.groupLoader.load('g1');
      expect(spy).toHaveBeenCalledTimes(1);

      // Load g1 in loaders2 → independent cache, triggers new batch
      await loaders2.groupLoader.load('g1');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('new loaders see data created after previous loaders', async () => {
      const loaders1 = createLoaders(engine);

      // g1 does not exist yet → null is cached
      const before = await loaders1.groupLoader.load('g1');
      expect(before).toBeNull();

      // Create group after loaders1 was populated
      engine.createGroup({ id: 'g1', name: 'New' });

      // loaders1 still returns cached null
      const still = await loaders1.groupLoader.load('g1');
      expect(still).toBeNull();

      // Fresh loaders see the new group
      const loaders2 = createLoaders(engine);
      const fresh = await loaders2.groupLoader.load('g1');
      expect(fresh).not.toBeNull();
      expect(fresh!.id).toBe('g1');
    });
  });
});
