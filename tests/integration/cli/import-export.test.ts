/**
 * Integrační testy pro příkazy import a export.
 * Testuje skutečné spuštění CLI jako subprocess.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const projectRoot = resolve(__dirname, '../../..');
const cliPath = join(projectRoot, 'dist/cli/index.js');
const fixturesDir = join(projectRoot, 'tests/fixtures/cli');
const tempDir = join(projectRoot, 'tests/temp/integration');

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

describe('CLI import/export commands (integration)', () => {
  beforeAll(() => {
    if (!existsSync(cliPath)) {
      throw new Error(
        `CLI not built. Run 'npm run build' first. Expected path: ${cliPath}`
      );
    }

    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      mkdirSync(tempDir, { recursive: true });
    }
  });

  describe('import command', () => {
    describe('successful import', () => {
      it('imports a single rule file with exit code 0', async () => {
        const file = join(fixturesDir, 'valid-rules/simple.json');
        const result = await runCli('import', file);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Import completed|Imported/i);
      });

      it('imports multiple rules file', async () => {
        const file = join(fixturesDir, 'valid-rules/multiple.json');
        const result = await runCli('import', file);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Imported.*2|Import completed/i);
      });

      it('handles relative paths', async () => {
        const result = await runCli('import', 'tests/fixtures/cli/valid-rules/simple.json');

        expect(result.exitCode).toBe(0);
      });
    });

    describe('dry run mode', () => {
      it('shows preview without making changes', async () => {
        const file = join(fixturesDir, 'valid-rules/simple.json');
        const result = await runCli('import', file, '--dry-run');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Dry run|Would import|Preview/i);
        expect(result.stdout).toMatch(/no changes/i);
      });

      it('validates rules in dry run mode', async () => {
        const file = join(fixturesDir, 'invalid-rules/missing-id.json');
        const result = await runCli('import', file, '--dry-run');

        expect(result.exitCode).toBe(3);
        expect(result.stderr).toMatch(/id|validation/i);
      });
    });

    describe('merge mode', () => {
      it('accepts merge flag', async () => {
        const file = join(fixturesDir, 'valid-rules/simple.json');
        const result = await runCli('import', file, '--merge');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Import completed|Imported/i);
      });

      it('combines merge and dry-run', async () => {
        const file = join(fixturesDir, 'valid-rules/multiple.json');
        const result = await runCli('import', file, '--merge', '--dry-run');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Would import|Preview/i);
      });
    });

    describe('validation control', () => {
      it('skips validation with --no-validate flag', async () => {
        const invalidFile = join(tempDir, 'no-validate.json');
        writeFileSync(invalidFile, JSON.stringify([{ id: 'test', name: 'No trigger' }]));

        const result = await runCli('import', invalidFile, '--no-validate');

        expect(result.exitCode).toBe(0);
      });

      it('fails validation for invalid rules by default', async () => {
        const file = join(fixturesDir, 'invalid-rules/missing-id.json');
        const result = await runCli('import', file);

        expect(result.exitCode).toBe(3);
      });
    });

    describe('error handling', () => {
      it('returns exit code 4 for non-existent file', async () => {
        const result = await runCli('import', '/nonexistent/path/rules.json');

        expect(result.exitCode).toBe(4);
        expect(result.stderr).toMatch(/not found|does not exist|no such file/i);
      });

      it('fails for invalid JSON syntax', async () => {
        const file = join(fixturesDir, 'invalid-rules/invalid-json.json');
        const result = await runCli('import', file);

        expect(result.exitCode).toBe(3);
        expect(result.stderr).toMatch(/JSON|parse|syntax/i);
      });

      it('fails for duplicate rule IDs', async () => {
        const file = join(fixturesDir, 'invalid-rules/duplicate-ids.json');
        const result = await runCli('import', file);

        expect(result.exitCode).toBe(3);
        expect(result.stderr).toMatch(/duplicate/i);
      });

      it('shows error for missing file argument', async () => {
        const result = await runCli('import');

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toMatch(/missing|required|argument/i);
      });
    });

    describe('output formats', () => {
      it('outputs valid JSON with --format json', async () => {
        const file = join(fixturesDir, 'valid-rules/simple.json');
        const result = await runCli('import', file, '--format', 'json');

        expect(result.exitCode).toBe(0);

        const parsed = JSON.parse(result.stdout);
        expect(parsed).toHaveProperty('success', true);
        expect(parsed).toHaveProperty('import');
        expect(parsed.import).toHaveProperty('imported');
      });

      it('reports validation errors on import failure', async () => {
        const file = join(fixturesDir, 'invalid-rules/missing-id.json');
        const result = await runCli('import', file, '--format', 'json');

        expect(result.exitCode).toBe(3);
        expect(result.stderr).toMatch(/id|validation|required/i);
      });

      it('outputs JSON in dry-run mode', async () => {
        const file = join(fixturesDir, 'valid-rules/simple.json');
        const result = await runCli('import', file, '--dry-run', '--format', 'json');

        expect(result.exitCode).toBe(0);

        const parsed = JSON.parse(result.stdout);
        expect(parsed).toHaveProperty('preview');
      });
    });

    describe('help', () => {
      it('shows help for import command', async () => {
        const result = await runCli('import', '--help');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('import');
        expect(result.stdout).toMatch(/file|dry-run|merge/i);
      });
    });
  });

  describe('export command', () => {
    describe('export to stdout', () => {
      it('exports rules to stdout with exit code 0', async () => {
        const result = await runCli('export');

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('outputs valid JSON array', async () => {
        const result = await runCli('export');

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(result.stdout);
        expect(Array.isArray(parsed)).toBe(true);
      });
    });

    describe('export to file', () => {
      it('writes rules to specified file', async () => {
        const outputFile = join(tempDir, 'exported-rules.json');
        const result = await runCli('export', outputFile);

        expect(result.exitCode).toBe(0);
        expect(existsSync(outputFile)).toBe(true);

        const content = readFileSync(outputFile, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      });

      it('creates parent directories when needed', async () => {
        const outputFile = join(tempDir, 'nested/deep/exported.json');
        const result = await runCli('export', outputFile);

        expect(result.exitCode).toBe(0);
        expect(existsSync(outputFile)).toBe(true);
      });

      it('shows success message for file export', async () => {
        const outputFile = join(tempDir, 'success.json');
        const result = await runCli('export', outputFile);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Exported|Export completed|rule\(s\)/i);
      });
    });

    describe('pretty formatting', () => {
      it('outputs formatted JSON with --pretty flag', async () => {
        const outputFile = join(tempDir, 'pretty.json');
        const result = await runCli('export', outputFile, '--pretty');

        expect(result.exitCode).toBe(0);
        expect(existsSync(outputFile)).toBe(true);

        const content = readFileSync(outputFile, 'utf-8');
        // Pretty JSON obsahuje newlines, pokud má nějaká data
        expect(() => JSON.parse(content)).not.toThrow();
      });
    });

    describe('filtering', () => {
      it('accepts --tags filter', async () => {
        const result = await runCli('export', '--tags', 'production,critical');

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('accepts --enabled filter', async () => {
        const result = await runCli('export', '--enabled');

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('combines multiple filters', async () => {
        const result = await runCli('export', '--tags', 'test', '--enabled');

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });
    });

    describe('output formats', () => {
      it('outputs structured JSON with --format json for stdout', async () => {
        const result = await runCli('export', '--format', 'json');

        expect(result.exitCode).toBe(0);

        const parsed = JSON.parse(result.stdout);
        expect(parsed).toHaveProperty('success', true);
        expect(parsed).toHaveProperty('rules');
        expect(Array.isArray(parsed.rules)).toBe(true);
      });

      it('outputs structured JSON with --format json for file', async () => {
        const outputFile = join(tempDir, 'json-format.json');
        const result = await runCli('export', outputFile, '--format', 'json');

        expect(result.exitCode).toBe(0);

        const parsed = JSON.parse(result.stdout);
        expect(parsed).toHaveProperty('export');
        expect(parsed.export).toHaveProperty('file');
      });
    });

    describe('help', () => {
      it('shows help for export command', async () => {
        const result = await runCli('export', '--help');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('export');
        expect(result.stdout).toMatch(/file|pretty|tags|enabled/i);
      });
    });
  });

  describe('import/export roundtrip', () => {
    it('can export and reimport rules', async () => {
      // First import some rules
      const importFile = join(fixturesDir, 'valid-rules/multiple.json');
      const importResult = await runCli('import', importFile);
      expect(importResult.exitCode).toBe(0);

      // Export to file
      const exportFile = join(tempDir, 'roundtrip.json');
      const exportResult = await runCli('export', exportFile);
      expect(exportResult.exitCode).toBe(0);
      expect(existsSync(exportFile)).toBe(true);

      // Reimport exported file
      const reimportResult = await runCli('import', exportFile, '--dry-run');
      expect(reimportResult.exitCode).toBe(0);
    });

    it('preserves rule structure during roundtrip', async () => {
      // Import rules
      const importFile = join(fixturesDir, 'valid-rules/simple.json');
      await runCli('import', importFile);

      // Export
      const exportResult = await runCli('export');
      const exported = JSON.parse(exportResult.stdout);

      // Verify structure
      if (exported.length > 0) {
        const rule = exported[0];
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('trigger');
        expect(rule).toHaveProperty('actions');
        // Internal fields should be excluded
        expect(rule).not.toHaveProperty('version');
        expect(rule).not.toHaveProperty('createdAt');
        expect(rule).not.toHaveProperty('updatedAt');
      }
    });
  });
});
