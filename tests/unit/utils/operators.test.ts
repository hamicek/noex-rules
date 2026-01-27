import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '../../../src/utils/operators';
import type { RuleCondition } from '../../../src/types/condition';

/**
 * Helper to create a minimal RuleCondition object for testing.
 * Only the operator field is used by evaluateCondition.
 */
function condition(operator: RuleCondition['operator']): RuleCondition {
  return {
    source: { type: 'fact', pattern: 'test' },
    operator,
    value: null,
  };
}

describe('evaluateCondition', () => {
  describe('eq operator', () => {
    const cond = condition('eq');

    it('returns true for identical primitives', () => {
      expect(evaluateCondition(cond, 42, 42)).toBe(true);
      expect(evaluateCondition(cond, 'hello', 'hello')).toBe(true);
      expect(evaluateCondition(cond, true, true)).toBe(true);
      expect(evaluateCondition(cond, false, false)).toBe(true);
      expect(evaluateCondition(cond, null, null)).toBe(true);
    });

    it('returns false for different values', () => {
      expect(evaluateCondition(cond, 42, 43)).toBe(false);
      expect(evaluateCondition(cond, 'hello', 'world')).toBe(false);
      expect(evaluateCondition(cond, true, false)).toBe(false);
    });

    it('uses strict equality', () => {
      expect(evaluateCondition(cond, 42, '42')).toBe(false);
      expect(evaluateCondition(cond, 0, false)).toBe(false);
      expect(evaluateCondition(cond, '', false)).toBe(false);
      expect(evaluateCondition(cond, null, undefined)).toBe(false);
    });
  });

  describe('neq operator', () => {
    const cond = condition('neq');

    it('returns true for different values', () => {
      expect(evaluateCondition(cond, 42, 43)).toBe(true);
      expect(evaluateCondition(cond, 'hello', 'world')).toBe(true);
      expect(evaluateCondition(cond, true, false)).toBe(true);
    });

    it('returns false for identical primitives', () => {
      expect(evaluateCondition(cond, 42, 42)).toBe(false);
      expect(evaluateCondition(cond, 'hello', 'hello')).toBe(false);
      expect(evaluateCondition(cond, true, true)).toBe(false);
    });

    it('uses strict inequality', () => {
      expect(evaluateCondition(cond, 42, '42')).toBe(true);
      expect(evaluateCondition(cond, null, undefined)).toBe(true);
    });
  });

  describe('gt operator', () => {
    const cond = condition('gt');

    it('returns true when value is greater', () => {
      expect(evaluateCondition(cond, 10, 5)).toBe(true);
      expect(evaluateCondition(cond, 0.5, 0.1)).toBe(true);
      expect(evaluateCondition(cond, -1, -10)).toBe(true);
    });

    it('returns false when value is less or equal', () => {
      expect(evaluateCondition(cond, 5, 10)).toBe(false);
      expect(evaluateCondition(cond, 5, 5)).toBe(false);
    });

    it('returns false for non-numeric types', () => {
      expect(evaluateCondition(cond, 'z', 'a')).toBe(false);
      expect(evaluateCondition(cond, 10, '5')).toBe(false);
      expect(evaluateCondition(cond, '10', 5)).toBe(false);
      expect(evaluateCondition(cond, null, 0)).toBe(false);
    });
  });

  describe('gte operator', () => {
    const cond = condition('gte');

    it('returns true when value is greater or equal', () => {
      expect(evaluateCondition(cond, 10, 5)).toBe(true);
      expect(evaluateCondition(cond, 5, 5)).toBe(true);
      expect(evaluateCondition(cond, -1, -1)).toBe(true);
    });

    it('returns false when value is less', () => {
      expect(evaluateCondition(cond, 5, 10)).toBe(false);
      expect(evaluateCondition(cond, -10, -1)).toBe(false);
    });

    it('returns false for non-numeric types', () => {
      expect(evaluateCondition(cond, '10', '5')).toBe(false);
      expect(evaluateCondition(cond, true, false)).toBe(false);
    });
  });

  describe('lt operator', () => {
    const cond = condition('lt');

    it('returns true when value is less', () => {
      expect(evaluateCondition(cond, 5, 10)).toBe(true);
      expect(evaluateCondition(cond, -10, -1)).toBe(true);
      expect(evaluateCondition(cond, 0.1, 0.5)).toBe(true);
    });

    it('returns false when value is greater or equal', () => {
      expect(evaluateCondition(cond, 10, 5)).toBe(false);
      expect(evaluateCondition(cond, 5, 5)).toBe(false);
    });

    it('returns false for non-numeric types', () => {
      expect(evaluateCondition(cond, 'a', 'z')).toBe(false);
      expect(evaluateCondition(cond, null, null)).toBe(false);
    });
  });

  describe('lte operator', () => {
    const cond = condition('lte');

    it('returns true when value is less or equal', () => {
      expect(evaluateCondition(cond, 5, 10)).toBe(true);
      expect(evaluateCondition(cond, 5, 5)).toBe(true);
      expect(evaluateCondition(cond, 0, 0)).toBe(true);
    });

    it('returns false when value is greater', () => {
      expect(evaluateCondition(cond, 10, 5)).toBe(false);
    });

    it('returns false for non-numeric types', () => {
      expect(evaluateCondition(cond, 'a', 'b')).toBe(false);
    });
  });

  describe('in operator', () => {
    const cond = condition('in');

    it('returns true when value is in array', () => {
      expect(evaluateCondition(cond, 'a', ['a', 'b', 'c'])).toBe(true);
      expect(evaluateCondition(cond, 2, [1, 2, 3])).toBe(true);
      expect(evaluateCondition(cond, null, [null, undefined])).toBe(true);
    });

    it('returns false when value is not in array', () => {
      expect(evaluateCondition(cond, 'd', ['a', 'b', 'c'])).toBe(false);
      expect(evaluateCondition(cond, 4, [1, 2, 3])).toBe(false);
    });

    it('returns false when compareValue is not an array', () => {
      expect(evaluateCondition(cond, 'a', 'abc')).toBe(false);
      expect(evaluateCondition(cond, 1, 123)).toBe(false);
      expect(evaluateCondition(cond, 'a', null)).toBe(false);
    });

    it('uses strict equality for array membership', () => {
      expect(evaluateCondition(cond, '1', [1, 2, 3])).toBe(false);
      expect(evaluateCondition(cond, 1, ['1', '2', '3'])).toBe(false);
    });
  });

  describe('not_in operator', () => {
    const cond = condition('not_in');

    it('returns true when value is not in array', () => {
      expect(evaluateCondition(cond, 'd', ['a', 'b', 'c'])).toBe(true);
      expect(evaluateCondition(cond, 4, [1, 2, 3])).toBe(true);
    });

    it('returns false when value is in array', () => {
      expect(evaluateCondition(cond, 'a', ['a', 'b', 'c'])).toBe(false);
      expect(evaluateCondition(cond, 2, [1, 2, 3])).toBe(false);
    });

    it('returns false when compareValue is not an array', () => {
      expect(evaluateCondition(cond, 'a', 'abc')).toBe(false);
      expect(evaluateCondition(cond, 1, null)).toBe(false);
    });
  });

  describe('contains operator', () => {
    const cond = condition('contains');

    describe('string containment', () => {
      it('returns true when string contains substring', () => {
        expect(evaluateCondition(cond, 'hello world', 'world')).toBe(true);
        expect(evaluateCondition(cond, 'hello world', 'hello')).toBe(true);
        expect(evaluateCondition(cond, 'hello world', 'lo wo')).toBe(true);
      });

      it('returns false when string does not contain substring', () => {
        expect(evaluateCondition(cond, 'hello world', 'foo')).toBe(false);
        expect(evaluateCondition(cond, 'hello world', 'WORLD')).toBe(false);
      });

      it('handles empty strings', () => {
        expect(evaluateCondition(cond, 'hello', '')).toBe(true);
        expect(evaluateCondition(cond, '', '')).toBe(true);
        expect(evaluateCondition(cond, '', 'a')).toBe(false);
      });
    });

    describe('array containment', () => {
      it('returns true when array contains element', () => {
        expect(evaluateCondition(cond, ['a', 'b', 'c'], 'b')).toBe(true);
        expect(evaluateCondition(cond, [1, 2, 3], 2)).toBe(true);
        expect(evaluateCondition(cond, [null, 'a'], null)).toBe(true);
      });

      it('returns false when array does not contain element', () => {
        expect(evaluateCondition(cond, ['a', 'b', 'c'], 'd')).toBe(false);
        expect(evaluateCondition(cond, [1, 2, 3], '2')).toBe(false);
      });
    });

    it('returns false for other types', () => {
      expect(evaluateCondition(cond, 123, 2)).toBe(false);
      expect(evaluateCondition(cond, { a: 1 }, 'a')).toBe(false);
      expect(evaluateCondition(cond, null, null)).toBe(false);
    });
  });

  describe('not_contains operator', () => {
    const cond = condition('not_contains');

    describe('string non-containment', () => {
      it('returns true when string does not contain substring', () => {
        expect(evaluateCondition(cond, 'hello world', 'foo')).toBe(true);
        expect(evaluateCondition(cond, 'hello world', 'WORLD')).toBe(true);
      });

      it('returns false when string contains substring', () => {
        expect(evaluateCondition(cond, 'hello world', 'world')).toBe(false);
        expect(evaluateCondition(cond, 'hello world', '')).toBe(false);
      });
    });

    describe('array non-containment', () => {
      it('returns true when array does not contain element', () => {
        expect(evaluateCondition(cond, ['a', 'b', 'c'], 'd')).toBe(true);
        expect(evaluateCondition(cond, [1, 2, 3], '1')).toBe(true);
      });

      it('returns false when array contains element', () => {
        expect(evaluateCondition(cond, ['a', 'b', 'c'], 'a')).toBe(false);
        expect(evaluateCondition(cond, [1, 2, 3], 2)).toBe(false);
      });
    });

    it('returns true for other types', () => {
      expect(evaluateCondition(cond, 123, 2)).toBe(true);
      expect(evaluateCondition(cond, { a: 1 }, 'a')).toBe(true);
      expect(evaluateCondition(cond, null, 'x')).toBe(true);
    });
  });

  describe('matches operator', () => {
    const cond = condition('matches');

    it('returns true when string matches regex pattern', () => {
      expect(evaluateCondition(cond, 'hello123', '\\d+')).toBe(true);
      expect(evaluateCondition(cond, 'test@example.com', '@')).toBe(true);
      expect(evaluateCondition(cond, 'abc', '^abc$')).toBe(true);
      expect(evaluateCondition(cond, 'Hello World', '[A-Z]')).toBe(true);
    });

    it('returns false when string does not match regex', () => {
      expect(evaluateCondition(cond, 'hello', '\\d+')).toBe(false);
      expect(evaluateCondition(cond, 'abc', '^def$')).toBe(false);
    });

    it('returns false for invalid regex patterns', () => {
      expect(evaluateCondition(cond, 'test', '[')).toBe(false);
      expect(evaluateCondition(cond, 'test', '*invalid')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(evaluateCondition(cond, 123, '\\d+')).toBe(false);
      expect(evaluateCondition(cond, null, '.*')).toBe(false);
      expect(evaluateCondition(cond, ['a'], 'a')).toBe(false);
    });

    it('returns false for non-string patterns', () => {
      expect(evaluateCondition(cond, 'test', 123 as unknown as string)).toBe(false);
      expect(evaluateCondition(cond, 'test', null)).toBe(false);
    });
  });

  describe('exists operator', () => {
    const cond = condition('exists');

    it('returns true for defined non-null values', () => {
      expect(evaluateCondition(cond, 42, null)).toBe(true);
      expect(evaluateCondition(cond, 'hello', null)).toBe(true);
      expect(evaluateCondition(cond, 0, null)).toBe(true);
      expect(evaluateCondition(cond, '', null)).toBe(true);
      expect(evaluateCondition(cond, false, null)).toBe(true);
      expect(evaluateCondition(cond, [], null)).toBe(true);
      expect(evaluateCondition(cond, {}, null)).toBe(true);
    });

    it('returns false for undefined and null', () => {
      expect(evaluateCondition(cond, undefined, null)).toBe(false);
      expect(evaluateCondition(cond, null, null)).toBe(false);
    });

    it('ignores compareValue parameter', () => {
      expect(evaluateCondition(cond, 42, 'ignored')).toBe(true);
      expect(evaluateCondition(cond, null, 123)).toBe(false);
    });
  });

  describe('not_exists operator', () => {
    const cond = condition('not_exists');

    it('returns true for undefined and null', () => {
      expect(evaluateCondition(cond, undefined, null)).toBe(true);
      expect(evaluateCondition(cond, null, null)).toBe(true);
    });

    it('returns false for defined non-null values', () => {
      expect(evaluateCondition(cond, 42, null)).toBe(false);
      expect(evaluateCondition(cond, 'hello', null)).toBe(false);
      expect(evaluateCondition(cond, 0, null)).toBe(false);
      expect(evaluateCondition(cond, '', null)).toBe(false);
      expect(evaluateCondition(cond, false, null)).toBe(false);
    });

    it('ignores compareValue parameter', () => {
      expect(evaluateCondition(cond, undefined, 'ignored')).toBe(true);
      expect(evaluateCondition(cond, 'value', 123)).toBe(false);
    });
  });

  describe('unknown operator', () => {
    it('returns false for unrecognized operators', () => {
      const cond = { operator: 'unknown' } as RuleCondition;
      expect(evaluateCondition(cond, 'any', 'value')).toBe(false);
    });
  });
});
