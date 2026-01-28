import { describe, it, expect } from 'vitest';
import { JsonFormatter } from '../../../../src/cli/formatters/json-formatter.js';
import type { FormattableData } from '../../../../src/cli/types.js';

describe('JsonFormatter', () => {
  describe('format', () => {
    it('should format message as JSON', () => {
      const formatter = new JsonFormatter(false);
      const data: FormattableData = {
        type: 'message',
        data: 'Hello, world!'
      };

      const result = JSON.parse(formatter.format(data));

      expect(result).toEqual({
        success: true,
        message: 'Hello, world!'
      });
    });

    it('should format error as JSON', () => {
      const formatter = new JsonFormatter(false);
      const data: FormattableData = {
        type: 'error',
        data: 'Something went wrong'
      };

      const result = JSON.parse(formatter.format(data));

      expect(result).toEqual({
        success: false,
        error: 'Something went wrong'
      });
    });

    it('should format rules as JSON', () => {
      const formatter = new JsonFormatter(false);
      const rules = [
        {
          id: 'rule-1',
          name: 'Test Rule',
          description: 'A test rule',
          priority: 10,
          enabled: true,
          version: 1,
          tags: ['test'],
          trigger: { type: 'event' as const, topic: 'test.event' },
          conditions: [],
          actions: [],
          createdAt: 1000,
          updatedAt: 2000
        }
      ];
      const data: FormattableData = {
        type: 'rules',
        data: rules
      };

      const result = JSON.parse(formatter.format(data));

      expect(result.success).toBe(true);
      expect(result.data).toEqual(rules);
    });

    it('should format validation result as JSON', () => {
      const formatter = new JsonFormatter(false);
      const validation = {
        valid: false,
        errors: [{ path: 'trigger.type', message: 'Invalid type' }]
      };
      const data: FormattableData = {
        type: 'validation',
        data: validation
      };

      const result = JSON.parse(formatter.format(data));

      expect(result.success).toBe(true);
      expect(result.validation).toEqual(validation);
    });

    it('should format stats as JSON', () => {
      const formatter = new JsonFormatter(false);
      const stats = {
        rules: 10,
        facts: 50,
        events: 100,
        timers: 5,
        uptime: 3600000
      };
      const data: FormattableData = {
        type: 'stats',
        data: stats
      };

      const result = JSON.parse(formatter.format(data));

      expect(result.success).toBe(true);
      expect(result.data).toEqual(stats);
    });

    it('should include meta when provided', () => {
      const formatter = new JsonFormatter(false);
      const data: FormattableData = {
        type: 'message',
        data: 'Test',
        meta: { count: 5 }
      };

      const result = JSON.parse(formatter.format(data));

      expect(result.meta).toEqual({ count: 5 });
    });

    it('should pretty print when enabled', () => {
      const formatter = new JsonFormatter(true);
      const data: FormattableData = {
        type: 'message',
        data: 'Test'
      };

      const result = formatter.format(data);

      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });

    it('should not pretty print when disabled', () => {
      const formatter = new JsonFormatter(false);
      const data: FormattableData = {
        type: 'message',
        data: 'Test'
      };

      const result = formatter.format(data);

      expect(result).not.toContain('\n');
    });
  });
});
