import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { validateCommand, type ValidateOptions } from '../../../../src/cli/commands/validate.js';
import { FileNotFoundError, ValidationError } from '../../../../src/cli/utils/errors.js';
import { setOutputOptions } from '../../../../src/cli/utils/output.js';

const fixturesDir = resolve(__dirname, '../../../fixtures/cli');

function createOptions(overrides: Partial<ValidateOptions> = {}): ValidateOptions {
  return {
    format: 'pretty',
    quiet: false,
    noColor: true,
    config: undefined,
    strict: false,
    ...overrides
  };
}

describe('validateCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('valid rules', () => {
    it('should validate a simple valid rule', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).resolves.toBeUndefined();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should validate multiple valid rules', async () => {
      const file = resolve(fixturesDir, 'valid-rules/multiple.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).resolves.toBeUndefined();
    });

    it('should validate temporal rule', async () => {
      const file = resolve(fixturesDir, 'valid-rules/temporal.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).resolves.toBeUndefined();
    });
  });

  describe('invalid rules', () => {
    it('should fail for missing id', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/missing-id.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).rejects.toThrow(ValidationError);
    });

    it('should fail for invalid trigger type', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/invalid-trigger.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).rejects.toThrow(ValidationError);
    });

    it('should fail for invalid JSON', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/invalid-json.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).rejects.toThrow(ValidationError);
    });

    it('should fail for duplicate IDs', async () => {
      const file = resolve(fixturesDir, 'invalid-rules/duplicate-ids.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).rejects.toThrow(ValidationError);
    });
  });

  describe('file handling', () => {
    it('should throw FileNotFoundError for non-existent file', async () => {
      const file = resolve(fixturesDir, 'non-existent.json');
      const options = createOptions();

      await expect(validateCommand(file, options)).rejects.toThrow(FileNotFoundError);
    });

    it('should handle relative paths', async () => {
      const file = 'tests/fixtures/cli/valid-rules/simple.json';
      const options = createOptions();

      await expect(validateCommand(file, options)).resolves.toBeUndefined();
    });
  });

  describe('output formats', () => {
    it('should output JSON format', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ format: 'json' });
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await validateCommand(file, options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.validation).toBeDefined();
    });

    it('should output pretty format by default', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ format: 'pretty' });
      setOutputOptions({ format: 'pretty', quiet: false, noColor: true });

      await validateCommand(file, options);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('File:');
      expect(output).toContain('Rules:');
    });
  });

  describe('strict mode', () => {
    it('should pass without warnings in non-strict mode', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ strict: false });

      await expect(validateCommand(file, options)).resolves.toBeUndefined();
    });
  });

  describe('quiet mode', () => {
    it('should suppress output in quiet mode for valid rules', async () => {
      const file = resolve(fixturesDir, 'valid-rules/simple.json');
      const options = createOptions({ quiet: true });
      setOutputOptions({ format: 'pretty', quiet: true, noColor: true });

      await validateCommand(file, options);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
