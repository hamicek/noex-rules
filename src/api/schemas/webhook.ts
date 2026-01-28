/**
 * JSON schémata pro Webhooks API.
 */
import { idParamSchema } from './common.js';

export const webhookResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    patterns: { type: 'array', items: { type: 'string' } },
    hasSecret: { type: 'boolean' },
    headers: { type: 'object', additionalProperties: { type: 'string' } },
    timeout: { type: 'number' },
    enabled: { type: 'boolean' },
    createdAt: { type: 'number' }
  },
  required: ['id', 'url', 'patterns', 'hasSecret', 'enabled', 'createdAt']
} as const;

export const webhookArraySchema = {
  type: 'array',
  items: webhookResponseSchema
} as const;

export const webhookStatsSchema = {
  type: 'object',
  properties: {
    webhookCount: { type: 'number' },
    activeWebhookCount: { type: 'number' },
    totalDeliveries: { type: 'number' },
    successfulDeliveries: { type: 'number' },
    failedDeliveries: { type: 'number' }
  },
  required: ['webhookCount', 'activeWebhookCount', 'totalDeliveries', 'successfulDeliveries', 'failedDeliveries']
} as const;

export const createWebhookBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string', format: 'uri', description: 'Webhook endpoint URL (HTTP or HTTPS)' },
    patterns: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Topic patterns to subscribe (default: ["*"])' },
    secret: { type: 'string', description: 'Secret for HMAC-SHA256 signature' },
    headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Custom headers to include' },
    timeout: { type: 'number', minimum: 1, maximum: 60000, description: 'Request timeout in ms (max 60000)' }
  },
  required: ['url']
} as const;

export const webhooksSchemas = {
  list: {
    tags: ['Webhooks'],
    summary: 'Get all webhooks',
    description: 'Returns a list of all registered webhooks',
    response: {
      200: webhookArraySchema
    }
  },
  get: {
    tags: ['Webhooks'],
    summary: 'Get webhook by ID',
    description: 'Returns a single webhook by its ID',
    params: idParamSchema,
    response: {
      200: webhookResponseSchema
    }
  },
  create: {
    tags: ['Webhooks'],
    summary: 'Register a webhook',
    description: 'Registers a new webhook endpoint for event notifications',
    body: createWebhookBodySchema,
    response: {
      201: webhookResponseSchema
    }
  },
  delete: {
    tags: ['Webhooks'],
    summary: 'Delete a webhook',
    description: 'Unregisters and removes a webhook by its ID',
    params: idParamSchema,
    response: {
      204: { type: 'null', description: 'Webhook deleted successfully' }
    }
  },
  enable: {
    tags: ['Webhooks'],
    summary: 'Enable a webhook',
    description: 'Enables a disabled webhook',
    params: idParamSchema,
    response: {
      200: webhookResponseSchema
    }
  },
  disable: {
    tags: ['Webhooks'],
    summary: 'Disable a webhook',
    description: 'Disables an enabled webhook (stops delivery)',
    params: idParamSchema,
    response: {
      200: webhookResponseSchema
    }
  },
  stats: {
    tags: ['Webhooks'],
    summary: 'Get webhook statistics',
    description: 'Returns delivery statistics for all webhooks',
    response: {
      200: webhookStatsSchema
    }
  }
};
