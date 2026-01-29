import { describe, it, expect } from 'vitest';
import { param, isTemplateParam } from '../../../../src/dsl/template/param';
import { DslValidationError } from '../../../../src/dsl/helpers/errors';
import { ref, isRef } from '../../../../src/dsl/helpers/ref';

describe('param', () => {
  it('creates a marker with __templateParam brand and paramName', () => {
    const marker = param('topic') as unknown as { __templateParam: true; paramName: string };
    expect(marker.__templateParam).toBe(true);
    expect(marker.paramName).toBe('topic');
  });

  it('creates distinct markers for different param names', () => {
    const a = param('topic') as unknown as { paramName: string };
    const b = param('threshold') as unknown as { paramName: string };
    expect(a.paramName).toBe('topic');
    expect(b.paramName).toBe('threshold');
  });

  it('returns a new marker instance on each call', () => {
    const a = param('topic');
    const b = param('topic');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('accepts a generic type parameter for type-safe embedding', () => {
    // Compile-time only — the runtime value is always a marker object.
    // This test verifies the function signature accepts a type param.
    const stringParam: string = param<string>('name');
    const numberParam: number = param<number>('threshold');
    // At runtime, both are TemplateParamMarker objects
    expect(isTemplateParam(stringParam)).toBe(true);
    expect(isTemplateParam(numberParam)).toBe(true);
  });

  it('throws DslValidationError for empty string', () => {
    expect(() => param('')).toThrow(DslValidationError);
    expect(() => param('')).toThrow('param() name must be a non-empty string');
  });

  it('throws DslValidationError for non-string values', () => {
    // @ts-expect-error — testing runtime guard
    expect(() => param(undefined)).toThrow(DslValidationError);
    // @ts-expect-error — testing runtime guard
    expect(() => param(null)).toThrow(DslValidationError);
    // @ts-expect-error — testing runtime guard
    expect(() => param(42)).toThrow(DslValidationError);
  });

  it('is structurally distinct from ref()', () => {
    const marker = param('topic');
    const reference = ref('event.topic');
    // param markers are not refs
    expect(isRef(marker)).toBe(false);
    // refs are not param markers
    expect(isTemplateParam(reference)).toBe(false);
  });
});

describe('isTemplateParam', () => {
  it('returns true for param() output', () => {
    expect(isTemplateParam(param('topic'))).toBe(true);
    expect(isTemplateParam(param('threshold'))).toBe(true);
  });

  it('returns true for manually constructed markers', () => {
    expect(isTemplateParam({ __templateParam: true, paramName: 'x' })).toBe(true);
  });

  it('returns false for null and undefined', () => {
    expect(isTemplateParam(null)).toBe(false);
    expect(isTemplateParam(undefined)).toBe(false);
  });

  it('returns false for primitive values', () => {
    expect(isTemplateParam('string')).toBe(false);
    expect(isTemplateParam(42)).toBe(false);
    expect(isTemplateParam(true)).toBe(false);
    expect(isTemplateParam(false)).toBe(false);
  });

  it('returns false for plain objects', () => {
    expect(isTemplateParam({})).toBe(false);
    expect(isTemplateParam({ key: 'value' })).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isTemplateParam([])).toBe(false);
    expect(isTemplateParam([{ __templateParam: true, paramName: 'x' }])).toBe(false);
  });

  it('returns false for ref() objects', () => {
    expect(isTemplateParam(ref('event.id'))).toBe(false);
    expect(isTemplateParam({ ref: 'some.path' })).toBe(false);
  });

  it('returns false when __templateParam is not true', () => {
    expect(isTemplateParam({ __templateParam: false, paramName: 'x' })).toBe(false);
    expect(isTemplateParam({ __templateParam: 'true', paramName: 'x' })).toBe(false);
    expect(isTemplateParam({ __templateParam: 1, paramName: 'x' })).toBe(false);
  });

  it('returns false when paramName is missing', () => {
    expect(isTemplateParam({ __templateParam: true })).toBe(false);
  });

  it('returns false when paramName is not a string', () => {
    expect(isTemplateParam({ __templateParam: true, paramName: 42 })).toBe(false);
    expect(isTemplateParam({ __templateParam: true, paramName: null })).toBe(false);
    expect(isTemplateParam({ __templateParam: true, paramName: undefined })).toBe(false);
    expect(isTemplateParam({ __templateParam: true, paramName: true })).toBe(false);
  });

  it('returns true even with extra properties on the marker', () => {
    expect(isTemplateParam({ __templateParam: true, paramName: 'x', extra: 'data' })).toBe(true);
  });
});
