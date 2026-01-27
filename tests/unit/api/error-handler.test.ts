import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  ValidationError,
  ConflictError
} from '../../../src/api/middleware/error-handler';

describe('API Error Classes', () => {
  describe('NotFoundError', () => {
    it('creates error with correct message', () => {
      const error = new NotFoundError('Rule', 'abc-123');

      expect(error.message).toBe("Rule 'abc-123' not found");
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('ValidationError', () => {
    it('creates error with message only', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
      expect(error.details).toBeUndefined();
    });

    it('creates error with details', () => {
      const details = { field: 'name', constraint: 'required' };
      const error = new ValidationError('Validation failed', details);

      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual(details);
    });
  });

  describe('ConflictError', () => {
    it('creates error with correct message', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.name).toBe('ConflictError');
    });
  });
});
