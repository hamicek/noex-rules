import { describe, it, expect } from 'vitest';
import { DslError } from '../../../../src/dsl/helpers/errors';
import {
  TemplateValidationError,
  TemplateInstantiationError,
} from '../../../../src/dsl/template/errors';

describe('TemplateValidationError', () => {
  it('extends DslError and Error', () => {
    const err = new TemplateValidationError('validation failed', ['issue 1']);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DslError);
    expect(err).toBeInstanceOf(TemplateValidationError);
  });

  it('has correct name', () => {
    const err = new TemplateValidationError('msg', []);
    expect(err.name).toBe('TemplateValidationError');
  });

  it('preserves message', () => {
    const err = new TemplateValidationError('params are invalid', ['a']);
    expect(err.message).toBe('params are invalid');
  });

  it('exposes issues array', () => {
    const issues = [
      'Parameter "topic": required but not provided',
      'Parameter "threshold": expected number, got string',
    ];
    const err = new TemplateValidationError('validation failed', issues);
    expect(err.issues).toEqual(issues);
  });

  it('handles empty issues array', () => {
    const err = new TemplateValidationError('no issues', []);
    expect(err.issues).toEqual([]);
  });

  it('has a stack trace', () => {
    const err = new TemplateValidationError('msg', ['issue']);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('TemplateValidationError');
  });

  it('issues array is the same reference passed in', () => {
    const issues = ['a', 'b'] as const;
    const err = new TemplateValidationError('msg', issues);
    expect(err.issues).toBe(issues);
  });

  it('is not instanceof TemplateInstantiationError', () => {
    const err = new TemplateValidationError('msg', []);
    expect(err).not.toBeInstanceOf(TemplateInstantiationError);
  });
});

describe('TemplateInstantiationError', () => {
  it('extends DslError and Error', () => {
    const err = new TemplateInstantiationError('instantiation failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DslError);
    expect(err).toBeInstanceOf(TemplateInstantiationError);
  });

  it('has correct name', () => {
    const err = new TemplateInstantiationError('msg');
    expect(err.name).toBe('TemplateInstantiationError');
  });

  it('preserves message', () => {
    const err = new TemplateInstantiationError('param "x" not declared');
    expect(err.message).toBe('param "x" not declared');
  });

  it('has a stack trace', () => {
    const err = new TemplateInstantiationError('msg');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('TemplateInstantiationError');
  });

  it('is not instanceof TemplateValidationError', () => {
    const err = new TemplateInstantiationError('msg');
    expect(err).not.toBeInstanceOf(TemplateValidationError);
  });
});

describe('DslError catch-all includes template errors', () => {
  it('catches both template error types with instanceof DslError', () => {
    const errors: DslError[] = [];

    const tryCapture = (fn: () => void) => {
      try {
        fn();
      } catch (err) {
        if (err instanceof DslError) {
          errors.push(err);
        }
      }
    };

    tryCapture(() => {
      throw new TemplateValidationError('v', ['issue']);
    });
    tryCapture(() => {
      throw new TemplateInstantiationError('i');
    });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toBeInstanceOf(TemplateValidationError);
    expect(errors[1]).toBeInstanceOf(TemplateInstantiationError);
    errors.forEach(err => {
      expect(err).toBeInstanceOf(DslError);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
