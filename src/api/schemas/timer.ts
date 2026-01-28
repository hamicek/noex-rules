/**
 * JSON schémata pro Timers API.
 */
import { nameParamSchema } from './common.js';

export const timerSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    expiresAt: { type: 'number' },
    repeat: {
      type: 'object',
      properties: {
        interval: { type: 'number' },
        count: { type: 'number' },
        maxCount: { type: 'number' }
      }
    },
    onExpire: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        data: { type: 'object', additionalProperties: true }
      },
      required: ['topic']
    },
    correlationId: { type: 'string' }
  },
  required: ['id', 'name', 'expiresAt', 'onExpire']
} as const;

export const timerArraySchema = {
  type: 'array',
  items: timerSchema
} as const;

export const createTimerBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Unique timer name' },
    duration: { oneOf: [{ type: 'string' }, { type: 'number' }], description: 'Duration in ms or string like "5s", "1m"' },
    onExpire: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topic: { type: 'string', description: 'Event topic to emit on expiration' },
        data: { type: 'object', additionalProperties: true, description: 'Event data' }
      },
      required: ['topic']
    },
    repeat: {
      type: 'object',
      additionalProperties: false,
      properties: {
        interval: { oneOf: [{ type: 'string' }, { type: 'number' }], description: 'Repeat interval' },
        maxCount: { type: 'number', description: 'Maximum repeat count' }
      },
      required: ['interval']
    }
  },
  required: ['name', 'duration', 'onExpire']
} as const;

export const timersSchemas = {
  list: {
    tags: ['Timers'],
    summary: 'Get all timers',
    description: 'Returns a list of all active timers',
    response: {
      200: timerArraySchema
    }
  },
  get: {
    tags: ['Timers'],
    summary: 'Get timer by name',
    description: 'Returns a single timer by its name',
    params: nameParamSchema,
    response: {
      200: timerSchema
    }
  },
  create: {
    tags: ['Timers'],
    summary: 'Create a new timer',
    description: 'Creates a new timer with the provided configuration. Duration can be a number (ms) or a string like "5s", "1m"',
    body: createTimerBodySchema,
    response: {
      201: timerSchema
    }
  },
  delete: {
    tags: ['Timers'],
    summary: 'Cancel a timer',
    description: 'Cancels and removes a timer by its name',
    params: nameParamSchema,
    response: {
      204: { type: 'null', description: 'Timer cancelled successfully' }
    }
  }
};
