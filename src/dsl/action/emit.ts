import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder } from '../types.js';
import { normalizeRefData } from '../helpers/ref.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/** @internal */
class EmitBuilder implements ActionBuilder {
  constructor(
    private readonly topic: string,
    private readonly data: Record<string, unknown>
  ) {}

  /** @returns A `RuleAction` of type `'emit_event'`. */
  build(): RuleAction {
    return {
      type: 'emit_event',
      topic: this.topic,
      data: normalizeRefData(this.data),
    };
  }
}

/**
 * Creates an action that emits a new event when the rule fires.
 *
 * @param topic - Topic for the emitted event.
 * @param data  - Event payload (values may be {@link ref} for dynamic resolution).
 * @returns An {@link ActionBuilder} for use with {@link RuleBuilder.then}.
 *
 * @example
 * ```typescript
 * emit('notification.send', {
 *   orderId: ref('event.orderId'),
 *   message: 'Order received!'
 * })
 * ```
 */
export function emit(
  topic: string,
  data: Record<string, unknown> = {}
): ActionBuilder {
  requireNonEmptyString(topic, 'emit() topic');
  return new EmitBuilder(topic, data);
}
