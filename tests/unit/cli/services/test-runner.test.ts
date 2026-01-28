import { describe, it, expect } from 'vitest';
import {
  TestRunner,
  createTestRunner,
  validateTestFile,
  resultToFailures,
  type TestFile,
  type TestScenario,
  type TestResult
} from '../../../../src/cli/services/test-runner.js';
import type { Rule } from '../../../../src/types/rule.js';

describe('TestRunner', () => {
  const createMinimalRule = (overrides: Partial<Rule> = {}): Rule => ({
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test rule',
    priority: 0,
    enabled: true,
    version: 1,
    tags: [],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  });

  describe('createTestRunner', () => {
    it('should create a test runner with default options', () => {
      const runner = createTestRunner();
      expect(runner).toBeInstanceOf(TestRunner);
    });

    it('should create a test runner with custom options', () => {
      const runner = createTestRunner({ dryRun: false, verbose: true, timeout: 10000 });
      expect(runner).toBeInstanceOf(TestRunner);
    });
  });

  describe('run', () => {
    it('should run a simple passing test', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const rule = createMinimalRule({
        id: 'set-fact-rule',
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'order:processed', value: true }
        ]
      });

      const testFile: TestFile = {
        name: 'simple-test',
        scenarios: [
          {
            name: 'Should set fact on event',
            actions: [
              { type: 'emit', topic: 'order.created', data: {} }
            ],
            assertions: [
              { type: 'fact_equals', key: 'order:processed', value: true }
            ]
          }
        ]
      };

      const result = await runner.run(testFile, [rule]);

      expect(result.passed).toBe(true);
      expect(result.total).toBe(1);
      expect(result.passedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('should run a failing test', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const rule = createMinimalRule({
        id: 'noop-rule',
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: []
      });

      const testFile: TestFile = {
        name: 'failing-test',
        scenarios: [
          {
            name: 'Should fail when fact not set',
            actions: [
              { type: 'emit', topic: 'order.created', data: {} }
            ],
            assertions: [
              { type: 'fact_equals', key: 'nonexistent', value: 'something' }
            ]
          }
        ]
      };

      const result = await runner.run(testFile, [rule]);

      expect(result.passed).toBe(false);
      expect(result.failedCount).toBe(1);
    });

    it('should handle initial facts', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const rule = createMinimalRule({
        id: 'condition-rule',
        trigger: { type: 'event', topic: 'check' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'user:vip' },
            operator: 'eq',
            value: true
          }
        ],
        actions: [
          { type: 'set_fact', key: 'discount', value: 20 }
        ]
      });

      const testFile: TestFile = {
        name: 'initial-facts-test',
        scenarios: [
          {
            name: 'VIP user gets discount',
            initialFacts: { 'user:vip': true },
            actions: [
              { type: 'emit', topic: 'check', data: {} }
            ],
            assertions: [
              { type: 'fact_equals', key: 'discount', value: 20 }
            ]
          }
        ]
      };

      const result = await runner.run(testFile, [rule]);

      expect(result.passed).toBe(true);
    });

    it('should handle fact_exists assertion', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const rule = createMinimalRule({
        id: 'set-fact-rule',
        trigger: { type: 'event', topic: 'test' },
        actions: [
          { type: 'set_fact', key: 'created', value: 'any' }
        ]
      });

      const testFile: TestFile = {
        name: 'fact-exists-test',
        scenarios: [
          {
            name: 'Fact should exist',
            actions: [{ type: 'emit', topic: 'test', data: {} }],
            assertions: [{ type: 'fact_exists', key: 'created' }]
          }
        ]
      };

      const result = await runner.run(testFile, [rule]);
      expect(result.passed).toBe(true);
    });

    it('should handle fact_not_exists assertion', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const rule = createMinimalRule({
        id: 'noop-rule',
        trigger: { type: 'event', topic: 'test' },
        actions: []
      });

      const testFile: TestFile = {
        name: 'fact-not-exists-test',
        scenarios: [
          {
            name: 'Fact should not exist',
            actions: [{ type: 'emit', topic: 'test', data: {} }],
            assertions: [{ type: 'fact_not_exists', key: 'nonexistent' }]
          }
        ]
      };

      const result = await runner.run(testFile, [rule]);
      expect(result.passed).toBe(true);
    });

    it('should handle set_fact test action', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const testFile: TestFile = {
        name: 'set-fact-action-test',
        scenarios: [
          {
            name: 'Set fact via action',
            actions: [
              { type: 'set_fact', key: 'manual:fact', value: 42 }
            ],
            assertions: [
              { type: 'fact_equals', key: 'manual:fact', value: 42 }
            ]
          }
        ]
      };

      const result = await runner.run(testFile, []);
      expect(result.passed).toBe(true);
    });

    it('should handle multiple scenarios', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const testFile: TestFile = {
        name: 'multi-scenario-test',
        scenarios: [
          {
            name: 'First scenario',
            actions: [{ type: 'set_fact', key: 'a', value: 1 }],
            assertions: [{ type: 'fact_equals', key: 'a', value: 1 }]
          },
          {
            name: 'Second scenario',
            actions: [{ type: 'set_fact', key: 'b', value: 2 }],
            assertions: [{ type: 'fact_equals', key: 'b', value: 2 }]
          }
        ]
      };

      const result = await runner.run(testFile, []);

      expect(result.total).toBe(2);
      expect(result.passedCount).toBe(2);
      expect(result.scenarios).toHaveLength(2);
    });

    it('should isolate scenarios from each other', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const testFile: TestFile = {
        name: 'isolation-test',
        scenarios: [
          {
            name: 'First sets a fact',
            actions: [{ type: 'set_fact', key: 'shared', value: 1 }],
            assertions: [{ type: 'fact_equals', key: 'shared', value: 1 }]
          },
          {
            name: 'Second should not see first fact',
            actions: [],
            assertions: [{ type: 'fact_not_exists', key: 'shared' }]
          }
        ]
      };

      const result = await runner.run(testFile, []);

      expect(result.passed).toBe(true);
      expect(result.passedCount).toBe(2);
    });

    it('should include trace in verbose mode', async () => {
      const runner = createTestRunner({ verbose: true, timeout: 2000 });

      const testFile: TestFile = {
        name: 'verbose-test',
        scenarios: [
          {
            name: 'Test with trace',
            actions: [{ type: 'set_fact', key: 'x', value: 1 }],
            assertions: [{ type: 'fact_exists', key: 'x' }]
          }
        ]
      };

      const result = await runner.run(testFile, []);

      expect(result.scenarios[0].trace.length).toBeGreaterThan(0);
    });

    it('should not include trace when not verbose', async () => {
      const runner = createTestRunner({ verbose: false, timeout: 2000 });

      const testFile: TestFile = {
        name: 'non-verbose-test',
        scenarios: [
          {
            name: 'Test without trace',
            actions: [{ type: 'set_fact', key: 'x', value: 1 }],
            assertions: [{ type: 'fact_exists', key: 'x' }]
          }
        ]
      };

      const result = await runner.run(testFile, []);

      expect(result.scenarios[0].trace).toHaveLength(0);
    });

    it('should handle timeout', async () => {
      const runner = createTestRunner({ timeout: 50 });

      const testFile: TestFile = {
        name: 'timeout-test',
        scenarios: [
          {
            name: 'Should timeout',
            actions: [{ type: 'wait', duration: 200 }],
            assertions: [{ type: 'fact_not_exists', key: 'x' }]
          }
        ]
      };

      const result = await runner.run(testFile, []);

      expect(result.passed).toBe(false);
      expect(result.scenarios[0].error).toContain('timed out');
    });

    it('should use scenario-level timeout', async () => {
      const runner = createTestRunner({ timeout: 5000 });

      const testFile: TestFile = {
        name: 'scenario-timeout-test',
        scenarios: [
          {
            name: 'Should timeout at scenario level',
            timeout: 50,
            actions: [{ type: 'wait', duration: 200 }],
            assertions: [{ type: 'fact_not_exists', key: 'x' }]
          }
        ]
      };

      const result = await runner.run(testFile, []);

      expect(result.passed).toBe(false);
      expect(result.scenarios[0].error).toContain('timed out');
    });
  });

  describe('assertions', () => {
    it('should handle complex value equality', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const testFile: TestFile = {
        name: 'complex-equality-test',
        scenarios: [
          {
            name: 'Object equality',
            actions: [
              { type: 'set_fact', key: 'obj', value: { a: 1, b: { c: 2 } } }
            ],
            assertions: [
              { type: 'fact_equals', key: 'obj', value: { a: 1, b: { c: 2 } } }
            ]
          },
          {
            name: 'Array equality',
            actions: [
              { type: 'set_fact', key: 'arr', value: [1, 2, 3] }
            ],
            assertions: [
              { type: 'fact_equals', key: 'arr', value: [1, 2, 3] }
            ]
          }
        ]
      };

      const result = await runner.run(testFile, []);
      expect(result.passed).toBe(true);
    });

    it('should fail on object inequality', async () => {
      const runner = createTestRunner({ timeout: 2000 });

      const testFile: TestFile = {
        name: 'inequality-test',
        scenarios: [
          {
            name: 'Should fail on different object',
            actions: [
              { type: 'set_fact', key: 'obj', value: { a: 1 } }
            ],
            assertions: [
              { type: 'fact_equals', key: 'obj', value: { a: 2 } }
            ]
          }
        ]
      };

      const result = await runner.run(testFile, []);
      expect(result.passed).toBe(false);
    });
  });
});

describe('validateTestFile', () => {
  it('should pass for valid test file', () => {
    const result = validateTestFile({
      scenarios: [
        {
          name: 'Test',
          actions: [],
          assertions: []
        }
      ]
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when input is not an object', () => {
    const result = validateTestFile('not an object');

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toBe('Test file must be an object');
  });

  it('should fail when scenarios is missing', () => {
    const result = validateTestFile({});

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Test file must have "scenarios" field');
  });

  it('should fail when scenarios is not an array', () => {
    const result = validateTestFile({ scenarios: 'not array' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"scenarios" must be an array');
  });

  it('should fail when scenario is missing name', () => {
    const result = validateTestFile({
      scenarios: [{ actions: [], assertions: [] }]
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('should fail when scenario is missing actions', () => {
    const result = validateTestFile({
      scenarios: [{ name: 'Test', assertions: [] }]
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('actions'))).toBe(true);
  });

  it('should fail when scenario is missing assertions', () => {
    const result = validateTestFile({
      scenarios: [{ name: 'Test', actions: [] }]
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('assertions'))).toBe(true);
  });
});

describe('resultToFailures', () => {
  it('should convert failed assertions to failures', () => {
    const result: TestResult = {
      file: 'test.json',
      passed: false,
      total: 1,
      passedCount: 0,
      failedCount: 1,
      scenarios: [
        {
          scenario: 'Test Scenario',
          passed: false,
          assertions: [
            {
              assertion: { type: 'fact_equals', key: 'x', value: 1 },
              passed: false,
              expected: 1,
              actual: undefined,
              message: 'Fact "x": expected 1, got undefined'
            }
          ],
          trace: [],
          duration: 100
        }
      ],
      duration: 100
    };

    const failures = resultToFailures(result);

    expect(failures).toHaveLength(1);
    expect(failures[0].scenario).toBe('Test Scenario');
    expect(failures[0].expected).toBe(1);
    expect(failures[0].actual).toBeUndefined();
  });

  it('should convert errors to failures', () => {
    const result: TestResult = {
      file: 'test.json',
      passed: false,
      total: 1,
      passedCount: 0,
      failedCount: 1,
      scenarios: [
        {
          scenario: 'Error Scenario',
          passed: false,
          assertions: [],
          trace: [],
          duration: 100,
          error: 'Something went wrong'
        }
      ],
      duration: 100
    };

    const failures = resultToFailures(result);

    expect(failures).toHaveLength(1);
    expect(failures[0].scenario).toBe('Error Scenario');
    expect(failures[0].assertion).toBe('execution');
    expect(failures[0].actual).toBe('Something went wrong');
  });

  it('should return empty array for passed result', () => {
    const result: TestResult = {
      file: 'test.json',
      passed: true,
      total: 1,
      passedCount: 1,
      failedCount: 0,
      scenarios: [
        {
          scenario: 'Passing Scenario',
          passed: true,
          assertions: [
            {
              assertion: { type: 'fact_equals', key: 'x', value: 1 },
              passed: true,
              expected: 1,
              actual: 1,
              message: 'Fact "x" equals expected value'
            }
          ],
          trace: [],
          duration: 100
        }
      ],
      duration: 100
    };

    const failures = resultToFailures(result);

    expect(failures).toHaveLength(0);
  });
});
