/**
 * JSON schémata pro Stream (SSE) API.
 */

export const connectionInfoSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    patterns: { type: 'array', items: { type: 'string' } },
    connectedAt: { type: 'number' }
  },
  required: ['id', 'patterns', 'connectedAt']
} as const;

export const connectionArraySchema = {
  type: 'array',
  items: connectionInfoSchema
} as const;

export const sseStatsSchema = {
  type: 'object',
  properties: {
    activeConnections: { type: 'number' },
    totalConnections: { type: 'number' },
    messagesSent: { type: 'number' }
  },
  required: ['activeConnections', 'totalConnections', 'messagesSent']
} as const;

export const streamQuerySchema = {
  type: 'object',
  properties: {
    patterns: { type: 'string', description: 'Comma-separated list of topic patterns to subscribe to' }
  }
} as const;

export const streamSchemas = {
  events: {
    tags: ['Stream'],
    summary: 'SSE event stream',
    description: 'Opens a Server-Sent Events connection for real-time event streaming. Use the patterns query parameter to filter events (e.g., "user.*,order.*")',
    querystring: streamQuerySchema,
    response: {
      200: {
        type: 'string',
        description: 'SSE event stream (text/event-stream)'
      }
    }
  },
  stats: {
    tags: ['Stream'],
    summary: 'Get SSE statistics',
    description: 'Returns statistics about active SSE connections',
    response: {
      200: sseStatsSchema
    }
  },
  connections: {
    tags: ['Stream'],
    summary: 'List active connections',
    description: 'Returns a list of all active SSE connections (admin/debug endpoint)',
    response: {
      200: connectionArraySchema
    }
  }
};
