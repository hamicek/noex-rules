/**
 * JSON schémata pro Facts API.
 */
import { keyParamSchema } from './common.js';

export const factSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    value: {},
    updatedAt: { type: 'number' },
    version: { type: 'number' }
  },
  required: ['key', 'value', 'updatedAt', 'version']
} as const;

export const factArraySchema = {
  type: 'array',
  items: factSchema
} as const;

export const setFactBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    value: { description: 'The value to store' }
  }
} as const;

export const queryFactsBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    pattern: { type: 'string', description: 'Pattern to match fact keys (supports wildcards)' }
  }
} as const;

export const factsSchemas = {
  list: {
    tags: ['Facts'],
    summary: 'Get all facts',
    description: 'Returns a list of all stored facts',
    response: {
      200: factArraySchema
    }
  },
  get: {
    tags: ['Facts'],
    summary: 'Get fact by key',
    description: 'Returns a single fact by its key',
    params: keyParamSchema,
    response: {
      200: factSchema
    }
  },
  set: {
    tags: ['Facts'],
    summary: 'Set a fact',
    description: 'Creates or updates a fact with the given key and value',
    params: keyParamSchema,
    body: setFactBodySchema,
    response: {
      200: factSchema,
      201: factSchema
    }
  },
  delete: {
    tags: ['Facts'],
    summary: 'Delete a fact',
    description: 'Deletes a fact by its key',
    params: keyParamSchema,
    response: {
      204: { type: 'null', description: 'Fact deleted successfully' }
    }
  },
  query: {
    tags: ['Facts'],
    summary: 'Query facts by pattern',
    description: 'Returns facts matching the given pattern (supports wildcards)',
    body: queryFactsBodySchema,
    response: {
      200: factArraySchema
    }
  }
};
