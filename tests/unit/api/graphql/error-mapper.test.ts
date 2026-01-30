import { describe, it, expect } from 'vitest';
import { GraphQLError } from 'graphql';
import { errorFormatter } from '../../../../src/api/graphql/error-mapper';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  BadRequestError,
  ServiceUnavailableError,
} from '../../../../src/api/middleware/error-handler';

function makeExecution(errors: GraphQLError[], data: Record<string, unknown> | null = null) {
  return { errors, data };
}

function wrapAsGraphQLError(original: Error, path?: readonly (string | number)[]): GraphQLError {
  return new GraphQLError(original.message, {
    originalError: original,
    path: path ?? ['someMutation'],
  });
}

describe('errorFormatter', () => {
  describe('AppError mapping', () => {
    it('maps NotFoundError to extensions with code and statusCode', () => {
      const original = new NotFoundError('Rule', 'abc-123');
      const gqlError = wrapAsGraphQLError(original);
      const result = errorFormatter(makeExecution([gqlError]));

      expect(result.statusCode).toBe(200);
      const errors = result.response.errors!;
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe("Rule 'abc-123' not found");
      expect(errors[0]!.extensions).toEqual({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('maps ConflictError to extensions', () => {
      const original = new ConflictError('Rule already exists');
      const gqlError = wrapAsGraphQLError(original);
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors[0]!.extensions).toEqual({
        code: 'CONFLICT',
        statusCode: 409,
      });
    });

    it('maps BadRequestError to extensions', () => {
      const original = new BadRequestError('Invalid format');
      const gqlError = wrapAsGraphQLError(original);
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors[0]!.extensions).toEqual({
        code: 'BAD_REQUEST',
        statusCode: 400,
      });
    });

    it('maps ServiceUnavailableError to extensions', () => {
      const original = new ServiceUnavailableError();
      const gqlError = wrapAsGraphQLError(original);
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors[0]!.extensions).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        statusCode: 503,
      });
    });

    it('includes details in extensions for ValidationError', () => {
      const details = [{ field: 'name', constraint: 'required' }];
      const original = new ValidationError('Validation failed', details);
      const gqlError = wrapAsGraphQLError(original);
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors[0]!.extensions).toEqual({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details,
      });
    });

    it('omits details from extensions when ValidationError has no details', () => {
      const original = new ValidationError('Invalid input');
      const gqlError = wrapAsGraphQLError(original);
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors[0]!.extensions).toEqual({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
      expect(errors[0]!.extensions).not.toHaveProperty('details');
    });
  });

  describe('non-AppError passthrough', () => {
    it('passes through generic GraphQL errors unchanged', () => {
      const gqlError = new GraphQLError('Syntax error', {
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
      });
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('Syntax error');
      expect(errors[0]!.extensions).toEqual({ code: 'GRAPHQL_VALIDATION_FAILED' });
    });

    it('passes through errors without originalError', () => {
      const gqlError = new GraphQLError('Unknown field "foo"');
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe(gqlError);
    });

    it('passes through errors with non-AppError originalError', () => {
      const original = new TypeError('Cannot read property of undefined');
      const gqlError = new GraphQLError(original.message, { originalError: original });
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe(gqlError);
    });
  });

  describe('mixed errors', () => {
    it('maps AppErrors and passes through others in the same execution', () => {
      const notFound = wrapAsGraphQLError(new NotFoundError('Rule', 'x'));
      const syntaxError = new GraphQLError('Unexpected token');
      const conflict = wrapAsGraphQLError(new ConflictError('Duplicate'));

      const result = errorFormatter(makeExecution([notFound, syntaxError, conflict]));
      const errors = result.response.errors!;

      expect(errors).toHaveLength(3);
      expect(errors[0]!.extensions).toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      expect(errors[1]).toBe(syntaxError);
      expect(errors[2]!.extensions).toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    });
  });

  describe('response structure', () => {
    it('always returns HTTP 200 per GraphQL spec', () => {
      const gqlError = wrapAsGraphQLError(new NotFoundError('Rule', 'x'));
      const result = errorFormatter(makeExecution([gqlError]));

      expect(result.statusCode).toBe(200);
    });

    it('preserves data alongside errors (partial success)', () => {
      const data = { rules: [{ id: '1', name: 'Test' }] };
      const gqlError = wrapAsGraphQLError(new NotFoundError('Rule', 'x'), ['rule']);

      const result = errorFormatter(makeExecution([gqlError], data));

      expect(result.response.data).toEqual(data);
      expect(result.response.errors).toHaveLength(1);
    });

    it('sets data to null when execution has no data', () => {
      const gqlError = wrapAsGraphQLError(new BadRequestError('Bad'));
      const result = errorFormatter(makeExecution([gqlError]));

      expect(result.response.data).toBeNull();
    });

    it('preserves path from original GraphQL error', () => {
      const original = new NotFoundError('Rule', 'abc');
      const gqlError = wrapAsGraphQLError(original, ['createRule']);
      const result = errorFormatter(makeExecution([gqlError]));

      const errors = result.response.errors!;
      expect(errors[0]!.path).toEqual(['createRule']);
    });
  });
});
