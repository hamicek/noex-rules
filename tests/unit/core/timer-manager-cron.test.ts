import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimerManager } from '../../../src/core/timer-manager';
import type { TimerConfig } from '../../../src/types/timer';

const createCronConfig = (overrides: Partial<TimerConfig> = {}): TimerConfig => ({
  name: 'cron-timer',
  cron: '*/5 * * * *',   // každých 5 minut
  onExpire: {
    topic: 'cron.fired',
    data: { source: 'test' }
  },
  ...overrides
});

describe('TimerManager — cron scheduling', () => {
  let manager: TimerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-03T10:00:00Z')); // pondělí
    manager = new TimerManager();
  });

  afterEach(async () => {
    await manager.stop();
    vi.useRealTimers();
  });

  describe('setTimer() with cron', () => {
    it('creates a cron timer with correct properties', async () => {
      const timer = await manager.setTimer(createCronConfig({
        name: 'weekly-report',
        cron: '0 8 * * MON',
      }));

      expect(timer.name).toBe('weekly-report');
      expect(timer.cron).toBe('0 8 * * MON');
      expect(timer.id).toBeTypeOf('string');
      expect(timer.repeat).toBeUndefined();
    });

    it('computes correct expiresAt based on cron', async () => {
      // Aktuální čas: 2024-06-03T10:00:00Z (pondělí)
      // Cron: 0 8 * * MON = příští pondělí v 8:00 (lokální čas)
      const timer = await manager.setTimer(createCronConfig({
        cron: '0 8 * * MON',
      }));

      // expiresAt musí být v budoucnosti a přibližně za týden (±24h kvůli timezone)
      const now = Date.now();
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      expect(timer.expiresAt).toBeGreaterThan(now);
      expect(timer.expiresAt).toBeLessThanOrEqual(now + oneWeekMs);
    });

    it('computes correct expiresAt for "every 5 minutes"', async () => {
      // Aktuální čas: 10:00:00 => next je 10:05:00
      const timer = await manager.setTimer(createCronConfig({
        cron: '*/5 * * * *',
      }));

      const expectedNext = new Date('2024-06-03T10:05:00Z').getTime();
      expect(timer.expiresAt).toBe(expectedNext);
    });

    it('stores cron timer and makes it retrievable', async () => {
      await manager.setTimer(createCronConfig({ name: 'my-cron' }));

      const retrieved = manager.getTimer('my-cron');
      expect(retrieved).toBeDefined();
      expect(retrieved?.cron).toBe('*/5 * * * *');
    });

    it('replaces existing cron timer with same name', async () => {
      const first = await manager.setTimer(createCronConfig({ name: 'dup-cron' }));
      const second = await manager.setTimer(createCronConfig({ name: 'dup-cron', cron: '0 * * * *' }));

      expect(manager.size).toBe(1);
      expect(first.id).not.toBe(second.id);
      expect(manager.getTimer('dup-cron')?.cron).toBe('0 * * * *');
    });

    it('throws on invalid cron expression', async () => {
      await expect(
        manager.setTimer(createCronConfig({ cron: 'not-a-cron' }))
      ).rejects.toThrow();
    });

    it('throws when neither duration nor cron is specified', async () => {
      await expect(
        manager.setTimer({
          name: 'broken',
          onExpire: { topic: 'test', data: {} },
        })
      ).rejects.toThrow('either duration or cron must be specified');
    });
  });

  describe('cron timer expiration', () => {
    it('fires callback at scheduled cron time', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({
        name: 'fire-test',
        cron: '*/5 * * * *',
      }));

      // Posun o 5 minut
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        name: 'fire-test',
        cron: '*/5 * * * *',
      }));
    });

    it('reschedules after each cron firing', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({
        name: 'recurring',
        cron: '*/5 * * * *',
      }));

      // First fire at 10:05
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second fire at 10:10
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(2);

      // Third fire at 10:15
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('remains active after firing (unlike one-shot timers)', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({
        name: 'persistent-cron',
        cron: '*/5 * * * *',
      }));

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(manager.getTimer('persistent-cron')).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('updates expiresAt after each cron firing', async () => {
      await manager.setTimer(createCronConfig({
        name: 'updating-cron',
        cron: '*/5 * * * *',
      }));

      const initialExpiry = manager.getTimer('updating-cron')!.expiresAt;

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      const updatedExpiry = manager.getTimer('updating-cron')!.expiresAt;
      expect(updatedExpiry).toBeGreaterThan(initialExpiry);
    });
  });

  describe('cron timer with maxCount', () => {
    it('stops after maxCount firings', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({
        name: 'limited-cron',
        cron: '*/5 * * * *',
        maxCount: 3,
      }));

      // Fire 3x
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(callback).toHaveBeenCalledTimes(3);

      // Timer should be removed
      expect(manager.getTimer('limited-cron')).toBeUndefined();
      expect(manager.size).toBe(0);
    });

    it('fires exactly maxCount=1 time', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({
        name: 'once-cron',
        cron: '*/5 * * * *',
        maxCount: 1,
      }));

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Timer should be gone
      expect(manager.size).toBe(0);

      // No more fires
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('cron timer cancellation', () => {
    it('can be cancelled before first fire', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({ name: 'cancel-before' }));
      await manager.cancelTimer('cancel-before');

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      expect(callback).not.toHaveBeenCalled();
      expect(manager.size).toBe(0);
    });

    it('can be cancelled between fires', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({
        name: 'cancel-mid',
        cron: '*/5 * * * *',
      }));

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(1);

      await manager.cancelTimer('cancel-mid');

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('cron timer with correlationId', () => {
    it('sets correlationId when provided', async () => {
      const timer = await manager.setTimer(
        createCronConfig({ name: 'correlated-cron' }),
        'correlation-abc'
      );

      expect(timer.correlationId).toBe('correlation-abc');
    });
  });

  describe('stop()', () => {
    it('stops all cron timers', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({ name: 'cron-1' }));
      await manager.setTimer(createCronConfig({ name: 'cron-2' }));

      await manager.stop();

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      expect(callback).not.toHaveBeenCalled();
      expect(manager.size).toBe(0);
    });
  });

  describe('mixed timers', () => {
    it('supports both cron and duration timers simultaneously', async () => {
      const callback = vi.fn();
      manager.onExpire(callback);

      await manager.setTimer(createCronConfig({
        name: 'my-cron',
        cron: '*/5 * * * *',
      }));

      await manager.setTimer({
        name: 'my-duration',
        duration: '3m',
        onExpire: { topic: 'duration.fired', data: {} },
      });

      expect(manager.size).toBe(2);

      // Duration timer fires at 3 min
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-duration' }));

      // Cron timer fires at 5 min
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-cron' }));
    });
  });
});
