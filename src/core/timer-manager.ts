import type { Timer, TimerConfig } from '../types/timer.js';
import { generateId } from '../utils/id-generator.js';
import { parseDuration } from '../utils/duration-parser.js';

export interface TimerManagerConfig {
  // persistence?: PersistenceConfig;  // TODO
  checkIntervalMs?: number;     // Jak často kontrolovat timery (default: 1000)
}

type TimerCallback = (timer: Timer) => void | Promise<void>;

/**
 * Správa časovačů s podporou opakování.
 *
 * TODO: Integrace s DurableTimerService pro persistence.
 */
export class TimerManager {
  private timers: Map<string, Timer> = new Map();
  private handles: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onExpireCallback?: TimerCallback;

  constructor(_config: TimerManagerConfig = {}) {
    // TODO: Implementovat checkInterval pro durable timers
  }

  static async start(config: TimerManagerConfig = {}): Promise<TimerManager> {
    return new TimerManager(config);
  }

  /**
   * Nastaví callback pro expiraci timerů.
   */
  onExpire(callback: TimerCallback): void {
    this.onExpireCallback = callback;
  }

  /**
   * Nastaví nový timer.
   */
  async setTimer(config: TimerConfig, correlationId?: string): Promise<Timer> {
    // Zrušit existující timer se stejným jménem
    if (this.timers.has(config.name)) {
      await this.cancelTimer(config.name);
    }

    const duration = parseDuration(config.duration);
    const timer: Timer = {
      id: generateId(),
      name: config.name,
      expiresAt: Date.now() + duration,
      onExpire: {
        topic: config.onExpire.topic,
        data: config.onExpire.data as Record<string, unknown>
      },
      repeat: config.repeat ? {
        interval: parseDuration(config.repeat.interval),
        maxCount: config.repeat.maxCount
      } : undefined,
      correlationId
    };

    this.timers.set(config.name, timer);

    // Naplánovat timeout
    const handle = setTimeout(() => {
      void this.handleTimerExpired(timer.name);
    }, duration);

    this.handles.set(timer.name, handle);

    return timer;
  }

  /**
   * Zruší timer.
   */
  async cancelTimer(name: string): Promise<boolean> {
    const timer = this.timers.get(name);
    if (!timer) return false;

    const handle = this.handles.get(name);
    if (handle) {
      clearTimeout(handle);
      this.handles.delete(name);
    }

    this.timers.delete(name);
    return true;
  }

  /**
   * Získá timer podle jména.
   */
  getTimer(name: string): Timer | undefined {
    return this.timers.get(name);
  }

  /**
   * Počet aktivních timerů.
   */
  get size(): number {
    return this.timers.size;
  }

  /**
   * Všechny aktivní timery.
   */
  getAll(): Timer[] {
    return [...this.timers.values()];
  }

  /**
   * Zastaví všechny timery.
   */
  async stop(): Promise<void> {
    for (const handle of this.handles.values()) {
      clearTimeout(handle);
    }
    this.handles.clear();
    this.timers.clear();
  }

  private async handleTimerExpired(name: string): Promise<void> {
    const timer = this.timers.get(name);
    if (!timer) return;

    // Zavolat callback
    if (this.onExpireCallback) {
      await this.onExpireCallback(timer);
    }

    // Pokud je opakující se, naplánovat znovu
    if (timer.repeat) {
      const newTimer: Timer = {
        ...timer,
        expiresAt: Date.now() + timer.repeat.interval
      };

      // TODO: Sledovat počet opakování (maxCount)

      this.timers.set(name, newTimer);

      const handle = setTimeout(() => {
        void this.handleTimerExpired(name);
      }, timer.repeat.interval);

      this.handles.set(name, handle);
    } else {
      // Smazat jednorázový timer
      this.timers.delete(name);
      this.handles.delete(name);
    }
  }
}
