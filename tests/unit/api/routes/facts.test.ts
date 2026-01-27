import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';
import type { Fact } from '../../../../src/types/fact';

describe('Facts API', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = await RuleEngineServer.start({
      server: { port: 0, logger: false }
    });
    baseUrl = `${server.address}/api/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('GET /facts', () => {
    it('returns empty array when no facts exist', async () => {
      const response = await fetch(`${baseUrl}/facts`);
      const facts = await response.json();

      expect(response.status).toBe(200);
      expect(facts).toEqual([]);
    });

    it('returns all facts', async () => {
      const engine = server.getEngine();
      await engine.setFact('user:1:name', 'Alice');
      await engine.setFact('user:2:name', 'Bob');

      const response = await fetch(`${baseUrl}/facts`);
      const facts = await response.json();

      expect(response.status).toBe(200);
      expect(facts).toHaveLength(2);
      expect(facts.map((f: Fact) => f.key)).toContain('user:1:name');
      expect(facts.map((f: Fact) => f.key)).toContain('user:2:name');
    });
  });

  describe('GET /facts/:key', () => {
    it('returns 404 for non-existent fact', async () => {
      const response = await fetch(`${baseUrl}/facts/non-existent`);
      const error = await response.json();

      expect(response.status).toBe(404);
      expect(error.error).toBe('Not Found');
      expect(error.message).toContain('non-existent');
    });

    it('returns fact details', async () => {
      await server.getEngine().setFact('user:123:status', 'active');

      const response = await fetch(`${baseUrl}/facts/user:123:status`);
      const fact = await response.json();

      expect(response.status).toBe(200);
      expect(fact.key).toBe('user:123:status');
      expect(fact.value).toBe('active');
      expect(fact.timestamp).toBeTypeOf('number');
      expect(fact.source).toBe('api');
      expect(fact.version).toBeTypeOf('number');
    });

    it('returns complex fact values', async () => {
      const complexValue = { name: 'Alice', age: 30, tags: ['admin', 'premium'] };
      await server.getEngine().setFact('user:123:profile', complexValue);

      const response = await fetch(`${baseUrl}/facts/user:123:profile`);
      const fact = await response.json();

      expect(response.status).toBe(200);
      expect(fact.value).toEqual(complexValue);
    });
  });

  describe('PUT /facts/:key', () => {
    it('creates a new fact with 201 status', async () => {
      const response = await fetch(`${baseUrl}/facts/order:456:total`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 1500 })
      });
      const fact = await response.json();

      expect(response.status).toBe(201);
      expect(fact.key).toBe('order:456:total');
      expect(fact.value).toBe(1500);
      expect(fact.version).toBe(1);
    });

    it('updates existing fact with 200 status', async () => {
      await server.getEngine().setFact('order:456:total', 1000);

      const response = await fetch(`${baseUrl}/facts/order:456:total`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 1500 })
      });
      const fact = await response.json();

      expect(response.status).toBe(200);
      expect(fact.value).toBe(1500);
      expect(fact.version).toBe(2);
    });

    it('returns 400 when value is missing', async () => {
      const response = await fetch(`${baseUrl}/facts/test:key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('value');
    });

    it('accepts null as a valid value', async () => {
      const response = await fetch(`${baseUrl}/facts/user:1:deleted`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: null })
      });
      const fact = await response.json();

      expect(response.status).toBe(201);
      expect(fact.value).toBeNull();
    });

    it('accepts false as a valid value', async () => {
      const response = await fetch(`${baseUrl}/facts/feature:enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: false })
      });
      const fact = await response.json();

      expect(response.status).toBe(201);
      expect(fact.value).toBe(false);
    });

    it('accepts 0 as a valid value', async () => {
      const response = await fetch(`${baseUrl}/facts/counter:value`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 0 })
      });
      const fact = await response.json();

      expect(response.status).toBe(201);
      expect(fact.value).toBe(0);
    });

    it('accepts empty string as a valid value', async () => {
      const response = await fetch(`${baseUrl}/facts/user:note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' })
      });
      const fact = await response.json();

      expect(response.status).toBe(201);
      expect(fact.value).toBe('');
    });
  });

  describe('DELETE /facts/:key', () => {
    it('returns 404 for non-existent fact', async () => {
      const response = await fetch(`${baseUrl}/facts/non-existent`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(404);
    });

    it('deletes existing fact', async () => {
      await server.getEngine().setFact('temp:data', 'to-be-deleted');

      const deleteResponse = await fetch(`${baseUrl}/facts/temp:data`, {
        method: 'DELETE'
      });

      expect(deleteResponse.status).toBe(204);

      // Verify it's deleted
      const getResponse = await fetch(`${baseUrl}/facts/temp:data`);
      expect(getResponse.status).toBe(404);
    });
  });

  describe('POST /facts/query', () => {
    beforeEach(async () => {
      const engine = server.getEngine();
      await engine.setFact('user:1:name', 'Alice');
      await engine.setFact('user:1:age', 30);
      await engine.setFact('user:2:name', 'Bob');
      await engine.setFact('order:100:total', 500);
    });

    it('returns 400 when pattern is missing', async () => {
      const response = await fetch(`${baseUrl}/facts/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('pattern');
    });

    it('queries facts by exact key', async () => {
      const response = await fetch(`${baseUrl}/facts/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: 'user:1:name' })
      });
      const facts = await response.json();

      expect(response.status).toBe(200);
      expect(facts).toHaveLength(1);
      expect(facts[0].key).toBe('user:1:name');
      expect(facts[0].value).toBe('Alice');
    });

    it('queries facts by wildcard pattern', async () => {
      const response = await fetch(`${baseUrl}/facts/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: 'user:1:*' })
      });
      const facts = await response.json();

      expect(response.status).toBe(200);
      expect(facts).toHaveLength(2);
      expect(facts.map((f: Fact) => f.key)).toContain('user:1:name');
      expect(facts.map((f: Fact) => f.key)).toContain('user:1:age');
    });

    it('queries user facts with multi-segment pattern', async () => {
      const response = await fetch(`${baseUrl}/facts/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: 'user:*:*' })
      });
      const facts = await response.json();

      expect(response.status).toBe(200);
      expect(facts).toHaveLength(3);
      expect(facts.map((f: Fact) => f.key)).toContain('user:1:name');
      expect(facts.map((f: Fact) => f.key)).toContain('user:1:age');
      expect(facts.map((f: Fact) => f.key)).toContain('user:2:name');
    });

    it('returns empty array for non-matching pattern', async () => {
      const response = await fetch(`${baseUrl}/facts/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: 'product:*' })
      });
      const facts = await response.json();

      expect(response.status).toBe(200);
      expect(facts).toEqual([]);
    });

    it('returns all facts with * pattern', async () => {
      const response = await fetch(`${baseUrl}/facts/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: '*' })
      });
      const facts = await response.json();

      expect(response.status).toBe(200);
      expect(facts).toHaveLength(4);
    });
  });

  describe('fact key with special characters', () => {
    it('handles URL-encoded keys', async () => {
      const key = 'user:test@example.com:status';
      await server.getEngine().setFact(key, 'active');

      const encodedKey = encodeURIComponent(key);
      const response = await fetch(`${baseUrl}/facts/${encodedKey}`);
      const fact = await response.json();

      expect(response.status).toBe(200);
      expect(fact.key).toBe(key);
    });
  });
});
