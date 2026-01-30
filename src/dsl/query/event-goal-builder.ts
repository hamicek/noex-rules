import type { EventGoal } from '../../types/backward.js';
import type { GoalBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Fluent builder for backward chaining event goals.
 *
 * An event goal asks: "Can this event be emitted by some rule chain?"
 *
 * @example
 * ```typescript
 * eventGoal('order.completed')
 *
 * const result = engine.query(eventGoal('order.completed'));
 * ```
 */
export class EventGoalBuilder implements GoalBuilder {
  private readonly topic: string;

  constructor(topic: string) {
    this.topic = topic;
  }

  build(): EventGoal {
    return { type: 'event', topic: this.topic };
  }
}

/**
 * Creates an {@link EventGoalBuilder} for a backward chaining event goal.
 *
 * @param topic - The event topic to query.
 * @returns An {@link EventGoalBuilder}.
 *
 * @example
 * ```typescript
 * eventGoal('order.completed')
 * eventGoal('notification.sent')
 *
 * const result = engine.query(eventGoal('order.completed'));
 * ```
 */
export function eventGoal(topic: string): EventGoalBuilder {
  requireNonEmptyString(topic, 'eventGoal() topic');
  return new EventGoalBuilder(topic);
}
