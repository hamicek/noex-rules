import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Facts API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  describe('GET /api/v1/facts', () => {
    it('returns empty array when no facts exist', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/facts'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns all facts', async () => {
      await ctx.engine.setFact('user.name', 'John');
      await ctx.engine.setFact('user.age', 30);
      await ctx.engine.setFact('config.debug', true);

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/facts'
      });

      expect(response.statusCode).toBe(200);
      const facts = response.json();
      expect(facts).toHaveLength(3);

      const keys = facts.map((f: { key: string }) => f.key);
      expect(keys).toContain('user.name');
      expect(keys).toContain('user.age');
      expect(keys).toContain('config.debug');
    });
  });

  describe('GET /api/v1/facts/:key', () => {
    it('returns fact by key', async () => {
      await ctx.engine.setFact('user.email', 'john@example.com');

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/facts/user.email'
      });

      expect(response.statusCode).toBe(200);
      const fact = response.json();
      expect(fact.key).toBe('user.email');
      expect(fact.value).toBe('john@example.com');
      expect(fact.timestamp).toBeDefined();
      expect(fact.source).toBe('api');
    });

    it('returns fact with complex value', async () => {
      const complexValue = {
        items: [1, 2, 3],
        nested: { foo: 'bar' }
      };
      await ctx.engine.setFact('data.complex', complexValue);

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/facts/data.complex'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().value).toEqual(complexValue);
    });

    it('returns 404 for non-existent fact', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/facts/non.existent'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/v1/facts/:key', () => {
    it('creates a new fact', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/new.fact',
        payload: { value: 'new value' }
      });

      expect(response.statusCode).toBe(201);
      const fact = response.json();
      expect(fact.key).toBe('new.fact');
      expect(fact.value).toBe('new value');
    });

    it('updates an existing fact', async () => {
      await ctx.engine.setFact('existing.fact', 'old value');

      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/existing.fact',
        payload: { value: 'new value' }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().value).toBe('new value');
    });

    it('handles numeric values', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/counter',
        payload: { value: 42 }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().value).toBe(42);
    });

    it('handles boolean values', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/flag',
        payload: { value: true }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().value).toBe(true);
    });

    it('handles null values', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/nullable',
        payload: { value: null }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().value).toBe(null);
    });

    it('handles array values', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/items',
        payload: { value: [1, 2, 3] }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().value).toEqual([1, 2, 3]);
    });

    it('handles object values', async () => {
      const objectValue = { name: 'John', age: 30 };
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/user',
        payload: { value: objectValue }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().value).toEqual(objectValue);
    });

    it('returns 400 when value is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/missing.value',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/facts/:key', () => {
    it('deletes an existing fact', async () => {
      await ctx.engine.setFact('to.delete', 'value');

      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/facts/to.delete'
      });

      expect(response.statusCode).toBe(204);
      expect(ctx.engine.getFact('to.delete')).toBeUndefined();
    });

    it('returns 404 for non-existent fact', async () => {
      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/facts/non.existent'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/facts/query', () => {
    beforeEach(async () => {
      await ctx.engine.setFact('user:name', 'John');
      await ctx.engine.setFact('user:age', 30);
      await ctx.engine.setFact('user:email', 'john@test.com');
      await ctx.engine.setFact('config:debug', true);
      await ctx.engine.setFact('config:timeout', 5000);
    });

    it('queries facts by prefix pattern', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/facts/query',
        payload: { pattern: 'user:*' }
      });

      expect(response.statusCode).toBe(200);
      const facts = response.json();
      expect(facts).toHaveLength(3);
      facts.forEach((f: { key: string }) => {
        expect(f.key.startsWith('user:')).toBe(true);
      });
    });

    it('queries all facts with wildcard', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/facts/query',
        payload: { pattern: '*' }
      });

      expect(response.statusCode).toBe(200);
      const facts = response.json();
      expect(facts).toHaveLength(5);
    });

    it('queries facts by config prefix', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/facts/query',
        payload: { pattern: 'config:*' }
      });

      expect(response.statusCode).toBe(200);
      const facts = response.json();
      expect(facts).toHaveLength(2);
    });

    it('returns empty array for non-matching pattern', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/facts/query',
        payload: { pattern: 'nonexistent:*' }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns 400 when pattern is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/facts/query',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });
});
