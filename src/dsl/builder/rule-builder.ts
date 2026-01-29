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
import { DslValidationError } from '../helpers/errors.js';

/**
 * Fluent builder for assembling rule definitions.
 *
 * Use the static {@link RuleBuilder.create} method (also exported as `Rule`)
 * as the entry point, then chain configuration methods and finish with
 * {@link RuleBuilder.build}.
 *
 * @example
 * ```typescript
 * Rule.create('order-notification')
 *   .name('Send Order Notification')
 *   .priority(100)
 *   .tags('orders', 'notifications')
 *   .when(onEvent('order.created'))
 *   .if(event('amount').gte(100))
 *   .then(emit('notification.send', { orderId: ref('event.orderId') }))
 *   .build();
 * ```
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
   * Creates a new rule builder with the given unique identifier.
   *
   * @param id - Unique rule identifier (must be a non-empty string).
   * @returns A fresh {@link RuleBuilder} instance.
   * @throws {DslValidationError} If `id` is empty or not a string.
   */
  static create(id: string): RuleBuilder {
    if (!id || typeof id !== 'string') {
      throw new DslValidationError('Rule ID must be a non-empty string');
    }
    return new RuleBuilder(id);
  }

  /**
   * Sets a human-readable name for the rule.
   *
   * @param value - Display name (defaults to the rule ID if not set).
   * @returns `this` for chaining.
   */
  name(value: string): this {
    this.ctx.name = value;
    return this;
  }

  /**
   * Sets an optional description for the rule.
   *
   * @param value - Free-text description.
   * @returns `this` for chaining.
   */
  description(value: string): this {
    this.ctx.description = value;
    return this;
  }

  /**
   * Sets the evaluation priority (higher value = evaluated sooner).
   *
   * @param value - A finite number (defaults to `0`).
   * @returns `this` for chaining.
   * @throws {DslValidationError} If `value` is not a finite number.
   */
  priority(value: number): this {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DslValidationError('Priority must be a finite number');
    }
    this.ctx.priority = value;
    return this;
  }

  /**
   * Enables or disables the rule.
   *
   * @param value - `true` to enable, `false` to disable (defaults to `true`).
   * @returns `this` for chaining.
   */
  enabled(value: boolean): this {
    this.ctx.enabled = value;
    return this;
  }

  /**
   * Appends one or more tags for categorization / filtering.
   *
   * @param values - Tag strings to add.
   * @returns `this` for chaining.
   */
  tags(...values: string[]): this {
    this.ctx.tags.push(...values);
    return this;
  }

  /**
   * Assigns the rule to a logical group.
   *
   * A rule is active only when both its own `enabled` flag and its group's
   * `enabled` flag are `true`. Omitting this call leaves the rule ungrouped.
   *
   * @param groupId - The ID of the group this rule belongs to.
   * @returns `this` for chaining.
   * @throws {DslValidationError} If `groupId` is not a non-empty string.
   */
  group(groupId: string): this {
    if (!groupId || typeof groupId !== 'string') {
      throw new DslValidationError('Group ID must be a non-empty string');
    }
    this.ctx.group = groupId;
    return this;
  }

  /**
   * Sets the trigger that determines when the rule fires.
   *
   * @param trigger - A {@link TriggerBuilder} (e.g. `onEvent`, `sequence`) or
   *                  a raw `RuleTrigger` object.
   * @returns `this` for chaining.
   */
  when(trigger: TriggerBuilder | RuleTrigger): this {
    this.ctx.trigger = 'build' in trigger ? trigger.build() : trigger;
    return this;
  }

  /**
   * Adds a condition that must be satisfied for the rule to execute.
   *
   * @param condition - A {@link ConditionBuilder} (e.g. `event('x').gte(1)`)
   *                    or a raw `RuleCondition` object.
   * @returns `this` for chaining.
   */
  if(condition: ConditionBuilder | RuleCondition): this {
    const built = 'build' in condition ? condition.build() : condition;
    this.ctx.conditions.push(built);
    return this;
  }

  /**
   * Alias for {@link RuleBuilder.if} — adds another condition (logical AND).
   *
   * @param condition - A {@link ConditionBuilder} or raw `RuleCondition`.
   * @returns `this` for chaining.
   */
  and(condition: ConditionBuilder | RuleCondition): this {
    return this.if(condition);
  }

  /**
   * Adds an action to execute when the rule fires.
   *
   * @param action - An {@link ActionBuilder} (e.g. `emit(...)`) or a raw
   *                 `RuleAction` object.
   * @returns `this` for chaining.
   */
  then(action: ActionBuilder | RuleAction): this {
    const built = 'build' in action ? action.build() : action;
    this.ctx.actions.push(built);
    return this;
  }

  /**
   * Alias for {@link RuleBuilder.then} — adds another action.
   *
   * @param action - An {@link ActionBuilder} or raw `RuleAction`.
   * @returns `this` for chaining.
   */
  also(action: ActionBuilder | RuleAction): this {
    return this.then(action);
  }

  /**
   * Validates the accumulated state and returns the final rule definition.
   *
   * @returns A {@link BuiltRule} ready to be registered with the engine.
   * @throws {DslValidationError} If the rule ID, trigger, or actions are missing.
   */
  build(): BuiltRule {
    if (!this.ctx.id) {
      throw new DslValidationError('Rule ID is required');
    }

    if (!this.ctx.trigger) {
      throw new DslValidationError(`Rule "${this.ctx.id}": trigger is required. Use .when()`);
    }

    if (this.ctx.actions.length === 0) {
      throw new DslValidationError(`Rule "${this.ctx.id}": at least one action is required. Use .then()`);
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

    if (this.ctx.group) {
      rule.group = this.ctx.group;
    }

    return rule;
  }
}

/**
 * Entry-point alias for {@link RuleBuilder}.
 *
 * @example
 * ```typescript
 * const myRule = Rule.create('my-rule')
 *   .when(onEvent('order.created'))
 *   .then(emit('notification.send'))
 *   .build();
 * ```
 */
export const Rule = RuleBuilder;
