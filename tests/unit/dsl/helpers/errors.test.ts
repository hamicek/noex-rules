import { describe, it, expect } from 'vitest';
import { DslError, DslValidationError } from '../../../../src/dsl/helpers/errors';
import { ParseError } from '../../../../src/dsl/tagged/parser';
import { YamlLoadError } from '../../../../src/dsl/yaml/loader';
import { YamlValidationError } from '../../../../src/dsl/yaml/schema';
import {
  Rule,
  onEvent,
  event,
  fact,
  context,
  emit,
  callService,
  log,
  setTimer,
  ref,
  sequence,
  absence,
  count,
  aggregate,
} from '../../../../src/dsl';

describe('DslError hierarchy', () => {
  describe('DslError', () => {
    it('is an instance of Error', () => {
      const err = new DslError('test');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DslError);
    });

    it('has correct name', () => {
      const err = new DslError('test message');
      expect(err.name).toBe('DslError');
    });

    it('preserves message', () => {
      const err = new DslError('something went wrong');
      expect(err.message).toBe('something went wrong');
    });

    it('has stack trace', () => {
      const err = new DslError('test');
      expect(err.stack).toBeDefined();
    });
  });

  describe('DslValidationError', () => {
    it('extends DslError and Error', () => {
      const err = new DslValidationError('invalid input');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DslError);
      expect(err).toBeInstanceOf(DslValidationError);
    });

    it('has correct name', () => {
      const err = new DslValidationError('test');
      expect(err.name).toBe('DslValidationError');
    });
  });

  describe('ParseError extends DslError', () => {
    it('is instanceof DslError', () => {
      const err = new ParseError('unexpected token', 5, 'WHEN foo');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DslError);
      expect(err).toBeInstanceOf(ParseError);
    });

    it('is not instanceof DslValidationError', () => {
      const err = new ParseError('msg', 1, 'src');
      expect(err).not.toBeInstanceOf(DslValidationError);
    });
  });

  describe('YamlLoadError extends DslError', () => {
    it('is instanceof DslError', () => {
      const err = new YamlLoadError('file not found');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DslError);
      expect(err).toBeInstanceOf(YamlLoadError);
    });
  });

  describe('YamlValidationError extends DslError', () => {
    it('is instanceof DslError', () => {
      const err = new YamlValidationError('missing field', 'rule.trigger');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DslError);
      expect(err).toBeInstanceOf(YamlValidationError);
    });
  });
});

describe('DslValidationError thrown by builders', () => {
  describe('Rule.create()', () => {
    it('throws DslValidationError for invalid id', () => {
      expect(() => Rule.create('')).toThrow(DslValidationError);
    });

    it('throws DslValidationError for invalid priority', () => {
      expect(() => Rule.create('test').priority(NaN)).toThrow(DslValidationError);
    });

    it('throws DslValidationError when trigger missing at build', () => {
      expect(() => Rule.create('test').then(emit('x')).build()).toThrow(DslValidationError);
    });

    it('throws DslValidationError when actions missing at build', () => {
      expect(() => Rule.create('test').when(onEvent('x')).build()).toThrow(DslValidationError);
    });
  });

  describe('condition builders', () => {
    it('throws DslValidationError for event() with empty field', () => {
      expect(() => event('')).toThrow(DslValidationError);
    });

    it('throws DslValidationError for fact() with empty pattern', () => {
      expect(() => fact('')).toThrow(DslValidationError);
    });

    it('throws DslValidationError for context() with empty key', () => {
      expect(() => context('')).toThrow(DslValidationError);
    });

    it('throws DslValidationError when building condition without operator', () => {
      expect(() => event('amount').build()).toThrow(DslValidationError);
    });
  });

  describe('trigger builders', () => {
    it('throws DslValidationError for onEvent() with empty topic', () => {
      expect(() => onEvent('')).toThrow(DslValidationError);
    });
  });

  describe('action builders', () => {
    it('throws DslValidationError for emit() with empty topic', () => {
      expect(() => emit('')).toThrow(DslValidationError);
    });

    it('throws DslValidationError for log() with invalid level', () => {
      expect(() => log('verbose' as any, 'msg')).toThrow(DslValidationError);
    });

    it('throws DslValidationError for log() with non-string message', () => {
      expect(() => log('info', 42 as any)).toThrow(DslValidationError);
    });

    it('throws DslValidationError for callService fluent without method', () => {
      expect(() => callService('svc').build()).toThrow(DslValidationError);
    });

    it('throws DslValidationError for setTimer fluent without emit', () => {
      expect(() =>
        (setTimer('timer') as any).after('5m').build(),
      ).toThrow(DslValidationError);
    });
  });

  describe('temporal builders', () => {
    it('throws DslValidationError for sequence without events', () => {
      expect(() => sequence().within('5m').build()).toThrow(DslValidationError);
    });

    it('throws DslValidationError for sequence without window', () => {
      expect(() => sequence().event('a').build()).toThrow(DslValidationError);
    });

    it('throws DslValidationError for absence without after', () => {
      expect(() =>
        absence().expected('b').within('5m').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for absence without expected', () => {
      expect(() =>
        absence().after('a').within('5m').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for absence without window', () => {
      expect(() =>
        absence().after('a').expected('b').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for count without event', () => {
      expect(() =>
        count().threshold(3).window('5m').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for count without threshold', () => {
      expect(() =>
        count().event('a').window('5m').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for count without window', () => {
      expect(() =>
        count().event('a').threshold(3).build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for count with invalid threshold', () => {
      expect(() => count().threshold(NaN)).toThrow(DslValidationError);
    });

    it('throws DslValidationError for count with invalid comparison', () => {
      expect(() => count().comparison('bad' as any)).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate without event', () => {
      expect(() =>
        aggregate().field('amount').function('sum').threshold(100).window('1h').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate without field', () => {
      expect(() =>
        aggregate().event('a').function('sum').threshold(100).window('1h').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate without function', () => {
      expect(() =>
        aggregate().event('a').field('amount').threshold(100).window('1h').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate without threshold', () => {
      expect(() =>
        aggregate().event('a').field('amount').function('sum').window('1h').build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate without window', () => {
      expect(() =>
        aggregate().event('a').field('amount').function('sum').threshold(100).build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate with invalid function', () => {
      expect(() => aggregate().function('bad' as any)).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate with invalid threshold', () => {
      expect(() => aggregate().threshold(Infinity)).toThrow(DslValidationError);
    });

    it('throws DslValidationError for aggregate with invalid comparison', () => {
      expect(() => aggregate().comparison('bad' as any)).toThrow(DslValidationError);
    });
  });

  describe('validator functions', () => {
    it('throws DslValidationError for invalid duration', () => {
      expect(() =>
        sequence().event('a').within('bad' as any).build(),
      ).toThrow(DslValidationError);
    });

    it('throws DslValidationError for ref() with empty path', () => {
      expect(() => ref('')).toThrow(DslValidationError);
    });
  });
});

describe('catch-all with DslError', () => {
  it('allows catching all DSL errors with a single instanceof check', () => {
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

    // Builder validation errors
    tryCapture(() => Rule.create(''));
    tryCapture(() => event('').eq(true));
    tryCapture(() => emit(''));
    tryCapture(() => sequence().build());

    // Parser error
    tryCapture(() => {
      throw new ParseError('bad', 1, 'src');
    });

    // YAML errors
    tryCapture(() => {
      throw new YamlLoadError('not found');
    });
    tryCapture(() => {
      throw new YamlValidationError('missing', 'path');
    });

    expect(errors).toHaveLength(7);
    errors.forEach(err => {
      expect(err).toBeInstanceOf(DslError);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
