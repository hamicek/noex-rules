import { describe, it, expect, vi } from 'vitest';
import { validateTemplateParams } from '../../../../src/dsl/template/validation';
import { TemplateValidationError } from '../../../../src/dsl/template/errors';
import { DslError } from '../../../../src/dsl/helpers/errors';
import type { TemplateParameterDef } from '../../../../src/dsl/template/types';

describe('validateTemplateParams', () => {
  // ---------------------------------------------------------------------------
  // Valid params — no errors
  // ---------------------------------------------------------------------------

  describe('valid parameters', () => {
    it('returns params unchanged when all required params are provided', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'topic', type: 'string' },
        { name: 'threshold', type: 'number' },
      ];
      const params = { topic: 'metrics.cpu', threshold: 90 };

      const result = validateTemplateParams(defs, params);
      expect(result).toEqual(params);
    });

    it('returns a new object (does not return the same reference)', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'string' }];
      const params = { x: 'value' };

      const result = validateTemplateParams(defs, params);
      expect(result).not.toBe(params);
      expect(result).toEqual(params);
    });

    it('accepts empty definitions with empty params', () => {
      const result = validateTemplateParams([], {});
      expect(result).toEqual({});
    });

    it('accepts params matching type "any" regardless of value type', () => {
      const defs: TemplateParameterDef[] = [{ name: 'data', type: 'any' }];

      expect(validateTemplateParams(defs, { data: 'string' })).toEqual({ data: 'string' });
      expect(validateTemplateParams(defs, { data: 42 })).toEqual({ data: 42 });
      expect(validateTemplateParams(defs, { data: true })).toEqual({ data: true });
      expect(validateTemplateParams(defs, { data: [1, 2] })).toEqual({ data: [1, 2] });
      expect(validateTemplateParams(defs, { data: { a: 1 } })).toEqual({ data: { a: 1 } });
      expect(validateTemplateParams(defs, { data: null })).toEqual({ data: null });
    });

    it('treats params without explicit type as "any"', () => {
      const defs: TemplateParameterDef[] = [{ name: 'flexible' }];

      expect(validateTemplateParams(defs, { flexible: 42 })).toEqual({ flexible: 42 });
      expect(validateTemplateParams(defs, { flexible: 'str' })).toEqual({ flexible: 'str' });
      expect(validateTemplateParams(defs, { flexible: null })).toEqual({ flexible: null });
    });
  });

  // ---------------------------------------------------------------------------
  // Default merging
  // ---------------------------------------------------------------------------

  describe('default merging', () => {
    it('applies default when param is not provided', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'threshold', type: 'number', default: 100 },
      ];

      const result = validateTemplateParams(defs, {});
      expect(result).toEqual({ threshold: 100 });
    });

    it('does not override an explicitly provided value with the default', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'threshold', type: 'number', default: 100 },
      ];

      const result = validateTemplateParams(defs, { threshold: 50 });
      expect(result).toEqual({ threshold: 50 });
    });

    it('applies multiple defaults', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'a', type: 'string', default: 'alpha' },
        { name: 'b', type: 'number', default: 42 },
        { name: 'c', type: 'boolean', default: false },
      ];

      const result = validateTemplateParams(defs, {});
      expect(result).toEqual({ a: 'alpha', b: 42, c: false });
    });

    it('mixes provided values and defaults', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'topic', type: 'string' },
        { name: 'threshold', type: 'number', default: 100 },
        { name: 'alertTopic', type: 'string', default: 'alert.triggered' },
      ];

      const result = validateTemplateParams(defs, { topic: 'metrics.cpu' });
      expect(result).toEqual({
        topic: 'metrics.cpu',
        threshold: 100,
        alertTopic: 'alert.triggered',
      });
    });

    it('handles falsy default values correctly', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'boolean', default: false },
        { name: 'c', type: 'string', default: '' },
      ];

      const result = validateTemplateParams(defs, {});
      expect(result).toEqual({ a: 0, b: false, c: '' });
    });

    it('handles undefined as an explicit default', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'opt', default: undefined },
      ];

      const result = validateTemplateParams(defs, {});
      expect(result).toEqual({ opt: undefined });
      expect('opt' in result).toBe(true);
    });

    it('handles null as an explicit default', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'opt', default: null },
      ];

      const result = validateTemplateParams(defs, {});
      expect(result).toEqual({ opt: null });
    });
  });

  // ---------------------------------------------------------------------------
  // Required parameter checks
  // ---------------------------------------------------------------------------

  describe('required parameters', () => {
    it('throws for a single missing required param', () => {
      const defs: TemplateParameterDef[] = [{ name: 'topic', type: 'string' }];

      expect(() => validateTemplateParams(defs, {})).toThrow(TemplateValidationError);
      try {
        validateTemplateParams(defs, {});
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Missing required parameter "topic"']);
      }
    });

    it('throws for multiple missing required params', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'topic', type: 'string' },
        { name: 'field', type: 'string' },
        { name: 'threshold', type: 'number' },
      ];

      try {
        validateTemplateParams(defs, {});
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toHaveLength(3);
        expect(ve.issues).toContain('Missing required parameter "topic"');
        expect(ve.issues).toContain('Missing required parameter "field"');
        expect(ve.issues).toContain('Missing required parameter "threshold"');
      }
    });

    it('does not consider a param with a default as required', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'threshold', type: 'number', default: 100 },
      ];

      const result = validateTemplateParams(defs, {});
      expect(result).toEqual({ threshold: 100 });
    });
  });

  // ---------------------------------------------------------------------------
  // Type checking
  // ---------------------------------------------------------------------------

  describe('type checking', () => {
    it('accepts valid string values', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'string' }];
      expect(validateTemplateParams(defs, { x: 'hello' })).toEqual({ x: 'hello' });
      expect(validateTemplateParams(defs, { x: '' })).toEqual({ x: '' });
    });

    it('rejects non-string when type is string', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'string' }];
      expect(() => validateTemplateParams(defs, { x: 42 })).toThrow(TemplateValidationError);

      try {
        validateTemplateParams(defs, { x: 42 });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected string, got number']);
      }
    });

    it('accepts valid number values', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'number' }];
      expect(validateTemplateParams(defs, { x: 42 })).toEqual({ x: 42 });
      expect(validateTemplateParams(defs, { x: 0 })).toEqual({ x: 0 });
      expect(validateTemplateParams(defs, { x: -3.14 })).toEqual({ x: -3.14 });
    });

    it('rejects non-number when type is number', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'number' }];

      try {
        validateTemplateParams(defs, { x: 'not-a-number' });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected number, got string']);
      }
    });

    it('accepts valid boolean values', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'boolean' }];
      expect(validateTemplateParams(defs, { x: true })).toEqual({ x: true });
      expect(validateTemplateParams(defs, { x: false })).toEqual({ x: false });
    });

    it('rejects non-boolean when type is boolean', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'boolean' }];

      try {
        validateTemplateParams(defs, { x: 1 });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected boolean, got number']);
      }
    });

    it('accepts valid object values', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'object' }];
      expect(validateTemplateParams(defs, { x: { key: 'val' } })).toEqual({ x: { key: 'val' } });
      expect(validateTemplateParams(defs, { x: {} })).toEqual({ x: {} });
    });

    it('rejects null when type is object', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'object' }];

      try {
        validateTemplateParams(defs, { x: null });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected object, got null']);
      }
    });

    it('rejects array when type is object', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'object' }];

      try {
        validateTemplateParams(defs, { x: [1, 2, 3] });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected object, got array']);
      }
    });

    it('accepts valid array values', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'array' }];
      expect(validateTemplateParams(defs, { x: [1, 2, 3] })).toEqual({ x: [1, 2, 3] });
      expect(validateTemplateParams(defs, { x: [] })).toEqual({ x: [] });
    });

    it('rejects non-array when type is array', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'array' }];

      try {
        validateTemplateParams(defs, { x: { length: 3 } });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected array, got object']);
      }
    });

    it('rejects object when type is array', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'array' }];

      try {
        validateTemplateParams(defs, { x: {} });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected array, got object']);
      }
    });

    it('rejects undefined when a specific type is declared', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'string' }];

      try {
        validateTemplateParams(defs, { x: undefined });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "x": expected string, got undefined']);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Custom validators
  // ---------------------------------------------------------------------------

  describe('custom validators', () => {
    it('passes when custom validator returns undefined', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'x', type: 'number', validate: () => undefined },
      ];

      const result = validateTemplateParams(defs, { x: 42 });
      expect(result).toEqual({ x: 42 });
    });

    it('fails when custom validator returns an error string', () => {
      const defs: TemplateParameterDef[] = [
        {
          name: 'threshold',
          type: 'number',
          validate: (v) => (v as number) < 0 ? 'must be non-negative' : undefined,
        },
      ];

      try {
        validateTemplateParams(defs, { threshold: -5 });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Parameter "threshold": must be non-negative']);
      }
    });

    it('does not invoke custom validator when type check fails', () => {
      const validate = vi.fn(() => undefined);
      const defs: TemplateParameterDef[] = [
        { name: 'x', type: 'number', validate },
      ];

      expect(() => validateTemplateParams(defs, { x: 'not-a-number' })).toThrow(
        TemplateValidationError,
      );
      expect(validate).not.toHaveBeenCalled();
    });

    it('passes the actual value to the custom validator', () => {
      const validate = vi.fn(() => undefined);
      const defs: TemplateParameterDef[] = [
        { name: 'x', type: 'number', validate },
      ];

      validateTemplateParams(defs, { x: 42 });
      expect(validate).toHaveBeenCalledWith(42);
    });

    it('runs custom validator for type "any"', () => {
      const validate = vi.fn((v) =>
        typeof v === 'string' && v.length > 0 ? undefined : 'must be non-empty string',
      );
      const defs: TemplateParameterDef[] = [
        { name: 'x', type: 'any', validate },
      ];

      expect(validateTemplateParams(defs, { x: 'ok' })).toEqual({ x: 'ok' });
      expect(validate).toHaveBeenCalledWith('ok');
    });

    it('runs custom validator for params without explicit type', () => {
      const validate = vi.fn(() => 'always fails');
      const defs: TemplateParameterDef[] = [
        { name: 'x', validate },
      ];

      expect(() => validateTemplateParams(defs, { x: 'anything' })).toThrow(
        TemplateValidationError,
      );
      expect(validate).toHaveBeenCalledWith('anything');
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown parameters
  // ---------------------------------------------------------------------------

  describe('unknown parameters', () => {
    it('rejects a single unknown parameter', () => {
      const defs: TemplateParameterDef[] = [{ name: 'topic', type: 'string' }];

      try {
        validateTemplateParams(defs, { topic: 'ok', extra: 'unknown' });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toEqual(['Unknown parameter "extra"']);
      }
    });

    it('rejects multiple unknown parameters', () => {
      const defs: TemplateParameterDef[] = [];

      try {
        validateTemplateParams(defs, { a: 1, b: 2 });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toHaveLength(2);
        expect(ve.issues).toContain('Unknown parameter "a"');
        expect(ve.issues).toContain('Unknown parameter "b"');
      }
    });

    it('reports unknown params alongside other issues', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'topic', type: 'string' },
      ];

      try {
        validateTemplateParams(defs, { unknown: 'x' });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toHaveLength(2);
        expect(ve.issues).toContain('Unknown parameter "unknown"');
        expect(ve.issues).toContain('Missing required parameter "topic"');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Error shape and hierarchy
  // ---------------------------------------------------------------------------

  describe('error shape', () => {
    it('throws TemplateValidationError extending DslError', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'string' }];

      try {
        validateTemplateParams(defs, {});
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TemplateValidationError);
        expect(err).toBeInstanceOf(DslError);
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('includes issues array on the error', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'number' },
      ];

      try {
        validateTemplateParams(defs, {});
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toBeInstanceOf(Array);
        expect(ve.issues).toHaveLength(2);
      }
    });

    it('formats message with issue count (singular)', () => {
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'string' }];

      try {
        validateTemplateParams(defs, {});
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.message).toBe(
          'Template parameter validation failed with 1 issue',
        );
      }
    });

    it('formats message with issue count (plural)', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'string' },
      ];

      try {
        validateTemplateParams(defs, {});
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.message).toBe(
          'Template parameter validation failed with 2 issues',
        );
      }
    });

    it('collects all issues in a single error', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'topic', type: 'string' },
        { name: 'threshold', type: 'number' },
        { name: 'enabled', type: 'boolean' },
      ];

      try {
        validateTemplateParams(defs, {
          topic: 42,       // type mismatch
          threshold: 'x',  // type mismatch
          enabled: 'yes',  // type mismatch
          extra: true,     // unknown
        });
        expect.fail('should have thrown');
      } catch (err) {
        const ve = err as TemplateValidationError;
        expect(ve.issues).toHaveLength(4);
        expect(ve.issues).toContain('Unknown parameter "extra"');
        expect(ve.issues).toContain('Parameter "topic": expected string, got number');
        expect(ve.issues).toContain('Parameter "threshold": expected number, got string');
        expect(ve.issues).toContain('Parameter "enabled": expected boolean, got string');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('treats explicitly provided undefined as "provided" (not missing)', () => {
      // The key exists in the params object, so it is "provided".
      // Type check applies normally.
      const defs: TemplateParameterDef[] = [{ name: 'x', type: 'any' }];

      const result = validateTemplateParams(defs, { x: undefined });
      expect(result).toEqual({ x: undefined });
      expect('x' in result).toBe(true);
    });

    it('accepts falsy values that match the declared type', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'n', type: 'number' },
        { name: 'b', type: 'boolean' },
        { name: 's', type: 'string' },
      ];

      const result = validateTemplateParams(defs, { n: 0, b: false, s: '' });
      expect(result).toEqual({ n: 0, b: false, s: '' });
    });

    it('does not skip default when param absent even if default is falsy', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'n', type: 'number', default: 0 },
        { name: 'b', type: 'boolean', default: false },
      ];

      const result = validateTemplateParams(defs, {});
      expect(result).toEqual({ n: 0, b: false });
    });

    it('handles many parameters efficiently', () => {
      const defs: TemplateParameterDef[] = Array.from({ length: 50 }, (_, i) => ({
        name: `p${i}`,
        type: 'number' as const,
      }));
      const params = Object.fromEntries(defs.map(d => [d.name, 42]));

      const result = validateTemplateParams(defs, params);
      expect(Object.keys(result)).toHaveLength(50);
    });

    it('preserves provided param order in merged result', () => {
      const defs: TemplateParameterDef[] = [
        { name: 'b', type: 'string', default: 'B' },
        { name: 'a', type: 'string' },
      ];

      const result = validateTemplateParams(defs, { a: 'A' });
      expect(result).toEqual({ a: 'A', b: 'B' });
    });
  });
});
