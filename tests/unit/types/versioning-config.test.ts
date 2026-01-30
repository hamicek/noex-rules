import { describe, it, expect } from 'vitest';
import { MemoryAdapter, SQLiteAdapter } from '@hamicek/noex';
import type { VersioningConfig, VersioningStats, RuleEngineConfig, EngineStats } from '../../../src/types/index.js';

describe('VersioningConfig', () => {
  describe('type compatibility', () => {
    it('should accept adapter with no optional fields', () => {
      const config: VersioningConfig = {
        adapter: new MemoryAdapter(),
      };

      expect(config.adapter).toBeDefined();
      expect(config.maxVersionsPerRule).toBeUndefined();
      expect(config.maxAgeMs).toBeUndefined();
    });

    it('should accept SQLiteAdapter', () => {
      const config: VersioningConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
      };

      expect(config.adapter).toBeDefined();
    });

    it('should accept optional maxVersionsPerRule parameter', () => {
      const config: VersioningConfig = {
        adapter: new MemoryAdapter(),
        maxVersionsPerRule: 50,
      };

      expect(config.maxVersionsPerRule).toBe(50);
    });

    it('should accept optional maxAgeMs parameter', () => {
      const config: VersioningConfig = {
        adapter: new MemoryAdapter(),
        maxAgeMs: 30 * 24 * 60 * 60 * 1_000, // 30 days
      };

      expect(config.maxAgeMs).toBe(2_592_000_000);
    });

    it('should accept full configuration', () => {
      const config: VersioningConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
        maxVersionsPerRule: 200,
        maxAgeMs: 90 * 24 * 60 * 60 * 1_000, // 90 days
      };

      expect(config.adapter).toBeDefined();
      expect(config.maxVersionsPerRule).toBe(200);
      expect(config.maxAgeMs).toBe(7_776_000_000);
    });
  });

  describe('type constraints', () => {
    it('should require adapter property', () => {
      // @ts-expect-error - adapter is required
      const _invalidConfig: VersioningConfig = {};
      expect(true).toBe(true);
    });

    it('should not accept invalid adapter type', () => {
      // @ts-expect-error - adapter must be StorageAdapter
      const _invalidConfig: VersioningConfig = {
        adapter: { notAStorageAdapter: true },
      };
      expect(true).toBe(true);
    });
  });
});

describe('VersioningStats', () => {
  describe('type compatibility', () => {
    it('should accept stats with all fields', () => {
      const stats: VersioningStats = {
        trackedRules: 10,
        totalVersions: 45,
        dirtyRules: 2,
        oldestEntry: 1700000000000,
        newestEntry: 1700000500000,
      };

      expect(stats.trackedRules).toBe(10);
      expect(stats.totalVersions).toBe(45);
      expect(stats.dirtyRules).toBe(2);
      expect(stats.oldestEntry).toBe(1700000000000);
      expect(stats.newestEntry).toBe(1700000500000);
    });

    it('should accept null timestamps when empty', () => {
      const stats: VersioningStats = {
        trackedRules: 0,
        totalVersions: 0,
        dirtyRules: 0,
        oldestEntry: null,
        newestEntry: null,
      };

      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });
});

describe('RuleEngineConfig versioning integration', () => {
  it('should allow RuleEngineConfig without versioning', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
    };

    expect(config.versioning).toBeUndefined();
  });

  it('should accept versioning in RuleEngineConfig', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
      versioning: {
        adapter: new MemoryAdapter(),
      },
    };

    expect(config.versioning).toBeDefined();
    expect(config.versioning!.adapter).toBeDefined();
  });

  it('should accept versioning with all options in RuleEngineConfig', () => {
    const config: RuleEngineConfig = {
      name: 'test-engine',
      versioning: {
        adapter: new MemoryAdapter(),
        maxVersionsPerRule: 50,
        maxAgeMs: 30 * 24 * 60 * 60 * 1_000,
      },
    };

    expect(config.versioning!.maxVersionsPerRule).toBe(50);
    expect(config.versioning!.maxAgeMs).toBe(2_592_000_000);
  });

  it('should coexist with all other config options', () => {
    const adapter = new MemoryAdapter();
    const config: RuleEngineConfig = {
      name: 'full-config',
      maxConcurrency: 5,
      debounceMs: 100,
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
      tracing: {
        enabled: true,
        maxEntries: 5000,
      },
      metrics: {
        enabled: true,
        perRuleMetrics: true,
      },
      opentelemetry: {
        enabled: true,
        serviceName: 'full-config-engine',
      },
      versioning: {
        adapter,
        maxVersionsPerRule: 100,
        maxAgeMs: 90 * 24 * 60 * 60 * 1_000,
      },
    };

    expect(config.persistence).toBeDefined();
    expect(config.timerPersistence).toBeDefined();
    expect(config.audit).toBeDefined();
    expect(config.tracing).toBeDefined();
    expect(config.metrics).toBeDefined();
    expect(config.opentelemetry).toBeDefined();
    expect(config.versioning).toBeDefined();
    expect(config.versioning!.adapter).toBe(config.audit!.adapter);
  });
});

describe('EngineStats versioning integration', () => {
  it('should allow EngineStats without versioning', () => {
    const stats: EngineStats = {
      rulesCount: 5,
      factsCount: 10,
      timersCount: 2,
      eventsProcessed: 100,
      rulesExecuted: 50,
      avgProcessingTimeMs: 1.5,
    };

    expect(stats.versioning).toBeUndefined();
  });

  it('should accept versioning stats in EngineStats', () => {
    const stats: EngineStats = {
      rulesCount: 5,
      factsCount: 10,
      timersCount: 2,
      eventsProcessed: 100,
      rulesExecuted: 50,
      avgProcessingTimeMs: 1.5,
      versioning: {
        trackedRules: 5,
        totalVersions: 23,
        dirtyRules: 1,
        oldestEntry: 1700000000000,
        newestEntry: 1700000500000,
      },
    };

    expect(stats.versioning).toBeDefined();
    expect(stats.versioning!.trackedRules).toBe(5);
    expect(stats.versioning!.totalVersions).toBe(23);
    expect(stats.versioning!.dirtyRules).toBe(1);
    expect(stats.versioning!.oldestEntry).toBe(1700000000000);
    expect(stats.versioning!.newestEntry).toBe(1700000500000);
  });

  it('should accept versioning stats with null timestamps when empty', () => {
    const stats: EngineStats = {
      rulesCount: 0,
      factsCount: 0,
      timersCount: 0,
      eventsProcessed: 0,
      rulesExecuted: 0,
      avgProcessingTimeMs: 0,
      versioning: {
        trackedRules: 0,
        totalVersions: 0,
        dirtyRules: 0,
        oldestEntry: null,
        newestEntry: null,
      },
    };

    expect(stats.versioning!.oldestEntry).toBeNull();
    expect(stats.versioning!.newestEntry).toBeNull();
  });

  it('should coexist with audit stats in EngineStats', () => {
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
      versioning: {
        trackedRules: 5,
        totalVersions: 23,
        dirtyRules: 0,
        oldestEntry: 1700000000000,
        newestEntry: 1700000500000,
      },
    };

    expect(stats.audit).toBeDefined();
    expect(stats.versioning).toBeDefined();
    expect(stats.audit!.totalEntries).toBe(250);
    expect(stats.versioning!.totalVersions).toBe(23);
  });
});
