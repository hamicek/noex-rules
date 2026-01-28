/**
 * Tagged template literal pro definici pravidel.
 *
 * @example
 * import { rule } from 'noex-rules/dsl';
 *
 * const myRule = rule`
 *   id: order-notification
 *   name: Send Order Notification
 *   priority: 100
 *
 *   WHEN event order.created
 *   IF event.amount >= 100
 *   THEN emit notification.send { orderId: event.orderId }
 * `;
 *
 * @example
 * // S interpolací
 * const topic = 'order.created';
 * const threshold = 100;
 *
 * const myRule = rule`
 *   id: dynamic-rule
 *   WHEN event ${topic}
 *   IF event.amount >= ${threshold}
 *   THEN emit result
 * `;
 */

import type { RuleInput } from '../../types/rule.js';
import { parseRuleTemplate } from './parser.js';

/**
 * Tagged template literal pro definici pravidel.
 *
 * Kombinuje template string s interpolovanými hodnotami
 * a parsuje výsledek do RuleInput objektu.
 *
 * @param strings - Template string části
 * @param values - Interpolované hodnoty
 * @returns RuleInput objekt připravený k registraci
 *
 * @throws {ParseError} Při syntaktické chybě
 * @throws {Error} Při chybějícím povinném poli
 */
export function rule(strings: TemplateStringsArray, ...values: unknown[]): RuleInput {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += String(values[i]);
    }
  }
  return parseRuleTemplate(result);
}
