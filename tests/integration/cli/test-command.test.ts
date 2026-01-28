/**
 * Integrační testy pro příkaz test.
 * Testuje skutečné spuštění CLI jako subprocess.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const projectRoot = resolve(__dirname, '../../..');
const cliPath = join(projectRoot, 'dist/cli/index.js');
const fixturesDir = join(projectRoot, 'tests/fixtures/cli');
const tempDir = join(projectRoot, 'tests/temp/integration-test');

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(...args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 30000
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

describe('CLI test command (integration)', () => {
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

  describe('successful test execution', () => {
    it('runs simple test scenario with exit code 0', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/pass|success|✓/i);
    });

    it('runs test with initial facts', async () => {
      const file = join(fixturesDir, 'test-scenarios/with-initial-facts.json');
      const result = await runCli('test', file);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/pass|success|scenarios/i);
    });

    it('handles relative paths', async () => {
      const result = await runCli('test', 'tests/fixtures/cli/test-scenarios/simple-test.json');

      expect(result.exitCode).toBe(0);
    });

    it('runs multiple scenarios in one file', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file);

      expect(result.exitCode).toBe(0);
      // simple-test.json has 2 scenarios
      expect(result.stdout).toMatch(/2.*scenario|scenarios.*2|passed.*2/i);
    });
  });

  describe('dry run mode', () => {
    it('runs tests in dry run mode by default', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--dry-run');

      expect(result.exitCode).toBe(0);
    });

    it('isolates test execution from real storage', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');

      // Run test twice - each should pass independently
      const result1 = await runCli('test', file);
      const result2 = await runCli('test', file);

      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);
    });
  });

  describe('verbose mode', () => {
    it('shows execution trace in verbose mode', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--verbose');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/trace|event|fact|action/i);
    });

    it('includes more details in verbose output', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');

      const normalResult = await runCli('test', file);
      const verboseResult = await runCli('test', file, '--verbose');

      expect(verboseResult.stdout.length).toBeGreaterThan(normalResult.stdout.length);
    });
  });

  describe('external rules file', () => {
    it('loads rules from external file with --rules option', async () => {
      const testFile = join(tempDir, 'external-rules-test.json');
      const rulesFile = join(fixturesDir, 'valid-rules/simple.json');

      // Create test file that uses external rules
      const testContent = {
        name: 'External Rules Test',
        scenarios: [
          {
            name: 'Test with external rules',
            actions: [
              {
                type: 'emit',
                topic: 'order.created',
                data: { orderId: 'ext-1', amount: 200 }
              }
            ],
            assertions: [
              {
                type: 'fact_exists',
                key: 'order:ext-1:status'
              }
            ]
          }
        ]
      };

      writeFileSync(testFile, JSON.stringify(testContent, null, 2));

      const result = await runCli('test', testFile, '--rules', rulesFile);

      expect(result.exitCode).toBe(0);
    });

    it('fails when rules file does not exist', async () => {
      const testFile = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', testFile, '--rules', '/nonexistent/rules.json');

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/not found|does not exist|no such file/i);
    });
  });

  describe('timeout handling', () => {
    it('accepts custom timeout option', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--timeout', '5000');

      expect(result.exitCode).toBe(0);
    });

    it('handles short timeout value', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--timeout', '100');

      // Should still pass for simple tests
      expect(result.exitCode).toBe(0);
    });
  });

  describe('error handling', () => {
    it('returns exit code 4 for non-existent file', async () => {
      const result = await runCli('test', '/nonexistent/path/test.json');

      expect(result.exitCode).toBe(4);
      expect(result.stderr).toMatch(/not found|does not exist|no such file/i);
    });

    it('fails for invalid test file structure', async () => {
      const file = join(fixturesDir, 'test-scenarios/invalid-test.json');
      const result = await runCli('test', file);

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toMatch(/scenario|validation|invalid/i);
    });

    it('shows error for missing file argument', async () => {
      const result = await runCli('test');

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/missing|required|argument/i);
    });

    it('fails for invalid JSON syntax', async () => {
      const invalidFile = join(tempDir, 'invalid-syntax.json');
      writeFileSync(invalidFile, '{ invalid json }');

      const result = await runCli('test', invalidFile);

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toMatch(/JSON|parse|syntax/i);
    });
  });

  describe('test failures', () => {
    it('returns exit code 6 when assertions fail', async () => {
      const failingTest = join(tempDir, 'failing-test.json');

      const testContent = {
        name: 'Failing Test',
        rules: [
          {
            id: 'no-op-rule',
            name: 'No-op Rule',
            trigger: { type: 'event', topic: 'some.event' },
            conditions: [],
            actions: [{ type: 'log', level: 'info', message: 'no-op' }]
          }
        ],
        scenarios: [
          {
            name: 'Should fail assertion',
            actions: [
              { type: 'emit', topic: 'other.event', data: {} }
            ],
            assertions: [
              { type: 'fact_exists', key: 'nonexistent:fact' }
            ]
          }
        ]
      };

      writeFileSync(failingTest, JSON.stringify(testContent, null, 2));

      const result = await runCli('test', failingTest);

      expect(result.exitCode).toBe(6);
      expect(result.stderr).toMatch(/fail|assertion|error/i);
    });
  });

  describe('output formats', () => {
    it('outputs valid JSON with --format json', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--format', 'json');

      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('passed', true);
      expect(parsed).toHaveProperty('scenarios');
      expect(Array.isArray(parsed.scenarios)).toBe(true);
    });

    it('includes scenario details in JSON output', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--format', 'json');

      const parsed = JSON.parse(result.stdout);
      expect(parsed.scenarios.length).toBeGreaterThan(0);

      const scenario = parsed.scenarios[0];
      expect(scenario).toHaveProperty('scenario');
      expect(scenario).toHaveProperty('passed');
    });

    it('includes trace in JSON output with verbose mode', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--format', 'json', '--verbose');

      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(result.stdout);
      expect(parsed.scenarios[0]).toHaveProperty('trace');
    });

    it('outputs structured JSON on test failure', async () => {
      const failingTest = join(tempDir, 'failing-json-test.json');

      const testContent = {
        name: 'Failing JSON Test',
        rules: [
          {
            id: 'dummy',
            name: 'Dummy',
            trigger: { type: 'event', topic: 'x' },
            conditions: [],
            actions: []
          }
        ],
        scenarios: [
          {
            name: 'Will fail',
            actions: [],
            assertions: [{ type: 'fact_exists', key: 'missing' }]
          }
        ]
      };

      writeFileSync(failingTest, JSON.stringify(testContent, null, 2));

      const result = await runCli('test', failingTest, '--format', 'json');

      expect(result.exitCode).toBe(6);

      const parsed = JSON.parse(result.stdout);
      expect(parsed.passed).toBe(false);
      expect(parsed.scenarios[0].passed).toBe(false);
    });
  });

  describe('help', () => {
    it('shows help for test command', async () => {
      const result = await runCli('test', '--help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test');
      expect(result.stdout).toMatch(/file|dry-run|verbose|rules|timeout/i);
    });
  });

  describe('assertions', () => {
    it('supports fact_equals assertion', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file, '--format', 'json');

      expect(result.exitCode).toBe(0);
    });

    it('supports fact_exists assertion', async () => {
      const testFile = join(tempDir, 'fact-exists-test.json');

      const testContent = {
        name: 'Fact Exists Test',
        rules: [
          {
            id: 'set-fact',
            name: 'Set Fact Rule',
            trigger: { type: 'event', topic: 'trigger.event' },
            conditions: [],
            actions: [{ type: 'set_fact', key: 'test:key', value: 'any' }]
          }
        ],
        scenarios: [
          {
            name: 'Fact should exist',
            actions: [{ type: 'emit', topic: 'trigger.event', data: {} }],
            assertions: [{ type: 'fact_exists', key: 'test:key' }]
          }
        ]
      };

      writeFileSync(testFile, JSON.stringify(testContent, null, 2));

      const result = await runCli('test', testFile);
      expect(result.exitCode).toBe(0);
    });

    it('supports fact_not_exists assertion', async () => {
      const file = join(fixturesDir, 'test-scenarios/simple-test.json');
      const result = await runCli('test', file);

      // simple-test.json includes fact_not_exists assertion
      expect(result.exitCode).toBe(0);
    });
  });
});
