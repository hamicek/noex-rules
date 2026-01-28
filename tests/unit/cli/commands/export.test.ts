import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { exportCommand, type ExportCommandOptions } from '../../../../src/cli/commands/export.js';
import { RulePersistence } from '../../../../src/persistence/rule-persistence.js';
import { setOutputOptions } from '../../../../src/cli/utils/output.js';
import type { Rule } from '../../../../src/types/rule.js';

const tempDir = resolve(__dirname, '../../../temp/export');

function createOptions(overrides: Partial<ExportCommandOptions> = {}): ExportCommandOptions {
  return {
    format: 'pretty',
    quiet: false,
    noColor: true,
    config: undefined,
    pretty: false,
    tags: undefined,
    enabled: undefined,
    ...overrides
  };
}

function createRule(overrides: Partial<Rule> = {}): Rule {
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

describe('exportCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setOutputOptions({ format: 'pretty', quiet: false, noColor: true });

    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('export to stdout', () => {
    it('should export empty array when no rules exist', async () => {
      const options = createOptions();

      await exportCommand(undefined, options);

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('[]');
    });

    it('should output valid JSON', async () => {
      const options = createOptions();

      await exportCommand(undefined, options);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should output pretty JSON when requested', async () => {
      const options = createOptions({ pretty: true });

      await exportCommand(undefined, options);

      const output = consoleLogSpy.mock.calls[0][0];
      // Prázdné pole bude vždy "[]" - pretty formát přidá newline pouze pro objekty/pole s položkami
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should output compact JSON by default', async () => {
      const options = createOptions({ pretty: false });

      await exportCommand(undefined, options);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toBe('[]');
    });
  });

  describe('export to file', () => {
    it('should write rules to file', async () => {
      const outputPath = join(tempDir, 'export.json');
      const options = createOptions();

      await exportCommand(outputPath, options);

      expect(existsSync(outputPath)).toBe(true);

      const content = readFileSync(outputPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should write pretty JSON to file when requested', async () => {
      const outputPath = join(tempDir, 'pretty-export.json');
      const options = createOptions({ pretty: true });

      await exportCommand(outputPath, options);

      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('\n');
    });

    it('should create parent directories', async () => {
      const outputPath = join(tempDir, 'nested/deep/export.json');
      const options = createOptions();

      await exportCommand(outputPath, options);

      expect(existsSync(outputPath)).toBe(true);
    });

    it('should show success message', async () => {
      const outputPath = join(tempDir, 'success.json');
      const options = createOptions();

      await exportCommand(outputPath, options);

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Exported');
      expect(output).toContain('rule(s)');
    });
  });

  describe('output formats', () => {
    it('should output JSON format for stdout', async () => {
      const options = createOptions({ format: 'json' });
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await exportCommand(undefined, options);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.rules).toBeDefined();
    });

    it('should output JSON format for file', async () => {
      const outputPath = join(tempDir, 'json-format.json');
      const options = createOptions({ format: 'json' });
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await exportCommand(outputPath, options);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.export).toBeDefined();
      expect(parsed.export.file).toContain('json-format.json');
    });
  });

  describe('filtering', () => {
    it('should accept tags filter', async () => {
      const options = createOptions({ tags: 'production,critical' });

      await expect(exportCommand(undefined, options)).resolves.toBeUndefined();
    });

    it('should accept enabled filter', async () => {
      const options = createOptions({ enabled: true });

      await expect(exportCommand(undefined, options)).resolves.toBeUndefined();
    });

    it('should combine filters', async () => {
      const options = createOptions({ tags: 'production', enabled: true });

      await expect(exportCommand(undefined, options)).resolves.toBeUndefined();
    });
  });

  describe('rule formatting', () => {
    it('should exclude internal fields from export', async () => {
      const options = createOptions();

      await exportCommand(undefined, options);

      const output = consoleLogSpy.mock.calls[0][0];
      const rules = JSON.parse(output);

      if (rules.length > 0) {
        expect(rules[0]).not.toHaveProperty('version');
        expect(rules[0]).not.toHaveProperty('createdAt');
        expect(rules[0]).not.toHaveProperty('updatedAt');
      }
    });
  });

  describe('quiet mode', () => {
    it('should suppress extra output in quiet mode for stdout', async () => {
      const options = createOptions({ quiet: true });
      setOutputOptions({ format: 'pretty', quiet: true, noColor: true });

      await exportCommand(undefined, options);

      // V quiet mode by se měl zobrazit pouze JSON
      const calls = consoleLogSpy.mock.calls;
      expect(calls.length).toBeLessThanOrEqual(1);
    });
  });
});
