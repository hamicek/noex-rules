/**
 * Test runner služba pro CLI.
 * Spouští testovací scénáře proti pravidlům s podporou dry-run a tracování.
 */

import type { Rule } from '../../types/rule.js';
import type { RuleAction } from '../../types/action.js';
import { RuleEngine } from '../../core/rule-engine.js';
import type { TestFailure } from '../utils/errors.js';

/** Typ aserce v testu */
export type AssertionType = 'fact_equals' | 'fact_exists' | 'fact_not_exists' | 'event_emitted' | 'timer_set' | 'timer_not_set';

/** Aserce pro testovací scénář */
export interface TestAssertion {
  type: AssertionType;
  /** Pro fact_equals, fact_exists, fact_not_exists */
  key?: string;
  /** Pro fact_equals */
  value?: unknown;
  /** Pro event_emitted */
  topic?: string;
  /** Pro event_emitted - volitelná data k ověření */
  data?: Record<string, unknown>;
  /** Pro timer_set, timer_not_set */
  timer?: string;
}

/** Akce v testovacím scénáři */
export interface TestAction {
  type: 'emit' | 'set_fact' | 'wait';
  /** Pro emit */
  topic?: string;
  /** Pro emit, set_fact */
  data?: Record<string, unknown>;
  /** Pro set_fact */
  key?: string;
  /** Pro set_fact */
  value?: unknown;
  /** Pro wait (v ms) */
  duration?: number;
}

/** Testovací scénář */
export interface TestScenario {
  name: string;
  description?: string;
  /** Počáteční fakty */
  initialFacts?: Record<string, unknown>;
  /** Akce k provedení */
  actions: TestAction[];
  /** Očekávané aserce po provedení akcí */
  assertions: TestAssertion[];
  /** Timeout pro scénář v ms */
  timeout?: number;
}

/** Soubor s testovacími scénáři */
export interface TestFile {
  name?: string;
  description?: string;
  /** Pravidla inline (volitelně) */
  rules?: unknown[];
  /** Cesta k souboru s pravidly (volitelně) */
  rulesFile?: string;
  /** Testovací scénáře */
  scenarios: TestScenario[];
  /** Globální timeout v ms */
  timeout?: number;
}

/** Výsledek jedné aserce */
export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message: string;
}

/** Trace záznam */
export interface TraceEntry {
  timestamp: number;
  type: 'action' | 'rule_triggered' | 'rule_executed' | 'fact_changed' | 'event_emitted' | 'timer_set' | 'timer_cancelled';
  details: Record<string, unknown>;
}

/** Výsledek scénáře */
export interface ScenarioResult {
  scenario: string;
  passed: boolean;
  assertions: AssertionResult[];
  trace: TraceEntry[];
  duration: number;
  error?: string;
}

/** Výsledek celého testu */
export interface TestResult {
  file: string;
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  scenarios: ScenarioResult[];
  duration: number;
}

/** Options pro test runner */
export interface TestRunnerOptions {
  /** Dry-run mode - nemodifikuje reálné úložiště */
  dryRun: boolean;
  /** Verbose výstup - zahrnuje trace */
  verbose: boolean;
  /** Globální timeout v ms */
  timeout: number;
}

const DEFAULT_TIMEOUT = 5000;

/**
 * Test runner pro pravidla.
 */
export class TestRunner {
  private readonly options: TestRunnerOptions;

  constructor(options: Partial<TestRunnerOptions> = {}) {
    this.options = {
      dryRun: options.dryRun ?? true,
      verbose: options.verbose ?? false,
      timeout: options.timeout ?? DEFAULT_TIMEOUT
    };
  }

  /**
   * Spustí testy z testovacího souboru.
   */
  async run(testFile: TestFile, rules: Rule[]): Promise<TestResult> {
    const startTime = Date.now();
    const results: ScenarioResult[] = [];
    const globalTimeout = testFile.timeout ?? this.options.timeout;

    for (const scenario of testFile.scenarios) {
      const result = await this.runScenario(scenario, rules, globalTimeout);
      results.push(result);
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.length - passedCount;

    return {
      file: testFile.name ?? 'unnamed',
      passed: failedCount === 0,
      total: results.length,
      passedCount,
      failedCount,
      scenarios: results,
      duration: Date.now() - startTime
    };
  }

  /**
   * Spustí jeden testovací scénář.
   */
  private async runScenario(scenario: TestScenario, rules: Rule[], globalTimeout: number): Promise<ScenarioResult> {
    const startTime = Date.now();
    const trace: TraceEntry[] = [];
    const timeout = scenario.timeout ?? globalTimeout;

    // Tracking pro aserce
    const emittedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const setTimers = new Set<string>();

    let engine: RuleEngine | null = null;

    try {
      // Vytvoření izolovaného enginu pro test
      engine = await RuleEngine.start({
        name: `test-${Date.now()}`,
        services: this.createMockServices(trace)
      });

      // Registrace pravidel
      for (const rule of rules) {
        engine.registerRule(rule);
        trace.push({
          timestamp: Date.now(),
          type: 'action',
          details: { action: 'register_rule', ruleId: rule.id }
        });
      }

      // Nastavení počátečních faktů
      if (scenario.initialFacts) {
        for (const [key, value] of Object.entries(scenario.initialFacts)) {
          await engine.setFact(key, value);
          trace.push({
            timestamp: Date.now(),
            type: 'fact_changed',
            details: { key, value, source: 'initial' }
          });
        }
      }

      // Subscribe pro sledování eventů
      engine.subscribe('*', (event, topic) => {
        emittedEvents.push({ topic, data: event.data });
        trace.push({
          timestamp: Date.now(),
          type: 'event_emitted',
          details: { topic, data: event.data }
        });
      });

      // Provedení akcí s timeoutem
      await this.executeWithTimeout(async () => {
        for (const action of scenario.actions) {
          await this.executeAction(action, engine!, trace, setTimers);
        }
      }, timeout);

      // Vyhodnocení asercí
      const assertions = this.evaluateAssertions(scenario.assertions, engine, emittedEvents, setTimers);

      const passed = assertions.every((a) => a.passed);

      return {
        scenario: scenario.name,
        passed,
        assertions,
        trace: this.options.verbose ? trace : [],
        duration: Date.now() - startTime
      };
    } catch (err) {
      return {
        scenario: scenario.name,
        passed: false,
        assertions: [],
        trace: this.options.verbose ? trace : [],
        duration: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      };
    } finally {
      if (engine) {
        await engine.stop();
      }
    }
  }

  /**
   * Provede testovací akci.
   */
  private async executeAction(
    action: TestAction,
    engine: RuleEngine,
    trace: TraceEntry[],
    setTimers: Set<string>
  ): Promise<void> {
    trace.push({
      timestamp: Date.now(),
      type: 'action',
      details: { action: action.type, ...action }
    });

    switch (action.type) {
      case 'emit':
        if (action.topic) {
          await engine.emit(action.topic, action.data ?? {});
        }
        break;

      case 'set_fact':
        if (action.key !== undefined) {
          await engine.setFact(action.key, action.value);
          trace.push({
            timestamp: Date.now(),
            type: 'fact_changed',
            details: { key: action.key, value: action.value, source: 'test_action' }
          });
        }
        break;

      case 'wait':
        if (action.duration && action.duration > 0) {
          await this.sleep(action.duration);
        }
        break;
    }

    // Sledování timerů
    for (const timer of engine.getTimers()) {
      setTimers.add(timer.name);
    }
  }

  /**
   * Vyhodnotí aserce.
   */
  private evaluateAssertions(
    assertions: TestAssertion[],
    engine: RuleEngine,
    emittedEvents: Array<{ topic: string; data: Record<string, unknown> }>,
    setTimers: Set<string>
  ): AssertionResult[] {
    return assertions.map((assertion) => this.evaluateAssertion(assertion, engine, emittedEvents, setTimers));
  }

  /**
   * Vyhodnotí jednu aserci.
   */
  private evaluateAssertion(
    assertion: TestAssertion,
    engine: RuleEngine,
    emittedEvents: Array<{ topic: string; data: Record<string, unknown> }>,
    setTimers: Set<string>
  ): AssertionResult {
    switch (assertion.type) {
      case 'fact_equals': {
        const actual = engine.getFact(assertion.key!);
        const passed = this.deepEqual(actual, assertion.value);
        return {
          assertion,
          passed,
          expected: assertion.value,
          actual,
          message: passed
            ? `Fact "${assertion.key}" equals expected value`
            : `Fact "${assertion.key}": expected ${JSON.stringify(assertion.value)}, got ${JSON.stringify(actual)}`
        };
      }

      case 'fact_exists': {
        const fact = engine.getFactFull(assertion.key!);
        const passed = fact !== undefined;
        return {
          assertion,
          passed,
          expected: 'exists',
          actual: passed ? 'exists' : 'not found',
          message: passed ? `Fact "${assertion.key}" exists` : `Fact "${assertion.key}" does not exist`
        };
      }

      case 'fact_not_exists': {
        const fact = engine.getFactFull(assertion.key!);
        const passed = fact === undefined;
        return {
          assertion,
          passed,
          expected: 'not exists',
          actual: fact !== undefined ? 'exists' : 'not found',
          message: passed ? `Fact "${assertion.key}" does not exist` : `Fact "${assertion.key}" unexpectedly exists`
        };
      }

      case 'event_emitted': {
        const matchingEvent = emittedEvents.find((e) => {
          if (e.topic !== assertion.topic) return false;
          if (assertion.data) {
            return this.objectContains(e.data, assertion.data);
          }
          return true;
        });
        const passed = matchingEvent !== undefined;
        return {
          assertion,
          passed,
          expected: { topic: assertion.topic, data: assertion.data },
          actual: matchingEvent ?? 'no matching event',
          message: passed
            ? `Event "${assertion.topic}" was emitted`
            : `Event "${assertion.topic}" was not emitted`
        };
      }

      case 'timer_set': {
        const timer = engine.getTimer(assertion.timer!);
        const passed = timer !== undefined || setTimers.has(assertion.timer!);
        return {
          assertion,
          passed,
          expected: 'timer set',
          actual: passed ? 'timer set' : 'timer not found',
          message: passed ? `Timer "${assertion.timer}" is set` : `Timer "${assertion.timer}" is not set`
        };
      }

      case 'timer_not_set': {
        const timer = engine.getTimer(assertion.timer!);
        const passed = timer === undefined;
        return {
          assertion,
          passed,
          expected: 'timer not set',
          actual: timer !== undefined ? 'timer set' : 'timer not found',
          message: passed
            ? `Timer "${assertion.timer}" is not set`
            : `Timer "${assertion.timer}" is unexpectedly set`
        };
      }

      default:
        return {
          assertion,
          passed: false,
          expected: 'unknown',
          actual: 'unknown',
          message: `Unknown assertion type: ${(assertion as TestAssertion).type}`
        };
    }
  }

  /**
   * Vytvoří mock služby pro dry-run mode.
   */
  private createMockServices(trace: TraceEntry[]): Record<string, unknown> {
    if (!this.options.dryRun) {
      return {};
    }

    // Mock služby, které logují volání místo skutečného provedení
    return {
      mock: {
        call: (method: string, ...args: unknown[]) => {
          trace.push({
            timestamp: Date.now(),
            type: 'action',
            details: { action: 'service_call', service: 'mock', method, args }
          });
          return { mocked: true, method, args };
        }
      }
    };
  }

  /**
   * Spustí funkci s timeoutem.
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Test timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Hluboké porovnání hodnot.
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, i) => this.deepEqual(val, b[i]));
      }

      if (Array.isArray(a) || Array.isArray(b)) return false;

      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);

      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((key) => this.deepEqual(aObj[key], bObj[key]));
    }

    return false;
  }

  /**
   * Kontroluje, zda objekt obsahuje všechny klíče a hodnoty z expected.
   */
  private objectContains(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(expected)) {
      if (!this.deepEqual(actual[key], value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Čeká zadaný počet ms.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Převede výsledek testu na pole selhání pro TestFailedError.
 */
export function resultToFailures(result: TestResult): TestFailure[] {
  const failures: TestFailure[] = [];

  for (const scenario of result.scenarios) {
    if (!scenario.passed) {
      if (scenario.error) {
        failures.push({
          scenario: scenario.scenario,
          assertion: 'execution',
          expected: 'success',
          actual: scenario.error
        });
      } else {
        for (const assertion of scenario.assertions) {
          if (!assertion.passed) {
            failures.push({
              scenario: scenario.scenario,
              assertion: assertion.message,
              expected: assertion.expected,
              actual: assertion.actual
            });
          }
        }
      }
    }
  }

  return failures;
}

/**
 * Validuje strukturu testovacího souboru.
 */
export function validateTestFile(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Test file must be an object'] };
  }

  const file = data as Record<string, unknown>;

  if (!file['scenarios']) {
    errors.push('Test file must have "scenarios" field');
  } else if (!Array.isArray(file['scenarios'])) {
    errors.push('"scenarios" must be an array');
  } else {
    const scenarios = file['scenarios'] as unknown[];
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      if (!scenario || typeof scenario !== 'object') {
        errors.push(`scenarios[${i}] must be an object`);
        continue;
      }

      const s = scenario as Record<string, unknown>;
      if (!s['name'] || typeof s['name'] !== 'string') {
        errors.push(`scenarios[${i}].name is required and must be a string`);
      }

      if (!s['actions'] || !Array.isArray(s['actions'])) {
        errors.push(`scenarios[${i}].actions is required and must be an array`);
      }

      if (!s['assertions'] || !Array.isArray(s['assertions'])) {
        errors.push(`scenarios[${i}].assertions is required and must be an array`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Vytvoří instanci test runneru.
 */
export function createTestRunner(options?: Partial<TestRunnerOptions>): TestRunner {
  return new TestRunner(options);
}
