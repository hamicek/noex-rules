import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';

describe('Engine — for_each Actions Integration', () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'for-each-test' });
  });

  afterEach(async () => {
    await engine.stop();
  });

  describe('basic iteration', () => {
    it('iterates over event data array and sets facts', async () => {
      const rule: RuleInput = {
        id: 'process-items',
        name: 'Process Items',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'batch.received' },
        conditions: [],
        actions: [
          {
            type: 'for_each',
            collection: { ref: 'event.items' },
            as: 'item',
            actions: [
              { type: 'set_fact', key: 'item:${var.item.id}:name', value: { ref: 'var.item.name' } }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('batch.received', {
        items: [
          { id: '1', name: 'Widget' },
          { id: '2', name: 'Gadget' },
          { id: '3', name: 'Doohickey' },
        ]
      });

      expect(engine.getFact('item:1:name')).toBe('Widget');
      expect(engine.getFact('item:2:name')).toBe('Gadget');
      expect(engine.getFact('item:3:name')).toBe('Doohickey');
    });
  });

  describe('for_each with conditional', () => {
    it('applies conditional logic per iteration', async () => {
      const rule: RuleInput = {
        id: 'route-orders',
        name: 'Route Orders',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'orders.batch' },
        conditions: [],
        actions: [
          {
            type: 'for_each',
            collection: { ref: 'event.orders' },
            as: 'order',
            actions: [
              {
                type: 'conditional',
                conditions: [
                  { source: { type: 'context', key: 'order.amount' }, operator: 'gte', value: 100 }
                ],
                then: [
                  { type: 'set_fact', key: 'order:${var.order.id}:tier', value: 'premium' }
                ],
                else: [
                  { type: 'set_fact', key: 'order:${var.order.id}:tier', value: 'standard' }
                ]
              }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('orders.batch', {
        orders: [
          { id: 'a', amount: 200 },
          { id: 'b', amount: 50 },
          { id: 'c', amount: 100 },
        ]
      });

      expect(engine.getFact('order:a:tier')).toBe('premium');
      expect(engine.getFact('order:b:tier')).toBe('standard');
      expect(engine.getFact('order:c:tier')).toBe('premium');
    });
  });

  describe('for_each emitting events', () => {
    it('emitted events from loop body trigger other rules', async () => {
      // Rule 1: iterate and emit events
      const producer: RuleInput = {
        id: 'producer',
        name: 'Producer',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'start' },
        conditions: [],
        actions: [
          {
            type: 'for_each',
            collection: { ref: 'event.names' },
            as: 'name',
            actions: [
              { type: 'emit_event', topic: 'greet', data: { name: { ref: 'var.name' } } }
            ]
          }
        ]
      };

      // Rule 2: react to emitted events
      const consumer: RuleInput = {
        id: 'consumer',
        name: 'Consumer',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'greet' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'greeted:${event.name}', value: true }
        ]
      };

      engine.registerRule(producer);
      engine.registerRule(consumer);
      await engine.emit('start', { names: ['Alice', 'Bob'] });

      expect(engine.getFact('greeted:Alice')).toBe(true);
      expect(engine.getFact('greeted:Bob')).toBe(true);
    });
  });

  describe('nested for_each', () => {
    it('handles nested loops in the engine', async () => {
      const rule: RuleInput = {
        id: 'nested-loop',
        name: 'Nested Loop',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'matrix' },
        conditions: [],
        actions: [
          {
            type: 'for_each',
            collection: { ref: 'event.rows' },
            as: 'row',
            actions: [
              {
                type: 'for_each',
                collection: { ref: 'var.row.cells' },
                as: 'cell',
                actions: [
                  { type: 'set_fact', key: 'cell:${var.row.id}:${var.cell}', value: true }
                ]
              }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('matrix', {
        rows: [
          { id: 'r1', cells: ['a', 'b'] },
          { id: 'r2', cells: ['c'] },
        ]
      });

      expect(engine.getFact('cell:r1:a')).toBe(true);
      expect(engine.getFact('cell:r1:b')).toBe(true);
      expect(engine.getFact('cell:r2:c')).toBe(true);
    });
  });

  describe('empty collection', () => {
    it('does nothing when collection is empty', async () => {
      const rule: RuleInput = {
        id: 'empty-loop',
        name: 'Empty Loop',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'empty' },
        conditions: [],
        actions: [
          {
            type: 'for_each',
            collection: { ref: 'event.items' },
            as: 'item',
            actions: [
              { type: 'set_fact', key: 'should-not-exist', value: true }
            ]
          },
          { type: 'set_fact', key: 'after-loop', value: 'done' }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('empty', { items: [] });

      expect(engine.getFact('should-not-exist')).toBeUndefined();
      expect(engine.getFact('after-loop')).toBe('done');
    });
  });

  describe('maxIterations safety', () => {
    it('respects maxIterations limit', async () => {
      const rule: RuleInput = {
        id: 'limited-loop',
        name: 'Limited Loop',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'big' },
        conditions: [],
        actions: [
          {
            type: 'for_each',
            collection: { ref: 'event.numbers' },
            as: 'n',
            actions: [
              { type: 'set_fact', key: 'count', value: { ref: 'var.n_index' } }
            ],
            maxIterations: 3
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('big', { numbers: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] });

      // Should only process first 3
      expect(engine.getFact('count')).toBe(2); // last index = 2
    });
  });
});
