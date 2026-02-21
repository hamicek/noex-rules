import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';

describe('Engine — try_catch Actions Integration', () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'try-catch-test' });
  });

  afterEach(async () => {
    await engine.stop();
  });

  describe('successful try block', () => {
    it('executes try actions when no error occurs', async () => {
      const rule: RuleInput = {
        id: 'safe-op',
        name: 'Safe Operation',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'process' },
        conditions: [],
        actions: [
          {
            type: 'try_catch',
            try: [
              { type: 'set_fact', key: 'step1', value: 'done' },
              { type: 'set_fact', key: 'step2', value: 'done' },
            ],
            catch: {
              actions: [{ type: 'set_fact', key: 'error_occurred', value: true }]
            }
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('process', {});

      expect(engine.getFact('step1')).toBe('done');
      expect(engine.getFact('step2')).toBe('done');
      expect(engine.getFact('error_occurred')).toBeUndefined();
    });
  });

  describe('error handling with catch', () => {
    it('catches service errors and executes recovery actions', async () => {
      engine = await RuleEngine.start({
        name: 'try-catch-svc-test',
        services: {
          payment: {
            charge: () => { throw new Error('insufficient funds'); }
          }
        }
      });

      const rule: RuleInput = {
        id: 'safe-payment',
        name: 'Safe Payment',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.pay' },
        conditions: [],
        actions: [
          {
            type: 'try_catch',
            try: [
              { type: 'call_service', service: 'payment', method: 'charge', args: [{ ref: 'event.amount' }] },
              { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'paid' },
            ],
            catch: {
              as: 'err',
              actions: [
                { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'payment-failed' },
              ]
            }
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.pay', { orderId: 'A1', amount: 100 });

      expect(engine.getFact('order:A1:status')).toBe('payment-failed');
    });
  });

  describe('finally block', () => {
    it('always executes finally regardless of success', async () => {
      const rule: RuleInput = {
        id: 'with-cleanup',
        name: 'With Cleanup',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'work' },
        conditions: [],
        actions: [
          {
            type: 'try_catch',
            try: [
              { type: 'set_fact', key: 'result', value: 'ok' },
            ],
            catch: {
              actions: [{ type: 'set_fact', key: 'result', value: 'err' }]
            },
            finally: [
              { type: 'set_fact', key: 'finalized', value: true }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('work', {});

      expect(engine.getFact('result')).toBe('ok');
      expect(engine.getFact('finalized')).toBe(true);
    });

    it('executes finally after catch', async () => {
      engine = await RuleEngine.start({
        name: 'try-catch-finally-test',
        services: {
          svc: { boom: () => { throw new Error('kaboom'); } }
        }
      });

      const rule: RuleInput = {
        id: 'full-try-catch-finally',
        name: 'Full Try/Catch/Finally',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'risky' },
        conditions: [],
        actions: [
          {
            type: 'try_catch',
            try: [
              { type: 'call_service', service: 'svc', method: 'boom', args: [] },
            ],
            catch: {
              actions: [{ type: 'set_fact', key: 'caught', value: true }]
            },
            finally: [
              { type: 'set_fact', key: 'cleaned', value: true }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('risky', {});

      expect(engine.getFact('caught')).toBe(true);
      expect(engine.getFact('cleaned')).toBe(true);
    });
  });

  describe('try_catch inside for_each', () => {
    it('handles errors per iteration independently', async () => {
      engine = await RuleEngine.start({
        name: 'foreach-trycatch-test',
        services: {
          processor: {
            run: (id: string) => {
              if (id === '2') throw new Error(`failed for ${id}`);
              return `ok:${id}`;
            }
          }
        }
      });

      const rule: RuleInput = {
        id: 'batch-safe',
        name: 'Batch Safe Processing',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'batch' },
        conditions: [],
        actions: [
          {
            type: 'for_each',
            collection: { ref: 'event.items' },
            as: 'item',
            actions: [
              {
                type: 'try_catch',
                try: [
                  { type: 'call_service', service: 'processor', method: 'run', args: [{ ref: 'var.item' }] },
                  { type: 'set_fact', key: 'item:${var.item}:status', value: 'ok' },
                ],
                catch: {
                  actions: [
                    { type: 'set_fact', key: 'item:${var.item}:status', value: 'failed' },
                  ]
                }
              }
            ]
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('batch', { items: ['1', '2', '3'] });

      expect(engine.getFact('item:1:status')).toBe('ok');
      expect(engine.getFact('item:2:status')).toBe('failed');
      expect(engine.getFact('item:3:status')).toBe('ok');
    });
  });

  describe('chained actions after try_catch', () => {
    it('continues with actions after try_catch completes', async () => {
      const rule: RuleInput = {
        id: 'chain-after',
        name: 'Chain After',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'go' },
        conditions: [],
        actions: [
          {
            type: 'try_catch',
            try: [{ type: 'set_fact', key: 'a', value: 1 }],
            catch: { actions: [{ type: 'log', level: 'error', message: 'err' }] },
          },
          { type: 'set_fact', key: 'b', value: 2 },
        ]
      };

      engine.registerRule(rule);
      await engine.emit('go', {});

      expect(engine.getFact('a')).toBe(1);
      expect(engine.getFact('b')).toBe(2);
    });
  });

  describe('events emitted from try_catch trigger other rules', () => {
    it('emitted events from catch block trigger downstream rules', async () => {
      engine = await RuleEngine.start({
        name: 'cascade-test',
        services: {
          svc: { fail: () => { throw new Error('boom'); } }
        }
      });

      const mainRule: RuleInput = {
        id: 'main-rule',
        name: 'Main Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'start' },
        conditions: [],
        actions: [
          {
            type: 'try_catch',
            try: [
              { type: 'call_service', service: 'svc', method: 'fail', args: [] },
            ],
            catch: {
              actions: [
                { type: 'emit_event', topic: 'error.occurred', data: { source: 'main-rule' } },
              ]
            }
          }
        ]
      };

      const errorHandler: RuleInput = {
        id: 'error-handler',
        name: 'Error Handler',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'error.occurred' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'error:handled:${event.source}', value: true },
        ]
      };

      engine.registerRule(mainRule);
      engine.registerRule(errorHandler);
      await engine.emit('start', {});

      expect(engine.getFact('error:handled:main-rule')).toBe(true);
    });
  });
});
