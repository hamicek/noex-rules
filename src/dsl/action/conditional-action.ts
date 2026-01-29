import type { RuleAction } from '../../types/action.js';
import type { RuleCondition } from '../../types/condition.js';
import type { ActionBuilder, ConditionBuilder } from '../types.js';
import { DslValidationError } from '../helpers/errors.js';

/**
 * Input accepted wherever a condition is expected — either a fluent
 * {@link ConditionBuilder} (e.g. `event('amount').gte(100)`) or a raw
 * {@link RuleCondition} object.
 */
type ConditionInput = ConditionBuilder | RuleCondition;

/**
 * Input accepted wherever an action is expected — either a fluent
 * {@link ActionBuilder} (e.g. `emit(...)`) or a raw {@link RuleAction} object.
 */
type ActionInput = ActionBuilder | RuleAction;

function resolveCondition(input: ConditionInput): RuleCondition {
  return 'build' in input && typeof (input as ConditionBuilder).build === 'function'
    ? (input as ConditionBuilder).build()
    : (input as RuleCondition);
}

function resolveAction(input: ActionInput): RuleAction {
  return 'build' in input && typeof (input as ActionBuilder).build === 'function'
    ? (input as ActionBuilder).build()
    : (input as RuleAction);
}

/**
 * Fluent builder for conditional (if/then/else) actions.
 *
 * Created via the {@link conditional} factory function.
 * Supports AND-chained conditions, then/else branches, and
 * syntactic-sugar `elseIf` chains that produce nested conditionals.
 *
 * @example
 * ```typescript
 * // Simple if/then
 * conditional(event('amount').gte(100))
 *   .then(emit('premium.process'))
 *
 * // If/then/else
 * conditional(event('amount').gte(100))
 *   .then(emit('premium.process'))
 *   .else(emit('standard.process'))
 *
 * // Multiple AND conditions
 * conditional(event('amount').gte(100))
 *   .and(fact('customer:vip').eq(true))
 *   .then(emit('vip.process'))
 *
 * // Else-if chain
 * conditional(event('tier').eq('gold'))
 *   .then(emit('gold.process'))
 *   .elseIf(event('tier').eq('silver'))
 *   .then(emit('silver.process'))
 *   .else(emit('default.process'))
 * ```
 */
export class ConditionalBuilder implements ActionBuilder {
  private readonly conditions: RuleCondition[] = [];
  private readonly thenActions: RuleAction[] = [];
  private readonly elseActions: RuleAction[] = [];
  private nestedElseIf: ConditionalBuilder | null = null;
  private readonly root: ConditionalBuilder;

  /** @internal */
  constructor(condition: ConditionInput, root?: ConditionalBuilder) {
    this.root = root ?? this;
    this.conditions.push(resolveCondition(condition));
  }

  /**
   * Adds another condition with AND semantics — all conditions must
   * be met for the `then` branch to execute.
   *
   * @param condition - Condition builder or raw condition object.
   * @returns `this` for chaining.
   */
  and(condition: ConditionInput): ConditionalBuilder {
    this.conditions.push(resolveCondition(condition));
    return this;
  }

  /**
   * Adds an action to the `then` branch (executed when all conditions are met).
   * Can be called multiple times to add several actions.
   *
   * @param action - Action builder or raw action object.
   * @returns `this` for chaining.
   */
  then(action: ActionInput): ConditionalBuilder {
    this.thenActions.push(resolveAction(action));
    return this;
  }

  /**
   * Adds an action to the `else` branch (executed when conditions are not met).
   * Can be called multiple times to add several actions.
   *
   * Cannot be used after {@link elseIf} — the else-if chain already defines
   * the else branch.
   *
   * @param action - Action builder or raw action object.
   * @returns `this` for chaining.
   * @throws {DslValidationError} If called after `.elseIf()`.
   */
  else(action: ActionInput): ConditionalBuilder {
    if (this.nestedElseIf) {
      throw new DslValidationError(
        'conditional(): cannot use .else() after .elseIf() — use .else() on the inner branch instead',
      );
    }
    this.elseActions.push(resolveAction(action));
    return this;
  }

  /**
   * Starts an else-if chain by nesting a new conditional action inside
   * the current `else` branch. Returns the **inner** builder so subsequent
   * `.then()` / `.else()` / `.elseIf()` calls apply to it.
   *
   * Calling `.build()` on any builder in the chain always produces
   * the complete tree rooted at the outermost conditional.
   *
   * Cannot be used after {@link else} — explicit else actions already
   * occupy the else branch.
   *
   * @param condition - Condition for the nested branch.
   * @returns The inner {@link ConditionalBuilder} for further chaining.
   * @throws {DslValidationError} If called after `.else()`.
   */
  elseIf(condition: ConditionInput): ConditionalBuilder {
    if (this.elseActions.length > 0) {
      throw new DslValidationError(
        'conditional(): cannot use .elseIf() after .else() — .elseIf() must precede .else()',
      );
    }
    this.nestedElseIf = new ConditionalBuilder(condition, this.root);
    return this.nestedElseIf;
  }

  /**
   * Builds the complete conditional action tree starting from the
   * outermost conditional, regardless of which builder in an elseIf
   * chain this is called on.
   *
   * @returns A `RuleAction` of type `'conditional'`.
   * @throws {DslValidationError} If conditions or then-actions are missing.
   */
  build(): RuleAction {
    return this.root.buildSelf();
  }

  /** @internal Builds this node (and nested elseIf nodes recursively). */
  private buildSelf(): RuleAction {
    if (this.conditions.length === 0) {
      throw new DslValidationError(
        'conditional(): at least one condition is required',
      );
    }

    if (this.thenActions.length === 0) {
      throw new DslValidationError(
        'conditional(): at least one .then() action is required',
      );
    }

    const action: Extract<RuleAction, { type: 'conditional' }> = {
      type: 'conditional',
      conditions: this.conditions,
      then: this.thenActions,
    };

    if (this.nestedElseIf) {
      action.else = [this.nestedElseIf.buildSelf()];
    } else if (this.elseActions.length > 0) {
      action.else = this.elseActions;
    }

    return action;
  }
}

/**
 * Creates a conditional (if/then/else) action for use inside a rule's
 * action list.
 *
 * @param condition - The initial condition (builder or raw object).
 * @returns A {@link ConditionalBuilder} for fluent configuration.
 *
 * @example
 * ```typescript
 * import { conditional, event, fact, emit, ref } from 'noex-rules/dsl';
 *
 * Rule.create('order-routing')
 *   .when(onEvent('order.created'))
 *   .then(conditional(event('amount').gte(100))
 *     .then(emit('premium.process', { orderId: ref('event.orderId') }))
 *     .else(emit('standard.process', { orderId: ref('event.orderId') }))
 *   )
 *   .build();
 * ```
 */
export function conditional(condition: ConditionInput): ConditionalBuilder {
  return new ConditionalBuilder(condition);
}
