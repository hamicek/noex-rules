import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenServer } from '@hamicek/noex';
import type { RuleInput } from '../../../../src/types/rule.js';
import type { Rule } from '../../../../src/types/rule.js';
import type {
  HotReloadConfig,
  HotReloadStatus,
  RuleDiff,
  RuleSource,
} from '../../../../src/core/hot-reload/types.js';
import { HotReloadWatcher } from '../../../../src/core/hot-reload/watcher.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRuleInput(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    id: 'rule-1',
    name: 'Rule 1',
    priority: 100,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [],
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    name: 'Rule 1',
    priority: 100,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createMockEngine(rules: Rule[] = []) {
  return {
    getRules: vi.fn().mockReturnValue(rules),
    getAuditLog: vi.fn().mockReturnValue(null),
    registerRule: vi.fn().mockImplementation((input: RuleInput) => ({
      ...input,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    unregisterRule: vi.fn().mockReturnValue(true),
    waitForProcessingQueue: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSource(rules: RuleInput[] = [], name = 'mock'): RuleSource {
  return {
    name,
    loadRules: vi.fn().mockResolvedValue(rules),
  };
}

// ── computeRuleHash ─────────────────────────────────────────────────────────

describe('HotReloadWatcher.computeRuleHash', () => {
  it('should produce consistent hashes for the same rule', () => {
    const rule = makeRuleInput();
    const hash1 = HotReloadWatcher.computeRuleHash(rule);
    const hash2 = HotReloadWatcher.computeRuleHash(rule);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different rules', () => {
    const rule1 = makeRuleInput({ id: 'a', name: 'Rule A' });
    const rule2 = makeRuleInput({ id: 'b', name: 'Rule B' });

    expect(HotReloadWatcher.computeRuleHash(rule1)).not.toBe(
      HotReloadWatcher.computeRuleHash(rule2),
    );
  });

  it('should produce a hex string of 64 characters (SHA-256)', () => {
    const hash = HotReloadWatcher.computeRuleHash(makeRuleInput());

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should be key-order independent', () => {
    const rule1 = { id: 'x', name: 'X', priority: 1, enabled: true, tags: [], trigger: { type: 'event' as const, topic: 't' }, conditions: [], actions: [] } as RuleInput;

    // Same data, different key insertion order
    const rule2 = { actions: [], conditions: [], trigger: { type: 'event' as const, topic: 't' }, tags: [], enabled: true, priority: 1, name: 'X', id: 'x' } as unknown as RuleInput;

    expect(HotReloadWatcher.computeRuleHash(rule1)).toBe(
      HotReloadWatcher.computeRuleHash(rule2),
    );
  });

  it('should detect change in priority', () => {
    const rule1 = makeRuleInput({ priority: 100 });
    const rule2 = makeRuleInput({ priority: 200 });

    expect(HotReloadWatcher.computeRuleHash(rule1)).not.toBe(
      HotReloadWatcher.computeRuleHash(rule2),
    );
  });

  it('should detect change in enabled flag', () => {
    const rule1 = makeRuleInput({ enabled: true });
    const rule2 = makeRuleInput({ enabled: false });

    expect(HotReloadWatcher.computeRuleHash(rule1)).not.toBe(
      HotReloadWatcher.computeRuleHash(rule2),
    );
  });

  it('should detect change in actions', () => {
    const rule1 = makeRuleInput({ actions: [] });
    const rule2 = makeRuleInput({ actions: [{ type: 'emit_event', topic: 't', data: {} }] });

    expect(HotReloadWatcher.computeRuleHash(rule1)).not.toBe(
      HotReloadWatcher.computeRuleHash(rule2),
    );
  });

  it('should detect change in conditions', () => {
    const rule1 = makeRuleInput({ conditions: [] });
    const rule2 = makeRuleInput({
      conditions: [{ source: { type: 'fact', path: 'x' }, operator: 'eq', value: 1 }],
    });

    expect(HotReloadWatcher.computeRuleHash(rule1)).not.toBe(
      HotReloadWatcher.computeRuleHash(rule2),
    );
  });
});

// ── computeDiff ─────────────────────────────────────────────────────────────

describe('HotReloadWatcher.computeDiff', () => {
  let watcher: HotReloadWatcher;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(async () => {
    engine = createMockEngine([
      makeRule({ id: 'existing-1', name: 'Existing 1' }),
      makeRule({ id: 'existing-2', name: 'Existing 2' }),
    ]);
    watcher = await HotReloadWatcher.start(engine as never, { intervalMs: 999_999 });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('should detect no changes when rules are identical', () => {
    const rules = [
      makeRuleInput({ id: 'existing-1', name: 'Existing 1' }),
      makeRuleInput({ id: 'existing-2', name: 'Existing 2' }),
    ];

    const diff = watcher.computeDiff(rules);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it('should detect added rules', () => {
    const rules = [
      makeRuleInput({ id: 'existing-1', name: 'Existing 1' }),
      makeRuleInput({ id: 'existing-2', name: 'Existing 2' }),
      makeRuleInput({ id: 'new-rule', name: 'New Rule' }),
    ];

    const diff = watcher.computeDiff(rules);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.id).toBe('new-rule');
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it('should detect removed rules', () => {
    const rules = [
      makeRuleInput({ id: 'existing-1', name: 'Existing 1' }),
      // existing-2 je odebraný
    ];

    const diff = watcher.computeDiff(rules);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toEqual(['existing-2']);
    expect(diff.modified).toHaveLength(0);
  });

  it('should detect modified rules', () => {
    const rules = [
      makeRuleInput({ id: 'existing-1', name: 'Existing 1 MODIFIED', priority: 999 }),
      makeRuleInput({ id: 'existing-2', name: 'Existing 2' }),
    ];

    const diff = watcher.computeDiff(rules);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]!.id).toBe('existing-1');
    expect(diff.modified[0]!.name).toBe('Existing 1 MODIFIED');
  });

  it('should detect mixed changes', () => {
    const rules = [
      // existing-1 modifikováno
      makeRuleInput({ id: 'existing-1', name: 'Existing 1', priority: 999 }),
      // existing-2 odebraný (chybí)
      // brand-new přidán
      makeRuleInput({ id: 'brand-new', name: 'Brand New' }),
    ];

    const diff = watcher.computeDiff(rules);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.id).toBe('brand-new');
    expect(diff.removed).toEqual(['existing-2']);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]!.id).toBe('existing-1');
  });

  it('should detect complete replacement', () => {
    const rules = [
      makeRuleInput({ id: 'new-1', name: 'New 1' }),
      makeRuleInput({ id: 'new-2', name: 'New 2' }),
    ];

    const diff = watcher.computeDiff(rules);

    expect(diff.added).toHaveLength(2);
    expect(diff.removed).toHaveLength(2);
    expect(diff.modified).toHaveLength(0);
  });

  it('should handle empty new rules (all removed)', () => {
    const diff = watcher.computeDiff([]);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(2);
    expect(diff.modified).toHaveLength(0);
  });
});

// ── performCheck ────────────────────────────────────────────────────────────

describe('HotReloadWatcher.performCheck', () => {
  let engine: ReturnType<typeof createMockEngine>;

  afterEach(async () => {
    // Cleanup GenServers
  });

  it('should return null when no changes detected', async () => {
    const existingRule = makeRule({ id: 'r1', name: 'R1' });
    engine = createMockEngine([existingRule]);

    // Source returns the same rule as already registered
    const source = createMockSource([makeRuleInput({ id: 'r1', name: 'R1' })]);
    const watcher = await startWatcherWithSource(engine, source);

    const result = await watcher.performCheck();

    expect(result).toBeNull();
    expect(engine.registerRule).not.toHaveBeenCalled();
    expect(engine.unregisterRule).not.toHaveBeenCalled();

    await watcher.stop();
  });

  it('should apply added rules', async () => {
    engine = createMockEngine([]);

    const newRule = makeRuleInput({ id: 'new-1', name: 'New Rule' });
    const source = createMockSource([newRule]);
    const watcher = await startWatcherWithSource(engine, source);

    const result = await watcher.performCheck();

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.addedCount).toBe(1);
    expect(result!.removedCount).toBe(0);
    expect(result!.modifiedCount).toBe(0);
    expect(engine.registerRule).toHaveBeenCalledWith(newRule, { skipValidation: true });

    await watcher.stop();
  });

  it('should apply removed rules', async () => {
    const existingRule = makeRule({ id: 'r1', name: 'R1' });
    engine = createMockEngine([existingRule]);

    // Source returns empty — r1 has been removed
    const source = createMockSource([]);
    const watcher = await startWatcherWithSource(engine, source);

    const result = await watcher.performCheck();

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.addedCount).toBe(0);
    expect(result!.removedCount).toBe(1);
    expect(engine.unregisterRule).toHaveBeenCalledWith('r1');

    await watcher.stop();
  });

  it('should apply modified rules (unregister + register)', async () => {
    const existingRule = makeRule({ id: 'r1', name: 'R1', priority: 100 });
    engine = createMockEngine([existingRule]);

    const modifiedRule = makeRuleInput({ id: 'r1', name: 'R1', priority: 999 });
    const source = createMockSource([modifiedRule]);
    const watcher = await startWatcherWithSource(engine, source);

    const result = await watcher.performCheck();

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.modifiedCount).toBe(1);
    expect(engine.unregisterRule).toHaveBeenCalledWith('r1');
    expect(engine.registerRule).toHaveBeenCalledWith(modifiedRule, { skipValidation: true });

    await watcher.stop();
  });

  it('should wait for processing queue before applying changes', async () => {
    engine = createMockEngine([]);

    const source = createMockSource([makeRuleInput({ id: 'new-1' })]);
    const watcher = await startWatcherWithSource(engine, source);

    await watcher.performCheck();

    expect(engine.waitForProcessingQueue).toHaveBeenCalled();

    await watcher.stop();
  });

  it('should skip batch on validation failure in atomic mode', async () => {
    engine = createMockEngine([]);

    // Invalid rule (missing required fields) — validator will reject
    const invalidRule = { id: 'bad' } as unknown as RuleInput;
    const source = createMockSource([invalidRule]);
    const watcher = await startWatcherWithSource(engine, source, {
      validateBeforeApply: true,
      atomicReload: true,
    });

    const result = await watcher.performCheck();

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toContain('Validation failed');
    expect(engine.registerRule).not.toHaveBeenCalled();

    await watcher.stop();
  });

  it('should skip validation when validateBeforeApply is false', async () => {
    engine = createMockEngine([]);

    const rule = makeRuleInput({ id: 'r1' });
    const source = createMockSource([rule]);
    const watcher = await startWatcherWithSource(engine, source, {
      validateBeforeApply: false,
    });

    const result = await watcher.performCheck();

    expect(result!.success).toBe(true);
    expect(engine.registerRule).toHaveBeenCalledWith(rule, { skipValidation: true });

    await watcher.stop();
  });

  it('should handle source errors gracefully and continue', async () => {
    engine = createMockEngine([]);

    const source: RuleSource = {
      name: 'failing',
      loadRules: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    const watcher = await startWatcherWithSource(engine, source);

    const result = await watcher.performCheck();

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe('Network error');
    expect(engine.registerRule).not.toHaveBeenCalled();

    // Watcher should still be running
    const status = watcher.getStatus();
    expect(status.running).toBe(true);
    expect(status.failureCount).toBe(1);

    await watcher.stop();
  });

  it('should update hashes after successful reload', async () => {
    engine = createMockEngine([]);

    const rule1 = makeRuleInput({ id: 'r1', name: 'R1' });
    const source = createMockSource([rule1]);
    const watcher = await startWatcherWithSource(engine, source);

    // First check — r1 is added
    await watcher.performCheck();

    // Second check — same rules, no changes
    const result = await watcher.performCheck();
    expect(result).toBeNull();

    await watcher.stop();
  });

  it('should include duration in result', async () => {
    engine = createMockEngine([]);

    const source = createMockSource([makeRuleInput({ id: 'r1' })]);
    const watcher = await startWatcherWithSource(engine, source);

    const result = await watcher.performCheck();

    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result!.timestamp).toBeGreaterThan(0);

    await watcher.stop();
  });

  it('should merge rules from multiple sources', async () => {
    engine = createMockEngine([]);

    const source1 = createMockSource([makeRuleInput({ id: 's1-r1', name: 'Source 1 Rule' })], 'file');
    const source2 = createMockSource([makeRuleInput({ id: 's2-r1', name: 'Source 2 Rule' })], 'storage');
    const watcher = await startWatcherWithSources(engine, [source1, source2]);

    const result = await watcher.performCheck();

    expect(result!.success).toBe(true);
    expect(result!.addedCount).toBe(2);
    expect(engine.registerRule).toHaveBeenCalledTimes(2);

    await watcher.stop();
  });
});

// ── getStatus ───────────────────────────────────────────────────────────────

describe('HotReloadWatcher.getStatus', () => {
  it('should return initial status', async () => {
    const engine = createMockEngine([makeRule({ id: 'r1' })]);
    const source = createMockSource([makeRuleInput({ id: 'r1' })]);
    const watcher = await startWatcherWithSource(engine, source);

    const status = watcher.getStatus();

    expect(status.running).toBe(true);
    expect(status.intervalMs).toBe(999_999);
    expect(status.trackedRulesCount).toBe(1);
    expect(status.lastReloadAt).toBeNull();
    expect(status.reloadCount).toBe(0);
    expect(status.failureCount).toBe(0);

    await watcher.stop();
  });

  it('should reflect state after successful reload', async () => {
    const engine = createMockEngine([]);
    const source = createMockSource([makeRuleInput({ id: 'r1' })]);
    const watcher = await startWatcherWithSource(engine, source);

    await watcher.performCheck();

    const status = watcher.getStatus();
    expect(status.reloadCount).toBe(1);
    expect(status.failureCount).toBe(0);
    expect(status.lastReloadAt).not.toBeNull();
    expect(status.trackedRulesCount).toBe(1);

    await watcher.stop();
  });

  it('should reflect state after failed reload', async () => {
    const engine = createMockEngine([]);
    const failingSource: RuleSource = {
      name: 'broken',
      loadRules: vi.fn().mockRejectedValue(new Error('fail')),
    };
    const watcher = await startWatcherWithSource(engine, failingSource);

    await watcher.performCheck();

    const status = watcher.getStatus();
    expect(status.reloadCount).toBe(0);
    expect(status.failureCount).toBe(1);
    expect(status.lastReloadAt).toBeNull();

    await watcher.stop();
  });

  it('should report running=false after stop', async () => {
    const engine = createMockEngine([]);
    const source = createMockSource([]);
    const watcher = await startWatcherWithSource(engine, source);

    await watcher.stop();

    const status = watcher.getStatus();
    expect(status.running).toBe(false);
  });
});

// ── start / stop lifecycle ──────────────────────────────────────────────────

describe('HotReloadWatcher lifecycle', () => {
  it('should start and stop cleanly', async () => {
    const engine = createMockEngine([]);
    const watcher = await HotReloadWatcher.start(engine as never, { intervalMs: 999_999 });

    expect(watcher.getStatus().running).toBe(true);

    await watcher.stop();

    expect(watcher.getStatus().running).toBe(false);
  });

  it('should use default intervalMs of 5000', async () => {
    const engine = createMockEngine([]);
    const watcher = await HotReloadWatcher.start(engine as never, {});

    expect(watcher.getStatus().intervalMs).toBe(5000);

    await watcher.stop();
  });

  it('should build FileRuleSource from config.files', async () => {
    const engine = createMockEngine([]);
    // Just verify it starts without error — actual file loading is tested in sources.test.ts
    const watcher = await HotReloadWatcher.start(engine as never, {
      intervalMs: 999_999,
      files: { paths: ['/nonexistent'] },
    });

    expect(watcher.getStatus().running).toBe(true);

    await watcher.stop();
  });

  it('should stop idempotently', async () => {
    const engine = createMockEngine([]);
    const watcher = await HotReloadWatcher.start(engine as never, { intervalMs: 999_999 });

    await watcher.stop();
    await watcher.stop(); // second stop should not throw

    expect(watcher.getStatus().running).toBe(false);
  });

  it('should initialize hashes from current engine rules', async () => {
    const engine = createMockEngine([
      makeRule({ id: 'a', name: 'A' }),
      makeRule({ id: 'b', name: 'B' }),
    ]);
    const watcher = await HotReloadWatcher.start(engine as never, { intervalMs: 999_999 });

    expect(watcher.getStatus().trackedRulesCount).toBe(2);

    await watcher.stop();
  });
});

// ── audit logging ───────────────────────────────────────────────────────────

describe('HotReloadWatcher audit logging', () => {
  it('should log hot_reload_started and hot_reload_completed on success', async () => {
    const mockAudit = { record: vi.fn() };
    const engine = createMockEngine([]);
    engine.getAuditLog.mockReturnValue(mockAudit);

    const source = createMockSource([makeRuleInput({ id: 'r1' })]);
    const watcher = await startWatcherWithSource(engine, source);

    await watcher.performCheck();

    const calls = mockAudit.record.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('hot_reload_started');
    expect(calls).toContain('hot_reload_completed');
    expect(calls).not.toContain('hot_reload_failed');

    await watcher.stop();
  });

  it('should log hot_reload_failed on validation failure', async () => {
    const mockAudit = { record: vi.fn() };
    const engine = createMockEngine([]);
    engine.getAuditLog.mockReturnValue(mockAudit);

    const source = createMockSource([{ id: 'bad' } as unknown as RuleInput]);
    const watcher = await startWatcherWithSource(engine, source);

    await watcher.performCheck();

    const calls = mockAudit.record.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('hot_reload_started');
    expect(calls).toContain('hot_reload_failed');
    expect(calls).not.toContain('hot_reload_completed');

    await watcher.stop();
  });

  it('should log hot_reload_failed on source error', async () => {
    const mockAudit = { record: vi.fn() };
    const engine = createMockEngine([]);
    engine.getAuditLog.mockReturnValue(mockAudit);

    const source: RuleSource = {
      name: 'broken',
      loadRules: vi.fn().mockRejectedValue(new Error('fail')),
    };
    const watcher = await startWatcherWithSource(engine, source);

    await watcher.performCheck();

    const calls = mockAudit.record.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('hot_reload_failed');

    await watcher.stop();
  });
});

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Vytvoří watcher s jedním mockovým zdrojem.
 * Používá vysoký intervalMs aby se auto-check nespustil během testu.
 */
async function startWatcherWithSource(
  engine: ReturnType<typeof createMockEngine>,
  source: RuleSource,
  configOverrides: Partial<HotReloadConfig> = {},
): Promise<HotReloadWatcher> {
  // Watcher builds sources from config, but we want to inject our mock.
  // We start with no config sources, then use performCheck which calls loadAllSources.
  // To inject the mock source, we use a storage config with a mock adapter.
  // Actually, let's use a different approach — start watcher and replace sources via prototype hack.

  // Cleaner approach: start watcher with config that won't create sources,
  // then inject our mock source via the private field.
  const watcher = await HotReloadWatcher.start(engine as never, {
    intervalMs: 999_999,
    ...configOverrides,
  });

  // Inject mock source
  (watcher as unknown as { sources: RuleSource[] }).sources = [source];

  return watcher;
}

async function startWatcherWithSources(
  engine: ReturnType<typeof createMockEngine>,
  sources: RuleSource[],
  configOverrides: Partial<HotReloadConfig> = {},
): Promise<HotReloadWatcher> {
  const watcher = await HotReloadWatcher.start(engine as never, {
    intervalMs: 999_999,
    ...configOverrides,
  });

  (watcher as unknown as { sources: RuleSource[] }).sources = sources;

  return watcher;
}
