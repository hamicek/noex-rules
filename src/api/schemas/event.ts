/**
 * JSON schémata pro Events API.
 */

export const eventSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    topic: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
    timestamp: { type: 'number' },
    correlationId: { type: 'string' },
    causationId: { type: 'string' },
    source: { type: 'string' }
  },
  required: ['id', 'topic', 'data', 'timestamp', 'source']
} as const;

export const emitEventBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string', minLength: 1, description: 'Event topic (e.g., "order.created")' },
    data: { type: 'object', additionalProperties: true, description: 'Event payload' }
  },
  required: ['topic']
} as const;

export const emitCorrelatedEventBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string', minLength: 1, description: 'Event topic' },
    data: { type: 'object', additionalProperties: true, description: 'Event payload' },
    correlationId: { type: 'string', minLength: 1, description: 'ID to correlate related events' },
    causationId: { type: 'string', description: 'ID of the event that caused this one' }
  },
  required: ['topic', 'correlationId']
} as const;

export const eventsSchemas = {
  emit: {
    tags: ['Events'],
    summary: 'Emit an event',
    description: 'Emits a new event with the given topic and data',
    body: emitEventBodySchema,
    response: {
      201: eventSchema
    }
  },
  emitCorrelated: {
    tags: ['Events'],
    summary: 'Emit a correlated event',
    description: 'Emits a new event with correlation and optional causation IDs',
    body: emitCorrelatedEventBodySchema,
    response: {
      201: eventSchema
    }
  }
};
