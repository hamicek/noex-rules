import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ActionExecutor,
  type ExecutionContext,
  type EventEmitter,
  type ExecutionOptions
} from '../../../src/evaluation/action-executor';
import { ConditionEvaluator } from '../../../src/evaluation/condition-evaluator';
import { FactStore } from '../../../src/core/fact-store';
import { TimerManager } from '../../../src/core/timer-manager';
import type { RuleAction, TryCatchActionResult } from '../../../src/types/action';
import type {
  ActionStartedInfo,
  ActionCompletedInfo,
  ActionFailedInfo
} from '../../../src/debugging/types';

describe('ActionExecutor — try_catch actions', () => {
  let factStore: FactStore;
  let timerManager: TimerManager;
  let emitEvent: EventEmitter;
  let emittedEvents: Array<{ topic: string; event: unknown }>;
  let services: Map<string, unknown>;
  let conditionEvaluator: ConditionEvaluator;
  let executor: ActionExecutor;
  let context: ExecutionContext;

  beforeEach(async () => {
    factStore = new FactStore();
    timerManager = await TimerManager.start();
    emittedEvents = [];
    emitEvent = (topic, event) => {
      emittedEvents.push({ topic, event });
    };
    services = new Map();
    conditionEvaluator = new ConditionEvaluator();

    executor = new ActionExecutor(factStore, timerManager, emitEvent, services, conditionEvaluator);

    context = {
      trigger: {
        type: 'event',
        data: { orderId: 'ord-1', amount: 250 }
      },
      facts: factStore,
      variables: new Map()
    };
  });

  // ─── try block success ────────────────────────────────────────────────

  describe('try block success', () => {
    it('executes try actions and reports success', async () => {
      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'set_fact', key: 'status', value: 'ok' },
            { type: 'set_fact', key: 'count', value: 1 },
          ],
          catch: { actions: [{ type: 'set_fact', key: 'status', value: 'failed' }] }
        }
      ];

      const results = await executor.execute(actions, context);
      const tc = results[0]!.result as TryCatchActionResult;

      expect(results[0]!.success).toBe(true);
      expect(tc.branchExecuted).toBe('try');
      expect(tc.error).toBeUndefined();
      expect(tc.tryResults).toHaveLength(2);
      expect(tc.tryResults[0]!.success).toBe(true);
      expect(tc.tryResults[1]!.success).toBe(true);
      expect(tc.catchResults).toBeUndefined();
      expect(factStore.get('status')?.value).toBe('ok');
      expect(factStore.get('count')?.value).toBe(1);
    });

    it('does not execute catch when try succeeds', async () => {
      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          catch: { actions: [{ type: 'set_fact', key: 'y', value: 2 }] }
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('x')?.value).toBe(1);
      expect(factStore.get('y')).toBeUndefined();
    });
  });

  // ─── catch block execution ──────────────────────────────────────────

  describe('catch block execution', () => {
    it('stops try block on first error and executes catch', async () => {
      services.set('svc', {
        risky: () => { throw new Error('service unavailable'); }
      });

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'set_fact', key: 'step', value: 'before' },
            { type: 'call_service', service: 'svc', method: 'risky', args: [] },
            { type: 'set_fact', key: 'step', value: 'after' }, // should not execute
          ],
          catch: {
            actions: [{ type: 'set_fact', key: 'recovered', value: true }]
          }
        }
      ];

      const results = await executor.execute(actions, context);
      const tc = results[0]!.result as TryCatchActionResult;

      expect(tc.branchExecuted).toBe('catch');
      expect(tc.error).toBe('service unavailable');
      expect(tc.tryResults).toHaveLength(2); // first success + failed action
      expect(tc.tryResults[0]!.success).toBe(true);
      expect(tc.tryResults[1]!.success).toBe(false);
      expect(tc.catchResults).toHaveLength(1);
      expect(tc.catchResults![0]!.success).toBe(true);

      expect(factStore.get('step')?.value).toBe('before'); // 'after' was never set
      expect(factStore.get('recovered')?.value).toBe(true);
    });

    it('binds error to variable when catchAs is specified', async () => {
      services.set('svc', {
        fail: () => { throw new Error('disk full'); }
      });

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'call_service', service: 'svc', method: 'fail', args: [] },
          ],
          catch: {
            as: 'err',
            actions: [
              { type: 'set_fact', key: 'error_msg', value: { ref: 'var.err.message' } },
            ]
          }
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('error_msg')?.value).toBe('disk full');
    });

    it('cleans up error variable after catch block', async () => {
      services.set('svc', {
        fail: () => { throw new Error('boom'); }
      });

      context.variables.set('preserve', 'keep');

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'call_service', service: 'svc', method: 'fail', args: [] },
          ],
          catch: {
            as: 'err',
            actions: [{ type: 'log', level: 'error', message: 'caught' }]
          }
        }
      ];

      await executor.execute(actions, context);

      expect(context.variables.has('err')).toBe(false);
      expect(context.variables.get('preserve')).toBe('keep');
    });

    it('catch block continues on internal errors (normal execution semantics)', async () => {
      services.set('svc', {
        fail: () => { throw new Error('trigger error'); },
        missing: undefined,
      });

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'call_service', service: 'svc', method: 'fail', args: [] },
          ],
          catch: {
            actions: [
              { type: 'call_service', service: 'nonexistent', method: 'x', args: [] },
              { type: 'set_fact', key: 'catch_ran', value: true },
            ]
          }
        }
      ];

      const results = await executor.execute(actions, context);
      const tc = results[0]!.result as TryCatchActionResult;

      // First catch action fails, but second still runs (normal execute semantics)
      expect(tc.catchResults![0]!.success).toBe(false);
      expect(tc.catchResults![1]!.success).toBe(true);
      expect(factStore.get('catch_ran')?.value).toBe(true);
    });
  });

  // ─── finally block ────────────────────────────────────────────────────

  describe('finally block', () => {
    it('finally executes after successful try', async () => {
      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'status', value: 'ok' }],
          catch: { actions: [{ type: 'set_fact', key: 'status', value: 'err' }] },
          finally: [{ type: 'set_fact', key: 'cleanup', value: true }]
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('status')?.value).toBe('ok');
      expect(factStore.get('cleanup')?.value).toBe(true);
    });

    it('finally executes after catch', async () => {
      services.set('svc', {
        fail: () => { throw new Error('err'); }
      });

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'call_service', service: 'svc', method: 'fail', args: [] },
          ],
          catch: { actions: [{ type: 'set_fact', key: 'caught', value: true }] },
          finally: [{ type: 'set_fact', key: 'finalized', value: true }]
        }
      ];

      const results = await executor.execute(actions, context);
      const tc = results[0]!.result as TryCatchActionResult;

      expect(tc.branchExecuted).toBe('catch');
      expect(tc.finallyResults).toHaveLength(1);
      expect(tc.finallyResults![0]!.success).toBe(true);
      expect(factStore.get('caught')?.value).toBe(true);
      expect(factStore.get('finalized')?.value).toBe(true);
    });

    it('try/finally without catch (error is recorded but finally runs)', async () => {
      services.set('svc', {
        fail: () => { throw new Error('oops'); }
      });

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'call_service', service: 'svc', method: 'fail', args: [] },
          ],
          finally: [{ type: 'set_fact', key: 'cleaned_up', value: true }]
        }
      ];

      const results = await executor.execute(actions, context);
      const tc = results[0]!.result as TryCatchActionResult;

      expect(tc.branchExecuted).toBe('catch');
      expect(tc.error).toBe('oops');
      expect(tc.catchResults).toBeUndefined();
      expect(tc.finallyResults).toHaveLength(1);
      expect(factStore.get('cleaned_up')?.value).toBe(true);
    });

    it('finally errors are recorded but do not change outcome', async () => {
      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'ok', value: true }],
          finally: [
            { type: 'call_service', service: 'nonexistent', method: 'x', args: [] },
            { type: 'set_fact', key: 'final_step', value: true },
          ]
        }
      ];

      const results = await executor.execute(actions, context);
      const tc = results[0]!.result as TryCatchActionResult;

      expect(tc.branchExecuted).toBe('try');
      expect(tc.finallyResults![0]!.success).toBe(false);
      expect(tc.finallyResults![1]!.success).toBe(true);
      expect(factStore.get('ok')?.value).toBe(true);
      expect(factStore.get('final_step')?.value).toBe(true);
    });
  });

  // ─── nesting ──────────────────────────────────────────────────────────

  describe('nesting', () => {
    it('supports nested try_catch', async () => {
      services.set('svc', {
        inner_fail: () => { throw new Error('inner error'); }
      });

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            {
              type: 'try_catch',
              try: [
                { type: 'call_service', service: 'svc', method: 'inner_fail', args: [] },
              ],
              catch: {
                as: 'inner_err',
                actions: [
                  { type: 'set_fact', key: 'inner_caught', value: { ref: 'var.inner_err.message' } },
                ]
              }
            },
            { type: 'set_fact', key: 'outer_continued', value: true },
          ],
          catch: {
            actions: [{ type: 'set_fact', key: 'outer_caught', value: true }]
          }
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('inner_caught')?.value).toBe('inner error');
      expect(factStore.get('outer_continued')?.value).toBe(true);
      expect(factStore.get('outer_caught')).toBeUndefined(); // outer try succeeded
    });

    it('try_catch inside for_each', async () => {
      services.set('svc', {
        process: (id: string) => {
          if (id === 'b') throw new Error(`failed for ${id}`);
          return `ok:${id}`;
        }
      });

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: ['a', 'b', 'c'],
          as: 'item',
          actions: [
            {
              type: 'try_catch',
              try: [
                { type: 'call_service', service: 'svc', method: 'process', args: [{ ref: 'var.item' }] },
                { type: 'set_fact', key: 'processed:${var.item}', value: 'ok' },
              ],
              catch: {
                actions: [
                  { type: 'set_fact', key: 'processed:${var.item}', value: 'failed' },
                ]
              }
            }
          ]
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('processed:a')?.value).toBe('ok');
      expect(factStore.get('processed:b')?.value).toBe('failed');
      expect(factStore.get('processed:c')?.value).toBe('ok');
    });
  });

  // ─── tracing callbacks ────────────────────────────────────────────────

  describe('tracing callbacks', () => {
    it('fires callbacks for try_catch and inner actions', async () => {
      const started: ActionStartedInfo[] = [];
      const completed: ActionCompletedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => started.push(info),
        onActionCompleted: (info) => completed.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'set_fact', key: 'a', value: 1 },
            { type: 'set_fact', key: 'b', value: 2 },
          ],
          catch: { actions: [{ type: 'log', level: 'error', message: 'err' }] },
          finally: [{ type: 'set_fact', key: 'c', value: 3 }]
        }
      ];

      await executor.execute(actions, context, options);

      const startedTypes = started.map(s => s.actionType);
      // try_catch outer, then 2 try actions, then 1 finally action
      expect(startedTypes).toEqual(['try_catch', 'set_fact', 'set_fact', 'set_fact']);

      const completedTypes = completed.map(c => c.actionType);
      expect(completedTypes).toEqual(['set_fact', 'set_fact', 'set_fact', 'try_catch']);
    });

    it('fires onActionFailed for errored action in try block', async () => {
      const failed: ActionFailedInfo[] = [];
      const options: ExecutionOptions = {
        onActionFailed: (info) => failed.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [
            { type: 'call_service', service: 'missing', method: 'x', args: [] },
          ],
          catch: { actions: [{ type: 'log', level: 'error', message: 'handled' }] }
        }
      ];

      await executor.execute(actions, context, options);

      expect(failed).toHaveLength(1);
      expect(failed[0]!.actionType).toBe('call_service');
    });
  });

  // ─── buildActionInput tracing ─────────────────────────────────────────

  describe('buildActionInput tracing', () => {
    it('reports action metadata in onActionStarted', async () => {
      const started: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => started.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'try_catch',
          try: [{ type: 'set_fact', key: 'x', value: 1 }],
          catch: { actions: [{ type: 'log', level: 'error', message: 'err' }] },
          finally: [{ type: 'set_fact', key: 'y', value: 2 }]
        }
      ];

      await executor.execute(actions, context, options);

      expect(started[0]!.input).toEqual({
        tryActionsCount: 1,
        hasCatch: true,
        hasFinally: true,
      });
    });
  });
});
