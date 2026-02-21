import type { RuleAction, ActionResult, ConditionalActionResult, ForEachActionResult, TryCatchActionResult } from '../types/action.js';
import type { Event } from '../types/event.js';
import type { FactStore } from '../core/fact-store.js';
import type { TimerManager } from '../core/timer-manager.js';
import { generateId } from '../utils/id-generator.js';
import { interpolate, resolve, resolveObject, type InterpolationContext } from '../utils/interpolation.js';
import type {
  ActionStartedCallback,
  ActionCompletedCallback,
  ActionFailedCallback
} from '../debugging/types.js';
import type { ConditionEvaluator, EvaluationContext } from './condition-evaluator.js';

export interface ExecutionContext extends InterpolationContext {
  correlationId?: string;
}

export type EventEmitter = (topic: string, event: Event) => void | Promise<void>;

/** Options for action execution with optional tracing callbacks */
export interface ExecutionOptions {
  /** Callback invoked when an action starts execution */
  onActionStarted?: ActionStartedCallback;

  /** Callback invoked when an action completes successfully */
  onActionCompleted?: ActionCompletedCallback;

  /** Callback invoked when an action fails */
  onActionFailed?: ActionFailedCallback;
}

/**
 * Spouštění akcí s podporou referencí a interpolace.
 */
export class ActionExecutor {
  constructor(
    private factStore: FactStore,
    private timerManager: TimerManager,
    private emitEvent: EventEmitter,
    private services: Map<string, unknown> = new Map(),
    private conditionEvaluator?: ConditionEvaluator
  ) {}

  /**
   * Spustí všechny akce.
   */
  async execute(
    actions: RuleAction[],
    context: ExecutionContext,
    options?: ExecutionOptions
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!;
      const startTime = performance.now();

      options?.onActionStarted?.({
        actionIndex: i,
        actionType: action.type,
        input: this.buildActionInput(action, context)
      });

      try {
        const result = await this.executeAction(action, context, options);
        const durationMs = performance.now() - startTime;

        options?.onActionCompleted?.({
          actionIndex: i,
          actionType: action.type,
          output: result,
          durationMs
        });

        results.push({ action, success: true, result });
      } catch (error) {
        const durationMs = performance.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        options?.onActionFailed?.({
          actionIndex: i,
          actionType: action.type,
          error: message,
          durationMs
        });

        results.push({ action, success: false, error: message });
      }
    }

    return results;
  }

  /**
   * Builds a sanitized input representation for tracing.
   */
  private buildActionInput(action: RuleAction, ctx: ExecutionContext): Record<string, unknown> {
    switch (action.type) {
      case 'set_fact':
        return { key: interpolate(action.key, ctx), value: resolve(action.value, ctx) };
      case 'delete_fact':
        return { key: interpolate(action.key, ctx) };
      case 'emit_event':
        return {
          topic: interpolate(action.topic, ctx),
          data: resolveObject(action.data as Record<string, unknown>, ctx)
        };
      case 'set_timer':
        return {
          name: interpolate(action.timer.name, ctx),
          duration: action.timer.duration,
          onExpire: {
            topic: interpolate(action.timer.onExpire.topic, ctx),
            data: resolveObject(action.timer.onExpire.data as Record<string, unknown>, ctx)
          }
        };
      case 'cancel_timer':
        return { name: interpolate(action.name, ctx) };
      case 'call_service':
        return {
          service: action.service,
          method: action.method,
          args: action.args.map(arg => resolve(arg, ctx))
        };
      case 'log':
        return { level: action.level, message: interpolate(action.message, ctx) };
      case 'conditional':
        return {
          conditionsCount: action.conditions.length,
          thenActionsCount: action.then.length,
          elseActionsCount: action.else?.length ?? 0
        };

      case 'for_each':
        return {
          as: action.as,
          actionsCount: action.actions.length,
          maxIterations: action.maxIterations
        };

      case 'try_catch':
        return {
          tryActionsCount: action.try.length,
          hasCatch: !!action.catch,
          hasFinally: !!action.finally,
        };
    }
  }

  private async executeAction(action: RuleAction, ctx: ExecutionContext, options?: ExecutionOptions): Promise<unknown> {
    switch (action.type) {
      case 'set_fact': {
        const key = interpolate(action.key, ctx);
        const value = resolve(action.value, ctx);
        return this.factStore.set(key, value, 'rule');
      }

      case 'delete_fact': {
        const key = interpolate(action.key, ctx);
        return this.factStore.delete(key);
      }

      case 'emit_event': {
        const event: Event = {
          id: generateId(),
          topic: interpolate(action.topic, ctx),
          data: resolveObject(action.data as Record<string, unknown>, ctx),
          timestamp: Date.now(),
          correlationId: ctx.correlationId,
          source: 'rule'
        };

        await this.emitEvent(event.topic, event);
        return event;
      }

      case 'set_timer': {
        return this.timerManager.setTimer(
          {
            name: interpolate(action.timer.name, ctx),
            duration: action.timer.duration,
            onExpire: {
              topic: interpolate(action.timer.onExpire.topic, ctx),
              data: resolveObject(action.timer.onExpire.data as Record<string, unknown>, ctx)
            },
            repeat: action.timer.repeat
          },
          ctx.correlationId
        );
      }

      case 'cancel_timer': {
        const name = interpolate(action.name, ctx);
        return this.timerManager.cancelTimer(name);
      }

      case 'call_service': {
        const service = this.services.get(action.service);
        if (!service) throw new Error(`Service not found: ${action.service}`);

        const method = (service as Record<string, unknown>)[action.method];
        if (typeof method !== 'function') {
          throw new Error(`Method not found: ${action.service}.${action.method}`);
        }

        const args = action.args.map(arg => resolve(arg, ctx));
        return (method as (...args: unknown[]) => unknown).apply(service, args);
      }

      case 'log': {
        const message = interpolate(action.message, ctx);
        console[action.level](message);
        return message;
      }

      case 'conditional': {
        if (!this.conditionEvaluator) {
          throw new Error('ConditionEvaluator is required for conditional actions');
        }

        const evalContext: EvaluationContext = {
          trigger: ctx.trigger as EvaluationContext['trigger'],
          facts: ctx.facts as FactStore,
          variables: ctx.variables,
          ...(ctx.lookups && { lookups: ctx.lookups }),
        };

        const conditionMet = this.conditionEvaluator.evaluateAll(action.conditions, evalContext);

        if (conditionMet) {
          const results = await this.execute(action.then, ctx, options);
          return { conditionMet: true, branchExecuted: 'then', results } satisfies ConditionalActionResult;
        }

        if (action.else) {
          const results = await this.execute(action.else, ctx, options);
          return { conditionMet: false, branchExecuted: 'else', results } satisfies ConditionalActionResult;
        }

        return { conditionMet: false, branchExecuted: 'none', results: [] } satisfies ConditionalActionResult;
      }

      case 'for_each': {
        const raw = resolve(action.collection, ctx);
        if (!Array.isArray(raw)) {
          throw new Error(`for_each: collection must be an array, got ${typeof raw}`);
        }

        const limit = action.maxIterations ?? 1000;
        const allResults: ActionResult[][] = [];
        const count = Math.min(raw.length, limit);

        for (let idx = 0; idx < count; idx++) {
          ctx.variables.set(action.as, raw[idx]);
          ctx.variables.set(`${action.as}_index`, idx);

          const iterResults = await this.execute(action.actions, ctx, options);
          allResults.push(iterResults);
        }

        ctx.variables.delete(action.as);
        ctx.variables.delete(`${action.as}_index`);

        return { iterations: count, results: allResults } satisfies ForEachActionResult;
      }

      case 'try_catch': {
        const tryResults: ActionResult[] = [];
        let caughtError: string | undefined;

        // Try block — stop on first failure
        for (let idx = 0; idx < action.try.length; idx++) {
          const tryAction = action.try[idx]!;
          const startTime = performance.now();

          options?.onActionStarted?.({
            actionIndex: idx,
            actionType: tryAction.type,
            input: this.buildActionInput(tryAction, ctx)
          });

          try {
            const result = await this.executeAction(tryAction, ctx, options);
            const durationMs = performance.now() - startTime;

            options?.onActionCompleted?.({
              actionIndex: idx,
              actionType: tryAction.type,
              output: result,
              durationMs
            });

            tryResults.push({ action: tryAction, success: true, result });
          } catch (error) {
            const durationMs = performance.now() - startTime;
            const message = error instanceof Error ? error.message : String(error);

            options?.onActionFailed?.({
              actionIndex: idx,
              actionType: tryAction.type,
              error: message,
              durationMs
            });

            tryResults.push({ action: tryAction, success: false, error: message });
            caughtError = message;
            break;
          }
        }

        // Catch block — only when try failed and catch is defined
        let catchResults: ActionResult[] | undefined;
        if (caughtError !== undefined && action.catch) {
          if (action.catch.as) {
            ctx.variables.set(action.catch.as, { message: caughtError });
          }
          catchResults = await this.execute(action.catch.actions, ctx, options);
          if (action.catch.as) {
            ctx.variables.delete(action.catch.as);
          }
        }

        // Finally block — always runs
        let finallyResults: ActionResult[] | undefined;
        if (action.finally) {
          finallyResults = await this.execute(action.finally, ctx, options);
        }

        return {
          branchExecuted: caughtError !== undefined ? 'catch' : 'try',
          error: caughtError,
          tryResults,
          catchResults,
          finallyResults,
        } satisfies TryCatchActionResult;
      }
    }
  }
}
