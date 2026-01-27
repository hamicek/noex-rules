import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
): void {
  const statusCode = (error as { statusCode?: number }).statusCode ?? error.statusCode ?? 500;

  const response: ApiError = {
    statusCode,
    error: getErrorName(statusCode),
    message: error.message
  };

  if (error instanceof ValidationError && error.details) {
    response.details = error.details;
  }

  if (statusCode >= 500) {
    reply.log.error(error);
  }

  reply.status(statusCode).send(response);
}

function getErrorName(statusCode: number): string {
  const names: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    500: 'Internal Server Error'
  };
  return names[statusCode] ?? 'Error';
}
