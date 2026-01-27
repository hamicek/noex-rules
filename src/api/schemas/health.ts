/**
 * JSON schémata pro Health/Stats API.
 */

export const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
    timestamp: { type: 'number' },
    uptime: { type: 'number' },
    version: { type: 'string' },
    engine: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        running: { type: 'boolean' }
      },
      required: ['name', 'running']
    }
  },
  required: ['status', 'timestamp', 'uptime', 'version', 'engine']
} as const;

export const statsResponseSchema = {
  type: 'object',
  properties: {
    timestamp: { type: 'number' },
    rules: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        enabled: { type: 'number' },
        disabled: { type: 'number' }
      }
    },
    facts: {
      type: 'object',
      properties: {
        total: { type: 'number' }
      }
    },
    events: {
      type: 'object',
      properties: {
        emitted: { type: 'number' },
        processed: { type: 'number' }
      }
    },
    timers: {
      type: 'object',
      properties: {
        active: { type: 'number' },
        fired: { type: 'number' }
      }
    }
  },
  required: ['timestamp']
} as const;

export const healthSchemas = {
  health: {
    tags: ['System'],
    summary: 'Health check',
    description: 'Returns the health status of the rule engine server',
    response: {
      200: healthResponseSchema
    }
  },
  stats: {
    tags: ['System'],
    summary: 'Get engine statistics',
    description: 'Returns detailed statistics about the rule engine',
    response: {
      200: statsResponseSchema
    }
  }
};
