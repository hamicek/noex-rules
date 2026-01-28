import { describe, it, expect, vi } from 'vitest';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  BadRequestError,
  ServiceUnavailableError,
  errorHandler
} from '../../../src/api/middleware/error-handler';

function createMockRequest(): FastifyRequest {
  return {
    method: 'GET',
    url: '/api/v1/test',
    log: {
      error: vi.fn(),
      warn: vi.fn()
    }
  } as unknown as FastifyRequest;
}

function createMockReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis()
  };
  return reply as unknown as FastifyReply & { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

describe('API Error Classes', () => {
  describe('NotFoundError', () => {
    it('creates error with correct message and properties', () => {
      const error = new NotFoundError('Rule', 'abc-123');

      expect(error.message).toBe("Rule 'abc-123' not found");
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ValidationError', () => {
    it('creates error with message only', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
      expect(error.details).toBeUndefined();
    });

    it('creates error with details', () => {
      const details = { field: 'name', constraint: 'required' };
      const error = new ValidationError('Validation failed', details);

      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual(details);
    });

    it('accepts array as details', () => {
      const details = [
        { field: 'name', error: 'required' },
        { field: 'email', error: 'invalid format' }
      ];
      const error = new ValidationError('Multiple validation errors', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('ConflictError', () => {
    it('creates error with correct message and properties', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.name).toBe('ConflictError');
    });
  });

  describe('BadRequestError', () => {
    it('creates error with correct message and properties', () => {
      const error = new BadRequestError('Invalid request format');

      expect(error.message).toBe('Invalid request format');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.name).toBe('BadRequestError');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('creates error with default message', () => {
      const error = new ServiceUnavailableError();

      expect(error.message).toBe('Service temporarily unavailable');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.name).toBe('ServiceUnavailableError');
    });

    it('creates error with custom message', () => {
      const error = new ServiceUnavailableError('Database connection failed');

      expect(error.message).toBe('Database connection failed');
      expect(error.statusCode).toBe(503);
    });
  });
});

describe('errorHandler', () => {
  describe('application errors', () => {
    it('handles NotFoundError', () => {
      const error = new NotFoundError('Rule', 'test-id') as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 404,
        error: 'Not Found',
        message: "Rule 'test-id' not found",
        code: 'NOT_FOUND'
      });
    });

    it('handles ValidationError with details', () => {
      const details = [{ field: 'name', error: 'required' }];
      const error = new ValidationError('Validation failed', details) as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details
      });
    });

    it('handles ConflictError', () => {
      const error = new ConflictError('Rule already exists') as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 409,
        error: 'Conflict',
        message: 'Rule already exists',
        code: 'CONFLICT'
      });
    });

    it('handles BadRequestError', () => {
      const error = new BadRequestError('Malformed request') as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Malformed request',
        code: 'BAD_REQUEST'
      });
    });

    it('handles ServiceUnavailableError', () => {
      const error = new ServiceUnavailableError() as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    });
  });

  describe('Fastify validation errors', () => {
    it('handles schema validation error', () => {
      const error = {
        code: 'FST_ERR_VALIDATION',
        message: 'body/name must be string',
        statusCode: 400,
        validation: [
          {
            instancePath: '/name',
            message: 'must be string',
            keyword: 'type'
          }
        ]
      } as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      const sentResponse = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentResponse.statusCode).toBe(400);
      expect(sentResponse.error).toBe('Bad Request');
      expect(sentResponse.message).toBe('Field name must be string');
      expect(sentResponse.code).toBe('VALIDATION_ERROR');
      expect(sentResponse.details).toEqual([
        {
          field: '/name',
          message: 'must be string',
          keyword: 'type'
        }
      ]);
    });

    it('handles validation error with missing property', () => {
      const error = {
        code: 'FST_ERR_VALIDATION',
        message: "body must have required property 'topic'",
        statusCode: 400,
        validation: [
          {
            instancePath: '',
            params: { missingProperty: 'topic' },
            message: "must have required property 'topic'",
            keyword: 'required'
          }
        ]
      } as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      const sentResponse = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentResponse.details).toEqual([
        {
          field: 'topic',
          message: "must have required property 'topic'",
          keyword: 'required'
        }
      ]);
    });
  });

  describe('JSON parse errors', () => {
    it('handles invalid JSON body', () => {
      const error = {
        code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
        message: 'Body cannot be empty when content-type is set to \'application/json\'',
        statusCode: 400
      } as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid JSON in request body',
        code: 'INVALID_JSON'
      });
    });

    it('handles invalid content type', () => {
      const error = {
        code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
        message: 'Unsupported Media Type',
        statusCode: 415
      } as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      const sentResponse = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentResponse.message).toBe('Invalid JSON in request body');
      expect(sentResponse.code).toBe('INVALID_JSON');
    });

    it('handles SyntaxError from JSON parsing', () => {
      const error = new SyntaxError('Unexpected token } in JSON at position 10') as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      const sentResponse = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentResponse.message).toBe('Invalid JSON in request body');
      expect(sentResponse.code).toBe('INVALID_JSON');
    });
  });

  describe('generic errors', () => {
    it('handles generic error as 500', () => {
      const error = new Error('Something went wrong') as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong'
      });
    });

    it('preserves custom statusCode on unknown errors', () => {
      const error = Object.assign(new Error('Gateway timeout'), { statusCode: 504 }) as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(reply.status).toHaveBeenCalledWith(504);
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 504,
        error: 'Gateway Timeout',
        message: 'Gateway timeout'
      });
    });
  });

  describe('logging', () => {
    it('logs 5xx errors as error level', () => {
      const error = new Error('Database connection failed') as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(request.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: error,
          method: 'GET',
          url: '/api/v1/test',
          statusCode: 500
        }),
        'Internal server error'
      );
    });

    it('logs 4xx errors as warn level', () => {
      const error = new NotFoundError('Rule', 'test-id') as unknown as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(request.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/api/v1/test',
          statusCode: 404,
          code: 'NOT_FOUND'
        }),
        expect.any(String)
      );
    });

    it('does not log errors below 400', () => {
      const error = Object.assign(new Error('Redirect'), { statusCode: 301 }) as FastifyError;
      const request = createMockRequest();
      const reply = createMockReply();

      errorHandler(error, request, reply);

      expect(request.log.error).not.toHaveBeenCalled();
      expect(request.log.warn).not.toHaveBeenCalled();
    });
  });
});
