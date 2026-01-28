/**
 * JSON schémata pro Debug API.
 */

import { eventSchema } from './event.js';

export const traceEntrySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    timestamp: { type: 'number' },
    type: {
      type: 'string',
      enum: [
        'rule_triggered',
        'rule_executed',
        'rule_skipped',
        'condition_evaluated',
        'action_started',
        'action_completed',
        'action_failed',
        'fact_changed',
        'event_emitted',
        'timer_set',
        'timer_cancelled',
        'timer_expired'
      ]
    },
    correlationId: { type: 'string' },
    causationId: { type: 'string' },
    ruleId: { type: 'string' },
    ruleName: { type: 'string' },
    details: { type: 'object', additionalProperties: true },
    durationMs: { type: 'number' }
  },
  required: ['id', 'timestamp', 'type', 'details']
} as const;

export const eventWithContextSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ...eventSchema.properties,
    traceEntries: {
      type: 'array',
      items: traceEntrySchema
    },
    triggeredRules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' },
          ruleName: { type: 'string' },
          executed: { type: 'boolean' },
          durationMs: { type: 'number' }
        },
        required: ['ruleId', 'executed']
      }
    },
    causedEvents: {
      type: 'array',
      items: eventSchema
    }
  },
  required: eventSchema.required
} as const;

export const historyResultSchema = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: eventWithContextSchema
    },
    totalCount: { type: 'number' },
    queryTimeMs: { type: 'number' }
  },
  required: ['events', 'totalCount', 'queryTimeMs']
} as const;

export const timelineEntrySchema = {
  type: 'object',
  properties: {
    timestamp: { type: 'number' },
    type: { type: 'string', enum: ['event', 'trace'] },
    entry: { type: 'object', additionalProperties: true },
    depth: { type: 'number' },
    parentId: { type: 'string' }
  },
  required: ['timestamp', 'type', 'entry', 'depth']
} as const;

export const historyQuerySchema = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: 'Filter by topic (supports wildcards * and **)' },
    correlationId: { type: 'string', description: 'Filter by correlation ID' },
    from: { type: 'number', description: 'Filter events after this timestamp (inclusive)' },
    to: { type: 'number', description: 'Filter events before this timestamp (inclusive)' },
    limit: { type: 'number', minimum: 1, maximum: 1000, description: 'Maximum number of events to return' },
    includeContext: { type: 'boolean', description: 'Include trace context with each event' }
  }
} as const;

export const correlationParamsSchema = {
  type: 'object',
  properties: {
    correlationId: { type: 'string' }
  },
  required: ['correlationId']
} as const;

export const eventIdParamsSchema = {
  type: 'object',
  properties: {
    eventId: { type: 'string' }
  },
  required: ['eventId']
} as const;

export const exportQuerySchema = {
  type: 'object',
  properties: {
    format: { type: 'string', enum: ['json', 'mermaid'], default: 'json' }
  }
} as const;

export const debugSchemas = {
  queryHistory: {
    tags: ['Debug'],
    summary: 'Query event history',
    description: 'Query event history with flexible filtering options',
    querystring: historyQuerySchema,
    response: {
      200: historyResultSchema
    }
  },
  getEvent: {
    tags: ['Debug'],
    summary: 'Get event with full context',
    description: 'Returns a single event with all trace entries, triggered rules, and caused events',
    params: eventIdParamsSchema,
    response: {
      200: eventWithContextSchema
    }
  },
  getCorrelation: {
    tags: ['Debug'],
    summary: 'Get correlation chain',
    description: 'Returns all events in a correlation chain',
    params: correlationParamsSchema,
    response: {
      200: {
        type: 'array',
        items: eventSchema
      }
    }
  },
  getTimeline: {
    tags: ['Debug'],
    summary: 'Get correlation timeline',
    description: 'Returns a visual timeline of all activities for a correlation ID',
    params: correlationParamsSchema,
    response: {
      200: {
        type: 'array',
        items: timelineEntrySchema
      }
    }
  },
  exportCorrelation: {
    tags: ['Debug'],
    summary: 'Export correlation trace',
    description: 'Export correlation trace to JSON or Mermaid sequence diagram',
    params: correlationParamsSchema,
    querystring: exportQuerySchema,
    response: {
      200: {
        type: 'string'
      }
    }
  },
  getTraces: {
    tags: ['Debug'],
    summary: 'Get recent trace entries',
    description: 'Returns recent trace entries with optional filtering',
    querystring: {
      type: 'object',
      properties: {
        correlationId: { type: 'string' },
        ruleId: { type: 'string' },
        types: { type: 'string', description: 'Comma-separated list of trace types' },
        limit: { type: 'number', minimum: 1, maximum: 1000 }
      }
    },
    response: {
      200: {
        type: 'array',
        items: traceEntrySchema
      }
    }
  },
  getTracingStatus: {
    tags: ['Debug'],
    summary: 'Get tracing status',
    description: 'Returns whether tracing is currently enabled',
    response: {
      200: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' }
        },
        required: ['enabled']
      }
    }
  },
  enableTracing: {
    tags: ['Debug'],
    summary: 'Enable tracing',
    description: 'Enables rule engine tracing',
    response: {
      200: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' }
        },
        required: ['enabled']
      }
    }
  },
  disableTracing: {
    tags: ['Debug'],
    summary: 'Disable tracing',
    description: 'Disables rule engine tracing',
    response: {
      200: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' }
        },
        required: ['enabled']
      }
    }
  }
};
