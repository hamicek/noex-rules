/**
 * CLI chybové třídy.
 */

import { ExitCode } from '../types.js';

/** Základní CLI chyba */
export class CliError extends Error {
  public readonly exitCode: ExitCode;
  public override readonly cause: Error | undefined;

  constructor(message: string, exitCode: ExitCode = ExitCode.GeneralError, cause?: Error) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.cause = cause;
  }
}

/** Chyba validace argumentů */
export class InvalidArgumentsError extends CliError {
  constructor(message: string, cause?: Error) {
    super(message, ExitCode.InvalidArguments, cause);
    this.name = 'InvalidArgumentsError';
  }
}

/** Soubor nenalezen */
export class FileNotFoundError extends CliError {
  public readonly filePath: string;

  constructor(filePath: string, cause?: Error) {
    super(`File not found: ${filePath}`, ExitCode.FileNotFound, cause);
    this.name = 'FileNotFoundError';
    this.filePath = filePath;
  }
}

/** Chyba validace pravidel */
export class ValidationError extends CliError {
  public readonly errors: ValidationIssue[];

  constructor(message: string, errors: ValidationIssue[] = [], cause?: Error) {
    super(message, ExitCode.ValidationError, cause);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/** Chyba připojení k serveru */
export class ConnectionError extends CliError {
  public readonly url: string;

  constructor(url: string, cause?: Error) {
    super(`Failed to connect to server: ${url}`, ExitCode.ConnectionError, cause);
    this.name = 'ConnectionError';
    this.url = url;
  }
}

/** Chyba testu */
export class TestFailedError extends CliError {
  public readonly failures: TestFailure[];

  constructor(message: string, failures: TestFailure[] = [], cause?: Error) {
    super(message, ExitCode.TestFailed, cause);
    this.name = 'TestFailedError';
    this.failures = failures;
  }
}

/** Validační problém */
export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/** Selhání testu */
export interface TestFailure {
  scenario: string;
  assertion: string;
  expected: unknown;
  actual: unknown;
}

/** Získá exit kód z chyby */
export function getExitCode(error: unknown): ExitCode {
  if (error instanceof CliError) {
    return error.exitCode;
  }
  return ExitCode.GeneralError;
}

/** Formátuje chybu pro výstup */
export function formatError(error: unknown): string {
  if (error instanceof CliError) {
    let message = error.message;
    if (error instanceof ValidationError && error.errors.length > 0) {
      message +=
        '\n' +
        error.errors.map((e) => `  ${e.severity === 'error' ? '✗' : '⚠'} ${e.path}: ${e.message}`).join('\n');
    }
    if (error instanceof TestFailedError && error.failures.length > 0) {
      message += '\n' + error.failures.map((f) => `  ✗ ${f.scenario}: ${f.assertion}`).join('\n');
    }
    return message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
