import { describe, it, expect } from 'vitest';
import {
  auditEntrySchema,
  auditQuerySchema,
  auditQueryResultSchema,
  auditStatsSchema,
  auditStreamQuerySchema,
  auditExportQuerySchema,
  auditSchemas,
} from '../../../../src/api/schemas/audit';
import { idParamSchema } from '../../../../src/api/schemas/common';
import { AUDIT_EVENT_CATEGORIES } from '../../../../src/audit/types';
import type { AuditCategory, AuditEventType } from '../../../../src/audit/types';

const ALL_CATEGORIES: AuditCategory[] = [
  'rule_management',
  'rule_execution',
  'fact_change',
  'event_emitted',
  'system',
];

const ALL_EVENT_TYPES: AuditEventType[] = [
  'rule_registered',
  'rule_unregistered',
  'rule_enabled',
  'rule_disabled',
  'rule_executed',
  'rule_skipped',
  'rule_failed',
  'fact_created',
  'fact_updated',
  'fact_deleted',
  'event_emitted',
  'engine_started',
  'engine_stopped',
];

describe('Audit API schemas', () => {
  describe('auditEntrySchema', () => {
    it('defines correct type and structure', () => {
      expect(auditEntrySchema.type).toBe('object');
      expect(auditEntrySchema.additionalProperties).toBe(true);
    });

    it('contains all required fields', () => {
      const required = auditEntrySchema.required;
      expect(required).toContain('id');
      expect(required).toContain('timestamp');
      expect(required).toContain('category');
      expect(required).toContain('type');
      expect(required).toContain('summary');
      expect(required).toContain('source');
      expect(required).toContain('details');
      expect(required).toHaveLength(7);
    });

    it('defines all properties with correct types', () => {
      const props = auditEntrySchema.properties;
      expect(props.id.type).toBe('string');
      expect(props.timestamp.type).toBe('number');
      expect(props.category.type).toBe('string');
      expect(props.type.type).toBe('string');
      expect(props.summary.type).toBe('string');
      expect(props.source.type).toBe('string');
      expect(props.ruleId.type).toBe('string');
      expect(props.ruleName.type).toBe('string');
      expect(props.correlationId.type).toBe('string');
      expect(props.details.type).toBe('object');
      expect(props.durationMs.type).toBe('number');
    });

    it('category enum matches all AuditCategory values', () => {
      const schemaCategories = [...auditEntrySchema.properties.category.enum];
      expect(schemaCategories.sort()).toEqual([...ALL_CATEGORIES].sort());
    });

    it('type enum matches all AuditEventType values', () => {
      const schemaTypes = [...auditEntrySchema.properties.type.enum];
      expect(schemaTypes.sort()).toEqual([...ALL_EVENT_TYPES].sort());
    });

    it('type enum covers every key in AUDIT_EVENT_CATEGORIES', () => {
      const eventCategoryKeys = Object.keys(AUDIT_EVENT_CATEGORIES) as AuditEventType[];
      const schemaTypes = [...auditEntrySchema.properties.type.enum];
      for (const key of eventCategoryKeys) {
        expect(schemaTypes).toContain(key);
      }
    });

    it('optional fields are not in required array', () => {
      const required = auditEntrySchema.required as readonly string[];
      expect(required).not.toContain('ruleId');
      expect(required).not.toContain('ruleName');
      expect(required).not.toContain('correlationId');
      expect(required).not.toContain('durationMs');
    });
  });

  describe('auditQuerySchema', () => {
    it('defines correct type', () => {
      expect(auditQuerySchema.type).toBe('object');
    });

    it('has no required fields (all filters optional)', () => {
      expect((auditQuerySchema as Record<string, unknown>).required).toBeUndefined();
    });

    it('supports category filter with correct enum', () => {
      const catProp = auditQuerySchema.properties.category;
      expect(catProp.type).toBe('string');
      expect([...catProp.enum]).toEqual(expect.arrayContaining(ALL_CATEGORIES));
    });

    it('supports types filter as comma-separated string', () => {
      expect(auditQuerySchema.properties.types.type).toBe('string');
    });

    it('supports ruleId, source, and correlationId string filters', () => {
      expect(auditQuerySchema.properties.ruleId.type).toBe('string');
      expect(auditQuerySchema.properties.source.type).toBe('string');
      expect(auditQuerySchema.properties.correlationId.type).toBe('string');
    });

    it('supports time range filters (from, to)', () => {
      expect(auditQuerySchema.properties.from.type).toBe('string');
      expect(auditQuerySchema.properties.from.pattern).toBeDefined();
      expect(auditQuerySchema.properties.to.type).toBe('string');
      expect(auditQuerySchema.properties.to.pattern).toBeDefined();
    });

    it('supports pagination with limit and offset', () => {
      const limit = auditQuerySchema.properties.limit;
      expect(limit.type).toBe('string');
      expect(limit.pattern).toBeDefined();

      const offset = auditQuerySchema.properties.offset;
      expect(offset.type).toBe('string');
      expect(offset.pattern).toBeDefined();
    });

    it('all fields have descriptions', () => {
      for (const [key, prop] of Object.entries(auditQuerySchema.properties)) {
        expect((prop as { description?: string }).description).toBeDefined();
      }
    });
  });

  describe('auditQueryResultSchema', () => {
    it('defines correct structure', () => {
      expect(auditQueryResultSchema.type).toBe('object');
    });

    it('contains all required fields', () => {
      const required = auditQueryResultSchema.required;
      expect(required).toContain('entries');
      expect(required).toContain('totalCount');
      expect(required).toContain('queryTimeMs');
      expect(required).toContain('hasMore');
      expect(required).toHaveLength(4);
    });

    it('entries is an array of auditEntrySchema', () => {
      const entries = auditQueryResultSchema.properties.entries;
      expect(entries.type).toBe('array');
      expect(entries.items).toBe(auditEntrySchema);
    });

    it('metadata fields have correct types', () => {
      expect(auditQueryResultSchema.properties.totalCount.type).toBe('number');
      expect(auditQueryResultSchema.properties.queryTimeMs.type).toBe('number');
      expect(auditQueryResultSchema.properties.hasMore.type).toBe('boolean');
    });
  });

  describe('auditStatsSchema', () => {
    it('defines correct structure', () => {
      expect(auditStatsSchema.type).toBe('object');
    });

    it('contains all required fields', () => {
      const required = auditStatsSchema.required;
      expect(required).toContain('totalEntries');
      expect(required).toContain('memoryEntries');
      expect(required).toContain('oldestEntry');
      expect(required).toContain('newestEntry');
      expect(required).toContain('entriesByCategory');
      expect(required).toContain('subscribersCount');
      expect(required).toHaveLength(6);
    });

    it('counter fields are numbers', () => {
      expect(auditStatsSchema.properties.totalEntries.type).toBe('number');
      expect(auditStatsSchema.properties.memoryEntries.type).toBe('number');
      expect(auditStatsSchema.properties.subscribersCount.type).toBe('number');
    });

    it('timestamp fields are nullable numbers', () => {
      expect(auditStatsSchema.properties.oldestEntry.type).toEqual(['number', 'null']);
      expect(auditStatsSchema.properties.newestEntry.type).toEqual(['number', 'null']);
    });

    it('entriesByCategory contains all categories', () => {
      const catSchema = auditStatsSchema.properties.entriesByCategory;
      expect(catSchema.type).toBe('object');
      for (const category of ALL_CATEGORIES) {
        expect(catSchema.properties[category]).toBeDefined();
        expect(catSchema.properties[category].type).toBe('number');
      }
      expect(catSchema.required).toEqual(expect.arrayContaining(ALL_CATEGORIES));
    });
  });

  describe('auditStreamQuerySchema', () => {
    it('defines correct type', () => {
      expect(auditStreamQuerySchema.type).toBe('object');
    });

    it('supports comma-separated filter fields', () => {
      expect(auditStreamQuerySchema.properties.categories.type).toBe('string');
      expect(auditStreamQuerySchema.properties.types.type).toBe('string');
      expect(auditStreamQuerySchema.properties.ruleIds.type).toBe('string');
      expect(auditStreamQuerySchema.properties.sources.type).toBe('string');
    });

    it('all fields have descriptions', () => {
      for (const [, prop] of Object.entries(auditStreamQuerySchema.properties)) {
        expect((prop as { description?: string }).description).toBeDefined();
      }
    });
  });

  describe('auditExportQuerySchema', () => {
    it('defines correct type', () => {
      expect(auditExportQuerySchema.type).toBe('object');
    });

    it('supports json and csv formats', () => {
      const format = auditExportQuerySchema.properties.format;
      expect(format.type).toBe('string');
      expect([...format.enum]).toEqual(['json', 'csv']);
      expect(format.default).toBe('json');
    });

    it('supports same filters as query schema', () => {
      expect(auditExportQuerySchema.properties.category.type).toBe('string');
      expect(auditExportQuerySchema.properties.types.type).toBe('string');
      expect(auditExportQuerySchema.properties.ruleId.type).toBe('string');
      expect(auditExportQuerySchema.properties.source.type).toBe('string');
      expect(auditExportQuerySchema.properties.from.type).toBe('string');
      expect(auditExportQuerySchema.properties.to.type).toBe('string');
    });
  });

  describe('auditSchemas endpoint configurations', () => {
    it('list endpoint has correct configuration', () => {
      const schema = auditSchemas.list;
      expect(schema.tags).toContain('Audit');
      expect(schema.summary).toBeDefined();
      expect(schema.description).toBeDefined();
      expect(schema.querystring).toBe(auditQuerySchema);
      expect(schema.response[200]).toBe(auditQueryResultSchema);
    });

    it('get endpoint uses idParamSchema', () => {
      const schema = auditSchemas.get;
      expect(schema.tags).toContain('Audit');
      expect(schema.params).toBe(idParamSchema);
      expect(schema.response[200]).toBe(auditEntrySchema);
    });

    it('stats endpoint returns auditStatsSchema', () => {
      const schema = auditSchemas.stats;
      expect(schema.tags).toContain('Audit');
      expect(schema.response[200]).toBe(auditStatsSchema);
    });

    it('stream endpoint has SSE tag and query schema', () => {
      const schema = auditSchemas.stream;
      expect(schema.tags).toContain('Audit');
      expect(schema.tags).toContain('SSE');
      expect(schema.querystring).toBe(auditStreamQuerySchema);
    });

    it('streamStats endpoint returns connection statistics', () => {
      const schema = auditSchemas.streamStats;
      expect(schema.tags).toContain('Audit');
      expect(schema.tags).toContain('SSE');
      const responseProps = schema.response[200].properties;
      expect(responseProps.activeConnections.type).toBe('number');
      expect(responseProps.totalEntriesSent.type).toBe('number');
      expect(responseProps.totalEntriesFiltered.type).toBe('number');
    });

    it('export endpoint has correct configuration', () => {
      const schema = auditSchemas.export;
      expect(schema.tags).toContain('Audit');
      expect(schema.querystring).toBe(auditExportQuerySchema);
      expect(schema.response[200]).toEqual({ type: 'string' });
    });

    it('cleanup endpoint returns removedCount and remainingCount', () => {
      const schema = auditSchemas.cleanup;
      expect(schema.tags).toContain('Audit');
      const response = schema.response[200];
      expect(response.properties.removedCount.type).toBe('number');
      expect(response.properties.remainingCount.type).toBe('number');
      expect(response.required).toContain('removedCount');
      expect(response.required).toContain('remainingCount');
    });

    it('all endpoints have tags, summary, and description', () => {
      for (const [name, schema] of Object.entries(auditSchemas)) {
        expect(schema.tags?.length, `${name} should have tags`).toBeGreaterThan(0);
        expect(schema.summary, `${name} should have summary`).toBeDefined();
        expect(schema.description, `${name} should have description`).toBeDefined();
      }
    });
  });

  describe('barrel export', () => {
    it('all audit schemas are exported from index', async () => {
      const index = await import('../../../../src/api/schemas/index');
      expect(index.auditEntrySchema).toBe(auditEntrySchema);
      expect(index.auditQuerySchema).toBe(auditQuerySchema);
      expect(index.auditQueryResultSchema).toBe(auditQueryResultSchema);
      expect(index.auditStatsSchema).toBe(auditStatsSchema);
      expect(index.auditStreamQuerySchema).toBe(auditStreamQuerySchema);
      expect(index.auditExportQuerySchema).toBe(auditExportQuerySchema);
      expect(index.auditSchemas).toBe(auditSchemas);
    });
  });
});
