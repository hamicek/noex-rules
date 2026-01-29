import { describe, it, expect } from 'vitest';
import { substituteParams } from '../../../../src/dsl/template/substitution';
import { param, isTemplateParam } from '../../../../src/dsl/template/param';
import { ref } from '../../../../src/dsl/helpers/ref';
import { TemplateInstantiationError } from '../../../../src/dsl/template/errors';
import { DslError } from '../../../../src/dsl/helpers/errors';

describe('substituteParams', () => {
  // ---------------------------------------------------------------------------
  // Primitives and nullish values
  // ---------------------------------------------------------------------------

  describe('primitives', () => {
    it('returns strings as-is', () => {
      expect(substituteParams('hello', {})).toBe('hello');
      expect(substituteParams('', {})).toBe('');
    });

    it('returns numbers as-is', () => {
      expect(substituteParams(42, {})).toBe(42);
      expect(substituteParams(0, {})).toBe(0);
      expect(substituteParams(-1.5, {})).toBe(-1.5);
      expect(substituteParams(Infinity, {})).toBe(Infinity);
      expect(substituteParams(NaN, {})).toBeNaN();
    });

    it('returns booleans as-is', () => {
      expect(substituteParams(true, {})).toBe(true);
      expect(substituteParams(false, {})).toBe(false);
    });

    it('returns null as-is', () => {
      expect(substituteParams(null, {})).toBeNull();
    });

    it('returns undefined as-is', () => {
      expect(substituteParams(undefined, {})).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Template parameter markers
  // ---------------------------------------------------------------------------

  describe('template param markers', () => {
    it('replaces a marker with the corresponding param value', () => {
      const marker = param('topic');
      const result = substituteParams(marker, { topic: 'metrics.cpu' });
      expect(result).toBe('metrics.cpu');
    });

    it('replaces a marker with a numeric param value', () => {
      const marker = param('threshold');
      const result = substituteParams(marker, { threshold: 90 });
      expect(result).toBe(90);
    });

    it('replaces a marker with a boolean param value', () => {
      const marker = param('enabled');
      const result = substituteParams(marker, { enabled: false });
      expect(result).toBe(false);
    });

    it('replaces a marker with an object param value', () => {
      const data = { key: 'value', nested: { a: 1 } };
      const marker = param('config');
      const result = substituteParams(marker, { config: data });
      expect(result).toEqual(data);
      expect(result).toBe(data); // same reference — param values are not cloned
    });

    it('replaces a marker with an array param value', () => {
      const tags = ['alert', 'cpu'];
      const marker = param('tags');
      const result = substituteParams(marker, { tags });
      expect(result).toEqual(tags);
    });

    it('replaces a marker with null param value', () => {
      const marker = param('optional');
      const result = substituteParams(marker, { optional: null });
      expect(result).toBeNull();
    });

    it('replaces a marker with undefined param value', () => {
      const marker = param('optional');
      const result = substituteParams(marker, { optional: undefined });
      expect(result).toBeUndefined();
    });

    it('throws TemplateInstantiationError for missing param', () => {
      const marker = param('unknown');
      expect(() => substituteParams(marker, {})).toThrow(TemplateInstantiationError);
      expect(() => substituteParams(marker, {})).toThrow(
        'Template parameter "unknown" is referenced in the blueprint but was not provided',
      );
    });

    it('thrown error extends DslError', () => {
      const marker = param('missing');
      try {
        substituteParams(marker, {});
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DslError);
        expect(err).toBeInstanceOf(TemplateInstantiationError);
      }
    });

    it('distinguishes params present with undefined value from missing params', () => {
      const marker = param('x');
      // 'x' is present (with undefined value) → should NOT throw
      expect(substituteParams(marker, { x: undefined })).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Functions (computed fields)
  // ---------------------------------------------------------------------------

  describe('functions', () => {
    it('invokes a function with the params object', () => {
      const fn = (p: Record<string, unknown>) => `alert-${p['topic']}`;
      const result = substituteParams(fn, { topic: 'cpu' });
      expect(result).toBe('alert-cpu');
    });

    it('passes all params to the function', () => {
      const fn = (p: Record<string, unknown>) => `${p['a']}-${p['b']}-${p['c']}`;
      const result = substituteParams(fn, { a: 'x', b: 'y', c: 'z' });
      expect(result).toBe('x-y-z');
    });

    it('returns the function result directly without further recursion', () => {
      // Function returns an object that contains what looks like a param marker.
      // It should NOT be recursed into.
      const markerLike = { __templateParam: true, paramName: 'sneaky' };
      const fn = () => markerLike;
      const result = substituteParams(fn, { sneaky: 'should not appear' });
      expect(result).toBe(markerLike);
      expect(isTemplateParam(result)).toBe(true);
    });

    it('handles functions returning primitives', () => {
      expect(substituteParams(() => 42, {})).toBe(42);
      expect(substituteParams(() => null, {})).toBeNull();
      expect(substituteParams(() => 'hello', {})).toBe('hello');
    });
  });

  // ---------------------------------------------------------------------------
  // Ref preservation
  // ---------------------------------------------------------------------------

  describe('ref preservation', () => {
    it('preserves ref objects untouched', () => {
      const r = ref('event.orderId');
      const result = substituteParams(r, {});
      expect(result).toEqual({ ref: 'event.orderId' });
    });

    it('preserves plain ref-shaped objects', () => {
      const r = { ref: 'fact.customer:123' };
      const result = substituteParams(r, {});
      expect(result).toEqual({ ref: 'fact.customer:123' });
    });

    it('does not recurse into ref objects', () => {
      // ref with extra properties — should be returned as-is
      const r = { ref: 'event.value' };
      const result = substituteParams(r, {});
      expect(result).toBe(r);
    });
  });

  // ---------------------------------------------------------------------------
  // Arrays
  // ---------------------------------------------------------------------------

  describe('arrays', () => {
    it('returns a new array (does not mutate the original)', () => {
      const original = [1, 2, 3];
      const result = substituteParams(original, {});
      expect(result).toEqual([1, 2, 3]);
      expect(result).not.toBe(original);
    });

    it('returns empty array for empty input', () => {
      expect(substituteParams([], {})).toEqual([]);
    });

    it('substitutes param markers within arrays', () => {
      const arr = [param('a'), 'literal', param('b')];
      const result = substituteParams(arr, { a: 'first', b: 'third' });
      expect(result).toEqual(['first', 'literal', 'third']);
    });

    it('recursively substitutes nested arrays', () => {
      const arr = [[param('x')], [param('y')]];
      const result = substituteParams(arr, { x: 1, y: 2 });
      expect(result).toEqual([[1], [2]]);
    });

    it('preserves refs within arrays', () => {
      const arr = [ref('event.a'), param('b'), 'c'];
      const result = substituteParams(arr, { b: 42 });
      expect(result).toEqual([{ ref: 'event.a' }, 42, 'c']);
    });
  });

  // ---------------------------------------------------------------------------
  // Objects (generic walk)
  // ---------------------------------------------------------------------------

  describe('objects', () => {
    it('returns a new object (does not mutate the original)', () => {
      const original = { a: 1, b: 2 };
      const result = substituteParams(original, {});
      expect(result).toEqual({ a: 1, b: 2 });
      expect(result).not.toBe(original);
    });

    it('returns empty object for empty input', () => {
      expect(substituteParams({}, {})).toEqual({});
    });

    it('substitutes param markers in object values', () => {
      const obj = { topic: param('t'), threshold: param('th') };
      const result = substituteParams(obj, { t: 'metrics.cpu', th: 90 });
      expect(result).toEqual({ topic: 'metrics.cpu', threshold: 90 });
    });

    it('recursively walks nested objects', () => {
      const obj = {
        outer: {
          inner: {
            value: param('deep'),
          },
        },
      };
      const result = substituteParams(obj, { deep: 'found' });
      expect(result).toEqual({ outer: { inner: { value: 'found' } } });
    });

    it('handles mixed values in objects', () => {
      const obj = {
        literal: 'hello',
        number: 42,
        marker: param('x'),
        reference: ref('event.id'),
        nested: { also: param('y') },
        arr: [param('z'), 'static'],
      };
      const result = substituteParams(obj, { x: 'X', y: 'Y', z: 'Z' });
      expect(result).toEqual({
        literal: 'hello',
        number: 42,
        marker: 'X',
        reference: { ref: 'event.id' },
        nested: { also: 'Y' },
        arr: ['Z', 'static'],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Complex / realistic blueprints
  // ---------------------------------------------------------------------------

  describe('realistic blueprints', () => {
    it('substitutes a trigger definition', () => {
      const trigger = { type: 'event', topic: param('topic') };
      const result = substituteParams(trigger, { topic: 'metrics.cpu' });
      expect(result).toEqual({ type: 'event', topic: 'metrics.cpu' });
    });

    it('substitutes a condition definition', () => {
      const condition = {
        source: { type: 'event', field: param('field') },
        operator: 'gte',
        value: param('threshold'),
      };
      const result = substituteParams(condition, { field: 'usage', threshold: 90 });
      expect(result).toEqual({
        source: { type: 'event', field: 'usage' },
        operator: 'gte',
        value: 90,
      });
    });

    it('substitutes an action definition preserving runtime refs', () => {
      const action = {
        type: 'emit_event',
        topic: param('alertTopic'),
        data: {
          source: param('topic'),
          currentValue: ref('event.value'),
        },
      };
      const result = substituteParams(action, {
        alertTopic: 'alert.triggered',
        topic: 'metrics.cpu',
      });
      expect(result).toEqual({
        type: 'emit_event',
        topic: 'alert.triggered',
        data: {
          source: 'metrics.cpu',
          currentValue: { ref: 'event.value' },
        },
      });
    });

    it('handles a complete blueprint-like structure', () => {
      const blueprint = {
        id: (p: Record<string, unknown>) => `alert-${p['topic']}-${p['field']}`,
        name: (p: Record<string, unknown>) =>
          `Alert: ${p['field']} > ${p['threshold']} on ${p['topic']}`,
        priority: 50,
        enabled: true,
        tags: ['alerts'],
        trigger: { type: 'event', topic: param('topic') },
        conditions: [
          {
            source: { type: 'event', field: param('field') },
            operator: 'gte',
            value: param('threshold'),
          },
        ],
        actions: [
          {
            type: 'emit_event',
            topic: param('alertTopic'),
            data: {
              source: param('topic'),
              currentValue: ref('event.value'),
            },
          },
        ],
      };

      const params = {
        topic: 'metrics.cpu',
        field: 'usage',
        threshold: 90,
        alertTopic: 'alert.triggered',
      };

      const result = substituteParams(blueprint, params) as Record<string, unknown>;

      expect(result['id']).toBe('alert-metrics.cpu-usage');
      expect(result['name']).toBe('Alert: usage > 90 on metrics.cpu');
      expect(result['priority']).toBe(50);
      expect(result['enabled']).toBe(true);
      expect(result['tags']).toEqual(['alerts']);
      expect(result['trigger']).toEqual({ type: 'event', topic: 'metrics.cpu' });
      expect(result['conditions']).toEqual([
        {
          source: { type: 'event', field: 'usage' },
          operator: 'gte',
          value: 90,
        },
      ]);
      expect(result['actions']).toEqual([
        {
          type: 'emit_event',
          topic: 'alert.triggered',
          data: {
            source: 'metrics.cpu',
            currentValue: { ref: 'event.value' },
          },
        },
      ]);
    });

    it('does not mutate the original blueprint', () => {
      const marker = param('topic');
      const blueprint = {
        trigger: { type: 'event', topic: marker },
        conditions: [{ value: param('threshold') }],
      };

      substituteParams(blueprint, { topic: 'test', threshold: 50 });

      // Original should still contain markers
      expect(isTemplateParam(blueprint.trigger.topic)).toBe(true);
      expect(isTemplateParam(blueprint.conditions[0]!.value)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles deeply nested structures (5+ levels)', () => {
      const deep = { a: { b: { c: { d: { e: param('val') } } } } };
      const result = substituteParams(deep, { val: 'deep-value' });
      expect(result).toEqual({ a: { b: { c: { d: { e: 'deep-value' } } } } });
    });

    it('handles objects with only param marker values', () => {
      const obj = { a: param('x'), b: param('y'), c: param('z') };
      const result = substituteParams(obj, { x: 1, y: 2, z: 3 });
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('handles arrays with only param markers', () => {
      const arr = [param('a'), param('b'), param('c')];
      const result = substituteParams(arr, { a: 'x', b: 'y', c: 'z' });
      expect(result).toEqual(['x', 'y', 'z']);
    });

    it('handles multiple markers referencing the same param', () => {
      const obj = {
        first: param('topic'),
        second: param('topic'),
        nested: { third: param('topic') },
      };
      const result = substituteParams(obj, { topic: 'shared' });
      expect(result).toEqual({
        first: 'shared',
        second: 'shared',
        nested: { third: 'shared' },
      });
    });

    it('throws on first missing param encountered in object walk', () => {
      const obj = { a: param('exists'), b: param('missing') };
      expect(() => substituteParams(obj, { exists: 'ok' })).toThrow(
        TemplateInstantiationError,
      );
    });

    it('handles param values that are themselves complex objects', () => {
      const marker = param('complexValue');
      const complexValue = {
        nested: { deep: [1, 2, 3] },
        ref: 'not-a-real-ref',
      };
      const result = substituteParams(marker, { complexValue });
      // Complex param values are returned as-is — not walked
      expect(result).toBe(complexValue);
    });
  });
});
