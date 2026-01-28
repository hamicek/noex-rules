import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder, Ref } from '../types.js';
import { normalizeValue, isRef } from '../helpers/ref.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Builder pro emit_event akci.
 */
class EmitBuilder implements ActionBuilder {
  constructor(
    private readonly topic: string,
    private readonly data: Record<string, unknown>
  ) {}

  build(): RuleAction {
    const normalizedData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(this.data)) {
      normalizedData[key] = isRef(value) ? { ref: (value as Ref).ref } : value;
    }

    return {
      type: 'emit_event',
      topic: this.topic,
      data: normalizedData,
    };
  }
}

/**
 * Vytvoří akci pro emitování eventu.
 *
 * @example
 * emit('notification.send', {
 *   orderId: ref('event.orderId'),
 *   message: 'Order received!'
 * })
 *
 * @param topic - Topic pro emitovaný event
 * @param data - Data eventu (může obsahovat ref() pro dynamické hodnoty)
 */
export function emit(
  topic: string,
  data: Record<string, unknown> = {}
): ActionBuilder {
  requireNonEmptyString(topic, 'emit() topic');
  return new EmitBuilder(topic, data);
}
