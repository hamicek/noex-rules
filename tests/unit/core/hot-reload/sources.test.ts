import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { FileRuleSource, StorageRuleSource } from '../../../../src/core/hot-reload/sources.js';
import type { StorageAdapter, PersistedState } from '@hamicek/noex';
import type { RuleInput } from '../../../../src/types/rule.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const tempDir = resolve(__dirname, '../../../temp/hot-reload-sources');

const SIMPLE_RULE_YAML = `
id: test-rule-1
name: Test Rule
priority: 100
enabled: true
tags: []
trigger:
  type: event
  topic: order.created
conditions: []
actions:
  - type: emit_event
    topic: notification.send
    data:
      message: hello
`;

const SECOND_RULE_YAML = `
id: test-rule-2
name: Second Rule
priority: 50
enabled: true
tags:
  - billing
trigger:
  type: event
  topic: payment.received
conditions: []
actions:
  - type: emit_event
    topic: payment.confirmed
    data:
      status: ok
`;

const TWO_RULES_YAML = `
rules:
  - id: multi-1
    name: Multi Rule One
    priority: 10
    enabled: true
    tags: []
    trigger:
      type: event
      topic: a.created
    conditions: []
    actions:
      - type: emit_event
        topic: a.done
        data:
          ok: true
  - id: multi-2
    name: Multi Rule Two
    priority: 20
    enabled: true
    tags: []
    trigger:
      type: event
      topic: b.created
    conditions: []
    actions:
      - type: emit_event
        topic: b.done
        data:
          ok: true
`;

function makeRule(overrides: Partial<RuleInput> = {}): RuleInput {
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

function createMockAdapter(data?: PersistedState<unknown>): StorageAdapter {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(data),
    delete: vi.fn().mockResolvedValue(true),
    exists: vi.fn().mockResolvedValue(data !== undefined),
    listKeys: vi.fn().mockResolvedValue([]),
  };
}

// ── FileRuleSource ──────────────────────────────────────────────────────────

describe('FileRuleSource', () => {
  beforeEach(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load rules from a single YAML file', async () => {
    const filePath = join(tempDir, 'rule.yaml');
    writeFileSync(filePath, SIMPLE_RULE_YAML, 'utf-8');

    const source = new FileRuleSource({ paths: [filePath] });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe('test-rule-1');
    expect(rules[0]!.name).toBe('Test Rule');
    expect(rules[0]!.priority).toBe(100);
  });

  it('should load rules from multiple files', async () => {
    const file1 = join(tempDir, 'a.yaml');
    const file2 = join(tempDir, 'b.yaml');
    writeFileSync(file1, SIMPLE_RULE_YAML, 'utf-8');
    writeFileSync(file2, SECOND_RULE_YAML, 'utf-8');

    const source = new FileRuleSource({ paths: [file1, file2] });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id)).toEqual(['test-rule-1', 'test-rule-2']);
  });

  it('should load multiple rules from a single file', async () => {
    const filePath = join(tempDir, 'multi.yaml');
    writeFileSync(filePath, TWO_RULES_YAML, 'utf-8');

    const source = new FileRuleSource({ paths: [filePath] });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id)).toEqual(['multi-1', 'multi-2']);
  });

  it('should scan directory for YAML files', async () => {
    writeFileSync(join(tempDir, 'a.yaml'), SIMPLE_RULE_YAML, 'utf-8');
    writeFileSync(join(tempDir, 'b.yml'), SECOND_RULE_YAML, 'utf-8');
    writeFileSync(join(tempDir, 'ignore.txt'), 'not a yaml file', 'utf-8');

    const source = new FileRuleSource({ paths: [tempDir] });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id).sort()).toEqual(['test-rule-1', 'test-rule-2']);
  });

  it('should respect custom file patterns', async () => {
    writeFileSync(join(tempDir, 'rules.yaml'), SIMPLE_RULE_YAML, 'utf-8');
    writeFileSync(join(tempDir, 'rules.custom'), SECOND_RULE_YAML, 'utf-8');

    const source = new FileRuleSource({
      paths: [tempDir],
      patterns: ['*.custom'],
    });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe('test-rule-2');
  });

  it('should skip subdirectories when recursive is false (default)', async () => {
    const subdir = join(tempDir, 'nested');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(tempDir, 'root.yaml'), SIMPLE_RULE_YAML, 'utf-8');
    writeFileSync(join(subdir, 'nested.yaml'), SECOND_RULE_YAML, 'utf-8');

    const source = new FileRuleSource({ paths: [tempDir] });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe('test-rule-1');
  });

  it('should scan subdirectories when recursive is true', async () => {
    const subdir = join(tempDir, 'nested');
    const deepSubdir = join(subdir, 'deep');
    mkdirSync(deepSubdir, { recursive: true });
    writeFileSync(join(tempDir, 'root.yaml'), SIMPLE_RULE_YAML, 'utf-8');
    writeFileSync(join(subdir, 'mid.yaml'), SECOND_RULE_YAML, 'utf-8');
    writeFileSync(join(deepSubdir, 'deep.yaml'), TWO_RULES_YAML, 'utf-8');

    const source = new FileRuleSource({ paths: [tempDir], recursive: true });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(4);
    const ids = rules.map((r) => r.id).sort();
    expect(ids).toEqual(['multi-1', 'multi-2', 'test-rule-1', 'test-rule-2']);
  });

  it('should return deterministic order from directory scans', async () => {
    writeFileSync(join(tempDir, 'z-last.yaml'), SECOND_RULE_YAML, 'utf-8');
    writeFileSync(join(tempDir, 'a-first.yaml'), SIMPLE_RULE_YAML, 'utf-8');

    const source = new FileRuleSource({ paths: [tempDir] });
    const rules = await source.loadRules();

    // Files should be sorted alphabetically by path
    expect(rules[0]!.id).toBe('test-rule-1'); // a-first.yaml
    expect(rules[1]!.id).toBe('test-rule-2'); // z-last.yaml
  });

  it('should throw when file does not exist', async () => {
    const source = new FileRuleSource({ paths: [join(tempDir, 'nonexistent.yaml')] });

    await expect(source.loadRules()).rejects.toThrow();
  });

  it('should throw when directory does not exist', async () => {
    const source = new FileRuleSource({ paths: [join(tempDir, 'nonexistent-dir')] });

    await expect(source.loadRules()).rejects.toThrow();
  });

  it('should return empty array for empty directory', async () => {
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const source = new FileRuleSource({ paths: [emptyDir] });
    const rules = await source.loadRules();

    expect(rules).toEqual([]);
  });

  it('should mix file and directory paths', async () => {
    const subdir = join(tempDir, 'dir');
    mkdirSync(subdir, { recursive: true });
    const directFile = join(tempDir, 'direct.yaml');
    writeFileSync(directFile, SIMPLE_RULE_YAML, 'utf-8');
    writeFileSync(join(subdir, 'from-dir.yaml'), SECOND_RULE_YAML, 'utf-8');

    const source = new FileRuleSource({ paths: [directFile, subdir] });
    const rules = await source.loadRules();

    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id)).toEqual(['test-rule-1', 'test-rule-2']);
  });

  it('should have name "file"', () => {
    const source = new FileRuleSource({ paths: [] });
    expect(source.name).toBe('file');
  });
});

// ── StorageRuleSource ───────────────────────────────────────────────────────

describe('StorageRuleSource', () => {
  it('should load rules from storage adapter', async () => {
    const rules = [makeRule({ id: 'stored-1' }), makeRule({ id: 'stored-2' })];
    const adapter = createMockAdapter({
      state: { rules },
      metadata: { persistedAt: Date.now(), serverId: 'test', schemaVersion: 1 },
    });

    const source = new StorageRuleSource({ adapter });
    const loaded = await source.loadRules();

    expect(loaded).toHaveLength(2);
    expect(loaded.map((r) => r.id)).toEqual(['stored-1', 'stored-2']);
  });

  it('should use default key "hot-reload:rules"', async () => {
    const adapter = createMockAdapter();

    const source = new StorageRuleSource({ adapter });
    await source.loadRules();

    expect(adapter.load).toHaveBeenCalledWith('hot-reload:rules');
  });

  it('should use custom storage key', async () => {
    const adapter = createMockAdapter();

    const source = new StorageRuleSource({ adapter, key: 'custom:rules' });
    await source.loadRules();

    expect(adapter.load).toHaveBeenCalledWith('custom:rules');
  });

  it('should return empty array when key does not exist', async () => {
    const adapter = createMockAdapter(undefined);

    const source = new StorageRuleSource({ adapter });
    const rules = await source.loadRules();

    expect(rules).toEqual([]);
  });

  it('should return empty array when stored rules is not an array', async () => {
    const adapter = createMockAdapter({
      state: { rules: 'not-an-array' },
      metadata: { persistedAt: Date.now(), serverId: 'test', schemaVersion: 1 },
    });

    const source = new StorageRuleSource({ adapter });
    const rules = await source.loadRules();

    expect(rules).toEqual([]);
  });

  it('should propagate storage adapter errors', async () => {
    const adapter = createMockAdapter();
    vi.mocked(adapter.load).mockRejectedValue(new Error('Connection failed'));

    const source = new StorageRuleSource({ adapter });

    await expect(source.loadRules()).rejects.toThrow('Connection failed');
  });

  it('should have name "storage"', () => {
    const adapter = createMockAdapter();
    const source = new StorageRuleSource({ adapter });
    expect(source.name).toBe('storage');
  });
});
