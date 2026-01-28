import { describe, it, expect } from 'vitest';
import {
  CliError,
  InvalidArgumentsError,
  FileNotFoundError,
  ValidationError,
  ConnectionError,
  TestFailedError,
  getExitCode,
  formatError
} from '../../../../src/cli/utils/errors.js';
import { ExitCode } from '../../../../src/cli/types.js';

describe('CLI Errors', () => {
  describe('CliError', () => {
    it('should create error with default exit code', () => {
      const error = new CliError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.exitCode).toBe(ExitCode.GeneralError);
      expect(error.name).toBe('CliError');
    });

    it('should create error with custom exit code', () => {
      const error = new CliError('Test error', ExitCode.ValidationError);

      expect(error.exitCode).toBe(ExitCode.ValidationError);
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new CliError('Wrapper error', ExitCode.GeneralError, cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('InvalidArgumentsError', () => {
    it('should create with InvalidArguments exit code', () => {
      const error = new InvalidArgumentsError('Invalid argument');

      expect(error.exitCode).toBe(ExitCode.InvalidArguments);
      expect(error.name).toBe('InvalidArgumentsError');
    });
  });

  describe('FileNotFoundError', () => {
    it('should create with file path', () => {
      const error = new FileNotFoundError('/path/to/file.json');

      expect(error.exitCode).toBe(ExitCode.FileNotFound);
      expect(error.filePath).toBe('/path/to/file.json');
      expect(error.message).toContain('/path/to/file.json');
    });
  });

  describe('ValidationError', () => {
    it('should create with validation errors', () => {
      const errors = [
        { path: 'trigger', message: 'Missing', severity: 'error' as const }
      ];
      const error = new ValidationError('Validation failed', errors);

      expect(error.exitCode).toBe(ExitCode.ValidationError);
      expect(error.errors).toEqual(errors);
    });
  });

  describe('ConnectionError', () => {
    it('should create with URL', () => {
      const error = new ConnectionError('http://localhost:3000');

      expect(error.exitCode).toBe(ExitCode.ConnectionError);
      expect(error.url).toBe('http://localhost:3000');
      expect(error.message).toContain('http://localhost:3000');
    });
  });

  describe('TestFailedError', () => {
    it('should create with failures', () => {
      const failures = [
        {
          scenario: 'test-1',
          assertion: 'fact_equals',
          expected: 'foo',
          actual: 'bar'
        }
      ];
      const error = new TestFailedError('Test failed', failures);

      expect(error.exitCode).toBe(ExitCode.TestFailed);
      expect(error.failures).toEqual(failures);
    });
  });

  describe('getExitCode', () => {
    it('should return exit code from CliError', () => {
      const error = new ValidationError('Test');

      expect(getExitCode(error)).toBe(ExitCode.ValidationError);
    });

    it('should return GeneralError for regular Error', () => {
      const error = new Error('Test');

      expect(getExitCode(error)).toBe(ExitCode.GeneralError);
    });

    it('should return GeneralError for non-Error', () => {
      expect(getExitCode('string error')).toBe(ExitCode.GeneralError);
      expect(getExitCode(null)).toBe(ExitCode.GeneralError);
    });
  });

  describe('formatError', () => {
    it('should format CliError', () => {
      const error = new CliError('Test error');

      expect(formatError(error)).toBe('Test error');
    });

    it('should format ValidationError with errors', () => {
      const error = new ValidationError('Validation failed', [
        { path: 'trigger', message: 'Missing', severity: 'error' }
      ]);

      const result = formatError(error);

      expect(result).toContain('Validation failed');
      expect(result).toContain('trigger: Missing');
    });

    it('should format TestFailedError with failures', () => {
      const error = new TestFailedError('Test failed', [
        {
          scenario: 'test-1',
          assertion: 'fact_equals',
          expected: 'foo',
          actual: 'bar'
        }
      ]);

      const result = formatError(error);

      expect(result).toContain('Test failed');
      expect(result).toContain('test-1');
    });

    it('should format regular Error', () => {
      const error = new Error('Regular error');

      expect(formatError(error)).toBe('Regular error');
    });

    it('should format string', () => {
      expect(formatError('String error')).toBe('String error');
    });
  });
});
