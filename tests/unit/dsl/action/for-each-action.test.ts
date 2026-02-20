import { describe, it, expect } from 'vitest';
import { forEach, ForEachBuilder } from '../../../../src/dsl/action/for-each-action';
import { setFact } from '../../../../src/dsl/action/fact-actions';
import { emit } from '../../../../src/dsl/action/emit';
import { log } from '../../../../src/dsl/action/log-action';
import { DslValidationError } from '../../../../src/dsl/helpers/errors';
import type { RuleAction } from '../../../../src/types/action';

describe('ForEachBuilder', () => {
  // ─── factory ──────────────────────────────────────────────────────────

  it('forEach() returns a ForEachBuilder', () => {
    expect(forEach([1, 2, 3])).toBeInstanceOf(ForEachBuilder);
  });

  // ─── build() ──────────────────────────────────────────────────────────

  describe('build()', () => {
    it('builds a for_each action with literal collection', () => {
      const action = forEach([1, 2, 3])
        .as('item')
        .do(setFact('x', 1))
        .build();

      expect(action).toEqual({
        type: 'for_each',
        collection: [1, 2, 3],
        as: 'item',
        actions: [{ type: 'set_fact', key: 'x', value: 1 }]
      });
    });

    it('builds a for_each action with ref collection', () => {
      const action = forEach({ ref: 'event.items' })
        .as('item')
        .do(setFact('k', { ref: 'var.item.id' }))
        .build();

      expect(action).toEqual({
        type: 'for_each',
        collection: { ref: 'event.items' },
        as: 'item',
        actions: [{ type: 'set_fact', key: 'k', value: { ref: 'var.item.id' } }]
      });
    });

    it('supports multiple .do() calls', () => {
      const action = forEach([1])
        .as('n')
        .do(setFact('a', 1))
        .do(emit('test.topic'))
        .build();

      expect((action as Extract<RuleAction, { type: 'for_each' }>).actions).toHaveLength(2);
    });

    it('supports multiple actions in a single .do() call', () => {
      const action = forEach([1])
        .as('n')
        .do(
          setFact('a', 1),
          emit('test.topic'),
          log.info('hi')
        )
        .build();

      expect((action as Extract<RuleAction, { type: 'for_each' }>).actions).toHaveLength(3);
    });

    it('includes maxIterations when set', () => {
      const action = forEach([1])
        .as('n')
        .do(setFact('x', 1))
        .maxIterations(50)
        .build();

      expect((action as Extract<RuleAction, { type: 'for_each' }>).maxIterations).toBe(50);
    });

    it('omits maxIterations when not set', () => {
      const action = forEach([1])
        .as('n')
        .do(setFact('x', 1))
        .build();

      expect((action as Extract<RuleAction, { type: 'for_each' }>)).not.toHaveProperty('maxIterations');
    });

    it('accepts raw RuleAction objects in .do()', () => {
      const raw: RuleAction = { type: 'log', level: 'info', message: 'raw' };
      const action = forEach([1]).as('n').do(raw).build();

      expect((action as Extract<RuleAction, { type: 'for_each' }>).actions[0]).toEqual(raw);
    });
  });

  // ─── validation ────────────────────────────────────────────────────────

  describe('validation', () => {
    it('throws if .as() is missing', () => {
      expect(() =>
        forEach([1]).do(setFact('x', 1)).build()
      ).toThrow(DslValidationError);
    });

    it('throws if .as() is given empty string', () => {
      expect(() => forEach([1]).as('')).toThrow(DslValidationError);
    });

    it('throws if .do() is never called', () => {
      expect(() =>
        forEach([1]).as('n').build()
      ).toThrow(DslValidationError);
    });

    it('throws if maxIterations is zero', () => {
      expect(() =>
        forEach([1]).as('n').do(setFact('x', 1)).maxIterations(0)
      ).toThrow(DslValidationError);
    });

    it('throws if maxIterations is negative', () => {
      expect(() =>
        forEach([1]).as('n').do(setFact('x', 1)).maxIterations(-1)
      ).toThrow(DslValidationError);
    });

    it('throws if maxIterations is not finite', () => {
      expect(() =>
        forEach([1]).as('n').do(setFact('x', 1)).maxIterations(Infinity)
      ).toThrow(DslValidationError);
    });
  });

  // ─── chaining ──────────────────────────────────────────────────────────

  describe('chaining', () => {
    it('returns this for all methods', () => {
      const builder = forEach([1]);
      expect(builder.as('n')).toBe(builder);
      expect(builder.do(setFact('x', 1))).toBe(builder);
      expect(builder.maxIterations(10)).toBe(builder);
    });
  });
});
