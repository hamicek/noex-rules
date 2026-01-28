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
  additionalProperties: true,
  properties: {
    timestamp: { type: 'number' },
    rulesCount: { type: 'number' },
    factsCount: { type: 'number' },
    timersCount: { type: 'number' },
    eventsProcessed: { type: 'number' },
    rulesExecuted: { type: 'number' },
    avgProcessingTimeMs: { type: 'number' }
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
