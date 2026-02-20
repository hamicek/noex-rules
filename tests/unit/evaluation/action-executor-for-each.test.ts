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
import type { RuleAction, ForEachActionResult, ConditionalActionResult } from '../../../src/types/action';
import type {
  ActionStartedInfo,
  ActionCompletedInfo,
  ActionFailedInfo
} from '../../../src/debugging/types';

describe('ActionExecutor — for_each actions', () => {
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
        data: {
          items: [
            { id: 'a', name: 'Alpha', amount: 100 },
            { id: 'b', name: 'Beta', amount: 200 },
            { id: 'c', name: 'Gamma', amount: 50 },
          ]
        }
      },
      facts: factStore,
      variables: new Map()
    };
  });

  // ─── basic iteration ────────────────────────────────────────────────────

  describe('basic iteration', () => {
    it('iterates over a literal array', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: ['x', 'y', 'z'],
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'last', value: { ref: 'var.item' } }
          ]
        }
      ];

      const results = await executor.execute(actions, context);
      expect(results[0]!.success).toBe(true);

      const forEach = results[0]!.result as ForEachActionResult;
      expect(forEach.iterations).toBe(3);
      expect(forEach.results).toHaveLength(3);
      expect(factStore.get('last')?.value).toBe('z');
    });

    it('iterates over a ref-resolved collection', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: { ref: 'event.items' },
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'processed:${var.item.id}', value: { ref: 'var.item.name' } }
          ]
        }
      ];

      const results = await executor.execute(actions, context);
      const forEach = results[0]!.result as ForEachActionResult;

      expect(forEach.iterations).toBe(3);
      expect(factStore.get('processed:a')?.value).toBe('Alpha');
      expect(factStore.get('processed:b')?.value).toBe('Beta');
      expect(factStore.get('processed:c')?.value).toBe('Gamma');
    });

    it('executes multiple body actions per iteration', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: { ref: 'event.items' },
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'name:${var.item.id}', value: { ref: 'var.item.name' } },
            { type: 'emit_event', topic: 'item.processed', data: { id: { ref: 'var.item.id' } } }
          ]
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('name:a')?.value).toBe('Alpha');
      expect(factStore.get('name:b')?.value).toBe('Beta');
      expect(factStore.get('name:c')?.value).toBe('Gamma');
      expect(emittedEvents).toHaveLength(3);
    });
  });

  // ─── index variable ──────────────────────────────────────────────────────

  describe('index variable', () => {
    it('exposes 0-based index as var.<name>_index', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: ['a', 'b', 'c'],
          as: 'letter',
          actions: [
            { type: 'set_fact', key: 'idx:${var.letter}', value: { ref: 'var.letter_index' } }
          ]
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('idx:a')?.value).toBe(0);
      expect(factStore.get('idx:b')?.value).toBe(1);
      expect(factStore.get('idx:c')?.value).toBe(2);
    });
  });

  // ─── empty collection ──────────────────────────────────────────────────

  describe('empty collection', () => {
    it('produces zero iterations for empty array', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: [],
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'should-not-exist', value: true }
          ]
        }
      ];

      const results = await executor.execute(actions, context);
      const forEach = results[0]!.result as ForEachActionResult;

      expect(forEach.iterations).toBe(0);
      expect(forEach.results).toEqual([]);
      expect(factStore.get('should-not-exist')).toBeUndefined();
    });
  });

  // ─── non-array collection ──────────────────────────────────────────────

  describe('non-array collection', () => {
    it('throws when collection is not an array', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: 'not-an-array',
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'x', value: 1 }
          ]
        }
      ];

      const results = await executor.execute(actions, context);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('collection must be an array');
    });

    it('throws when ref resolves to non-array', async () => {
      context.trigger.data = { notArray: { key: 'value' } };

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: { ref: 'event.notArray' },
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'x', value: 1 }
          ]
        }
      ];

      const results = await executor.execute(actions, context);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('collection must be an array');
    });
  });

  // ─── maxIterations ─────────────────────────────────────────────────────

  describe('maxIterations', () => {
    it('limits iteration count', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: items,
          as: 'n',
          actions: [
            { type: 'set_fact', key: 'count', value: { ref: 'var.n_index' } }
          ],
          maxIterations: 5
        }
      ];

      const results = await executor.execute(actions, context);
      const forEach = results[0]!.result as ForEachActionResult;

      expect(forEach.iterations).toBe(5);
      expect(forEach.results).toHaveLength(5);
      expect(factStore.get('count')?.value).toBe(4); // last index = 4
    });
  });

  // ─── variable scoping ──────────────────────────────────────────────────

  describe('variable scoping', () => {
    it('cleans up loop variables after completion', async () => {
      context.variables.set('preserve', 'keep-me');

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: [1, 2],
          as: 'temp',
          actions: [
            { type: 'log', level: 'debug', message: 'iter' }
          ]
        }
      ];

      await executor.execute(actions, context);

      expect(context.variables.has('temp')).toBe(false);
      expect(context.variables.has('temp_index')).toBe(false);
      expect(context.variables.get('preserve')).toBe('keep-me');
    });

    it('facts set in loop body persist after loop', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: ['a', 'b'],
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'item:${var.item}', value: true }
          ]
        },
        {
          type: 'emit_event',
          topic: 'done',
          data: { a: { ref: 'fact.item:a' }, b: { ref: 'fact.item:b' } }
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('item:a')?.value).toBe(true);
      expect(factStore.get('item:b')?.value).toBe(true);
      expect(emittedEvents).toHaveLength(1);
      const event = emittedEvents[0]!.event as { data: Record<string, unknown> };
      expect(event.data.a).toBe(true);
      expect(event.data.b).toBe(true);
    });
  });

  // ─── nested for_each ──────────────────────────────────────────────────

  describe('nested for_each', () => {
    it('supports nested loops with distinct variable names', async () => {
      context.trigger.data = {
        groups: [
          { name: 'G1', members: ['Alice', 'Bob'] },
          { name: 'G2', members: ['Charlie'] },
        ]
      };

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: { ref: 'event.groups' },
          as: 'group',
          actions: [
            {
              type: 'for_each',
              collection: { ref: 'var.group.members' },
              as: 'member',
              actions: [
                {
                  type: 'set_fact',
                  key: 'member:${var.group.name}:${var.member}',
                  value: true
                }
              ]
            }
          ]
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('member:G1:Alice')?.value).toBe(true);
      expect(factStore.get('member:G1:Bob')?.value).toBe(true);
      expect(factStore.get('member:G2:Charlie')?.value).toBe(true);
    });
  });

  // ─── interaction with conditional ──────────────────────────────────────

  describe('interaction with conditional', () => {
    it('supports conditionals inside for_each body', async () => {
      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: { ref: 'event.items' },
          as: 'item',
          actions: [
            {
              type: 'conditional',
              conditions: [
                { source: { type: 'context', key: 'item.amount' }, operator: 'gte', value: 100 }
              ],
              then: [
                { type: 'set_fact', key: 'high:${var.item.id}', value: true }
              ]
            }
          ]
        }
      ];

      await executor.execute(actions, context);

      // items a (100) and b (200) are >= 100, c (50) is not
      expect(factStore.get('high:a')?.value).toBe(true);
      expect(factStore.get('high:b')?.value).toBe(true);
      expect(factStore.get('high:c')).toBeUndefined();
    });
  });

  // ─── error handling in body ────────────────────────────────────────────

  describe('error handling in body', () => {
    it('continues iterating when one body action fails', async () => {
      services.set('svc', {
        process: (id: string) => {
          if (id === 'b') throw new Error('fail for b');
          return `ok:${id}`;
        }
      });

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: { ref: 'event.items' },
          as: 'item',
          actions: [
            { type: 'call_service', service: 'svc', method: 'process', args: [{ ref: 'var.item.id' }] },
            { type: 'set_fact', key: 'visited:${var.item.id}', value: true }
          ]
        }
      ];

      const results = await executor.execute(actions, context);
      const forEach = results[0]!.result as ForEachActionResult;

      expect(forEach.iterations).toBe(3);

      // First iteration: both actions succeed
      expect(forEach.results[0]![0]!.success).toBe(true);
      expect(forEach.results[0]![1]!.success).toBe(true);

      // Second iteration: call_service fails, but set_fact still runs
      expect(forEach.results[1]![0]!.success).toBe(false);
      expect(forEach.results[1]![1]!.success).toBe(true);

      // Third iteration: both succeed
      expect(forEach.results[2]![0]!.success).toBe(true);
      expect(forEach.results[2]![1]!.success).toBe(true);

      // All items were visited
      expect(factStore.get('visited:a')?.value).toBe(true);
      expect(factStore.get('visited:b')?.value).toBe(true);
      expect(factStore.get('visited:c')?.value).toBe(true);
    });
  });

  // ─── tracing callbacks ────────────────────────────────────────────────

  describe('tracing callbacks', () => {
    it('fires tracing callbacks for outer for_each and inner actions', async () => {
      const started: ActionStartedInfo[] = [];
      const completed: ActionCompletedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => started.push(info),
        onActionCompleted: (info) => completed.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: ['a', 'b'],
          as: 'item',
          actions: [
            { type: 'set_fact', key: 'x', value: { ref: 'var.item' } }
          ]
        }
      ];

      await executor.execute(actions, context, options);

      // Expected: for_each started, then for each iteration: set_fact started + completed, finally for_each completed
      const startedTypes = started.map(s => s.actionType);
      expect(startedTypes).toEqual(['for_each', 'set_fact', 'set_fact']);

      const completedTypes = completed.map(c => c.actionType);
      expect(completedTypes).toEqual(['set_fact', 'set_fact', 'for_each']);
    });

    it('fires onActionFailed for errored action inside loop body', async () => {
      const failed: ActionFailedInfo[] = [];
      const options: ExecutionOptions = {
        onActionFailed: (info) => failed.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: ['a'],
          as: 'item',
          actions: [
            { type: 'call_service', service: 'missing', method: 'x', args: [] }
          ]
        }
      ];

      await executor.execute(actions, context, options);

      expect(failed).toHaveLength(1);
      expect(failed[0]!.actionType).toBe('call_service');
    });
  });

  // ─── buildActionInput ──────────────────────────────────────────────────

  describe('buildActionInput tracing', () => {
    it('reports action metadata in onActionStarted', async () => {
      const started: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => started.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'for_each',
          collection: [1, 2, 3],
          as: 'n',
          actions: [
            { type: 'log', level: 'debug', message: 'hi' }
          ],
          maxIterations: 10
        }
      ];

      await executor.execute(actions, context, options);

      expect(started[0]!.input).toEqual({
        as: 'n',
        actionsCount: 1,
        maxIterations: 10
      });
    });
  });
});
