import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

interface AppError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
}

export class NotFoundError extends Error implements AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error implements AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ConflictError extends Error implements AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class BadRequestError extends Error implements AppError {
  readonly statusCode = 400;
  readonly code = 'BAD_REQUEST';

  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class ServiceUnavailableError extends Error implements AppError {
  readonly statusCode = 503;
  readonly code = 'SERVICE_UNAVAILABLE';

  constructor(message = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

const FASTIFY_VALIDATION_CODE = 'FST_ERR_VALIDATION';
const JSON_PARSE_ERROR_CODES = [
  'FST_ERR_CTP_INVALID_CONTENT_LENGTH',
  'FST_ERR_CTP_INVALID_MEDIA_TYPE',
  'FST_ERR_CTP_BODY_TOO_LARGE',
  'FST_ERR_CTP_EMPTY_JSON_BODY'
];

function isFastifyValidationError(error: FastifyError): boolean {
  return error.code === FASTIFY_VALIDATION_CODE || error.validation !== undefined;
}

function isSyntaxError(error: unknown): error is SyntaxError {
  return error instanceof SyntaxError;
}

function isJsonParseError(error: FastifyError): boolean {
  return JSON_PARSE_ERROR_CODES.includes(error.code ?? '');
}

function extractValidationDetails(error: FastifyError): unknown {
  if (error.validation && Array.isArray(error.validation)) {
    return error.validation.map((v) => ({
      field: v.instancePath || v.params?.['missingProperty'] || 'unknown',
      message: v.message,
      keyword: v.keyword
    }));
  }
  return undefined;
}

function formatValidationMessage(error: FastifyError): string {
  if (!error.validation || !Array.isArray(error.validation)) {
    return 'Request validation failed';
  }

  const messages = error.validation.map((v) => {
    // Convert /path/to/field to path.to.field
    const field = v.instancePath?.replace(/^\//, '').replace(/\//g, '.') || v.params?.['missingProperty'];
    const parentPath = v.instancePath?.replace(/^\//, '').replace(/\//g, '.') || '';

    if (v.keyword === 'required' && v.params?.['missingProperty']) {
      const missingField = v.params['missingProperty'];
      const fullPath = parentPath ? `${parentPath}.${missingField}` : missingField;
      return `Missing required field: ${fullPath}`;
    }
    if (v.keyword === 'type') {
      return `Field ${field} ${v.message}`;
    }
    if (v.keyword === 'additionalProperties') {
      return `Unknown field: ${v.params?.['additionalProperty']}`;
    }
    if (v.keyword === 'minimum' || v.keyword === 'maximum') {
      return `Field ${field} ${v.message}`;
    }
    if (v.keyword === 'minLength') {
      return `Field ${field} must not be empty`;
    }
    if (v.keyword === 'format') {
      if (v.params?.['format'] === 'uri') {
        return 'Invalid URL format';
      }
      return `Field ${field} has invalid format`;
    }

    return v.message || 'Validation error';
  });

  return messages.join('; ');
}

function sanitizeErrorMessage(error: FastifyError | SyntaxError): string {
  if ('validation' in error || (error as FastifyError).code === FASTIFY_VALIDATION_CODE) {
    return formatValidationMessage(error as FastifyError);
  }

  if (error instanceof SyntaxError || isJsonParseError(error as FastifyError)) {
    return 'Invalid JSON in request body';
  }

  return error.message;
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const appError = error as FastifyError & Partial<AppError>;

  let statusCode = appError.statusCode ?? 500;
  let code = appError.code;
  let details = appError.details;

  if (isFastifyValidationError(error)) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    details = extractValidationDetails(error);
  } else if (isSyntaxError(error) || isJsonParseError(error)) {
    statusCode = 400;
    code = 'INVALID_JSON';
  }

  const response: ApiError = {
    statusCode,
    error: getErrorName(statusCode),
    message: sanitizeErrorMessage(error)
  };

  if (code) {
    response.code = code;
  }

  if (details) {
    response.details = details;
  }

  if (statusCode >= 500) {
    request.log.error({
      err: error,
      method: request.method,
      url: request.url,
      statusCode
    }, 'Internal server error');
  } else if (statusCode >= 400) {
    request.log.warn({
      method: request.method,
      url: request.url,
      statusCode,
      code
    }, error.message);
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
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  return names[statusCode] ?? 'Error';
}
