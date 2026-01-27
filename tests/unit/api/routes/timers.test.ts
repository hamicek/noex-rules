import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';
import type { Timer } from '../../../../src/types/timer';

describe('Timers API', () => {
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

  describe('GET /timers', () => {
    it('returns empty array when no timers exist', async () => {
      const response = await fetch(`${baseUrl}/timers`);
      const timers: Timer[] = await response.json();

      expect(response.status).toBe(200);
      expect(timers).toEqual([]);
    });

    it('returns list of all timers', async () => {
      const engine = server.getEngine();

      await engine.setTimer({
        name: 'timer-1',
        duration: '10m',
        onExpire: { topic: 'timer.expired', data: { id: 1 } }
      });
      await engine.setTimer({
        name: 'timer-2',
        duration: '5m',
        onExpire: { topic: 'timer.expired', data: { id: 2 } }
      });

      const response = await fetch(`${baseUrl}/timers`);
      const timers: Timer[] = await response.json();

      expect(response.status).toBe(200);
      expect(timers).toHaveLength(2);
      expect(timers.map(t => t.name).sort()).toEqual(['timer-1', 'timer-2']);
    });
  });

  describe('GET /timers/:name', () => {
    it('returns timer by name', async () => {
      const engine = server.getEngine();

      await engine.setTimer({
        name: 'payment-timeout',
        duration: '15m',
        onExpire: { topic: 'payment.expired', data: { orderId: '123' } }
      });

      const response = await fetch(`${baseUrl}/timers/payment-timeout`);
      const timer: Timer = await response.json();

      expect(response.status).toBe(200);
      expect(timer.id).toBeTypeOf('string');
      expect(timer.name).toBe('payment-timeout');
      expect(timer.onExpire.topic).toBe('payment.expired');
      expect(timer.onExpire.data).toEqual({ orderId: '123' });
      expect(timer.expiresAt).toBeTypeOf('number');
    });

    it('returns 404 when timer does not exist', async () => {
      const response = await fetch(`${baseUrl}/timers/nonexistent`);
      const error = await response.json();

      expect(response.status).toBe(404);
      expect(error.error).toBe('Not Found');
      expect(error.message).toContain('Timer');
      expect(error.message).toContain('nonexistent');
    });
  });

  describe('POST /timers', () => {
    it('creates timer with minimal fields', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'reminder',
          duration: '30m',
          onExpire: { topic: 'reminder.due' }
        })
      });
      const timer: Timer = await response.json();

      expect(response.status).toBe(201);
      expect(timer.id).toBeTypeOf('string');
      expect(timer.name).toBe('reminder');
      expect(timer.onExpire.topic).toBe('reminder.due');
      expect(timer.onExpire.data).toEqual({});
      expect(timer.expiresAt).toBeTypeOf('number');
      expect(timer.expiresAt).toBeGreaterThan(Date.now());
    });

    it('creates timer with all fields', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'health-check',
          duration: '1m',
          onExpire: {
            topic: 'system.healthcheck',
            data: { service: 'api' }
          },
          repeat: {
            interval: '1m',
            maxCount: 10
          }
        })
      });
      const timer: Timer = await response.json();

      expect(response.status).toBe(201);
      expect(timer.name).toBe('health-check');
      expect(timer.onExpire.topic).toBe('system.healthcheck');
      expect(timer.onExpire.data).toEqual({ service: 'api' });
      expect(timer.repeat).toBeDefined();
      expect(timer.repeat!.interval).toBe(60000);
      expect(timer.repeat!.maxCount).toBe(10);
    });

    it('creates timer with numeric duration', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'numeric-timer',
          duration: 5000,
          onExpire: { topic: 'test.event' }
        })
      });
      const timer: Timer = await response.json();

      expect(response.status).toBe(201);
      expect(timer.expiresAt).toBeLessThanOrEqual(Date.now() + 6000);
    });

    it('replaces existing timer with same name', async () => {
      await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'unique-timer',
          duration: '10m',
          onExpire: { topic: 'first.topic' }
        })
      });

      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'unique-timer',
          duration: '20m',
          onExpire: { topic: 'second.topic' }
        })
      });
      const timer: Timer = await response.json();

      expect(response.status).toBe(201);
      expect(timer.onExpire.topic).toBe('second.topic');

      const engine = server.getEngine();
      const timers = engine.getTimers();
      expect(timers.filter(t => t.name === 'unique-timer')).toHaveLength(1);
    });

    it('returns 400 when name is missing', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: '10m',
          onExpire: { topic: 'test' }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('name');
    });

    it('returns 400 when name is not a string', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 123,
          duration: '10m',
          onExpire: { topic: 'test' }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when duration is missing', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          onExpire: { topic: 'test' }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('duration');
    });

    it('returns 400 when duration is invalid type', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          duration: true,
          onExpire: { topic: 'test' }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when onExpire is missing', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          duration: '10m'
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('onExpire');
    });

    it('returns 400 when onExpire.topic is missing', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          duration: '10m',
          onExpire: { data: {} }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('onExpire.topic');
    });

    it('returns 400 when onExpire.data is not an object', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          duration: '10m',
          onExpire: { topic: 'test', data: 'invalid' }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('onExpire.data');
    });

    it('returns 400 when onExpire.data is an array', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          duration: '10m',
          onExpire: { topic: 'test', data: [1, 2, 3] }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when repeat.interval is missing', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          duration: '10m',
          onExpire: { topic: 'test' },
          repeat: { maxCount: 5 }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('repeat.interval');
    });

    it('returns 400 when repeat.maxCount is not a number', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-timer',
          duration: '10m',
          onExpire: { topic: 'test' },
          repeat: { interval: '1m', maxCount: 'invalid' }
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('repeat.maxCount');
    });
  });

  describe('DELETE /timers/:name', () => {
    it('cancels existing timer', async () => {
      const engine = server.getEngine();

      await engine.setTimer({
        name: 'to-cancel',
        duration: '10m',
        onExpire: { topic: 'test.event', data: {} }
      });

      expect(engine.getTimer('to-cancel')).toBeDefined();

      const response = await fetch(`${baseUrl}/timers/to-cancel`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(204);
      expect(engine.getTimer('to-cancel')).toBeUndefined();
    });

    it('returns 404 when timer does not exist', async () => {
      const response = await fetch(`${baseUrl}/timers/nonexistent`, {
        method: 'DELETE'
      });
      const error = await response.json();

      expect(response.status).toBe(404);
      expect(error.error).toBe('Not Found');
      expect(error.message).toContain('Timer');
    });
  });

  describe('timer with special characters in name', () => {
    it('handles timer names with colons', async () => {
      const response = await fetch(`${baseUrl}/timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'payment:order:123',
          duration: '15m',
          onExpire: { topic: 'payment.timeout' }
        })
      });
      const timer: Timer = await response.json();

      expect(response.status).toBe(201);
      expect(timer.name).toBe('payment:order:123');

      const getResponse = await fetch(`${baseUrl}/timers/payment:order:123`);
      const fetchedTimer: Timer = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(fetchedTimer.name).toBe('payment:order:123');
    });
  });
});
