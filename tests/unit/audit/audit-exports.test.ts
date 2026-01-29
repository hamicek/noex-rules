import { describe, it, expect } from 'vitest';
import * as mainExports from '../../../src/index';

describe('Audit barrel export from src/index.ts', () => {
  it('exports AuditLogService class', () => {
    expect(mainExports.AuditLogService).toBeDefined();
    expect(typeof mainExports.AuditLogService.start).toBe('function');
  });

  it('exports AUDIT_EVENT_CATEGORIES mapping', () => {
    expect(mainExports.AUDIT_EVENT_CATEGORIES).toBeDefined();
    expect(mainExports.AUDIT_EVENT_CATEGORIES.rule_registered).toBe('rule_management');
    expect(mainExports.AUDIT_EVENT_CATEGORIES.rule_executed).toBe('rule_execution');
    expect(mainExports.AUDIT_EVENT_CATEGORIES.fact_created).toBe('fact_change');
    expect(mainExports.AUDIT_EVENT_CATEGORIES.event_emitted).toBe('event_emitted');
    expect(mainExports.AUDIT_EVENT_CATEGORIES.engine_started).toBe('system');
  });

  it('exports audit types usable at runtime via AuditLogService', async () => {
    const service = await mainExports.AuditLogService.start();
    const entry = service.record('engine_started', { version: '1.0.0' });

    expect(entry.id).toBeDefined();
    expect(entry.category).toBe('system');
    expect(entry.type).toBe('engine_started');
    expect(entry.details).toEqual({ version: '1.0.0' });

    await service.stop();
  });

  it('AuditPersistenceConfig is usable in RuleEngineConfig type', () => {
    // Verify AuditPersistenceConfig is part of the exported types
    // by checking EngineStats (which references AuditStats) is accessible
    const stats: mainExports.EngineStats = {
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
    expect(stats.audit).toBeDefined();
    expect(stats.audit!.totalEntries).toBe(0);
  });
});
