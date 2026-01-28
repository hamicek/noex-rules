import type { RuleAction } from '../../types/action.js';
import type { TimerConfig } from '../../types/timer.js';
import type { ActionBuilder, Ref } from '../types.js';
import { isRef } from '../helpers/ref.js';

/**
 * Konfigurace pro setTimer s podporou ref().
 */
export interface SetTimerOptions {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data?: Record<string, unknown>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}

/**
 * Builder pro set_timer akci.
 */
class SetTimerBuilder implements ActionBuilder {
  private readonly config: SetTimerOptions;

  constructor(config: SetTimerOptions) {
    this.config = config;
  }

  build(): RuleAction {
    const normalizedData: Record<string, unknown> = {};

    if (this.config.onExpire.data) {
      for (const [key, value] of Object.entries(this.config.onExpire.data)) {
        normalizedData[key] = isRef(value) ? { ref: (value as Ref).ref } : value;
      }
    }

    const timerConfig: TimerConfig = {
      name: this.config.name,
      duration: this.config.duration,
      onExpire: {
        topic: this.config.onExpire.topic,
        data: normalizedData,
      },
    };

    if (this.config.repeat) {
      timerConfig.repeat = {
        interval: this.config.repeat.interval,
        maxCount: this.config.repeat.maxCount,
      };
    }

    return {
      type: 'set_timer',
      timer: timerConfig,
    };
  }
}

/**
 * Fluent builder pro postupné vytváření timer konfigurace.
 */
class TimerFluentBuilder implements ActionBuilder {
  private readonly timerName: string;
  private timerDuration: string | number = '1m';
  private expireTopic: string = '';
  private expireData: Record<string, unknown> = {};
  private repeatInterval?: string | number;
  private repeatMaxCount?: number;

  constructor(name: string) {
    this.timerName = name;
  }

  /**
   * Nastaví dobu do expirace timeru.
   *
   * @param duration - Doba trvání ("15m", "24h", "7d" nebo ms)
   */
  after(duration: string | number): TimerFluentBuilder {
    this.timerDuration = duration;
    return this;
  }

  /**
   * Nastaví event, který se emituje při expiraci.
   *
   * @param topic - Topic emitovaného eventu
   * @param data - Data eventu (podporuje ref())
   */
  emit(topic: string, data: Record<string, unknown> = {}): TimerFluentBuilder {
    this.expireTopic = topic;
    this.expireData = data;
    return this;
  }

  /**
   * Nastaví opakování timeru.
   *
   * @param interval - Interval opakování ("5m", "1h" nebo ms)
   * @param maxCount - Maximální počet opakování (volitelné)
   */
  repeat(interval: string | number, maxCount?: number): TimerFluentBuilder {
    this.repeatInterval = interval;
    this.repeatMaxCount = maxCount;
    return this;
  }

  build(): RuleAction {
    if (!this.expireTopic) {
      throw new Error(
        `Timer "${this.timerName}" requires onExpire topic. Use .emit(topic, data) to set it.`
      );
    }

    const normalizedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.expireData)) {
      normalizedData[key] = isRef(value) ? { ref: (value as Ref).ref } : value;
    }

    const timerConfig: TimerConfig = {
      name: this.timerName,
      duration: this.timerDuration,
      onExpire: {
        topic: this.expireTopic,
        data: normalizedData,
      },
    };

    if (this.repeatInterval !== undefined) {
      timerConfig.repeat = {
        interval: this.repeatInterval,
        maxCount: this.repeatMaxCount,
      };
    }

    return {
      type: 'set_timer',
      timer: timerConfig,
    };
  }
}

/**
 * Builder pro cancel_timer akci.
 */
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
 * Vytvoří akci pro nastavení timeru.
 *
 * Podporuje dva způsoby použití:
 *
 * 1. S objektem konfigurace:
 * @example
 * setTimer({
 *   name: 'payment-timeout',
 *   duration: '15m',
 *   onExpire: {
 *     topic: 'order.payment_timeout',
 *     data: { orderId: ref('event.orderId') }
 *   }
 * })
 *
 * 2. S fluent API:
 * @example
 * setTimer('payment-timeout')
 *   .after('15m')
 *   .emit('order.payment_timeout', { orderId: ref('event.orderId') })
 *   .repeat('5m', 3)
 *
 * @param nameOrConfig - Název timeru pro fluent API nebo kompletní konfigurace
 */
export function setTimer(nameOrConfig: string | SetTimerOptions): ActionBuilder | TimerFluentBuilder {
  if (typeof nameOrConfig === 'string') {
    return new TimerFluentBuilder(nameOrConfig);
  }
  return new SetTimerBuilder(nameOrConfig);
}

/**
 * Vytvoří akci pro zrušení timeru.
 *
 * @example
 * cancelTimer('payment-timeout')
 * cancelTimer('payment-timeout:${event.orderId}')
 *
 * @param name - Název timeru k zrušení (podporuje interpolaci)
 */
export function cancelTimer(name: string): ActionBuilder {
  return new CancelTimerBuilder(name);
}
