import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimerManager } from '../../../src/core/timer-manager';
import type { TimerConfig } from '../../../src/types/timer';

const createTimerConfig = (overrides: Partial<TimerConfig> = {}): TimerConfig => ({
  name: 'test-timer',
  duration: '1h',
  onExpire: {
    topic: 'timer.expired',
    data: { source: 'test' }
  },
  ...overrides
});

describe('TimerManager', () => {
  let manager: TimerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new TimerManager();
  });

  afterEach(async () => {
    await manager.stop();
    vi.useRealTimers();
  });

  describe('static start()', () => {
    it('creates manager instance asynchronously', async () => {
      const asyncManager = await TimerManager.start();

      expect(asyncManager).toBeInstanceOf(TimerManager);
      await asyncManager.stop();
    });

    it('accepts configuration options', async () => {
      const asyncManager = await TimerManager.start({ checkIntervalMs: 500 });

      expect(asyncManager).toBeInstanceOf(TimerManager);
      await asyncManager.stop();
    });
  });

  describe('setTimer()', () => {
    it('creates a timer with correct properties', async () => {
      const config = createTimerConfig({ name: 'payment-timeout', duration: '30m' });

      const timer = await manager.setTimer(config);

      expect(timer.name).toBe('payment-timeout');
      expect(timer.id).toBeTypeOf('string');
      expect(timer.id.length).toBeGreaterThan(0);
      expect(timer.onExpire.topic).toBe('timer.expired');
      expect(timer.onExpire.data).toEqual({ source: 'test' });
    });

    it('parses string duration correctly', async () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
      const config = createTimerConfig({ duration: '15m' });

      const timer = await manager.setTimer(config);

      const expectedExpiry = Date.now() + 15 * 60 * 1000;
      expect(timer.expiresAt).toBe(expectedExpiry);
    });

    it('parses numeric duration as milliseconds', async () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
      const config = createTimerConfig({ duration: 5000 });

      const timer = await manager.setTimer(config);

      expect(timer.expiresAt).toBe(Date.now() + 5000);
    });

    it('stores timer and makes it retrievable', async () => {
      const config = createTimerConfig({ name: 'my-timer' });

      await manager.setTimer(config);

      const retrieved = manager.getTimer('my-timer');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('my-timer');
    });

    it('increments size when adding timers', async () => {
      expect(manager.size).toBe(0);

      await manager.setTimer(createTimerConfig({ name: 'timer-1' }));
      expect(manager.size).toBe(1);

      await manager.setTimer(createTimerConfig({ name: 'timer-2' }));
      expect(manager.size).toBe(2);
    });

    it('replaces existing timer with same name', async () => {
      const firstTimer = await manager.setTimer(createTimerConfig({ name: 'dup', duration: '1h' }));
      const secondTimer = await manager.setTimer(createTimerConfig({ name: 'dup', duration: '2h' }));

      expect(manager.size).toBe(1);
      expect(firstTimer.id).not.toBe(secondTimer.id);
      expect(manager.getTimer('dup')?.id).toBe(secondTimer.id);
    });

    it('sets correlationId when provided', async () => {
      const config = createTimerConfig({ name: 'correlated' });

      const timer = await manager.setTimer(config, 'correlation-123');

      expect(timer.correlationId).toBe('correlation-123');
    });

    it('stores repeat configuration when provided', async () => {
      const config = createTimerConfig({
        name: 'repeating',
        repeat: { interval: '5m', maxCount: 10 }
      });

      const timer = await manager.setTimer(config);

      expect(timer.repeat).toBeDefined();
      expect(timer.repeat?.interval).toBe(5 * 60 * 1000);
      expect(timer.repeat?.maxCount).toBe(10);
    });
  });

  describe('cancelTimer()', () => {
    it('removes existing timer and returns true', async () => {
      await manager.setTimer(createTimerConfig({ name: 'to-cancel' }));

      const result = await manager.cancelTimer('to-cancel');

      expect(result).toBe(true);
      expect(manager.getTimer('to-cancel')).toBeUndefined();
    });

    it('returns false for non-existing timer', async () => {
      const result = await manager.cancelTimer('non-existing');

      expect(result).toBe(false);
    });

    it('decreases size after cancellation', async () => {
      await manager.setTimer(createTimerConfig({ name: 'timer-1' }));
      await manager.setTimer(createTimerConfig({ name: 'timer-2' }));
      expect(manager.size).toBe(2);

      await manager.cancelTimer('timer-1');

      expect(manager.size).toBe(1);
    });

    it('prevents timer from firing after cancellation', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({ name: 'cancelled', duration: '10s' }));
      await manager.cancelTimer('cancelled');

      vi.advanceTimersByTime(15000);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getTimer()', () => {
    it('returns timer for existing name', async () => {
      await manager.setTimer(createTimerConfig({ name: 'find-me' }));

      const timer = manager.getTimer('find-me');

      expect(timer).toBeDefined();
      expect(timer?.name).toBe('find-me');
    });

    it('returns undefined for non-existing name', () => {
      const timer = manager.getTimer('not-found');

      expect(timer).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('returns empty array when no timers exist', () => {
      expect(manager.getAll()).toEqual([]);
    });

    it('returns all active timers', async () => {
      await manager.setTimer(createTimerConfig({ name: 'timer-a' }));
      await manager.setTimer(createTimerConfig({ name: 'timer-b' }));
      await manager.setTimer(createTimerConfig({ name: 'timer-c' }));

      const all = manager.getAll();

      expect(all).toHaveLength(3);
      expect(all.map(t => t.name).sort()).toEqual(['timer-a', 'timer-b', 'timer-c']);
    });
  });

  describe('size property', () => {
    it('returns 0 for empty manager', () => {
      expect(manager.size).toBe(0);
    });

    it('returns correct count of active timers', async () => {
      await manager.setTimer(createTimerConfig({ name: 't1' }));
      await manager.setTimer(createTimerConfig({ name: 't2' }));

      expect(manager.size).toBe(2);
    });
  });

  describe('onExpire()', () => {
    it('sets callback that fires when timer expires', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({ name: 'expiring', duration: '10s' }));

      vi.advanceTimersByTime(10000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ name: 'expiring' }));
    });

    it('passes full timer object to callback', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({
        name: 'full-info',
        duration: '5s',
        onExpire: { topic: 'test.topic', data: { key: 'value' } }
      }));

      vi.advanceTimersByTime(5000);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        name: 'full-info',
        onExpire: { topic: 'test.topic', data: { key: 'value' } }
      }));
    });

    it('removes one-time timer after expiration', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({ name: 'one-shot', duration: '1s' }));
      expect(manager.size).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);

      expect(manager.size).toBe(0);
      expect(manager.getTimer('one-shot')).toBeUndefined();
    });

    it('handles async callback', async () => {
      const results: string[] = [];
      manager.onExpire(async (timer) => {
        await Promise.resolve();
        results.push(timer.name);
      });

      await manager.setTimer(createTimerConfig({ name: 'async-test', duration: '1s' }));

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(results).toContain('async-test');
    });
  });

  describe('repeating timers', () => {
    it('reschedules after each expiration', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({
        name: 'repeater',
        duration: '1s',
        repeat: { interval: '1s' }
      }));

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('remains active after expiration when repeating', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({
        name: 'persistent',
        duration: '500ms',
        repeat: { interval: '500ms' }
      }));

      vi.advanceTimersByTime(500);

      expect(manager.getTimer('persistent')).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('updates expiresAt after each repetition', async () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

      await manager.setTimer(createTimerConfig({
        name: 'updating',
        duration: '1s',
        repeat: { interval: '2s' }
      }));

      const initialExpiry = manager.getTimer('updating')?.expiresAt;

      vi.advanceTimersByTime(1000);

      const updatedExpiry = manager.getTimer('updating')?.expiresAt;
      expect(updatedExpiry).toBeGreaterThan(initialExpiry!);
    });

    it('can be cancelled during repetition', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({
        name: 'cancel-mid',
        duration: '1s',
        repeat: { interval: '1s' }
      }));

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      await manager.cancelTimer('cancel-mid');

      await vi.advanceTimersByTimeAsync(5000);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('cancels all active timers', async () => {
      await manager.setTimer(createTimerConfig({ name: 't1', duration: '1h' }));
      await manager.setTimer(createTimerConfig({ name: 't2', duration: '2h' }));

      await manager.stop();

      expect(manager.size).toBe(0);
      expect(manager.getAll()).toEqual([]);
    });

    it('prevents all timers from firing', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({ name: 't1', duration: '1s' }));
      await manager.setTimer(createTimerConfig({ name: 't2', duration: '2s' }));

      await manager.stop();

      vi.advanceTimersByTime(10000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('can be called multiple times safely', async () => {
      await manager.setTimer(createTimerConfig({ name: 't1' }));

      await manager.stop();
      await manager.stop();
      await manager.stop();

      expect(manager.size).toBe(0);
    });
  });

  describe('duration parsing', () => {
    it('handles seconds', async () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const timer = await manager.setTimer(createTimerConfig({ duration: '30s' }));

      expect(timer.expiresAt).toBe(Date.now() + 30 * 1000);
    });

    it('handles minutes', async () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const timer = await manager.setTimer(createTimerConfig({ duration: '45m' }));

      expect(timer.expiresAt).toBe(Date.now() + 45 * 60 * 1000);
    });

    it('handles hours', async () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const timer = await manager.setTimer(createTimerConfig({ duration: '2h' }));

      expect(timer.expiresAt).toBe(Date.now() + 2 * 60 * 60 * 1000);
    });

    it('handles days', async () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const timer = await manager.setTimer(createTimerConfig({ duration: '7d' }));

      expect(timer.expiresAt).toBe(Date.now() + 7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('edge cases', () => {
    it('handles timer expiring immediately with 0 duration', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({ name: 'immediate', duration: 0 }));

      vi.advanceTimersByTime(0);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('handles very short duration', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({ name: 'quick', duration: 1 }));

      vi.advanceTimersByTime(1);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('handles timer name with special characters', async () => {
      const config = createTimerConfig({ name: 'payment:order:123:timeout' });

      const timer = await manager.setTimer(config);

      expect(manager.getTimer('payment:order:123:timeout')).toBe(timer);
    });

    it('handles empty data in onExpire', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createTimerConfig({
        name: 'empty-data',
        duration: '1s',
        onExpire: { topic: 'test', data: {} }
      }));

      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        onExpire: { topic: 'test', data: {} }
      }));
    });

    it('handles complex nested data in onExpire', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      const complexData = {
        orderId: '12345',
        items: [{ sku: 'ABC', qty: 2 }],
        nested: { deep: { value: true } }
      };

      await manager.setTimer(createTimerConfig({
        name: 'complex',
        duration: '1s',
        onExpire: { topic: 'order.timeout', data: complexData }
      }));

      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        onExpire: { topic: 'order.timeout', data: complexData }
      }));
    });
  });
});
