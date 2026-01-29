/**
 * JSON schémata pro Audit API.
 */

import { idParamSchema } from './common.js';

const auditCategoryEnum = [
  'rule_management',
  'rule_execution',
  'fact_change',
  'event_emitted',
  'system'
] as const;

const auditEventTypeEnum = [
  'rule_registered',
  'rule_unregistered',
  'rule_enabled',
  'rule_disabled',
  'rule_executed',
  'rule_skipped',
  'rule_failed',
  'group_created',
  'group_updated',
  'group_deleted',
  'group_enabled',
  'group_disabled',
  'fact_created',
  'fact_updated',
  'fact_deleted',
  'event_emitted',
  'engine_started',
  'engine_stopped',
  'hot_reload_started',
  'hot_reload_completed',
  'hot_reload_failed'
] as const;

export const auditEntrySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    timestamp: { type: 'number' },
    category: { type: 'string', enum: auditCategoryEnum },
    type: { type: 'string', enum: auditEventTypeEnum },
    summary: { type: 'string' },
    source: { type: 'string' },
    ruleId: { type: 'string' },
    ruleName: { type: 'string' },
    correlationId: { type: 'string' },
    details: { type: 'object', additionalProperties: true },
    durationMs: { type: 'number' }
  },
  required: ['id', 'timestamp', 'category', 'type', 'summary', 'source', 'details']
} as const;

export const auditQuerySchema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: auditCategoryEnum, description: 'Filter by audit category' },
    types: { type: 'string', description: 'Comma-separated list of event types to filter' },
    ruleId: { type: 'string', description: 'Filter by rule ID' },
    source: { type: 'string', description: 'Filter by source component' },
    correlationId: { type: 'string', description: 'Filter by correlation ID' },
    from: { type: 'string', pattern: '^\\d+$', description: 'Filter entries after this timestamp (inclusive)' },
    to: { type: 'string', pattern: '^\\d+$', description: 'Filter entries before this timestamp (inclusive)' },
    limit: { type: 'string', pattern: '^\\d+$', description: 'Maximum number of entries to return (1-1000)' },
    offset: { type: 'string', pattern: '^\\d+$', description: 'Number of entries to skip for pagination' }
  }
} as const;

export const auditQueryResultSchema = {
  type: 'object',
  properties: {
    entries: { type: 'array', items: auditEntrySchema },
    totalCount: { type: 'number' },
    queryTimeMs: { type: 'number' },
    hasMore: { type: 'boolean' }
  },
  required: ['entries', 'totalCount', 'queryTimeMs', 'hasMore']
} as const;

export const auditStatsSchema = {
  type: 'object',
  properties: {
    totalEntries: { type: 'number' },
    memoryEntries: { type: 'number' },
    oldestEntry: { type: ['number', 'null'] },
    newestEntry: { type: ['number', 'null'] },
    entriesByCategory: {
      type: 'object',
      properties: {
        rule_management: { type: 'number' },
        rule_execution: { type: 'number' },
        fact_change: { type: 'number' },
        event_emitted: { type: 'number' },
        system: { type: 'number' }
      },
      required: ['rule_management', 'rule_execution', 'fact_change', 'event_emitted', 'system']
    },
    subscribersCount: { type: 'number' }
  },
  required: ['totalEntries', 'memoryEntries', 'oldestEntry', 'newestEntry', 'entriesByCategory', 'subscribersCount']
} as const;

export const auditStreamQuerySchema = {
  type: 'object',
  properties: {
    categories: { type: 'string', description: 'Comma-separated list of audit categories to filter' },
    types: { type: 'string', description: 'Comma-separated list of event types to filter' },
    ruleIds: { type: 'string', description: 'Comma-separated list of rule IDs to filter' },
    sources: { type: 'string', description: 'Comma-separated list of sources to filter' }
  }
} as const;

export const auditExportQuerySchema = {
  type: 'object',
  properties: {
    format: { type: 'string', enum: ['json', 'csv'], default: 'json', description: 'Export format' },
    category: { type: 'string', enum: auditCategoryEnum, description: 'Filter by audit category' },
    types: { type: 'string', description: 'Comma-separated list of event types to filter' },
    ruleId: { type: 'string', description: 'Filter by rule ID' },
    source: { type: 'string', description: 'Filter by source component' },
    from: { type: 'string', pattern: '^\\d+$', description: 'Filter entries after this timestamp (inclusive)' },
    to: { type: 'string', pattern: '^\\d+$', description: 'Filter entries before this timestamp (inclusive)' }
  }
} as const;

export const auditSchemas = {
  list: {
    tags: ['Audit'],
    summary: 'Query audit entries',
    description: 'Query audit log entries with flexible filtering and pagination',
    querystring: auditQuerySchema,
    response: {
      200: auditQueryResultSchema
    }
  },
  get: {
    tags: ['Audit'],
    summary: 'Get audit entry by ID',
    description: 'Returns a single audit entry by its ID',
    params: idParamSchema,
    response: {
      200: auditEntrySchema
    }
  },
  stats: {
    tags: ['Audit'],
    summary: 'Get audit statistics',
    description: 'Returns current audit log statistics including entry counts and category breakdown',
    response: {
      200: auditStatsSchema
    }
  },
  stream: {
    tags: ['Audit', 'SSE'],
    summary: 'Stream audit entries via SSE',
    description: 'Real-time Server-Sent Events stream of audit entries with optional filtering',
    querystring: auditStreamQuerySchema
  },
  streamStats: {
    tags: ['Audit', 'SSE'],
    summary: 'Get audit stream statistics',
    description: 'Returns statistics about active audit SSE connections',
    response: {
      200: {
        type: 'object',
        properties: {
          activeConnections: { type: 'number' },
          totalEntriesSent: { type: 'number' },
          totalEntriesFiltered: { type: 'number' }
        },
        required: ['activeConnections', 'totalEntriesSent', 'totalEntriesFiltered']
      }
    }
  },
  export: {
    tags: ['Audit'],
    summary: 'Export audit entries',
    description: 'Export audit entries in JSON or CSV format with optional filtering',
    querystring: auditExportQuerySchema,
    response: {
      200: { type: 'string' }
    }
  },
  cleanup: {
    tags: ['Audit'],
    summary: 'Cleanup old audit entries',
    description: 'Manually trigger cleanup of audit entries older than the configured retention period',
    response: {
      200: {
        type: 'object',
        properties: {
          removedCount: { type: 'number' },
          remainingCount: { type: 'number' }
        },
        required: ['removedCount', 'remainingCount']
      }
    }
  }
};
