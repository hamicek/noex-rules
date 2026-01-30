import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { loadGoalsFromYAML, loadGoalsFromFile } from '../../../../src/dsl/yaml/goal-loader';
import { validateGoal, YamlValidationError } from '../../../../src/dsl/yaml/schema';
import { YamlLoadError } from '../../../../src/dsl/yaml/loader';
import type { FactGoal, EventGoal } from '../../../../src/types/backward';

const FIXTURES = resolve(__dirname, '../../../fixtures/yaml');

// ---------------------------------------------------------------------------
// validateGoal
// ---------------------------------------------------------------------------

describe('validateGoal', () => {
  describe('fact goal', () => {
    it('validates a minimal fact goal (existence check)', () => {
      const goal = validateGoal({ type: 'fact', key: 'customer:123:tier' });

      expect(goal).toEqual({ type: 'fact', key: 'customer:123:tier' });
    });

    it('validates a fact goal with value', () => {
      const goal = validateGoal({ type: 'fact', key: 'customer:123:tier', value: 'vip' });

      expect(goal).toEqual({ type: 'fact', key: 'customer:123:tier', value: 'vip' });
    });

    it('validates a fact goal with numeric value', () => {
      const goal = validateGoal({ type: 'fact', key: 'sensor:temp', value: 42 });

      expect(goal).toEqual({ type: 'fact', key: 'sensor:temp', value: 42 });
    });

    it('validates a fact goal with boolean value', () => {
      const goal = validateGoal({ type: 'fact', key: 'user:active', value: true });

      expect(goal).toEqual({ type: 'fact', key: 'user:active', value: true });
    });

    it('validates a fact goal with operator', () => {
      const goal = validateGoal({
        type: 'fact', key: 'sensor:temp', value: 100, operator: 'gte',
      });

      const factGoal = goal as FactGoal;
      expect(factGoal.type).toBe('fact');
      expect(factGoal.key).toBe('sensor:temp');
      expect(factGoal.value).toBe(100);
      expect(factGoal.operator).toBe('gte');
    });

    it.each(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const)('accepts operator "%s"', (op) => {
      const goal = validateGoal({
        type: 'fact', key: 'k', value: 1, operator: op,
      }) as FactGoal;

      expect(goal.operator).toBe(op);
    });

    it('does not include value/operator when not specified', () => {
      const goal = validateGoal({ type: 'fact', key: 'k' }) as FactGoal;

      expect(goal).not.toHaveProperty('value');
      expect(goal).not.toHaveProperty('operator');
    });

    it('throws on missing key', () => {
      expect(() => validateGoal({ type: 'fact' }))
        .toThrow(YamlValidationError);
      expect(() => validateGoal({ type: 'fact' }))
        .toThrow(/key/);
    });

    it('throws on empty key', () => {
      expect(() => validateGoal({ type: 'fact', key: '' }))
        .toThrow(YamlValidationError);
    });

    it('throws on non-string key', () => {
      expect(() => validateGoal({ type: 'fact', key: 123 }))
        .toThrow(YamlValidationError);
    });

    it('throws on invalid operator', () => {
      expect(() => validateGoal({
        type: 'fact', key: 'k', value: 1, operator: 'contains',
      })).toThrow(YamlValidationError);
      expect(() => validateGoal({
        type: 'fact', key: 'k', value: 1, operator: 'contains',
      })).toThrow(/invalid goal operator/);
    });

    it('throws on non-string operator', () => {
      expect(() => validateGoal({
        type: 'fact', key: 'k', value: 1, operator: 42,
      })).toThrow(YamlValidationError);
    });

    it('includes correct path for key error', () => {
      try {
        validateGoal({ type: 'fact' }, 'query');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('query');
      }
    });

    it('includes correct path for operator error', () => {
      try {
        validateGoal({ type: 'fact', key: 'k', operator: 'bad' }, 'query');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('query.operator');
      }
    });
  });

  describe('event goal', () => {
    it('validates an event goal', () => {
      const goal = validateGoal({ type: 'event', topic: 'order.completed' });

      expect(goal).toEqual({ type: 'event', topic: 'order.completed' });
    });

    it('throws on missing topic', () => {
      expect(() => validateGoal({ type: 'event' }))
        .toThrow(YamlValidationError);
      expect(() => validateGoal({ type: 'event' }))
        .toThrow(/topic/);
    });

    it('throws on empty topic', () => {
      expect(() => validateGoal({ type: 'event', topic: '' }))
        .toThrow(YamlValidationError);
    });

    it('throws on non-string topic', () => {
      expect(() => validateGoal({ type: 'event', topic: 42 }))
        .toThrow(YamlValidationError);
    });

    it('includes correct path for topic error', () => {
      try {
        validateGoal({ type: 'event' }, 'queries[0]');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('queries[0]');
      }
    });
  });

  describe('type validation', () => {
    it('throws on missing type', () => {
      expect(() => validateGoal({ key: 'k' }))
        .toThrow(YamlValidationError);
      expect(() => validateGoal({ key: 'k' }))
        .toThrow(/type/);
    });

    it('throws on invalid type', () => {
      expect(() => validateGoal({ type: 'timer', name: 'x' }))
        .toThrow(YamlValidationError);
      expect(() => validateGoal({ type: 'timer', name: 'x' }))
        .toThrow(/invalid goal type/);
    });

    it('throws on non-object input', () => {
      expect(() => validateGoal('string'))
        .toThrow(YamlValidationError);
      expect(() => validateGoal(42))
        .toThrow(YamlValidationError);
      expect(() => validateGoal(null))
        .toThrow(YamlValidationError);
      expect(() => validateGoal([]))
        .toThrow(YamlValidationError);
    });

    it('uses default path "goal"', () => {
      try {
        validateGoal('not-an-object');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('goal');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// loadGoalsFromYAML
// ---------------------------------------------------------------------------

describe('loadGoalsFromYAML', () => {
  describe('single goal', () => {
    it('loads a single fact goal', () => {
      const goals = loadGoalsFromYAML(`
        type: fact
        key: "customer:123:tier"
        value: "vip"
      `);

      expect(goals).toHaveLength(1);
      expect(goals[0]).toEqual({
        type: 'fact',
        key: 'customer:123:tier',
        value: 'vip',
      });
    });

    it('loads a single event goal', () => {
      const goals = loadGoalsFromYAML(`
        type: event
        topic: order.completed
      `);

      expect(goals).toHaveLength(1);
      expect(goals[0]).toEqual({ type: 'event', topic: 'order.completed' });
    });

    it('loads a fact goal with operator', () => {
      const goals = loadGoalsFromYAML(`
        type: fact
        key: sensor:temp
        value: 100
        operator: gte
      `);

      expect(goals).toHaveLength(1);
      const goal = goals[0] as FactGoal;
      expect(goal.key).toBe('sensor:temp');
      expect(goal.value).toBe(100);
      expect(goal.operator).toBe('gte');
    });

    it('loads an existence-check fact goal', () => {
      const goals = loadGoalsFromYAML(`
        type: fact
        key: "order:456:status"
      `);

      expect(goals).toHaveLength(1);
      const goal = goals[0] as FactGoal;
      expect(goal.key).toBe('order:456:status');
      expect(goal).not.toHaveProperty('value');
      expect(goal).not.toHaveProperty('operator');
    });
  });

  describe('multiple goals', () => {
    it('loads goals from top-level array', () => {
      const goals = loadGoalsFromYAML(`
        - type: fact
          key: customer:tier
          value: vip
        - type: event
          topic: order.completed
      `);

      expect(goals).toHaveLength(2);
      expect(goals[0]!.type).toBe('fact');
      expect(goals[1]!.type).toBe('event');
    });

    it('loads goals from "queries" wrapper', () => {
      const goals = loadGoalsFromYAML(`
        queries:
          - type: fact
            key: "customer:123:tier"
            value: vip
          - type: fact
            key: sensor:temp
            value: 100
            operator: gte
          - type: event
            topic: order.completed
      `);

      expect(goals).toHaveLength(3);
      expect(goals[0]!.type).toBe('fact');
      expect((goals[0] as FactGoal).key).toBe('customer:123:tier');
      expect(goals[1]!.type).toBe('fact');
      expect((goals[1] as FactGoal).operator).toBe('gte');
      expect(goals[2]!.type).toBe('event');
      expect((goals[2] as EventGoal).topic).toBe('order.completed');
    });
  });

  describe('error handling', () => {
    it('throws YamlLoadError on empty content', () => {
      expect(() => loadGoalsFromYAML('')).toThrow(YamlLoadError);
      expect(() => loadGoalsFromYAML('')).toThrow(/empty/);
    });

    it('throws YamlLoadError on null YAML', () => {
      expect(() => loadGoalsFromYAML('~')).toThrow(YamlLoadError);
      expect(() => loadGoalsFromYAML('null')).toThrow(YamlLoadError);
    });

    it('throws YamlLoadError on empty array', () => {
      expect(() => loadGoalsFromYAML('[]')).toThrow(YamlLoadError);
      expect(() => loadGoalsFromYAML('[]')).toThrow(/empty/);
    });

    it('throws YamlLoadError on empty queries array', () => {
      expect(() => loadGoalsFromYAML('queries: []')).toThrow(YamlLoadError);
    });

    it('throws YamlLoadError on non-array queries', () => {
      expect(() => loadGoalsFromYAML('queries: invalid')).toThrow(YamlLoadError);
      expect(() => loadGoalsFromYAML('queries: invalid')).toThrow(/"queries" must be an array/);
    });

    it('throws YamlLoadError on invalid YAML syntax', () => {
      expect(() => loadGoalsFromYAML('{{invalid yaml')).toThrow(YamlLoadError);
      expect(() => loadGoalsFromYAML('{{invalid yaml')).toThrow(/YAML syntax error/);
    });

    it('throws YamlLoadError on scalar YAML', () => {
      expect(() => loadGoalsFromYAML('"just a string"')).toThrow(YamlLoadError);
    });

    it('throws YamlValidationError on invalid goal structure', () => {
      expect(() => loadGoalsFromYAML(`
        type: fact
      `)).toThrow(YamlValidationError);
    });

    it('throws YamlValidationError on invalid goal in array', () => {
      expect(() => loadGoalsFromYAML(`
        - type: fact
          key: ok
        - type: event
      `)).toThrow(YamlValidationError);
    });
  });

  describe('path reporting', () => {
    it('reports correct path for single goal validation error', () => {
      try {
        loadGoalsFromYAML(`
          type: fact
          key: 123
        `);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('goal.key');
      }
    });

    it('reports correct path for array item validation error', () => {
      try {
        loadGoalsFromYAML(`
          - type: fact
            key: ok
          - type: event
        `);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('queries[1]');
      }
    });

    it('reports correct path for queries wrapper validation error', () => {
      try {
        loadGoalsFromYAML(`
          queries:
            - type: fact
              key: ok
            - type: fact
              key: ""
        `);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('queries[1].key');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// loadGoalsFromFile
// ---------------------------------------------------------------------------

describe('loadGoalsFromFile', () => {
  it('loads goals from YAML file', async () => {
    const goals = await loadGoalsFromFile(resolve(FIXTURES, 'goals.yaml'));

    expect(goals).toHaveLength(3);
    expect(goals[0]).toEqual({ type: 'fact', key: 'customer:123:tier', value: 'vip' });

    const secondGoal = goals[1] as FactGoal;
    expect(secondGoal.key).toBe('sensor:temp');
    expect(secondGoal.value).toBe(100);
    expect(secondGoal.operator).toBe('gte');

    expect(goals[2]).toEqual({ type: 'event', topic: 'order.completed' });
  });

  it('throws YamlLoadError on non-existent file', async () => {
    await expect(loadGoalsFromFile('/nonexistent/path.yaml'))
      .rejects.toThrow(YamlLoadError);
  });

  it('includes file path in error', async () => {
    try {
      await loadGoalsFromFile('/nonexistent/path.yaml');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(YamlLoadError);
      expect((err as YamlLoadError).filePath).toBe('/nonexistent/path.yaml');
    }
  });

  it('wraps validation errors with file path', async () => {
    const tmpFile = resolve(FIXTURES, '_invalid_goal_temp.yaml');

    try {
      await writeFile(tmpFile, 'type: fact\nkey: 123');
      await expect(loadGoalsFromFile(tmpFile)).rejects.toThrow(YamlLoadError);
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  });
});
