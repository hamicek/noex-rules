/**
 * Společné JSON schémata pro OpenAPI dokumentaci.
 */
import type { FastifySchema } from 'fastify';

export const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    statusCode: { type: 'number' }
  },
  required: ['error', 'statusCode']
} as const;

export const idParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' }
  },
  required: ['id']
} as const;

export const keyParamSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' }
  },
  required: ['key']
} as const;

export const nameParamSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' }
  },
  required: ['name']
} as const;

export function withErrorResponses(schema: FastifySchema): FastifySchema {
  const existingResponse = typeof schema.response === 'object' ? schema.response : {};
  return {
    ...schema,
    response: {
      ...existingResponse,
      400: errorResponseSchema,
      404: errorResponseSchema,
      409: errorResponseSchema,
      500: errorResponseSchema
    }
  };
}
