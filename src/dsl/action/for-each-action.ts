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
 * Fluent builder for `for_each` (iteration) actions.
 *
 * Created via the {@link forEach} factory function. Iterates over a
 * collection and executes a sequence of actions for each item, binding
 * the current item to a named variable accessible via `var.<name>` refs
 * and `${var.<name>}` interpolation. The current index is available as
 * `var.<name>_index`.
 *
 * @example
 * ```typescript
 * forEach(ref('event.items'))
 *   .as('item')
 *   .do(
 *     setFact('processed:${var.item_index}', ref('var.item.name')),
 *     emit('item.processed', { id: ref('var.item.id') })
 *   )
 * ```
 */
export class ForEachBuilder implements ActionBuilder {
  private readonly collection: unknown | { ref: string };
  private itemVar: string | null = null;
  private readonly bodyActions: RuleAction[] = [];
  private limit: number | undefined;

  /** @internal */
  constructor(collection: unknown | { ref: string }) {
    this.collection = collection;
  }

  /**
   * Sets the variable name for the current iteration item.
   *
   * The item is accessible as `var.<name>` in refs and `${var.<name>}` in
   * interpolation. The 0-based index is available as `var.<name>_index`.
   *
   * @param name - Variable name (must be a non-empty string).
   * @returns `this` for chaining.
   */
  as(name: string): this {
    if (!name || typeof name !== 'string') {
      throw new DslValidationError('forEach(): .as() requires a non-empty string');
    }
    this.itemVar = name;
    return this;
  }

  /**
   * Adds one or more actions to the loop body.
   *
   * @param actions - Action builders or raw action objects.
   * @returns `this` for chaining.
   */
  do(...actions: ActionInput[]): this {
    for (const a of actions) {
      this.bodyActions.push(resolveAction(a));
    }
    return this;
  }

  /**
   * Sets a safety limit on the number of iterations.
   * Defaults to 1000 if not specified.
   *
   * @param n - Maximum number of iterations (must be a positive integer).
   * @returns `this` for chaining.
   */
  maxIterations(n: number): this {
    if (!Number.isFinite(n) || n < 1) {
      throw new DslValidationError('forEach(): maxIterations must be a positive integer');
    }
    this.limit = n;
    return this;
  }

  build(): RuleAction {
    if (!this.itemVar) {
      throw new DslValidationError('forEach(): .as() is required');
    }
    if (this.bodyActions.length === 0) {
      throw new DslValidationError('forEach(): at least one .do() action is required');
    }

    const action: Extract<RuleAction, { type: 'for_each' }> = {
      type: 'for_each',
      collection: this.collection,
      as: this.itemVar,
      actions: this.bodyActions,
    };

    if (this.limit !== undefined) {
      action.maxIterations = this.limit;
    }

    return action;
  }
}

/**
 * Creates a for_each (iteration) action for use inside a rule's action list.
 *
 * @param collection - The collection to iterate over. Can be a literal array
 *   or a `{ ref: string }` reference resolved at runtime.
 * @returns A {@link ForEachBuilder} for fluent configuration.
 *
 * @example
 * ```typescript
 * import { forEach, ref, setFact, emit } from 'noex-rules/dsl';
 *
 * Rule.create('process-items')
 *   .when(onEvent('batch.received'))
 *   .then(forEach(ref('event.items'))
 *     .as('item')
 *     .do(
 *       setFact('item:${var.item.id}:status', 'processing'),
 *       emit('item.started', { itemId: ref('var.item.id') })
 *     )
 *   )
 *   .build();
 * ```
 */
export function forEach(collection: unknown | { ref: string }): ForEachBuilder {
  return new ForEachBuilder(collection);
}
