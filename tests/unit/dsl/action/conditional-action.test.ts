import { describe, it, expect } from 'vitest';
import { conditional, ConditionalBuilder } from '../../../../src/dsl/action/conditional-action';
import { emit } from '../../../../src/dsl/action/emit';
import { setFact } from '../../../../src/dsl/action/fact-actions';
import { log } from '../../../../src/dsl/action/log-action';
import { event, fact, context } from '../../../../src/dsl/condition/source-expr';
import type { RuleCondition } from '../../../../src/types/condition';
import type { RuleAction } from '../../../../src/types/action';

describe('conditional', () => {
  describe('simple if/then', () => {
    it('builds a conditional action with one condition and one then action', () => {
      const action = conditional(event('amount').gte(100))
        .then(emit('premium.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
        ],
        then: [
          { type: 'emit_event', topic: 'premium.process', data: {} },
        ],
      });
    });

    it('builds with multiple then actions', () => {
      const action = conditional(event('amount').gte(100))
        .then(emit('premium.process'))
        .then(log('info', 'Premium order detected'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
        ],
        then: [
          { type: 'emit_event', topic: 'premium.process', data: {} },
          { type: 'log', level: 'info', message: 'Premium order detected' },
        ],
      });
    });
  });

  describe('if/then/else', () => {
    it('builds a conditional action with then and else branches', () => {
      const action = conditional(event('amount').gte(100))
        .then(emit('premium.process'))
        .else(emit('standard.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
        ],
        then: [
          { type: 'emit_event', topic: 'premium.process', data: {} },
        ],
        else: [
          { type: 'emit_event', topic: 'standard.process', data: {} },
        ],
      });
    });

    it('builds with multiple else actions', () => {
      const action = conditional(event('status').eq('vip'))
        .then(emit('vip.route'))
        .else(emit('standard.route'))
        .else(log('info', 'Standard routing applied'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'status' }, operator: 'eq', value: 'vip' },
        ],
        then: [
          { type: 'emit_event', topic: 'vip.route', data: {} },
        ],
        else: [
          { type: 'emit_event', topic: 'standard.route', data: {} },
          { type: 'log', level: 'info', message: 'Standard routing applied' },
        ],
      });
    });
  });

  describe('.and() — multiple conditions (AND)', () => {
    it('builds with two AND conditions', () => {
      const action = conditional(event('amount').gte(100))
        .and(fact('customer:vip').eq(true))
        .then(emit('vip.process'))
        .else(emit('standard.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
          { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true },
        ],
        then: [
          { type: 'emit_event', topic: 'vip.process', data: {} },
        ],
        else: [
          { type: 'emit_event', topic: 'standard.process', data: {} },
        ],
      });
    });

    it('builds with three AND conditions using different source types', () => {
      const action = conditional(event('amount').gte(100))
        .and(fact('customer:vip').eq(true))
        .and(context('region').eq('EU'))
        .then(emit('eu.vip.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
          { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true },
          { source: { type: 'context', key: 'region' }, operator: 'eq', value: 'EU' },
        ],
        then: [
          { type: 'emit_event', topic: 'eu.vip.process', data: {} },
        ],
      });
    });
  });

  describe('.elseIf() — else-if chains', () => {
    it('builds a two-level else-if chain', () => {
      const action = conditional(event('tier').eq('gold'))
        .then(emit('gold.process'))
        .elseIf(event('tier').eq('silver'))
        .then(emit('silver.process'))
        .else(emit('default.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'gold' },
        ],
        then: [
          { type: 'emit_event', topic: 'gold.process', data: {} },
        ],
        else: [{
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'silver' },
          ],
          then: [
            { type: 'emit_event', topic: 'silver.process', data: {} },
          ],
          else: [
            { type: 'emit_event', topic: 'default.process', data: {} },
          ],
        }],
      });
    });

    it('builds a three-level else-if chain', () => {
      const action = conditional(event('tier').eq('gold'))
        .then(emit('gold.process'))
        .elseIf(event('tier').eq('silver'))
        .then(emit('silver.process'))
        .elseIf(event('tier').eq('bronze'))
        .then(emit('bronze.process'))
        .else(emit('default.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'gold' },
        ],
        then: [
          { type: 'emit_event', topic: 'gold.process', data: {} },
        ],
        else: [{
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'silver' },
          ],
          then: [
            { type: 'emit_event', topic: 'silver.process', data: {} },
          ],
          else: [{
            type: 'conditional',
            conditions: [
              { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'bronze' },
            ],
            then: [
              { type: 'emit_event', topic: 'bronze.process', data: {} },
            ],
            else: [
              { type: 'emit_event', topic: 'default.process', data: {} },
            ],
          }],
        }],
      });
    });

    it('builds an else-if chain without trailing else', () => {
      const action = conditional(event('tier').eq('gold'))
        .then(emit('gold.process'))
        .elseIf(event('tier').eq('silver'))
        .then(emit('silver.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'gold' },
        ],
        then: [
          { type: 'emit_event', topic: 'gold.process', data: {} },
        ],
        else: [{
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'silver' },
          ],
          then: [
            { type: 'emit_event', topic: 'silver.process', data: {} },
          ],
        }],
      });
    });

    it('supports .and() on inner elseIf branch', () => {
      const action = conditional(event('tier').eq('gold'))
        .then(emit('gold.process'))
        .elseIf(event('tier').eq('silver'))
        .and(fact('customer:active').eq(true))
        .then(emit('active-silver.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'gold' },
        ],
        then: [
          { type: 'emit_event', topic: 'gold.process', data: {} },
        ],
        else: [{
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'silver' },
            { source: { type: 'fact', pattern: 'customer:active' }, operator: 'eq', value: true },
          ],
          then: [
            { type: 'emit_event', topic: 'active-silver.process', data: {} },
          ],
        }],
      });
    });
  });

  describe('raw objects (non-builder inputs)', () => {
    it('accepts a raw RuleCondition', () => {
      const rawCondition: RuleCondition = {
        source: { type: 'event', field: 'status' },
        operator: 'eq',
        value: 'active',
      };

      const action = conditional(rawCondition)
        .then(emit('active.process'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [rawCondition],
        then: [{ type: 'emit_event', topic: 'active.process', data: {} }],
      });
    });

    it('accepts a raw RuleAction in then/else', () => {
      const rawAction: RuleAction = {
        type: 'emit_event',
        topic: 'raw.action',
        data: { key: 'value' },
      };

      const action = conditional(event('x').eq(1))
        .then(rawAction)
        .else(rawAction)
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'x' }, operator: 'eq', value: 1 },
        ],
        then: [rawAction],
        else: [rawAction],
      });
    });

    it('accepts a raw RuleCondition in .and()', () => {
      const rawCondition: RuleCondition = {
        source: { type: 'fact', pattern: 'flag:enabled' },
        operator: 'eq',
        value: true,
      };

      const action = conditional(event('x').eq(1))
        .and(rawCondition)
        .then(emit('done'))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'x' }, operator: 'eq', value: 1 },
          rawCondition,
        ],
        then: [{ type: 'emit_event', topic: 'done', data: {} }],
      });
    });
  });

  describe('nested conditional builders', () => {
    it('supports a conditional action inside then branch', () => {
      const inner = conditional(fact('priority').eq('high'))
        .then(emit('high-priority.alert'));

      const action = conditional(event('amount').gte(100))
        .then(inner)
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
        ],
        then: [{
          type: 'conditional',
          conditions: [
            { source: { type: 'fact', pattern: 'priority' }, operator: 'eq', value: 'high' },
          ],
          then: [
            { type: 'emit_event', topic: 'high-priority.alert', data: {} },
          ],
        }],
      });
    });

    it('supports a conditional action inside else branch', () => {
      const inner = conditional(fact('fallback').eq(true))
        .then(emit('fallback.process'));

      const action = conditional(event('amount').gte(100))
        .then(emit('premium.process'))
        .else(inner)
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
        ],
        then: [
          { type: 'emit_event', topic: 'premium.process', data: {} },
        ],
        else: [{
          type: 'conditional',
          conditions: [
            { source: { type: 'fact', pattern: 'fallback' }, operator: 'eq', value: true },
          ],
          then: [
            { type: 'emit_event', topic: 'fallback.process', data: {} },
          ],
        }],
      });
    });
  });

  describe('build validation', () => {
    it('throws when no then actions are provided', () => {
      expect(() => {
        conditional(event('x').eq(1)).build();
      }).toThrow('at least one .then() action is required');
    });

    it('throws when elseIf branch has no then actions', () => {
      expect(() => {
        conditional(event('tier').eq('gold'))
          .then(emit('gold.process'))
          .elseIf(event('tier').eq('silver'))
          .build();
      }).toThrow('at least one .then() action is required');
    });

    it('throws when .else() is called after .elseIf()', () => {
      const builder = conditional(event('x').eq(1))
        .then(emit('a'))
        .elseIf(event('x').eq(2))
        .then(emit('b'));

      // .else() on the outer builder would conflict with elseIf
      // but builder now points to the inner ConditionalBuilder,
      // so calling .else() here adds to the inner builder — which is correct
      expect(() => {
        // To test the guard, we need to call .else() on the outer builder
        // which already has a nestedElseIf set
        const outer = conditional(event('x').eq(1))
          .then(emit('a'));
        // First set up elseIf
        outer.elseIf(event('x').eq(2));
        // Then try .else() on the same outer builder
        outer.else(emit('c'));
      }).toThrow('cannot use .else() after .elseIf()');
    });

    it('throws when .elseIf() is called after .else()', () => {
      expect(() => {
        conditional(event('x').eq(1))
          .then(emit('a'))
          .else(emit('b'))
          .elseIf(event('x').eq(2));
      }).toThrow('cannot use .elseIf() after .else()');
    });
  });

  describe('ConditionalBuilder class export', () => {
    it('is exported and can be used with instanceof', () => {
      const builder = conditional(event('x').eq(1));
      expect(builder).toBeInstanceOf(ConditionalBuilder);
    });
  });

  describe('integration with setFact action', () => {
    it('works with setFact in then/else branches', () => {
      const action = conditional(event('vip').eq(true))
        .then(setFact('discount', 0.2))
        .else(setFact('discount', 0))
        .build();

      expect(action).toEqual({
        type: 'conditional',
        conditions: [
          { source: { type: 'event', field: 'vip' }, operator: 'eq', value: true },
        ],
        then: [
          { type: 'set_fact', key: 'discount', value: 0.2 },
        ],
        else: [
          { type: 'set_fact', key: 'discount', value: 0 },
        ],
      });
    });
  });
});
