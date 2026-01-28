import type { Timer, TimerConfig, TimerMetadata } from '../types/timer.js';
import { generateId } from '../utils/id-generator.js';
import { parseDuration } from '../utils/duration-parser.js';
import { GenServer, TimerService } from '@hamicek/noex';
import type { StorageAdapter } from '@hamicek/noex';

export interface TimerManagerConfig {
  adapter?: StorageAdapter;
  checkIntervalMs?: number;
}

type TimerCallback = (timer: Timer) => void | Promise<void>;

type ReceiverCastMsg = { type: 'timer_expired'; name: string };

/**
 * Správa časovačů s podporou opakování.
 *
 * Dva režimy:
 * - Fallback (výchozí): setTimeout — nestabilní přes restart
 * - Durable: DurableTimerService z @hamicek/noex — timery přežijí restart
 */
export class TimerManager {
  private timers: Map<string, Timer> = new Map();
  private handles: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onExpireCallback?: TimerCallback;

  private useDurable = false;
  private metadata: Map<string, TimerMetadata> = new Map();
  private timerServiceRef?: Awaited<ReturnType<typeof TimerService.start>> | undefined;
  private receiverRef?: Awaited<ReturnType<typeof GenServer.start>> | undefined;
  private adapter?: StorageAdapter | undefined;

  constructor(_config: TimerManagerConfig = {}) {}

  static async start(config: TimerManagerConfig = {}): Promise<TimerManager> {
    const manager = new TimerManager(config);

    if (config.adapter) {
      manager.useDurable = true;
      manager.adapter = config.adapter;
      await manager.initDurableMode(config);
    }

    return manager;
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

    if (this.useDurable) {
      await this.scheduleDurableTimer(timer, duration);
    } else {
      const handle = setTimeout(() => {
        void this.handleTimerExpired(timer.name);
      }, duration);
      this.handles.set(timer.name, handle);
    }

    return timer;
  }

  /**
   * Zruší timer.
   */
  async cancelTimer(name: string): Promise<boolean> {
    const timer = this.timers.get(name);
    if (!timer) return false;

    if (this.useDurable) {
      const meta = this.metadata.get(name);
      if (meta) {
        await TimerService.cancel(this.timerServiceRef!, meta.durableTimerId);
        this.metadata.delete(name);
        await this.persistTimerMetadata();
      }
    } else {
      const handle = this.handles.get(name);
      if (handle) {
        clearTimeout(handle);
        this.handles.delete(name);
      }
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
    if (this.useDurable) {
      if (this.timerServiceRef) {
        await TimerService.stop(this.timerServiceRef);
        this.timerServiceRef = undefined;
      }
      if (this.receiverRef) {
        await GenServer.stop(this.receiverRef);
        this.receiverRef = undefined;
      }
      this.metadata.clear();
    } else {
      for (const handle of this.handles.values()) {
        clearTimeout(handle);
      }
      this.handles.clear();
    }
    this.timers.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                            DURABLE MODE
  // ═══════════════════════════════════════════════════════════════════════════

  private async initDurableMode(config: TimerManagerConfig): Promise<void> {
    const manager = this;

    this.receiverRef = await GenServer.start({
      init: () => ({}),
      handleCall(_msg: unknown, state: Record<string, never>) {
        return [null, state] as const;
      },
      async handleCast(msg: unknown, state: Record<string, never>) {
        const castMsg = msg as ReceiverCastMsg;
        if (castMsg.type === 'timer_expired') {
          await manager.handleDurableTimerExpired(castMsg.name);
        }
        return state;
      }
    });

    this.timerServiceRef = await TimerService.start({
      adapter: this.adapter!,
      ...(config.checkIntervalMs !== undefined && { checkIntervalMs: config.checkIntervalMs }),
    });

    await this.restoreTimerMetadata();
  }

  private async scheduleDurableTimer(timer: Timer, durationMs: number): Promise<void> {
    const scheduleOptions = timer.repeat
      ? { repeat: timer.repeat.interval }
      : undefined;

    const durableTimerId = await TimerService.schedule(
      this.timerServiceRef!,
      this.receiverRef!,
      { type: 'timer_expired', name: timer.name } as ReceiverCastMsg,
      durationMs,
      scheduleOptions
    );

    const meta: TimerMetadata = {
      name: timer.name,
      durableTimerId,
      timerId: timer.id,
      onExpire: timer.onExpire,
      fireCount: 0,
      ...(timer.correlationId !== undefined && { correlationId: timer.correlationId }),
      ...(timer.repeat?.maxCount !== undefined && { maxCount: timer.repeat.maxCount }),
      ...(timer.repeat?.interval !== undefined && { repeatIntervalMs: timer.repeat.interval }),
    };

    this.metadata.set(timer.name, meta);
    await this.persistTimerMetadata();
  }

  private async handleDurableTimerExpired(name: string): Promise<void> {
    const timer = this.timers.get(name);
    const meta = this.metadata.get(name);
    if (!timer || !meta) return;

    if (this.onExpireCallback) {
      await this.onExpireCallback(timer);
    }

    if (timer.repeat) {
      meta.fireCount++;

      if (meta.maxCount !== undefined && meta.fireCount >= meta.maxCount) {
        await TimerService.cancel(this.timerServiceRef!, meta.durableTimerId);
        this.timers.delete(name);
        this.metadata.delete(name);
      } else {
        const updatedTimer: Timer = {
          ...timer,
          expiresAt: Date.now() + timer.repeat.interval
        };
        this.timers.set(name, updatedTimer);
      }
    } else {
      this.timers.delete(name);
      this.metadata.delete(name);
    }

    await this.persistTimerMetadata();
  }

  private async persistTimerMetadata(): Promise<void> {
    if (!this.adapter) return;

    await this.adapter.save('timer-manager:metadata', {
      state: { entries: [...this.metadata.values()] },
      metadata: {
        persistedAt: Date.now(),
        serverId: 'timer-manager',
        schemaVersion: 1
      }
    });
  }

  private async restoreTimerMetadata(): Promise<void> {
    if (!this.adapter) return;

    const persisted = await this.adapter.load<{ entries: TimerMetadata[] }>('timer-manager:metadata');
    if (!persisted?.state.entries.length) return;

    for (const entry of persisted.state.entries) {
      const durableEntry = await TimerService.get(this.timerServiceRef!, entry.durableTimerId);
      if (!durableEntry) continue;

      // Cancel old timer (targets previous receiver) and reschedule with current receiver
      await TimerService.cancel(this.timerServiceRef!, entry.durableTimerId);

      const remainingMs = Math.max(0, durableEntry.fireAt - Date.now());
      const scheduleOptions = entry.repeatIntervalMs
        ? { repeat: entry.repeatIntervalMs }
        : undefined;

      const newDurableTimerId = await TimerService.schedule(
        this.timerServiceRef!,
        this.receiverRef!,
        { type: 'timer_expired', name: entry.name } as ReceiverCastMsg,
        remainingMs,
        scheduleOptions
      );

      const timer: Timer = {
        id: entry.timerId,
        name: entry.name,
        expiresAt: durableEntry.fireAt,
        onExpire: entry.onExpire,
        repeat: entry.repeatIntervalMs
          ? { interval: entry.repeatIntervalMs, maxCount: entry.maxCount }
          : undefined,
        correlationId: entry.correlationId,
      };

      this.timers.set(entry.name, timer);
      this.metadata.set(entry.name, {
        ...entry,
        durableTimerId: newDurableTimerId,
      });
    }

    if (this.metadata.size > 0) {
      await this.persistTimerMetadata();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                           FALLBACK MODE
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleTimerExpired(name: string): Promise<void> {
    const timer = this.timers.get(name);
    if (!timer) return;

    if (this.onExpireCallback) {
      await this.onExpireCallback(timer);
    }

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
      this.timers.delete(name);
      this.handles.delete(name);
    }
  }
}
