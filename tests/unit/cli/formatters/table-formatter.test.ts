import { describe, it, expect } from 'vitest';
import { TableFormatter } from '../../../../src/cli/formatters/table-formatter.js';
import type { FormattableData } from '../../../../src/cli/types.js';
import type { Rule } from '../../../../src/types/rule.js';

describe('TableFormatter', () => {
  const createRule = (overrides: Partial<Rule> = {}): Rule => ({
    id: 'rule-1',
    name: 'Test Rule',
    description: 'A test rule',
    priority: 10,
    enabled: true,
    version: 1,
    tags: ['test'],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides
  });

  describe('formatRulesTable', () => {
    it('should format empty rules list', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'rules',
        data: []
      };

      const result = formatter.format(data);

      expect(result).toBe('No rules found.');
    });

    it('should format rules as table', () => {
      const formatter = new TableFormatter(false);
      const rules = [createRule()];
      const data: FormattableData = {
        type: 'rules',
        data: rules
      };

      const result = formatter.format(data);

      expect(result).toContain('ID');
      expect(result).toContain('Name');
      expect(result).toContain('Priority');
      expect(result).toContain('Enabled');
      expect(result).toContain('rule-1');
      expect(result).toContain('Test Rule');
      expect(result).toContain('10');
    });

    it('should show enabled status correctly', () => {
      const formatter = new TableFormatter(false);
      const rules = [createRule({ enabled: false })];
      const data: FormattableData = {
        type: 'rules',
        data: rules
      };

      const result = formatter.format(data);

      expect(result).toContain('no');
    });

    it('should truncate long IDs', () => {
      const formatter = new TableFormatter(false);
      const rules = [createRule({ id: 'very-long-rule-id-that-exceeds-limit' })];
      const data: FormattableData = {
        type: 'rules',
        data: rules
      };

      const result = formatter.format(data);

      expect(result).toContain('...');
    });
  });

  describe('formatRuleDetail', () => {
    it('should format rule detail', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'rule',
        data: createRule()
      };

      const result = formatter.format(data);

      expect(result).toContain('Rule Details');
      expect(result).toContain('rule-1');
      expect(result).toContain('Test Rule');
      expect(result).toContain('A test rule');
      expect(result).toContain('10');
      expect(result).toContain('Trigger');
      expect(result).toContain('event');
    });
  });

  describe('formatValidation', () => {
    it('should format valid result', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'validation',
        data: { valid: true }
      };

      const result = formatter.format(data);

      expect(result).toContain('Validation passed');
    });

    it('should format invalid result with errors', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'validation',
        data: {
          valid: false,
          errors: [{ path: 'trigger', message: 'Missing trigger' }]
        }
      };

      const result = formatter.format(data);

      expect(result).toContain('Validation failed');
      expect(result).toContain('trigger');
      expect(result).toContain('Missing trigger');
    });
  });

  describe('formatStats', () => {
    it('should format stats', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'stats',
        data: {
          rules: 10,
          facts: 50,
          events: 100,
          timers: 5,
          uptime: 3600000
        }
      };

      const result = formatter.format(data);

      expect(result).toContain('Engine Statistics');
      expect(result).toContain('Rules:     10');
      expect(result).toContain('Facts:     50');
      expect(result).toContain('1h 0m');
    });
  });

  describe('formatGenericTable', () => {
    it('should format generic table data', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'table',
        data: {
          columns: ['Col1', 'Col2'],
          rows: [
            ['a', 'b'],
            ['c', 'd']
          ]
        }
      };

      const result = formatter.format(data);

      expect(result).toContain('Col1');
      expect(result).toContain('Col2');
      expect(result).toContain('a');
      expect(result).toContain('d');
    });
  });

  describe('format error', () => {
    it('should format error message', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'error',
        data: 'Something went wrong'
      };

      const result = formatter.format(data);

      expect(result).toContain('Error: Something went wrong');
    });
  });

  describe('format message', () => {
    it('should format simple message', () => {
      const formatter = new TableFormatter(false);
      const data: FormattableData = {
        type: 'message',
        data: 'Hello, world!'
      };

      const result = formatter.format(data);

      expect(result).toBe('Hello, world!');
    });
  });
});
