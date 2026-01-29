import { describe, it, expect } from 'vitest';
import { MemoryAdapter, SQLiteAdapter } from '@hamicek/noex';
import type { AuditPersistenceConfig, RuleEngineConfig, EngineStats } from '../../../src/types/index.js';

describe('AuditPersistenceConfig', () => {
  describe('type compatibility', () => {
    it('should accept MemoryAdapter with no optional fields', () => {
      const config: AuditPersistenceConfig = {
        adapter: new MemoryAdapter(),
      };

      expect(config.adapter).toBeDefined();
      expect(config.retentionMs).toBeUndefined();
      expect(config.batchSize).toBeUndefined();
      expect(config.flushIntervalMs).toBeUndefined();
      expect(config.maxMemoryEntries).toBeUndefined();
    });

    it('should accept SQLiteAdapter', () => {
      const config: AuditPersistenceConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
      };

      expect(config.adapter).toBeDefined();
    });

    it('should accept optional retentionMs parameter', () => {
      const config: AuditPersistenceConfig = {
        adapter: new MemoryAdapter(),
        retentionMs: 7 * 24 * 60 * 60 * 1_000, // 7 days
      };

      expect(config.retentionMs).toBe(604_800_000);
    });

    it('should accept optional batchSize parameter', () => {
      const config: AuditPersistenceConfig = {
        adapter: new MemoryAdapter(),
        batchSize: 200,
      };

      expect(config.batchSize).toBe(200);
    });

    it('should accept optional flushIntervalMs parameter', () => {
      const config: AuditPersistenceConfig = {
        adapter: new MemoryAdapter(),
        flushIntervalMs: 10_000,
      };

      expect(config.flushIntervalMs).toBe(10_000);
    });

    it('should accept optional maxMemoryEntries parameter', () => {
      const config: AuditPersistenceConfig = {
        adapter: new MemoryAdapter(),
        maxMemoryEntries: 100_000,
      };

      expect(config.maxMemoryEntries).toBe(100_000);
    });

    it('should accept full configuration', () => {
      const config: AuditPersistenceConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
        retentionMs: 30 * 24 * 60 * 60 * 1_000,
        batchSize: 50,
        flushIntervalMs: 3_000,
        maxMemoryEntries: 25_000,
      };

      expect(config.adapter).toBeDefined();
      expect(config.retentionMs).toBe(2_592_000_000);
      expect(config.batchSize).toBe(50);
      expect(config.flushIntervalMs).toBe(3_000);
      expect(config.maxMemoryEntries).toBe(25_000);
    });
  });

  describe('type constraints', () => {
    it('should require adapter property', () => {
      // @ts-expect-error - adapter is required
      const _invalidConfig: AuditPersistenceConfig = {};
      expect(true).toBe(true);
    });

    it('should not accept invalid adapter type', () => {
      // @ts-expect-error - adapter must be StorageAdapter
      const _invalidConfig: AuditPersistenceConfig = {
        adapter: { notAStorageAdapter: true },
      };
      expect(true).toBe(true);
    });
  });

  describe('RuleEngineConfig integration', () => {
    it('should allow RuleEngineConfig without audit', () => {
      const config: RuleEngineConfig = {
        name: 'test-engine',
      };

      expect(config.audit).toBeUndefined();
    });

    it('should accept audit in RuleEngineConfig', () => {
      const config: RuleEngineConfig = {
        name: 'test-engine',
        audit: {
          adapter: new MemoryAdapter(),
        },
      };

      expect(config.audit).toBeDefined();
      expect(config.audit!.adapter).toBeDefined();
    });

    it('should accept audit with all options in RuleEngineConfig', () => {
      const config: RuleEngineConfig = {
        name: 'test-engine',
        audit: {
          adapter: new MemoryAdapter(),
          retentionMs: 604_800_000,
          batchSize: 50,
          flushIntervalMs: 10_000,
          maxMemoryEntries: 20_000,
        },
      };

      expect(config.audit!.retentionMs).toBe(604_800_000);
      expect(config.audit!.batchSize).toBe(50);
      expect(config.audit!.flushIntervalMs).toBe(10_000);
      expect(config.audit!.maxMemoryEntries).toBe(20_000);
    });

    it('should coexist with all other persistence configs', () => {
      const adapter = new MemoryAdapter();
      const config: RuleEngineConfig = {
        name: 'full-persistence',
        persistence: {
          adapter,
          key: 'rules',
        },
        timerPersistence: {
          adapter,
          checkIntervalMs: 500,
        },
        audit: {
          adapter,
          batchSize: 100,
        },
      };

      expect(config.persistence).toBeDefined();
      expect(config.timerPersistence).toBeDefined();
      expect(config.audit).toBeDefined();
      expect(config.persistence!.adapter).toBe(config.audit!.adapter);
      expect(config.timerPersistence!.adapter).toBe(config.audit!.adapter);
    });
  });

  describe('EngineStats integration', () => {
    it('should allow EngineStats without audit', () => {
      const stats: EngineStats = {
        rulesCount: 5,
        factsCount: 10,
        timersCount: 2,
        eventsProcessed: 100,
        rulesExecuted: 50,
        avgProcessingTimeMs: 1.5,
      };

      expect(stats.audit).toBeUndefined();
    });

    it('should accept audit stats in EngineStats', () => {
      const stats: EngineStats = {
        rulesCount: 5,
        factsCount: 10,
        timersCount: 2,
        eventsProcessed: 100,
        rulesExecuted: 50,
        avgProcessingTimeMs: 1.5,
        audit: {
          totalEntries: 250,
          memoryEntries: 200,
          oldestEntry: 1700000000000,
          newestEntry: 1700000500000,
          entriesByCategory: {
            rule_management: 20,
            rule_execution: 150,
            fact_change: 50,
            event_emitted: 25,
            system: 5,
          },
          subscribersCount: 2,
        },
      };

      expect(stats.audit).toBeDefined();
      expect(stats.audit!.totalEntries).toBe(250);
      expect(stats.audit!.memoryEntries).toBe(200);
      expect(stats.audit!.entriesByCategory.rule_execution).toBe(150);
    });

    it('should accept audit stats with null timestamps when empty', () => {
      const stats: EngineStats = {
        rulesCount: 0,
        factsCount: 0,
        timersCount: 0,
        eventsProcessed: 0,
        rulesExecuted: 0,
        avgProcessingTimeMs: 0,
        audit: {
          totalEntries: 0,
          memoryEntries: 0,
          oldestEntry: null,
          newestEntry: null,
          entriesByCategory: {
            rule_management: 0,
            rule_execution: 0,
            fact_change: 0,
            event_emitted: 0,
            system: 0,
          },
          subscribersCount: 0,
        },
      };

      expect(stats.audit!.oldestEntry).toBeNull();
      expect(stats.audit!.newestEntry).toBeNull();
    });
  });
});
