import { SourceExpr } from './operators.js';

/**
 * Vytvoří source expression pro pole z triggering eventu.
 *
 * @example
 * event('amount').gte(100)
 * event('status').eq('completed')
 * event('items').contains('SKU-123')
 *
 * @param field - Cesta k poli v datech eventu (podporuje tečkovou notaci)
 */
export function event(field: string): SourceExpr {
  return new SourceExpr({ type: 'event', field });
}

/**
 * Vytvoří source expression pro hodnotu faktu.
 *
 * @example
 * fact('customer:123:vip').eq(true)
 * fact('order:${event.orderId}:total').gte(1000)
 *
 * @param pattern - Klíč faktu (podporuje interpolaci)
 */
export function fact(pattern: string): SourceExpr {
  return new SourceExpr({ type: 'fact', pattern });
}

/**
 * Vytvoří source expression pro kontextovou proměnnou.
 *
 * @example
 * context('currentUser').exists()
 * context('threshold').lte(ref('event.amount'))
 *
 * @param key - Název kontextové proměnné
 */
export function context(key: string): SourceExpr {
  return new SourceExpr({ type: 'context', key });
}
