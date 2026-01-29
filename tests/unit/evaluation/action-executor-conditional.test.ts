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
import type { RuleAction, ConditionalActionResult } from '../../../src/types/action';
import type {
  ActionStartedInfo,
  ActionCompletedInfo,
  ActionFailedInfo
} from '../../../src/debugging/types';

describe('ActionExecutor — conditional actions', () => {
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
        data: { amount: 200, tier: 'gold' }
      },
      facts: factStore,
      variables: new Map()
    };
  });

  // ─── then branch ──────────────────────────────────────────────────────────

  describe('then branch', () => {
    it('executes then branch when condition is met', async () => {
      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'set_fact', key: 'routed', value: 'premium' }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      const conditional = results[0]!.result as ConditionalActionResult;
      expect(conditional.conditionMet).toBe(true);
      expect(conditional.branchExecuted).toBe('then');
      expect(conditional.results).toHaveLength(1);
      expect(conditional.results[0]!.success).toBe(true);
      expect(factStore.get('routed')?.value).toBe('premium');
    });

    it('executes multiple then actions in order', async () => {
      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'set_fact', key: 'step', value: 'first' },
            { type: 'set_fact', key: 'step', value: 'second' }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      const conditional = results[0]!.result as ConditionalActionResult;
      expect(conditional.results).toHaveLength(2);
      expect(factStore.get('step')?.value).toBe('second');
    });
  });

  // ─── else branch ──────────────────────────────────────────────────────────

  describe('else branch', () => {
    it('executes else branch when condition is not met', async () => {
      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 500 }
          ],
          then: [
            { type: 'set_fact', key: 'routed', value: 'premium' }
          ],
          else: [
            { type: 'set_fact', key: 'routed', value: 'standard' }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      const conditional = results[0]!.result as ConditionalActionResult;
      expect(conditional.conditionMet).toBe(false);
      expect(conditional.branchExecuted).toBe('else');
      expect(conditional.results).toHaveLength(1);
      expect(factStore.get('routed')?.value).toBe('standard');
    });
  });

  // ─── no else, condition not met ───────────────────────────────────────────

  describe('no else, condition not met', () => {
    it('returns branchExecuted "none" when condition not met and no else', async () => {
      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 9999 }
          ],
          then: [
            { type: 'set_fact', key: 'should-not-exist', value: true }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      const conditional = results[0]!.result as ConditionalActionResult;
      expect(conditional.conditionMet).toBe(false);
      expect(conditional.branchExecuted).toBe('none');
      expect(conditional.results).toEqual([]);
      expect(factStore.get('should-not-exist')).toBeUndefined();
    });
  });

  // ─── multiple conditions (AND logic) ──────────────────────────────────────

  describe('multiple conditions (AND)', () => {
    it('requires all conditions to be met', async () => {
      factStore.set('customer:vip', true);

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
            { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true }
          ],
          then: [
            { type: 'set_fact', key: 'route', value: 'vip' }
          ],
          else: [
            { type: 'set_fact', key: 'route', value: 'standard' }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      const conditional = results[0]!.result as ConditionalActionResult;
      expect(conditional.conditionMet).toBe(true);
      expect(conditional.branchExecuted).toBe('then');
      expect(factStore.get('route')?.value).toBe('vip');
    });

    it('falls to else when one condition fails', async () => {
      factStore.set('customer:vip', false);

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
            { source: { type: 'fact', pattern: 'customer:vip' }, operator: 'eq', value: true }
          ],
          then: [
            { type: 'set_fact', key: 'route', value: 'vip' }
          ],
          else: [
            { type: 'set_fact', key: 'route', value: 'standard' }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      const conditional = results[0]!.result as ConditionalActionResult;
      expect(conditional.conditionMet).toBe(false);
      expect(factStore.get('route')?.value).toBe('standard');
    });
  });

  // ─── nested conditionals ─────────────────────────────────────────────────

  describe('nested conditionals', () => {
    it('evaluates nested conditional in then branch', async () => {
      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            {
              type: 'conditional',
              conditions: [
                { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'gold' }
              ],
              then: [
                { type: 'set_fact', key: 'level', value: 'gold-premium' }
              ],
              else: [
                { type: 'set_fact', key: 'level', value: 'regular-premium' }
              ]
            }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      const outer = results[0]!.result as ConditionalActionResult;
      expect(outer.conditionMet).toBe(true);
      expect(outer.branchExecuted).toBe('then');

      const inner = outer.results[0]!.result as ConditionalActionResult;
      expect(inner.conditionMet).toBe(true);
      expect(inner.branchExecuted).toBe('then');
      expect(factStore.get('level')?.value).toBe('gold-premium');
    });

    it('evaluates nested conditional in else branch', async () => {
      context.trigger.data = { amount: 50, tier: 'silver' };

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'set_fact', key: 'level', value: 'premium' }
          ],
          else: [
            {
              type: 'conditional',
              conditions: [
                { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'silver' }
              ],
              then: [
                { type: 'set_fact', key: 'level', value: 'silver-standard' }
              ],
              else: [
                { type: 'set_fact', key: 'level', value: 'basic' }
              ]
            }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      const outer = results[0]!.result as ConditionalActionResult;
      expect(outer.conditionMet).toBe(false);
      expect(outer.branchExecuted).toBe('else');

      const inner = outer.results[0]!.result as ConditionalActionResult;
      expect(inner.conditionMet).toBe(true);
      expect(factStore.get('level')?.value).toBe('silver-standard');
    });
  });

  // ─── tracing callbacks ────────────────────────────────────────────────────

  describe('tracing callbacks', () => {
    it('fires tracing callbacks for outer conditional and inner branch actions', async () => {
      const started: ActionStartedInfo[] = [];
      const completed: ActionCompletedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => started.push(info),
        onActionCompleted: (info) => completed.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'set_fact', key: 'traced', value: true }
          ]
        }
      ];

      await executor.execute(actions, context, options);

      // Outer conditional: started + completed
      expect(started[0]!.actionType).toBe('conditional');
      expect(started[0]!.actionIndex).toBe(0);
      expect(started[0]!.input).toEqual({
        conditionsCount: 1,
        thenActionsCount: 1,
        elseActionsCount: 0
      });

      // Inner set_fact: started + completed (from recursive execute)
      expect(started[1]!.actionType).toBe('set_fact');
      expect(started[1]!.actionIndex).toBe(0);

      expect(completed).toHaveLength(2);
      // Inner action completes first (before the outer conditional returns)
      expect(completed[0]!.actionType).toBe('set_fact');
      expect(completed[1]!.actionType).toBe('conditional');
    });

    it('forwards tracing callbacks into nested conditionals', async () => {
      const started: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => started.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            {
              type: 'conditional',
              conditions: [
                { source: { type: 'event', field: 'tier' }, operator: 'eq', value: 'gold' }
              ],
              then: [
                { type: 'set_fact', key: 'deep', value: true }
              ]
            }
          ]
        }
      ];

      await executor.execute(actions, context, options);

      const types = started.map(s => s.actionType);
      expect(types).toEqual(['conditional', 'conditional', 'set_fact']);
    });
  });

  // ─── error in branch ─────────────────────────────────────────────────────

  describe('error handling in branches', () => {
    it('captures error from action within then branch', async () => {
      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'call_service', service: 'missing', method: 'noop', args: [] }
          ]
        }
      ];

      const results = await executor.execute(actions, context);

      // The conditional action itself succeeds (it ran to completion)
      const outerResult = results[0]!;
      expect(outerResult.success).toBe(true);
      const conditional = outerResult.result as ConditionalActionResult;
      expect(conditional.branchExecuted).toBe('then');
      // The inner action failed
      expect(conditional.results[0]!.success).toBe(false);
      expect(conditional.results[0]!.error).toBe('Service not found: missing');
    });

    it('fires onActionFailed for errored action inside branch', async () => {
      const failed: ActionFailedInfo[] = [];
      const options: ExecutionOptions = {
        onActionFailed: (info) => failed.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'call_service', service: 'missing', method: 'x', args: [] }
          ]
        }
      ];

      await executor.execute(actions, context, options);

      expect(failed).toHaveLength(1);
      expect(failed[0]!.actionType).toBe('call_service');
      expect(failed[0]!.error).toBe('Service not found: missing');
    });
  });

  // ─── missing evaluator ────────────────────────────────────────────────────

  describe('missing evaluator', () => {
    it('throws when no ConditionEvaluator is provided', async () => {
      const executorWithoutEvaluator = new ActionExecutor(
        factStore, timerManager, emitEvent, services
      );

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'set_fact', key: 'x', value: 1 }
          ]
        }
      ];

      const results = await executorWithoutEvaluator.execute(actions, context);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBe('ConditionEvaluator is required for conditional actions');
    });
  });

  // ─── context forwarding ───────────────────────────────────────────────────

  describe('context forwarding', () => {
    it('forwards execution context into branches (interpolation works)', async () => {
      context.trigger.data = { orderId: 'ord-42', amount: 200 };

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            {
              type: 'set_fact',
              key: 'order:${event.orderId}:status',
              value: 'premium'
            }
          ]
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('order:ord-42:status')?.value).toBe('premium');
    });

    it('forwards correlationId to emitted events in branches', async () => {
      context.correlationId = 'corr-xyz';

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'emit_event', topic: 'order.routed', data: {} }
          ]
        }
      ];

      await executor.execute(actions, context);

      expect(emittedEvents).toHaveLength(1);
      expect((emittedEvents[0]!.event as { correlationId: string }).correlationId).toBe('corr-xyz');
    });
  });

  // ─── fact mutations in branches ───────────────────────────────────────────

  describe('fact mutations in branches', () => {
    it('facts set in then branch are visible to subsequent actions', async () => {
      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'set_fact', key: 'premium', value: true }
          ]
        },
        {
          type: 'emit_event',
          topic: 'notify',
          data: { isPremium: { ref: 'fact.premium' } }
        }
      ];

      await executor.execute(actions, context);

      expect(emittedEvents).toHaveLength(1);
      expect((emittedEvents[0]!.event as { data: { isPremium: boolean } }).data.isPremium).toBe(true);
    });

    it('facts set in else branch are visible to subsequent actions', async () => {
      context.trigger.data = { amount: 10 };

      const actions: RuleAction[] = [
        {
          type: 'conditional',
          conditions: [
            { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
          ],
          then: [
            { type: 'set_fact', key: 'tier', value: 'premium' }
          ],
          else: [
            { type: 'set_fact', key: 'tier', value: 'basic' }
          ]
        },
        {
          type: 'emit_event',
          topic: 'notify',
          data: { tier: { ref: 'fact.tier' } }
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('tier')?.value).toBe('basic');
      expect((emittedEvents[0]!.event as { data: { tier: string } }).data.tier).toBe('basic');
    });
  });
});
