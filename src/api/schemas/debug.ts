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

export const conditionProfileSchema = {
  type: 'object',
  properties: {
    conditionIndex: { type: 'number' },
    evaluationCount: { type: 'number' },
    totalTimeMs: { type: 'number' },
    avgTimeMs: { type: 'number' },
    passCount: { type: 'number' },
    failCount: { type: 'number' },
    passRate: { type: 'number' }
  },
  required: ['conditionIndex', 'evaluationCount', 'totalTimeMs', 'avgTimeMs', 'passCount', 'failCount', 'passRate']
} as const;

export const actionProfileSchema = {
  type: 'object',
  properties: {
    actionIndex: { type: 'number' },
    actionType: { type: 'string' },
    executionCount: { type: 'number' },
    totalTimeMs: { type: 'number' },
    avgTimeMs: { type: 'number' },
    minTimeMs: { type: 'number' },
    maxTimeMs: { type: 'number' },
    successCount: { type: 'number' },
    failureCount: { type: 'number' },
    successRate: { type: 'number' }
  },
  required: ['actionIndex', 'actionType', 'executionCount', 'totalTimeMs', 'avgTimeMs', 'minTimeMs', 'maxTimeMs', 'successCount', 'failureCount', 'successRate']
} as const;

export const ruleProfileSchema = {
  type: 'object',
  properties: {
    ruleId: { type: 'string' },
    ruleName: { type: 'string' },
    triggerCount: { type: 'number' },
    executionCount: { type: 'number' },
    skipCount: { type: 'number' },
    totalTimeMs: { type: 'number' },
    avgTimeMs: { type: 'number' },
    minTimeMs: { type: 'number' },
    maxTimeMs: { type: 'number' },
    conditionEvalTimeMs: { type: 'number' },
    actionExecTimeMs: { type: 'number' },
    conditionProfiles: { type: 'array', items: conditionProfileSchema },
    actionProfiles: { type: 'array', items: actionProfileSchema },
    passRate: { type: 'number' },
    lastTriggeredAt: { type: 'number' },
    lastExecutedAt: { type: ['number', 'null'] }
  },
  required: ['ruleId', 'ruleName', 'triggerCount', 'executionCount', 'skipCount', 'totalTimeMs', 'avgTimeMs', 'minTimeMs', 'maxTimeMs', 'conditionEvalTimeMs', 'actionExecTimeMs', 'conditionProfiles', 'actionProfiles', 'passRate', 'lastTriggeredAt', 'lastExecutedAt']
} as const;

export const profilingSummarySchema = {
  type: 'object',
  properties: {
    totalRulesProfiled: { type: 'number' },
    totalTriggers: { type: 'number' },
    totalExecutions: { type: 'number' },
    totalTimeMs: { type: 'number' },
    avgRuleTimeMs: { type: 'number' },
    slowestRule: {
      type: ['object', 'null'],
      properties: {
        ruleId: { type: 'string' },
        ruleName: { type: 'string' },
        avgTimeMs: { type: 'number' }
      }
    },
    hottestRule: {
      type: ['object', 'null'],
      properties: {
        ruleId: { type: 'string' },
        ruleName: { type: 'string' },
        triggerCount: { type: 'number' }
      }
    },
    profilingStartedAt: { type: 'number' },
    lastActivityAt: { type: ['number', 'null'] }
  },
  required: ['totalRulesProfiled', 'totalTriggers', 'totalExecutions', 'totalTimeMs', 'avgRuleTimeMs', 'slowestRule', 'hottestRule', 'profilingStartedAt', 'lastActivityAt']
} as const;

export const ruleIdParamsSchema = {
  type: 'object',
  properties: {
    ruleId: { type: 'string' }
  },
  required: ['ruleId']
} as const;

export const profileQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'number', minimum: 1, maximum: 100, description: 'Maximum number of profiles to return' }
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
  },
  getAllProfiles: {
    tags: ['Debug', 'Profiling'],
    summary: 'Get all rule profiles',
    description: 'Returns performance profiles for all profiled rules',
    response: {
      200: {
        type: 'array',
        items: ruleProfileSchema
      }
    }
  },
  getProfilingSummary: {
    tags: ['Debug', 'Profiling'],
    summary: 'Get profiling summary',
    description: 'Returns summary statistics across all profiled rules',
    response: {
      200: profilingSummarySchema
    }
  },
  getSlowestRules: {
    tags: ['Debug', 'Profiling'],
    summary: 'Get slowest rules',
    description: 'Returns rules with the highest average execution time',
    querystring: profileQuerySchema,
    response: {
      200: {
        type: 'array',
        items: ruleProfileSchema
      }
    }
  },
  getHottestRules: {
    tags: ['Debug', 'Profiling'],
    summary: 'Get hottest rules',
    description: 'Returns the most frequently triggered rules',
    querystring: profileQuerySchema,
    response: {
      200: {
        type: 'array',
        items: ruleProfileSchema
      }
    }
  },
  getRuleProfile: {
    tags: ['Debug', 'Profiling'],
    summary: 'Get rule profile',
    description: 'Returns performance profile for a specific rule',
    params: ruleIdParamsSchema,
    response: {
      200: ruleProfileSchema
    }
  },
  resetProfile: {
    tags: ['Debug', 'Profiling'],
    summary: 'Reset profiling data',
    description: 'Clears all profiling data and resets statistics',
    response: {
      200: {
        type: 'object',
        properties: {
          reset: { type: 'boolean' }
        },
        required: ['reset']
      }
    }
  }
};
