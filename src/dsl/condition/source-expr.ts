import { SourceExpr } from './operators.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Creates a {@link SourceExpr} targeting a field from the triggering event.
 *
 * @param field - Dot-notated path to the event data field.
 * @returns A {@link SourceExpr} ready for operator chaining.
 *
 * @example
 * event('amount').gte(100)
 * event('status').eq('completed')
 * event('items').contains('SKU-123')
 */
export function event(field: string): SourceExpr {
  requireNonEmptyString(field, 'event() field');
  return new SourceExpr({ type: 'event', field });
}

/**
 * Creates a {@link SourceExpr} targeting a value from the fact store.
 *
 * @param pattern - Fact key pattern (supports `${}` interpolation at runtime).
 * @returns A {@link SourceExpr} ready for operator chaining.
 *
 * @example
 * fact('customer:123:vip').eq(true)
 * fact('order:${event.orderId}:total').gte(1000)
 */
export function fact(pattern: string): SourceExpr {
  requireNonEmptyString(pattern, 'fact() pattern');
  return new SourceExpr({ type: 'fact', pattern });
}

/**
 * Creates a {@link SourceExpr} targeting a context variable.
 *
 * @param key - Name of the context variable.
 * @returns A {@link SourceExpr} ready for operator chaining.
 *
 * @example
 * context('currentUser').exists()
 * context('threshold').lte(ref('event.amount'))
 */
export function context(key: string): SourceExpr {
  requireNonEmptyString(key, 'context() key');
  return new SourceExpr({ type: 'context', key });
}
