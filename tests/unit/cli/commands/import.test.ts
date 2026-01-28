import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { importCommand, type ImportCommandOptions } from '../../../../src/cli/commands/import.js';
import { FileNotFoundError, ValidationError } from '../../../../src/cli/utils/errors.js';
import { setOutputOptions } from '../../../../src/cli/utils/output.js';

const fixturesDir = resolve(__dirname, '../../../fixtures/cli');
const tempDir = resolve(__dirname, '../../../temp/import');

function createOptions(overrides: Partial<ImportCommandOptions> = {}): ImportCommandOptions {
  return {
    format: 'pretty',
    quiet: false,
    noColor: true,
    config: undefined,
    dryRun: false,
    merge: false,
    validate: true,
    strict: false,
    ...overrides
  };
}

describe('importCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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

  describe('valid imports', () => {
    it('should import a single valid rule', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions();

      await expect(importCommand(file, options)).resolves.toBeUndefined();

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Import completed');
      expect(output).toContain('Imported: 1');
    });

    it('should import multiple valid rules', async () => {
      const file = resolve(fixturesDir, 'valid-rules/multiple.json');
      const options = createOptions();

      await expect(importCommand(file, options)).resolves.toBeUndefined();

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Imported: 2');
    });

    it('should handle relative paths', async () => {
      const file = 'tests/fixtures/cli/valid-rules/simple.json';
      const options = createOptions();

      await expect(importCommand(file, options)).resolves.toBeUndefined();
    });
  });

  describe('dry run mode', () => {
    it('should show preview in dry run mode', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ dryRun: true });

      await expect(importCommand(file, options)).resolves.toBeUndefined();

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Dry run');
      expect(output).toContain('Would import');
    });

    it('should not make changes in dry run mode', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ dryRun: true });

      await importCommand(file, options);

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('no changes');
    });

    it('should show validation errors in dry run mode', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/missing-id.json');
      const options = createOptions({ dryRun: true });

      await expect(importCommand(file, options)).rejects.toThrow(ValidationError);
    });
  });

  describe('file handling', () => {
    it('should throw FileNotFoundError for non-existent file', async () => {
      const file = 'non-existent.json';
      const options = createOptions();

      await expect(importCommand(file, options)).rejects.toThrow(FileNotFoundError);
    });

    it('should throw ValidationError for invalid JSON', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/invalid-json.json');
      const options = createOptions();

      await expect(importCommand(file, options)).rejects.toThrow(ValidationError);
    });
  });

  describe('validation', () => {
    it('should fail for invalid rules', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/missing-id.json');
      const options = createOptions();

      await expect(importCommand(file, options)).rejects.toThrow(ValidationError);
    });

    it('should fail for invalid trigger', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/invalid-trigger.json');
      const options = createOptions();

      await expect(importCommand(file, options)).rejects.toThrow(ValidationError);
    });

    it('should skip validation when disabled', async () => {
      const filePath = join(tempDir, 'no-validate.json');
      writeFileSync(filePath, JSON.stringify([{ id: 'test', name: 'Test' }]));

      const options = createOptions({ validate: false });

      await expect(importCommand(filePath, options)).resolves.toBeUndefined();
    });
  });

  describe('output formats', () => {
    it('should output JSON format', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ format: 'json' });
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await importCommand(file, options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.import).toBeDefined();
    });

    it('should output JSON format in dry run mode', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ format: 'json', dryRun: true });
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await importCommand(file, options);

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.preview).toBeDefined();
    });
  });

  describe('merge mode', () => {
    it('should show merge results', async () => {
      const file = resolve(fixturesDir, 'valid-rules/multiple.json');
      const options = createOptions({ merge: true });

      await importCommand(file, options);

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Import completed');
    });

    it('should show merge preview in dry run', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ merge: true, dryRun: true });

      await importCommand(file, options);

      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Would import');
    });
  });
});
