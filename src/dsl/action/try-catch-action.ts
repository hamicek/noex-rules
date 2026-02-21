import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder } from '../types.js';
import { DslValidationError } from '../helpers/errors.js';

type ActionInput = ActionBuilder | RuleAction;

function resolveAction(input: ActionInput): RuleAction {
  return 'build' in input && typeof (input as ActionBuilder).build === 'function'
    ? (input as ActionBuilder).build()
    : (input as RuleAction);
}

/**
 * Fluent builder for `try_catch` (error handling) actions.
 *
 * Created via the {@link tryCatch} factory function. Wraps a sequence of
 * actions in a try block that stops on first failure, with optional catch
 * and finally branches.
 *
 * The catch block receives the error as a variable (when `.catchAs()` is
 * used) accessible via `var.<name>.message` in refs and interpolation.
 *
 * @example
 * ```typescript
 * tryCatch(
 *   callService('payment', 'charge', [ref('event.amount')]),
 *   setFact('payment:${event.orderId}:status', 'charged'),
 * )
 * .catchAs('err')
 * .catch(
 *   log('error', 'Payment failed: ${var.err.message}'),
 *   setFact('payment:${event.orderId}:status', 'failed'),
 * )
 * .finally(
 *   emit('payment.completed', { orderId: ref('event.orderId') }),
 * )
 * ```
 */
export class TryCatchBuilder implements ActionBuilder {
  private readonly tryActions: RuleAction[] = [];
  private readonly catchActions: RuleAction[] = [];
  private readonly finallyActions: RuleAction[] = [];
  private errorVar: string | undefined;

  /** @internal */
  constructor(tryActions: ActionInput[]) {
    for (const a of tryActions) {
      this.tryActions.push(resolveAction(a));
    }
  }

  /**
   * Sets the variable name for the caught error object.
   *
   * The error is accessible as `var.<name>` in refs and `${var.<name>}` in
   * interpolation. The error object has a `message` property.
   *
   * @param name - Variable name (must be a non-empty string).
   * @returns `this` for chaining.
   */
  catchAs(name: string): this {
    if (!name || typeof name !== 'string') {
      throw new DslValidationError('tryCatch(): .catchAs() requires a non-empty string');
    }
    this.errorVar = name;
    return this;
  }

  /**
   * Adds one or more actions to the catch block.
   *
   * The catch block executes only when an action in the try block fails.
   * Can be called multiple times to add more actions.
   *
   * @param actions - Action builders or raw action objects.
   * @returns `this` for chaining.
   */
  catch(...actions: ActionInput[]): this {
    for (const a of actions) {
      this.catchActions.push(resolveAction(a));
    }
    return this;
  }

  /**
   * Adds one or more actions to the finally block.
   *
   * The finally block always executes regardless of whether the try block
   * succeeded or failed. Can be called multiple times to add more actions.
   *
   * @param actions - Action builders or raw action objects.
   * @returns `this` for chaining.
   */
  finally(...actions: ActionInput[]): this {
    for (const a of actions) {
      this.finallyActions.push(resolveAction(a));
    }
    return this;
  }

  build(): RuleAction {
    if (this.tryActions.length === 0) {
      throw new DslValidationError('tryCatch(): at least one try action is required');
    }
    if (this.catchActions.length === 0 && this.finallyActions.length === 0) {
      throw new DslValidationError('tryCatch(): at least one .catch() or .finally() is required');
    }

    const action: Extract<RuleAction, { type: 'try_catch' }> = {
      type: 'try_catch',
      try: this.tryActions,
    };

    if (this.catchActions.length > 0) {
      action.catch = { actions: this.catchActions };
      if (this.errorVar) {
        action.catch.as = this.errorVar;
      }
    }

    if (this.finallyActions.length > 0) {
      action.finally = this.finallyActions;
    }

    return action;
  }
}

/**
 * Creates a try_catch (error handling) action for use inside a rule's action list.
 *
 * The try block executes actions sequentially and stops on the first failure.
 * If an error occurs and a catch block is defined, recovery actions execute.
 * The finally block always executes regardless of success or failure.
 *
 * @param tryActions - Actions to attempt. At least one is required.
 * @returns A {@link TryCatchBuilder} for fluent configuration.
 *
 * @example
 * ```typescript
 * import { tryCatch, callService, setFact, log, ref } from 'noex-rules/dsl';
 *
 * Rule.create('safe-payment')
 *   .when(onEvent('order.created'))
 *   .then(tryCatch(
 *     callService('payment', 'charge', [ref('event.amount')]),
 *   )
 *   .catchAs('err')
 *   .catch(
 *     log('error', 'Charge failed: ${var.err.message}'),
 *     setFact('order:${event.orderId}:status', 'payment-failed'),
 *   ))
 *   .build();
 * ```
 */
export function tryCatch(...tryActions: ActionInput[]): TryCatchBuilder {
  return new TryCatchBuilder(tryActions);
}
