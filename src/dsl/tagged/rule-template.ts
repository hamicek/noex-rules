/**
 * Tagged template literal for defining rules in a compact DSL syntax.
 *
 * @example
 * ```typescript
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
 * ```
 *
 * @example
 * ```typescript
 * // With interpolation
 * const topic = 'order.created';
 * const threshold = 100;
 *
 * const myRule = rule`
 *   id: dynamic-rule
 *   WHEN event ${topic}
 *   IF event.amount >= ${threshold}
 *   THEN emit result
 * `;
 * ```
 *
 * @module
 */

import type { RuleInput } from '../../types/rule.js';
import { parseRuleTemplate } from './parser.js';

/**
 * Tagged template literal that parses a rule definition string into
 * a `RuleInput` object ready for engine registration.
 *
 * Interpolated values are stringified and spliced into the template
 * before parsing.
 *
 * @param strings - Static template string segments.
 * @param values  - Interpolated values.
 * @returns A validated `RuleInput` object.
 *
 * @throws {ParseError} On syntax errors.
 * @throws {Error} If required fields (id, WHEN, THEN) are missing.
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
