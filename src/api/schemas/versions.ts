/**
 * JSON schémata pro Versions API.
 */
import { idParamSchema } from './common.js';
import { ruleSchema } from './rule.js';

const changeTypeEnum = [
  'registered',
  'updated',
  'enabled',
  'disabled',
  'unregistered',
  'rolled_back'
] as const;

const ruleFieldChangeSchema = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    oldValue: {},
    newValue: {}
  },
  required: ['field', 'oldValue', 'newValue']
} as const;

export const ruleVersionEntrySchema = {
  type: 'object',
  properties: {
    version: { type: 'number' },
    ruleSnapshot: ruleSchema,
    timestamp: { type: 'number' },
    changeType: { type: 'string', enum: changeTypeEnum },
    rolledBackFrom: { type: 'number' },
    description: { type: 'string' }
  },
  required: ['version', 'ruleSnapshot', 'timestamp', 'changeType']
} as const;

export const ruleVersionQueryResultSchema = {
  type: 'object',
  properties: {
    entries: { type: 'array', items: ruleVersionEntrySchema },
    totalVersions: { type: 'number' },
    hasMore: { type: 'boolean' }
  },
  required: ['entries', 'totalVersions', 'hasMore']
} as const;

export const ruleVersionDiffSchema = {
  type: 'object',
  properties: {
    ruleId: { type: 'string' },
    fromVersion: { type: 'number' },
    toVersion: { type: 'number' },
    changes: { type: 'array', items: ruleFieldChangeSchema }
  },
  required: ['ruleId', 'fromVersion', 'toVersion', 'changes']
} as const;

const versionIdParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    version: { type: 'string', pattern: '^\\d+$' }
  },
  required: ['id', 'version']
} as const;

const versionsQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'string', pattern: '^\\d+$', description: 'Maximum number of entries to return (default: 50)' },
    offset: { type: 'string', pattern: '^\\d+$', description: 'Number of entries to skip for pagination' },
    order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order by version number (default: desc)' },
    fromVersion: { type: 'string', pattern: '^\\d+$', description: 'Minimum version number (inclusive)' },
    toVersion: { type: 'string', pattern: '^\\d+$', description: 'Maximum version number (inclusive)' },
    changeTypes: { type: 'string', description: 'Comma-separated list of change types to filter' },
    from: { type: 'string', pattern: '^\\d+$', description: 'Filter entries after this timestamp (inclusive)' },
    to: { type: 'string', pattern: '^\\d+$', description: 'Filter entries before this timestamp (inclusive)' }
  }
} as const;

const diffQuerySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', pattern: '^\\d+$', description: 'Source version number' },
    to: { type: 'string', pattern: '^\\d+$', description: 'Target version number' }
  },
  required: ['from', 'to']
} as const;

const rollbackBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { type: 'number', description: 'Target version number to rollback to' }
  },
  required: ['version']
} as const;

export const versionsSchemas = {
  list: {
    tags: ['Versions'],
    summary: 'List rule version history',
    description: 'Returns paginated version history for a rule with optional filtering',
    params: idParamSchema,
    querystring: versionsQuerySchema,
    response: {
      200: ruleVersionQueryResultSchema
    }
  },
  get: {
    tags: ['Versions'],
    summary: 'Get specific rule version',
    description: 'Returns a single version snapshot of a rule',
    params: versionIdParamSchema,
    response: {
      200: ruleVersionEntrySchema
    }
  },
  rollback: {
    tags: ['Versions'],
    summary: 'Rollback rule to a previous version',
    description: 'Restores a rule to its state at the specified version number',
    params: idParamSchema,
    body: rollbackBodySchema,
    response: {
      200: ruleSchema
    }
  },
  diff: {
    tags: ['Versions'],
    summary: 'Diff two rule versions',
    description: 'Returns field-level differences between two versions of a rule',
    params: idParamSchema,
    querystring: diffQuerySchema,
    response: {
      200: ruleVersionDiffSchema
    }
  }
};
