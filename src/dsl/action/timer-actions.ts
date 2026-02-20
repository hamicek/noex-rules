import type { RuleAction } from '../../types/action.js';
import type { TimerConfig } from '../../types/timer.js';
import type { ActionBuilder } from '../types.js';
import { normalizeRefData } from '../helpers/ref.js';
import { requireNonEmptyString, requireDuration, requireCronExpression } from '../helpers/validators.js';
import { DslValidationError } from '../helpers/errors.js';

/**
 * Configuration object for {@link setTimer} when using the options-based overload.
 */
export interface SetTimerOptions {
  /** Unique timer name. */
  name: string;
  /** Duration until expiration (string or milliseconds). Required unless `cron` is set. */
  duration?: string | number;
  /** Event emitted when the timer expires. */
  onExpire: {
    /** Topic of the emitted event. */
    topic: string;
    /** Optional event payload (values may be {@link ref}). */
    data?: Record<string, unknown>;
  };
  /** Optional repeat configuration (mutually exclusive with `cron`). */
  repeat?: {
    /** Interval between repetitions (string or milliseconds). */
    interval: string | number;
    /** Maximum number of repetitions. */
    maxCount?: number;
  };
  /** Cron expression for scheduling (e.g. "0 8 * * MON"). Mutually exclusive with `duration`/`repeat`. */
  cron?: string;
  /** Maximum number of cron firings. Only used with `cron`. */
  maxCount?: number;
}

/** @internal */
class SetTimerBuilder implements ActionBuilder {
  private readonly config: SetTimerOptions;

  constructor(config: SetTimerOptions) {
    requireNonEmptyString(config.name, 'setTimer() config.name');
    requireNonEmptyString(config.onExpire.topic, 'setTimer() config.onExpire.topic');

    if (config.cron && config.duration) {
      throw new DslValidationError('setTimer(): cron and duration are mutually exclusive');
    }
    if (config.cron && config.repeat) {
      throw new DslValidationError('setTimer(): cron and repeat are mutually exclusive');
    }

    if (config.cron) {
      requireCronExpression(config.cron, 'setTimer() config.cron');
    } else {
      if (config.duration === undefined) {
        throw new DslValidationError('setTimer(): either duration or cron must be specified');
      }
      requireDuration(config.duration, 'setTimer() config.duration');
      if (config.repeat) {
        requireDuration(config.repeat.interval, 'setTimer() config.repeat.interval');
      }
    }

    this.config = config;
  }

  build(): RuleAction {
    const timerConfig: TimerConfig = {
      name: this.config.name,
      onExpire: {
        topic: this.config.onExpire.topic,
        data: this.config.onExpire.data ? normalizeRefData(this.config.onExpire.data) : {},
      },
    };

    if (this.config.cron) {
      timerConfig.cron = this.config.cron;
      if (this.config.maxCount !== undefined) {
        timerConfig.maxCount = this.config.maxCount;
      }
    } else {
      timerConfig.duration = this.config.duration;
      if (this.config.repeat) {
        timerConfig.repeat = {
          interval: this.config.repeat.interval,
          maxCount: this.config.repeat.maxCount,
        };
      }
    }

    return {
      type: 'set_timer',
      timer: timerConfig,
    };
  }
}

/** @internal Fluent builder returned by `setTimer(name)`. */
class TimerFluentBuilder implements ActionBuilder {
  private readonly timerName: string;
  private timerDuration?: string | number;
  private cronExpression?: string;
  private cronMaxCount?: number;
  private expireTopic: string = '';
  private expireData: Record<string, unknown> = {};
  private repeatInterval?: string | number;
  private repeatMaxCount?: number;

  constructor(name: string) {
    this.timerName = name;
  }

  /**
   * Sets the duration before the timer expires (mutually exclusive with {@link cron}).
   *
   * @param duration - Duration string (e.g. `"15m"`, `"24h"`) or milliseconds.
   * @returns `this` for chaining.
   */
  after(duration: string | number): TimerFluentBuilder {
    requireDuration(duration, 'setTimer().after() duration');
    this.timerDuration = duration;
    return this;
  }

  /**
   * Sets a cron schedule (mutually exclusive with {@link after} and {@link repeat}).
   *
   * @param expression - Cron expression (e.g. `"0 8 * * MON"`, `"*​/5 * * * *"`).
   * @param maxCount - Optional maximum number of firings.
   * @returns `this` for chaining.
   */
  cron(expression: string, maxCount?: number): TimerFluentBuilder {
    requireCronExpression(expression, 'setTimer().cron() expression');
    this.cronExpression = expression;
    if (maxCount !== undefined) {
      this.cronMaxCount = maxCount;
    }
    return this;
  }

  /**
   * Sets the event emitted when the timer expires.
   *
   * @param topic - Topic of the emitted event.
   * @param data  - Optional payload (values may be {@link ref}).
   * @returns `this` for chaining.
   */
  emit(topic: string, data: Record<string, unknown> = {}): TimerFluentBuilder {
    requireNonEmptyString(topic, 'setTimer().emit() topic');
    this.expireTopic = topic;
    this.expireData = data;
    return this;
  }

  /**
   * Configures the timer to repeat after each expiration (mutually exclusive with {@link cron}).
   *
   * @param interval - Repeat interval (string or milliseconds).
   * @param maxCount - Optional maximum number of repetitions.
   * @returns `this` for chaining.
   */
  repeat(interval: string | number, maxCount?: number): TimerFluentBuilder {
    requireDuration(interval, 'setTimer().repeat() interval');
    this.repeatInterval = interval;
    if (maxCount !== undefined) {
      this.repeatMaxCount = maxCount;
    }
    return this;
  }

  build(): RuleAction {
    if (!this.expireTopic) {
      throw new DslValidationError(
        `Timer "${this.timerName}" requires onExpire topic. Use .emit(topic, data) to set it.`
      );
    }

    if (this.cronExpression && this.timerDuration) {
      throw new DslValidationError(
        `Timer "${this.timerName}": .cron() and .after() are mutually exclusive`
      );
    }
    if (this.cronExpression && this.repeatInterval) {
      throw new DslValidationError(
        `Timer "${this.timerName}": .cron() and .repeat() are mutually exclusive`
      );
    }

    const timerConfig: TimerConfig = {
      name: this.timerName,
      onExpire: {
        topic: this.expireTopic,
        data: normalizeRefData(this.expireData),
      },
    };

    if (this.cronExpression) {
      timerConfig.cron = this.cronExpression;
      if (this.cronMaxCount !== undefined) {
        timerConfig.maxCount = this.cronMaxCount;
      }
    } else {
      timerConfig.duration = this.timerDuration ?? '1m';
      if (this.repeatInterval !== undefined) {
        timerConfig.repeat = {
          interval: this.repeatInterval,
          maxCount: this.repeatMaxCount,
        };
      }
    }

    return {
      type: 'set_timer',
      timer: timerConfig,
    };
  }
}

/** @internal */
class CancelTimerBuilder implements ActionBuilder {
  constructor(private readonly timerName: string) {}

  build(): RuleAction {
    return {
      type: 'cancel_timer',
      name: this.timerName,
    };
  }
}

/**
 * Creates an action that sets a timer.
 *
 * Supports two usage styles:
 *
 * **1. Options object** — pass a complete {@link SetTimerOptions}:
 * @example
 * ```typescript
 * setTimer({
 *   name: 'payment-timeout',
 *   duration: '15m',
 *   onExpire: {
 *     topic: 'order.payment_timeout',
 *     data: { orderId: ref('event.orderId') }
 *   }
 * })
 * ```
 *
 * **2. Fluent API** — pass just the timer name and chain methods:
 * @example
 * ```typescript
 * setTimer('payment-timeout')
 *   .after('15m')
 *   .emit('order.payment_timeout', { orderId: ref('event.orderId') })
 *   .repeat('5m', 3)
 * ```
 *
 * **3. Cron scheduling** — use a cron expression instead of duration:
 * @example
 * ```typescript
 * setTimer('weekly-report')
 *   .cron('0 8 * * MON')
 *   .emit('report.generate', { type: 'weekly' })
 * ```
 *
 * @param nameOrConfig - Timer name (fluent) or a complete
 *                       {@link SetTimerOptions} object.
 * @returns An {@link ActionBuilder} (options form) or a `TimerFluentBuilder`
 *          (string form).
 */
export function setTimer(nameOrConfig: string | SetTimerOptions): ActionBuilder | TimerFluentBuilder {
  if (typeof nameOrConfig === 'string') {
    requireNonEmptyString(nameOrConfig, 'setTimer() name');
    return new TimerFluentBuilder(nameOrConfig);
  }
  return new SetTimerBuilder(nameOrConfig);
}

/**
 * Creates an action that cancels a running timer.
 *
 * @param name - Timer name to cancel (supports `${}` interpolation).
 * @returns An {@link ActionBuilder} for use with {@link RuleBuilder.then}.
 *
 * @example
 * ```typescript
 * cancelTimer('payment-timeout')
 * cancelTimer('payment-timeout:${event.orderId}')
 * ```
 */
export function cancelTimer(name: string): ActionBuilder {
  requireNonEmptyString(name, 'cancelTimer() name');
  return new CancelTimerBuilder(name);
}
