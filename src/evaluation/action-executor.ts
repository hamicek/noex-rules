import type { RuleAction, ActionResult } from '../types/action.js';
import type { Event } from '../types/event.js';
import type { FactStore } from '../core/fact-store.js';
import type { TimerManager } from '../core/timer-manager.js';
import { generateId } from '../utils/id-generator.js';
import { interpolate, resolve, resolveObject, type InterpolationContext } from '../utils/interpolation.js';

export interface ExecutionContext extends InterpolationContext {
  correlationId?: string;
}

export type EventEmitter = (topic: string, event: Event) => void | Promise<void>;

/**
 * Spouštění akcí s podporou referencí a interpolace.
 */
export class ActionExecutor {
  constructor(
    private factStore: FactStore,
    private timerManager: TimerManager,
    private emitEvent: EventEmitter,
    private services: Map<string, unknown> = new Map()
  ) {}

  /**
   * Spustí všechny akce.
   */
  async execute(actions: RuleAction[], context: ExecutionContext): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      try {
        const result = await this.executeAction(action, context);
        results.push({ action, success: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ action, success: false, error: message });
      }
    }

    return results;
  }

  private async executeAction(action: RuleAction, ctx: ExecutionContext): Promise<unknown> {
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
    }
  }
}
