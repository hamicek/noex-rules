import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AuditCategory,
  AuditEventType,
  AuditEntry,
  AuditQuery,
  AuditQueryResult,
  AuditConfig,
  AuditSubscriber,
  AuditStats,
} from '../../src/audit/types.js';
import { AUDIT_EVENT_CATEGORIES } from '../../src/audit/types.js';

describe('Audit types', () => {
  describe('AUDIT_EVENT_CATEGORIES', () => {
    it('maps all rule management events to rule_management', () => {
      expect(AUDIT_EVENT_CATEGORIES.rule_registered).toBe('rule_management');
      expect(AUDIT_EVENT_CATEGORIES.rule_unregistered).toBe('rule_management');
      expect(AUDIT_EVENT_CATEGORIES.rule_enabled).toBe('rule_management');
      expect(AUDIT_EVENT_CATEGORIES.rule_disabled).toBe('rule_management');
    });

    it('maps all group management events to rule_management', () => {
      expect(AUDIT_EVENT_CATEGORIES.group_created).toBe('rule_management');
      expect(AUDIT_EVENT_CATEGORIES.group_deleted).toBe('rule_management');
      expect(AUDIT_EVENT_CATEGORIES.group_enabled).toBe('rule_management');
      expect(AUDIT_EVENT_CATEGORIES.group_disabled).toBe('rule_management');
    });

    it('maps all rule execution events to rule_execution', () => {
      expect(AUDIT_EVENT_CATEGORIES.rule_executed).toBe('rule_execution');
      expect(AUDIT_EVENT_CATEGORIES.rule_skipped).toBe('rule_execution');
      expect(AUDIT_EVENT_CATEGORIES.rule_failed).toBe('rule_execution');
    });

    it('maps all fact change events to fact_change', () => {
      expect(AUDIT_EVENT_CATEGORIES.fact_created).toBe('fact_change');
      expect(AUDIT_EVENT_CATEGORIES.fact_updated).toBe('fact_change');
      expect(AUDIT_EVENT_CATEGORIES.fact_deleted).toBe('fact_change');
    });

    it('maps event_emitted to event_emitted', () => {
      expect(AUDIT_EVENT_CATEGORIES.event_emitted).toBe('event_emitted');
    });

    it('maps system events to system', () => {
      expect(AUDIT_EVENT_CATEGORIES.engine_started).toBe('system');
      expect(AUDIT_EVENT_CATEGORIES.engine_stopped).toBe('system');
    });

    it('covers exactly 18 event types', () => {
      expect(Object.keys(AUDIT_EVENT_CATEGORIES)).toHaveLength(18);
    });

    it('maps to exactly 5 categories', () => {
      const categories = new Set(Object.values(AUDIT_EVENT_CATEGORIES));
      expect(categories.size).toBe(5);
      expect(categories).toContain('rule_management');
      expect(categories).toContain('rule_execution');
      expect(categories).toContain('fact_change');
      expect(categories).toContain('event_emitted');
      expect(categories).toContain('system');
    });
  });

  describe('AuditEntry type contract', () => {
    it('accepts a minimal valid entry', () => {
      const entry: AuditEntry = {
        id: 'audit-001',
        timestamp: Date.now(),
        category: 'rule_execution',
        type: 'rule_executed',
        summary: 'Rule "checkTemperature" executed successfully',
        source: 'rule-engine',
        details: {},
      };

      expect(entry.id).toBe('audit-001');
      expect(entry.ruleId).toBeUndefined();
      expect(entry.ruleName).toBeUndefined();
      expect(entry.correlationId).toBeUndefined();
      expect(entry.durationMs).toBeUndefined();
    });

    it('accepts a fully populated entry', () => {
      const entry: AuditEntry = {
        id: 'audit-002',
        timestamp: 1700000000000,
        category: 'rule_execution',
        type: 'rule_failed',
        summary: 'Rule "alertOnHigh" failed: timeout',
        source: 'rule-engine',
        ruleId: 'rule-alert-high',
        ruleName: 'alertOnHigh',
        correlationId: 'corr-abc-123',
        details: { error: 'Timeout after 5000ms', retries: 3 },
        durationMs: 5012,
      };

      expect(entry.ruleId).toBe('rule-alert-high');
      expect(entry.durationMs).toBe(5012);
      expect(entry.details).toEqual({ error: 'Timeout after 5000ms', retries: 3 });
    });
  });

  describe('AuditQuery type contract', () => {
    it('accepts an empty query (match all)', () => {
      const query: AuditQuery = {};
      expect(query.category).toBeUndefined();
      expect(query.limit).toBeUndefined();
    });

    it('accepts a fully constrained query', () => {
      const query: AuditQuery = {
        category: 'fact_change',
        types: ['fact_created', 'fact_updated'],
        ruleId: 'rule-1',
        source: 'api',
        correlationId: 'corr-1',
        from: 1700000000000,
        to: 1700001000000,
        limit: 50,
        offset: 100,
      };

      expect(query.types).toHaveLength(2);
      expect(query.limit).toBe(50);
      expect(query.offset).toBe(100);
    });
  });

  describe('AuditQueryResult type contract', () => {
    it('represents an empty result set', () => {
      const result: AuditQueryResult = {
        entries: [],
        totalCount: 0,
        queryTimeMs: 1.2,
        hasMore: false,
      };

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('represents a paginated result with more pages', () => {
      const entry: AuditEntry = {
        id: 'a1',
        timestamp: Date.now(),
        category: 'system',
        type: 'engine_started',
        summary: 'Engine started',
        source: 'rule-engine',
        details: { config: { maxConcurrency: 4 } },
      };

      const result: AuditQueryResult = {
        entries: [entry],
        totalCount: 250,
        queryTimeMs: 3.5,
        hasMore: true,
      };

      expect(result.entries).toHaveLength(1);
      expect(result.totalCount).toBe(250);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('AuditConfig type contract', () => {
    it('accepts empty config (all defaults)', () => {
      const config: AuditConfig = {};
      expect(config.enabled).toBeUndefined();
      expect(config.maxMemoryEntries).toBeUndefined();
    });

    it('accepts full config override', () => {
      const config: AuditConfig = {
        enabled: true,
        maxMemoryEntries: 100_000,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        batchSize: 200,
        flushIntervalMs: 10_000,
      };

      expect(config.batchSize).toBe(200);
      expect(config.retentionMs).toBe(604_800_000);
    });
  });

  describe('AuditStats type contract', () => {
    it('represents empty stats', () => {
      const stats: AuditStats = {
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
      };

      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
      expect(stats.entriesByCategory.rule_management).toBe(0);
    });

    it('represents populated stats', () => {
      const now = Date.now();
      const stats: AuditStats = {
        totalEntries: 1500,
        memoryEntries: 1200,
        oldestEntry: now - 86_400_000,
        newestEntry: now,
        entriesByCategory: {
          rule_management: 20,
          rule_execution: 1100,
          fact_change: 350,
          event_emitted: 25,
          system: 5,
        },
        subscribersCount: 3,
      };

      expect(stats.totalEntries).toBe(1500);
      expect(stats.oldestEntry).toBeLessThan(stats.newestEntry!);
    });
  });

  describe('Type-level assertions', () => {
    it('AuditCategory is a string union', () => {
      expectTypeOf<AuditCategory>().toBeString();
    });

    it('AuditEventType is a string union', () => {
      expectTypeOf<AuditEventType>().toBeString();
    });

    it('AuditSubscriber is a function accepting AuditEntry', () => {
      expectTypeOf<AuditSubscriber>().toBeFunction();
      expectTypeOf<AuditSubscriber>().parameter(0).toMatchTypeOf<AuditEntry>();
    });

    it('AuditEntry.details is Record<string, unknown>', () => {
      expectTypeOf<AuditEntry['details']>().toEqualTypeOf<Record<string, unknown>>();
    });

    it('AuditEntry optional fields are properly typed', () => {
      expectTypeOf<AuditEntry['ruleId']>().toEqualTypeOf<string | undefined>();
      expectTypeOf<AuditEntry['ruleName']>().toEqualTypeOf<string | undefined>();
      expectTypeOf<AuditEntry['correlationId']>().toEqualTypeOf<string | undefined>();
      expectTypeOf<AuditEntry['durationMs']>().toEqualTypeOf<number | undefined>();
    });

    it('AuditQuery all fields are optional', () => {
      expectTypeOf<AuditQuery>().toMatchTypeOf<Record<string, unknown>>();
      expectTypeOf({} as const).toMatchTypeOf<AuditQuery>();
    });

    it('AuditStats.entriesByCategory covers all categories', () => {
      expectTypeOf<AuditStats['entriesByCategory']>().toEqualTypeOf<Record<AuditCategory, number>>();
    });

    it('AUDIT_EVENT_CATEGORIES maps AuditEventType to AuditCategory', () => {
      expectTypeOf(AUDIT_EVENT_CATEGORIES).toEqualTypeOf<Record<AuditEventType, AuditCategory>>();
    });
  });
});
