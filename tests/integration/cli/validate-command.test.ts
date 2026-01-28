/**
 * Integrační testy pro příkaz validate.
 * Testuje skutečné spuštění CLI jako subprocess.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const projectRoot = resolve(__dirname, '../../..');
const cliPath = join(projectRoot, 'dist/cli/index.js');
const fixturesDir = join(projectRoot, 'tests/fixtures/cli');

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(...args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: '1' }
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.code ?? 1
    };
  }
}

describe('CLI validate command (integration)', () => {
  beforeAll(() => {
    if (!existsSync(cliPath)) {
      throw new Error(
        `CLI not built. Run 'npm run build' first. Expected path: ${cliPath}`
      );
    }
  });

  describe('successful validation', () => {
    it('validates a simple rule file with exit code 0', async () => {
      const file = join(fixturesDir, 'valid-rules/simple.json');
      const result = await runCli('validate', file);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('File:');
      expect(result.stdout).toContain('Rules: 1');
      expect(result.stdout).toMatch(/All rules are valid|valid/i);
    });

    it('validates multiple rules file', async () => {
      const file = join(fixturesDir, 'valid-rules/multiple.json');
      const result = await runCli('validate', file);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rules:');
    });

    it('validates temporal rules', async () => {
      const file = join(fixturesDir, 'valid-rules/temporal.json');
      const result = await runCli('validate', file);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('validation failures', () => {
    it('fails for missing rule id with exit code 3', async () => {
      const file = join(fixturesDir, 'invalid-rules/missing-id.json');
      const result = await runCli('validate', file);

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toMatch(/id|required/i);
    });

    it('fails for invalid trigger type with exit code 3', async () => {
      const file = join(fixturesDir, 'invalid-rules/invalid-trigger.json');
      const result = await runCli('validate', file);

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toMatch(/trigger|type/i);
    });

    it('fails for invalid JSON syntax with exit code 3', async () => {
      const file = join(fixturesDir, 'invalid-rules/invalid-json.json');
      const result = await runCli('validate', file);

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toMatch(/JSON|parse|syntax/i);
    });

    it('fails for duplicate rule IDs with exit code 3', async () => {
      const file = join(fixturesDir, 'invalid-rules/duplicate-ids.json');
      const result = await runCli('validate', file);

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toMatch(/duplicate/i);
    });
  });

  describe('file handling', () => {
    it('returns exit code 4 for non-existent file', async () => {
      const result = await runCli('validate', '/nonexistent/path/rules.json');

      expect(result.exitCode).toBe(4);
      expect(result.stderr).toMatch(/not found|does not exist|no such file/i);
    });

    it('handles relative paths', async () => {
      const result = await runCli('validate', 'tests/fixtures/cli/valid-rules/simple.json');

      expect(result.exitCode).toBe(0);
    });
  });

  describe('output formats', () => {
    it('outputs valid JSON with --format json', async () => {
      const file = join(fixturesDir, 'valid-rules/simple.json');
      const result = await runCli('validate', file, '--format', 'json');

      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('success', true);
      expect(parsed).toHaveProperty('validation');
      expect(parsed.validation).toHaveProperty('valid', true);
      expect(parsed.validation).toHaveProperty('ruleCount', 1);
      expect(parsed.validation).toHaveProperty('errorCount', 0);
    });

    it('outputs structured JSON on validation failure', async () => {
      const file = join(fixturesDir, 'invalid-rules/missing-id.json');
      const result = await runCli('validate', file, '--format', 'json');

      expect(result.exitCode).toBe(3);

      const parsed = JSON.parse(result.stdout);
      expect(parsed.validation).toHaveProperty('valid', false);
      expect(parsed.validation.errorCount).toBeGreaterThan(0);
      expect(Array.isArray(parsed.validation.errors)).toBe(true);
    });
  });

  describe('strict mode', () => {
    it('accepts --strict flag', async () => {
      const file = join(fixturesDir, 'valid-rules/simple.json');
      const result = await runCli('validate', file, '--strict');

      expect(result.exitCode).toBe(0);
    });

    it('can be combined with other flags', async () => {
      const file = join(fixturesDir, 'valid-rules/simple.json');
      const result = await runCli('validate', file, '--strict', '--format', 'json');

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.validation.valid).toBe(true);
    });
  });

  describe('quiet mode', () => {
    it('suppresses output in quiet mode for valid rules', async () => {
      const file = join(fixturesDir, 'valid-rules/simple.json');
      const result = await runCli('validate', file, '--quiet');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('');
    });

    it('still reports errors in quiet mode', async () => {
      const file = join(fixturesDir, 'invalid-rules/missing-id.json');
      const result = await runCli('validate', file, '--quiet');

      expect(result.exitCode).toBe(3);
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('help and usage', () => {
    it('shows help for validate command', async () => {
      const result = await runCli('validate', '--help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('validate');
      expect(result.stdout).toMatch(/file|rules/i);
    });

    it('shows error for missing file argument', async () => {
      const result = await runCli('validate');

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/missing|required|argument/i);
    });
  });
});
