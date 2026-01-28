import { describe, it, expect } from 'vitest';
import { MemoryAdapter, SQLiteAdapter } from '@hamicek/noex';
import type { TimerPersistenceConfig, RuleEngineConfig } from '../../../src/types/index.js';

describe('TimerPersistenceConfig', () => {
  describe('type compatibility', () => {
    it('should accept MemoryAdapter', () => {
      const config: TimerPersistenceConfig = {
        adapter: new MemoryAdapter(),
      };

      expect(config.adapter).toBeDefined();
      expect(config.checkIntervalMs).toBeUndefined();
    });

    it('should accept SQLiteAdapter', () => {
      const config: TimerPersistenceConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
      };

      expect(config.adapter).toBeDefined();
    });

    it('should accept optional checkIntervalMs parameter', () => {
      const config: TimerPersistenceConfig = {
        adapter: new MemoryAdapter(),
        checkIntervalMs: 500,
      };

      expect(config.checkIntervalMs).toBe(500);
    });

    it('should accept full configuration', () => {
      const config: TimerPersistenceConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
        checkIntervalMs: 1000,
      };

      expect(config.adapter).toBeDefined();
      expect(config.checkIntervalMs).toBe(1000);
    });
  });

  describe('type constraints', () => {
    it('should require adapter property', () => {
      // @ts-expect-error - adapter is required
      const _invalidConfig: TimerPersistenceConfig = {};
      expect(true).toBe(true);
    });

    it('should not accept invalid adapter type', () => {
      // @ts-expect-error - adapter must be StorageAdapter
      const _invalidConfig: TimerPersistenceConfig = {
        adapter: { notAStorageAdapter: true },
      };
      expect(true).toBe(true);
    });
  });

  describe('RuleEngineConfig integration', () => {
    it('should allow RuleEngineConfig without timerPersistence', () => {
      const config: RuleEngineConfig = {
        name: 'test-engine',
      };

      expect(config.timerPersistence).toBeUndefined();
    });

    it('should accept timerPersistence in RuleEngineConfig', () => {
      const config: RuleEngineConfig = {
        name: 'test-engine',
        timerPersistence: {
          adapter: new MemoryAdapter(),
        },
      };

      expect(config.timerPersistence).toBeDefined();
      expect(config.timerPersistence!.adapter).toBeDefined();
    });

    it('should accept timerPersistence with checkIntervalMs in RuleEngineConfig', () => {
      const config: RuleEngineConfig = {
        name: 'test-engine',
        timerPersistence: {
          adapter: new MemoryAdapter(),
          checkIntervalMs: 2000,
        },
      };

      expect(config.timerPersistence!.checkIntervalMs).toBe(2000);
    });

    it('should coexist with rule persistence config', () => {
      const adapter = new MemoryAdapter();
      const config: RuleEngineConfig = {
        name: 'dual-persistence',
        persistence: {
          adapter,
          key: 'rules',
        },
        timerPersistence: {
          adapter,
          checkIntervalMs: 500,
        },
      };

      expect(config.persistence).toBeDefined();
      expect(config.timerPersistence).toBeDefined();
      expect(config.persistence!.adapter).toBe(config.timerPersistence!.adapter);
    });
  });
});
