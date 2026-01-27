import { bench, describe, beforeEach, afterEach } from 'vitest';
import { TimerManager } from '../../../src/core/timer-manager.js';
import type { TimerConfig } from '../../../src/types/timer.js';

const createTimerConfig = (name: string, duration: number | string = '1h'): TimerConfig => ({
  name,
  duration,
  onExpire: {
    topic: 'timer.expired',
    data: { source: 'benchmark' }
  }
});

describe('TimerManager', () => {
  let manager: TimerManager;

  beforeEach(() => {
    manager = new TimerManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  describe('setTimer() - creation operations', () => {
    bench('setTimer() - single timer', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`timer-${i}`));
      }
      await m.stop();
    });

    bench('setTimer() - with correlationId', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`timer-${i}`), `correlation-${i}`);
      }
      await m.stop();
    });

    bench('setTimer() - with repeat config', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer({
          name: `repeating-${i}`,
          duration: '1h',
          onExpire: { topic: 'test', data: {} },
          repeat: { interval: '5m', maxCount: 10 }
        });
      }
      await m.stop();
    });

    bench('setTimer() - replacing existing timer', async () => {
      const m = new TimerManager();
      const name = 'replace-test';
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(name, i + 1000));
      }
      await m.stop();
    });
  });

  describe('getTimer() - lookup operations', () => {
    bench('getTimer() - existing timer (100 timers)', async () => {
      const m = new TimerManager();
      const names: string[] = [];
      for (let i = 0; i < 100; i++) {
        const name = `timer-${i}`;
        names.push(name);
        await m.setTimer(createTimerConfig(name));
      }
      for (let i = 0; i < 1000; i++) {
        m.getTimer(names[i % names.length]);
      }
      await m.stop();
    });

    bench('getTimer() - non-existing timer', () => {
      for (let i = 0; i < 1000; i++) {
        manager.getTimer(`non-existing-${i}`);
      }
    });

    bench('getTimer() - mixed existing/non-existing', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 50; i++) {
        await m.setTimer(createTimerConfig(`timer-${i}`));
      }
      for (let i = 0; i < 1000; i++) {
        m.getTimer(`timer-${i % 100}`);
      }
      await m.stop();
    });
  });

  describe('cancelTimer() - cancellation operations', () => {
    bench('cancelTimer() - existing timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`cancel-${i}`));
      }
      for (let i = 0; i < 100; i++) {
        await m.cancelTimer(`cancel-${i}`);
      }
    });

    bench('cancelTimer() - non-existing timers', async () => {
      for (let i = 0; i < 100; i++) {
        await manager.cancelTimer(`non-existing-${i}`);
      }
    });

    bench('cancelTimer() - mixed create/cancel cycle', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`cycle-${i}`));
        if (i > 0 && i % 2 === 0) {
          await m.cancelTimer(`cycle-${i - 1}`);
        }
      }
      await m.stop();
    });
  });

  describe('getAll() - bulk retrieval', () => {
    const scales = [10, 100, 1000] as const;
    const managers = new Map<number, TimerManager>();

    beforeEach(async () => {
      for (const scale of scales) {
        const m = new TimerManager();
        for (let i = 0; i < scale; i++) {
          await m.setTimer(createTimerConfig(`timer-${i}`));
        }
        managers.set(scale, m);
      }
    });

    afterEach(async () => {
      for (const m of managers.values()) {
        await m.stop();
      }
      managers.clear();
    });

    bench('getAll() - 10 timers', () => {
      managers.get(10)!.getAll();
    });

    bench('getAll() - 100 timers', () => {
      managers.get(100)!.getAll();
    });

    bench('getAll() - 1,000 timers', () => {
      managers.get(1000)!.getAll();
    });
  });

  describe('size property - count access', () => {
    bench('size - empty manager', () => {
      for (let i = 0; i < 1000; i++) {
        void manager.size;
      }
    });

    bench('size - populated manager (1k timers)', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 1000; i++) {
        await m.setTimer(createTimerConfig(`timer-${i}`));
      }
      for (let i = 0; i < 1000; i++) {
        void m.size;
      }
      await m.stop();
    });
  });

  describe('scalability - setTimer with varying counts', () => {
    bench('populate 100 timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`scale-${i}`));
      }
      await m.stop();
    });

    bench('populate 1,000 timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 1000; i++) {
        await m.setTimer(createTimerConfig(`scale-${i}`));
      }
      await m.stop();
    });

    bench('populate 5,000 timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 5000; i++) {
        await m.setTimer(createTimerConfig(`scale-${i}`));
      }
      await m.stop();
    });

    bench('populate 10,000 timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 10000; i++) {
        await m.setTimer(createTimerConfig(`scale-${i}`));
      }
      await m.stop();
    });
  });

  describe('scalability - getTimer with varying store sizes', () => {
    const scales = [100, 1000, 10000] as const;
    const managers = new Map<number, { manager: TimerManager; names: string[] }>();

    beforeEach(async () => {
      for (const scale of scales) {
        const m = new TimerManager();
        const names: string[] = [];
        for (let i = 0; i < scale; i++) {
          const name = `timer-${i}`;
          names.push(name);
          await m.setTimer(createTimerConfig(name));
        }
        managers.set(scale, { manager: m, names });
      }
    });

    afterEach(async () => {
      for (const { manager: m } of managers.values()) {
        await m.stop();
      }
      managers.clear();
    });

    bench('getTimer() - 100 timers', () => {
      const { manager: m, names } = managers.get(100)!;
      for (let i = 0; i < 100; i++) {
        m.getTimer(names[i % names.length]);
      }
    });

    bench('getTimer() - 1,000 timers', () => {
      const { manager: m, names } = managers.get(1000)!;
      for (let i = 0; i < 100; i++) {
        m.getTimer(names[Math.floor(Math.random() * names.length)]);
      }
    });

    bench('getTimer() - 10,000 timers', () => {
      const { manager: m, names } = managers.get(10000)!;
      for (let i = 0; i < 100; i++) {
        m.getTimer(names[Math.floor(Math.random() * names.length)]);
      }
    });
  });

  describe('duration parsing variations', () => {
    bench('setTimer() - milliseconds (numeric)', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`ms-${i}`, 60000));
      }
      await m.stop();
    });

    bench('setTimer() - seconds string', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`sec-${i}`, '30s'));
      }
      await m.stop();
    });

    bench('setTimer() - minutes string', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`min-${i}`, '15m'));
      }
      await m.stop();
    });

    bench('setTimer() - hours string', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`hour-${i}`, '2h'));
      }
      await m.stop();
    });

    bench('setTimer() - days string', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`day-${i}`, '7d'));
      }
      await m.stop();
    });
  });

  describe('mixed workload simulation', () => {
    bench('80% read / 20% write (500 timers)', async () => {
      const m = new TimerManager();
      const names: string[] = [];
      for (let i = 0; i < 500; i++) {
        const name = `mixed-${i}`;
        names.push(name);
        await m.setTimer(createTimerConfig(name));
      }
      for (let i = 0; i < 1000; i++) {
        const op = i % 10;
        if (op < 8) {
          m.getTimer(names[Math.floor(Math.random() * names.length)]);
        } else {
          await m.setTimer(createTimerConfig(`new-${i}`, '30m'));
        }
      }
      await m.stop();
    });

    bench('50% read / 50% write (500 timers)', async () => {
      const m = new TimerManager();
      const names: string[] = [];
      for (let i = 0; i < 500; i++) {
        const name = `mixed-${i}`;
        names.push(name);
        await m.setTimer(createTimerConfig(name));
      }
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          m.getTimer(names[Math.floor(Math.random() * names.length)]);
        } else {
          await m.setTimer(createTimerConfig(`new-${i}`, '30m'));
        }
      }
      await m.stop();
    });

    bench('create/cancel churn (high turnover)', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 500; i++) {
        await m.setTimer(createTimerConfig(`churn-${i}`));
        if (i >= 100) {
          await m.cancelTimer(`churn-${i - 100}`);
        }
      }
      await m.stop();
    });
  });

  describe('stop() - cleanup operations', () => {
    bench('stop() - 100 timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 100; i++) {
        await m.setTimer(createTimerConfig(`stop-${i}`));
      }
      await m.stop();
    });

    bench('stop() - 1,000 timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 1000; i++) {
        await m.setTimer(createTimerConfig(`stop-${i}`));
      }
      await m.stop();
    });

    bench('stop() - 5,000 timers', async () => {
      const m = new TimerManager();
      for (let i = 0; i < 5000; i++) {
        await m.setTimer(createTimerConfig(`stop-${i}`));
      }
      await m.stop();
    });
  });
});
