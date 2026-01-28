import type { RuleCondition } from '../../types/condition.js';
import type { RuleAction } from '../../types/action.js';
import type { RuleTrigger, RuleInput } from '../../types/rule.js';
import type {
  TriggerBuilder,
  ConditionBuilder,
  ActionBuilder,
  RuleBuildContext,
  BuiltRule,
} from '../types.js';
import { SourceExpr } from '../condition/operators.js';

/**
 * Fluent builder pro vytváření pravidel.
 *
 * @example
 * Rule.create('order-notification')
 *   .name('Send Order Notification')
 *   .priority(100)
 *   .tags('orders', 'notifications')
 *   .when(onEvent('order.created'))
 *   .if(event('amount').gte(100))
 *   .then(emit('notification.send', { orderId: ref('event.orderId') }))
 *   .build();
 */
export class RuleBuilder {
  private ctx: RuleBuildContext;

  private constructor(id: string) {
    this.ctx = {
      id,
      tags: [],
      conditions: [],
      actions: [],
    };
  }

  /**
   * Vytvoří nový rule builder.
   *
   * @param id - Unikátní identifikátor pravidla
   */
  static create(id: string): RuleBuilder {
    if (!id || typeof id !== 'string') {
      throw new Error('Rule ID must be a non-empty string');
    }
    return new RuleBuilder(id);
  }

  /**
   * Nastaví název pravidla.
   */
  name(value: string): this {
    this.ctx.name = value;
    return this;
  }

  /**
   * Nastaví popis pravidla.
   */
  description(value: string): this {
    this.ctx.description = value;
    return this;
  }

  /**
   * Nastaví prioritu pravidla (vyšší = dříve).
   */
  priority(value: number): this {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Priority must be a finite number');
    }
    this.ctx.priority = value;
    return this;
  }

  /**
   * Nastaví, zda je pravidlo aktivní.
   */
  enabled(value: boolean): this {
    this.ctx.enabled = value;
    return this;
  }

  /**
   * Přidá tagy k pravidlu.
   */
  tags(...values: string[]): this {
    this.ctx.tags.push(...values);
    return this;
  }

  /**
   * Nastaví trigger pravidla (kdy se spustí).
   *
   * @param trigger - TriggerBuilder nebo RuleTrigger objekt
   */
  when(trigger: TriggerBuilder | RuleTrigger): this {
    this.ctx.trigger = 'build' in trigger ? trigger.build() : trigger;
    return this;
  }

  /**
   * Přidá podmínku k pravidlu.
   *
   * @param condition - ConditionBuilder (SourceExpr) nebo RuleCondition objekt
   */
  if(condition: ConditionBuilder | RuleCondition): this {
    const built = 'build' in condition ? condition.build() : condition;
    this.ctx.conditions.push(built);
    return this;
  }

  /**
   * Alias pro if() - přidá další podmínku.
   */
  and(condition: ConditionBuilder | RuleCondition): this {
    return this.if(condition);
  }

  /**
   * Přidá akci k pravidlu.
   *
   * @param action - ActionBuilder nebo RuleAction objekt
   */
  then(action: ActionBuilder | RuleAction): this {
    const built = 'build' in action ? action.build() : action;
    this.ctx.actions.push(built);
    return this;
  }

  /**
   * Alias pro then() - přidá další akci.
   */
  also(action: ActionBuilder | RuleAction): this {
    return this.then(action);
  }

  /**
   * Sestaví finální pravidlo.
   *
   * @throws Error pokud chybí povinná pole
   */
  build(): BuiltRule {
    if (!this.ctx.id) {
      throw new Error('Rule ID is required');
    }

    if (!this.ctx.trigger) {
      throw new Error(`Rule "${this.ctx.id}": trigger is required. Use .when()`);
    }

    if (this.ctx.actions.length === 0) {
      throw new Error(`Rule "${this.ctx.id}": at least one action is required. Use .then()`);
    }

    const rule: BuiltRule = {
      id: this.ctx.id,
      name: this.ctx.name ?? this.ctx.id,
      priority: this.ctx.priority ?? 0,
      enabled: this.ctx.enabled ?? true,
      tags: this.ctx.tags,
      trigger: this.ctx.trigger,
      conditions: this.ctx.conditions,
      actions: this.ctx.actions,
    };

    if (this.ctx.description) {
      rule.description = this.ctx.description;
    }

    return rule;
  }
}

/**
 * Entry point pro DSL.
 */
export const Rule = RuleBuilder;
