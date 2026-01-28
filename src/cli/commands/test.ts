/**
 * Příkaz test pro CLI.
 * Spouští testovací scénáře proti pravidlům.
 */

import type { GlobalOptions } from '../types.js';
import type { Rule } from '../../types/rule.js';
import type { TestFile, TestResult, ScenarioResult, AssertionResult } from '../services/test-runner.js';
import { createTestRunner, validateTestFile, resultToFailures } from '../services/test-runner.js';
import { loadJsonFile } from '../utils/file-loader.js';
import { TestFailedError, ValidationError } from '../utils/errors.js';
import { print, success, error, warning, info, colorize } from '../utils/output.js';
import { createFormatter } from '../formatters/index.js';

/** Options pro příkaz test */
export interface TestCommandOptions extends GlobalOptions {
  /** Dry-run mode */
  dryRun: boolean;
  /** Verbose výstup */
  verbose: boolean;
  /** Cesta k souboru s pravidly (přepisuje rulesFile v test souboru) */
  rules: string | undefined;
  /** Timeout v ms */
  timeout: number | undefined;
}

/**
 * Spustí příkaz test.
 */
export async function testCommand(file: string, options: TestCommandOptions): Promise<void> {
  // Načtení testovacího souboru
  const { data: testData } = loadJsonFile(file);

  // Validace struktury
  const validation = validateTestFile(testData);
  if (!validation.valid) {
    throw new ValidationError(`Invalid test file: ${file}`, validation.errors.map((e) => ({
      path: file,
      message: e,
      severity: 'error' as const
    })));
  }

  const testFile = testData as TestFile;

  // Načtení pravidel
  const rules = await loadRules(testFile, options);

  // Vytvoření test runneru
  const runnerOptions: { dryRun: boolean; verbose: boolean; timeout?: number } = {
    dryRun: options.dryRun,
    verbose: options.verbose
  };
  if (options.timeout !== undefined) {
    runnerOptions.timeout = options.timeout;
  }
  const runner = createTestRunner(runnerOptions);

  // Spuštění testů
  const result = await runner.run(testFile, rules);

  // Výstup výsledků
  if (options.format === 'json') {
    outputJson(result);
  } else {
    outputPretty(result, options.verbose);
  }

  // Kontrola výsledku
  if (!result.passed) {
    const failures = resultToFailures(result);
    throw new TestFailedError(
      `${result.failedCount} of ${result.total} test(s) failed`,
      failures
    );
  }
}

/**
 * Načte pravidla z testovacího souboru nebo externí cesty.
 */
function loadRules(testFile: TestFile, options: TestCommandOptions): Rule[] {
  // Priorita: --rules option > rulesFile v test souboru > inline rules
  const rulesPath = options.rules ?? testFile.rulesFile;

  if (rulesPath) {
    const { data: rulesData } = loadJsonFile(rulesPath);
    return normalizeRules(rulesData);
  }

  if (testFile.rules && Array.isArray(testFile.rules)) {
    return normalizeRules(testFile.rules);
  }

  throw new ValidationError('No rules specified. Use --rules option, rulesFile in test file, or inline rules.');
}

/**
 * Normalizuje pravidla na pole Rule objektů.
 */
function normalizeRules(data: unknown): Rule[] {
  if (Array.isArray(data)) {
    return data.map(normalizeRule);
  }
  return [normalizeRule(data)];
}

/**
 * Normalizuje jedno pravidlo.
 */
function normalizeRule(data: unknown): Rule {
  const rule = data as Record<string, unknown>;
  const now = Date.now();

  const normalized: Rule = {
    id: rule['id'] as string,
    name: rule['name'] as string,
    priority: (rule['priority'] as number) ?? 0,
    enabled: (rule['enabled'] as boolean) ?? true,
    version: (rule['version'] as number) ?? 1,
    tags: (rule['tags'] as string[]) ?? [],
    trigger: rule['trigger'] as Rule['trigger'],
    conditions: (rule['conditions'] as Rule['conditions']) ?? [],
    actions: (rule['actions'] as Rule['actions']) ?? [],
    createdAt: (rule['createdAt'] as number) ?? now,
    updatedAt: (rule['updatedAt'] as number) ?? now
  };

  if (typeof rule['description'] === 'string') {
    normalized.description = rule['description'];
  }

  return normalized;
}

/**
 * Výstup v JSON formátu.
 */
function outputJson(result: TestResult): void {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Výstup v pretty formátu.
 */
function outputPretty(result: TestResult, verbose: boolean): void {
  print('');
  print(colorize(`Test Results: ${result.file}`, 'bold'));
  print(colorize('─'.repeat(50), 'gray'));
  print('');

  for (const scenario of result.scenarios) {
    outputScenario(scenario, verbose);
  }

  print(colorize('─'.repeat(50), 'gray'));
  outputSummary(result);
}

/**
 * Výstup jednoho scénáře.
 */
function outputScenario(scenario: ScenarioResult, verbose: boolean): void {
  const icon = scenario.passed ? colorize('✓', 'green') : colorize('✗', 'red');
  const name = scenario.passed ? scenario.scenario : colorize(scenario.scenario, 'red');
  const duration = colorize(`(${scenario.duration}ms)`, 'gray');

  print(`  ${icon} ${name} ${duration}`);

  if (scenario.error) {
    print(`      ${colorize('Error:', 'red')} ${scenario.error}`);
  }

  if (!scenario.passed || verbose) {
    for (const assertion of scenario.assertions) {
      outputAssertion(assertion);
    }
  }

  if (verbose && scenario.trace.length > 0) {
    print(colorize('    Trace:', 'gray'));
    for (const entry of scenario.trace) {
      const isoTime = new Date(entry.timestamp).toISOString();
      const timePart = isoTime.split('T')[1] ?? isoTime;
      const time = timePart.slice(0, -1);
      print(colorize(`      [${time}] ${entry.type}: ${JSON.stringify(entry.details)}`, 'gray'));
    }
  }

  print('');
}

/**
 * Výstup jedné aserce.
 */
function outputAssertion(assertion: AssertionResult): void {
  if (assertion.passed) {
    print(`      ${colorize('✓', 'green')} ${assertion.message}`);
  } else {
    print(`      ${colorize('✗', 'red')} ${assertion.message}`);
    print(`        ${colorize('Expected:', 'gray')} ${JSON.stringify(assertion.expected)}`);
    print(`        ${colorize('Actual:', 'gray')} ${JSON.stringify(assertion.actual)}`);
  }
}

/**
 * Výstup souhrnu.
 */
function outputSummary(result: TestResult): void {
  const status = result.passed
    ? colorize('PASSED', 'green')
    : colorize('FAILED', 'red');

  print(`  ${status} ${result.passedCount}/${result.total} scenarios passed ${colorize(`(${result.duration}ms)`, 'gray')}`);
  print('');
}
