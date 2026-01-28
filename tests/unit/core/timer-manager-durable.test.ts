import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimerManager } from '../../../src/core/timer-manager';
import { MemoryAdapter } from '@hamicek/noex';
import type { TimerConfig } from '../../../src/types/timer';

const TICK = 150;
const CHECK_INTERVAL = 50;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 3000,
  pollMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(pollMs);
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}

const timerConfig = (overrides: Partial<TimerConfig> = {}): TimerConfig => ({
  name: 'test-timer',
  duration: TICK,
  onExpire: { topic: 'timer.expired', data: { source: 'durable-test' } },
  ...overrides,
});

describe('TimerManager — durable mode', () => {
  let manager: TimerManager;
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    manager = await TimerManager.start({ adapter, checkIntervalMs: CHECK_INTERVAL });
  });

  afterEach(async () => {
    await manager.stop();
  });

  describe('timer creation', () => {
    it('creates timer retrievable via getTimer()', async () => {
      const timer = await manager.setTimer(timerConfig({ name: 'payment-timeout', duration: 5000 }));

      expect(timer.name).toBe('payment-timeout');
      expect(timer.id).toBeTypeOf('string');
      expect(timer.id.length).toBeGreaterThan(0);
      expect(manager.getTimer('payment-timeout')).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('persists metadata to the storage adapter', async () => {
      await manager.setTimer(timerConfig({ name: 'persisted', duration: 5000 }));

      const stored = await adapter.load<{ entries: unknown[] }>('timer-manager:metadata');

      expect(stored).toBeDefined();
      expect(stored!.state.entries).toHaveLength(1);
    });

    it('replaces existing timer with same name', async () => {
      const first = await manager.setTimer(timerConfig({ name: 'dup', duration: 5000 }));
      const second = await manager.setTimer(timerConfig({ name: 'dup', duration: 10000 }));

      expect(manager.size).toBe(1);
      expect(first.id).not.toBe(second.id);
      expect(manager.getTimer('dup')?.id).toBe(second.id);
    });

    it('stores correlationId when provided', async () => {
      const timer = await manager.setTimer(timerConfig({ name: 'correlated', duration: 5000 }), 'corr-42');

      expect(timer.correlationId).toBe('corr-42');
    });

    it('stores repeat configuration', async () => {
      const timer = await manager.setTimer(timerConfig({
        name: 'repeating',
        duration: 5000,
        repeat: { interval: 1000, maxCount: 10 },
      }));

      expect(timer.repeat).toBeDefined();
      expect(timer.repeat?.interval).toBe(1000);
      expect(timer.repeat?.maxCount).toBe(10);
    });
  });

  describe('timer cancellation', () => {
    it('removes timer and returns true', async () => {
      await manager.setTimer(timerConfig({ name: 'to-cancel', duration: 5000 }));

      const result = await manager.cancelTimer('to-cancel');

      expect(result).toBe(true);
      expect(manager.getTimer('to-cancel')).toBeUndefined();
      expect(manager.size).toBe(0);
    });

    it('returns false for non-existing timer', async () => {
      expect(await manager.cancelTimer('ghost')).toBe(false);
    });

    it('removes metadata from storage after cancel', async () => {
      await manager.setTimer(timerConfig({ name: 'clean-meta', duration: 5000 }));
      await manager.cancelTimer('clean-meta');

      const stored = await adapter.load<{ entries: unknown[] }>('timer-manager:metadata');

      expect(stored!.state.entries).toHaveLength(0);
    });

    it('prevents callback from firing after cancellation', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({ name: 'no-fire', duration: TICK }));
      await manager.cancelTimer('no-fire');

      await delay(TICK + CHECK_INTERVAL * 4);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('timer expiration', () => {
    it('fires callback on one-shot timer', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({ name: 'one-shot', duration: TICK }));

      await waitUntil(() => callback.mock.calls.length >= 1);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ name: 'one-shot' }));
    });

    it('removes one-shot timer after expiration', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({ name: 'auto-remove', duration: TICK }));

      await waitUntil(() => callback.mock.calls.length >= 1);

      expect(manager.getTimer('auto-remove')).toBeUndefined();
      expect(manager.size).toBe(0);
    });

    it('passes full timer object including onExpire data', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      const onExpirePayload = { topic: 'order.timeout', data: { orderId: '123', amount: 99 } };
      await manager.setTimer(timerConfig({
        name: 'full-info',
        duration: TICK,
        onExpire: onExpirePayload,
      }));

      await waitUntil(() => callback.mock.calls.length >= 1);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        name: 'full-info',
        onExpire: onExpirePayload,
      }));
    });

    it('cleans metadata from storage after one-shot expiration', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({ name: 'meta-cleanup', duration: TICK }));

      await waitUntil(() => callback.mock.calls.length >= 1);

      const stored = await adapter.load<{ entries: unknown[] }>('timer-manager:metadata');

      expect(stored!.state.entries).toHaveLength(0);
    });
  });

  describe('repeating timers with maxCount', () => {
    it('fires exactly maxCount times then auto-cancels', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({
        name: 'limited',
        duration: TICK,
        repeat: { interval: TICK, maxCount: 3 },
      }));

      await waitUntil(() => callback.mock.calls.length >= 3, 5000);

      // Extra wait to verify no more fires beyond maxCount
      await delay(TICK + CHECK_INTERVAL * 4);

      expect(callback).toHaveBeenCalledTimes(3);
      expect(manager.getTimer('limited')).toBeUndefined();
      expect(manager.size).toBe(0);
    }, 10_000);

    it('keeps timer active between repetitions', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({
        name: 'stays-active',
        duration: TICK,
        repeat: { interval: TICK, maxCount: 5 },
      }));

      await waitUntil(() => callback.mock.calls.length >= 1);

      expect(manager.getTimer('stays-active')).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('updates expiresAt after each repetition', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({
        name: 'updating',
        duration: TICK,
        repeat: { interval: TICK, maxCount: 5 },
      }));

      const initialExpiry = manager.getTimer('updating')?.expiresAt;

      await waitUntil(() => callback.mock.calls.length >= 1);

      const updatedExpiry = manager.getTimer('updating')?.expiresAt;

      expect(updatedExpiry).toBeGreaterThan(initialExpiry!);
    });

    it('can be cancelled during repetition', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({
        name: 'cancel-mid',
        duration: TICK,
        repeat: { interval: TICK, maxCount: 10 },
      }));

      await waitUntil(() => callback.mock.calls.length >= 1);
      const countAfterFirst = callback.mock.calls.length;

      await manager.cancelTimer('cancel-mid');

      await delay(TICK * 3);

      expect(callback).toHaveBeenCalledTimes(countAfterFirst);
    });
  });

  describe('restart recovery', () => {
    it('restores timer from a previous run and fires it', async () => {
      await manager.setTimer(timerConfig({
        name: 'survivor',
        duration: 2000,
        onExpire: { topic: 'revived', data: { restored: true } },
      }));

      await manager.stop();

      const callback = vi.fn();
      manager = await TimerManager.start({ adapter, checkIntervalMs: CHECK_INTERVAL });
      manager.onExpire(callback);

      const restored = manager.getTimer('survivor');

      expect(restored).toBeDefined();
      expect(restored?.name).toBe('survivor');
      expect(restored?.onExpire.topic).toBe('revived');

      await waitUntil(() => callback.mock.calls.length >= 1, 5000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        name: 'survivor',
        onExpire: { topic: 'revived', data: { restored: true } },
      }));
    }, 10_000);

    it('restores repeating timer with correct repeat config', async () => {
      await manager.setTimer(timerConfig({
        name: 'repeat-survivor',
        duration: 5000,
        repeat: { interval: 1000, maxCount: 5 },
      }));

      await manager.stop();

      manager = await TimerManager.start({ adapter, checkIntervalMs: CHECK_INTERVAL });

      const restored = manager.getTimer('repeat-survivor');

      expect(restored).toBeDefined();
      expect(restored?.repeat?.interval).toBe(1000);
      expect(restored?.repeat?.maxCount).toBe(5);
    });

    it('restores correlationId across restart', async () => {
      await manager.setTimer(
        timerConfig({ name: 'corr-survivor', duration: 5000 }),
        'original-correlation',
      );

      await manager.stop();

      manager = await TimerManager.start({ adapter, checkIntervalMs: CHECK_INTERVAL });

      expect(manager.getTimer('corr-survivor')?.correlationId).toBe('original-correlation');
    });

    it('discards orphaned metadata when durable entry is missing', async () => {
      await manager.setTimer(timerConfig({ name: 'orphan', duration: 5000 }));

      // Manually corrupt: stop TimerService but keep metadata in adapter
      // Simulate by clearing the adapter's timer entries but keeping metadata
      await manager.stop();

      // Delete all durable timer entries from adapter, keeping only metadata
      const keys = await adapter.listKeys('durable_timer:');
      for (const key of keys) {
        await adapter.delete(key);
      }

      manager = await TimerManager.start({ adapter, checkIntervalMs: CHECK_INTERVAL });

      // Orphaned timer should not be restored
      expect(manager.getTimer('orphan')).toBeUndefined();
      expect(manager.size).toBe(0);
    });
  });

  describe('stop()', () => {
    it('clears all timers and metadata', async () => {
      await manager.setTimer(timerConfig({ name: 't1', duration: 5000 }));
      await manager.setTimer(timerConfig({ name: 't2', duration: 5000 }));

      await manager.stop();

      expect(manager.size).toBe(0);
      expect(manager.getAll()).toEqual([]);
    });

    it('prevents callbacks after stop', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({ name: 'no-fire', duration: TICK }));
      await manager.stop();

      await delay(TICK + CHECK_INTERVAL * 4);

      expect(callback).not.toHaveBeenCalled();
    });

    it('can be called multiple times safely', async () => {
      await manager.setTimer(timerConfig({ name: 't1', duration: 5000 }));

      await manager.stop();
      await manager.stop();

      expect(manager.size).toBe(0);
    });
  });

  describe('name-to-ID mapping', () => {
    it('correctly handles cancel and re-create with same name', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(timerConfig({ name: 'recycled', duration: 5000 }));
      await manager.cancelTimer('recycled');

      await manager.setTimer(timerConfig({
        name: 'recycled',
        duration: TICK,
        onExpire: { topic: 'new-topic', data: { version: 2 } },
      }));

      await waitUntil(() => callback.mock.calls.length >= 1);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        name: 'recycled',
        onExpire: { topic: 'new-topic', data: { version: 2 } },
      }));
    });

    it('assigns new durable timer ID after re-create', async () => {
      await manager.setTimer(timerConfig({ name: 'remap', duration: 5000 }));

      type MetaEntry = { name: string; durableTimerId: string };

      const stored1 = await adapter.load<{ entries: MetaEntry[] }>('timer-manager:metadata');
      const firstId = stored1!.state.entries.find(e => e.name === 'remap')!.durableTimerId;

      await manager.setTimer(timerConfig({ name: 'remap', duration: 5000 }));

      const stored2 = await adapter.load<{ entries: MetaEntry[] }>('timer-manager:metadata');
      const secondId = stored2!.state.entries.find(e => e.name === 'remap')!.durableTimerId;

      expect(firstId).toBeDefined();
      expect(secondId).toBeDefined();
      expect(firstId).not.toBe(secondId);
    });
  });
});
