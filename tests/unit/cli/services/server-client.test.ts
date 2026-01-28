import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ServerClient,
  createServerClient,
  type ServerClientConfig
} from '../../../../src/cli/services/server-client.js';
import { ConnectionError } from '../../../../src/cli/utils/errors.js';

describe('ServerClient', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const client = new ServerClient();
      expect(client).toBeInstanceOf(ServerClient);
    });

    it('should merge provided config with defaults', () => {
      const client = new ServerClient({ baseUrl: 'http://custom:8080' });
      expect(client).toBeInstanceOf(ServerClient);
    });
  });

  describe('createServerClient', () => {
    it('should create client instance', () => {
      const client = createServerClient();
      expect(client).toBeInstanceOf(ServerClient);
    });

    it('should accept partial config', () => {
      const client = createServerClient({ timeout: 5000 });
      expect(client).toBeInstanceOf(ServerClient);
    });
  });

  describe('request methods', () => {
    const mockResponse = <T>(data: T, status = 200) => {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: () => Promise.resolve(data)
      } as Response);
    };

    describe('get', () => {
      it('should perform GET request', async () => {
        const mockData = { id: 1, name: 'test' };
        global.fetch = vi.fn().mockResolvedValue(mockResponse(mockData));

        const client = new ServerClient({ baseUrl: 'http://localhost:3000' });
        const result = await client.get('/test');

        expect(result).toEqual(mockData);
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v1/test',
          expect.objectContaining({
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            }
          })
        );
      });

      it('should build URL correctly with apiPrefix', async () => {
        global.fetch = vi.fn().mockResolvedValue(mockResponse({}));

        const client = new ServerClient({
          baseUrl: 'http://localhost:3000/',
          apiPrefix: '/v1/api/v1/'
        });
        await client.get('/endpoint');

        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3000/v1/api/v1/endpoint',
          expect.anything()
        );
      });
    });

    describe('post', () => {
      it('should perform POST request with body', async () => {
        const mockData = { success: true };
        const requestBody = { name: 'test' };
        global.fetch = vi.fn().mockResolvedValue(mockResponse(mockData));

        const client = new ServerClient();
        const result = await client.post('/test', requestBody);

        expect(result).toEqual(mockData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(requestBody)
          })
        );
      });

      it('should perform POST request without body', async () => {
        global.fetch = vi.fn().mockResolvedValue(mockResponse({ success: true }));

        const client = new ServerClient();
        await client.post('/test');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'POST'
          })
        );
        // Verify body is not in the request init
        const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
        expect(callArgs.body).toBeUndefined();
      });
    });

    describe('put', () => {
      it('should perform PUT request', async () => {
        const mockData = { id: 1, updated: true };
        global.fetch = vi.fn().mockResolvedValue(mockResponse(mockData));

        const client = new ServerClient();
        const result = await client.put('/test/1', { name: 'updated' });

        expect(result).toEqual(mockData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ method: 'PUT' })
        );
      });
    });

    describe('delete', () => {
      it('should perform DELETE request', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
          json: () => Promise.resolve(null)
        } as Response);

        const client = new ServerClient();
        const result = await client.delete('/test/1');

        expect(result).toBeUndefined();
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });

  describe('error handling', () => {
    it('should throw error for non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Resource not found' })
      } as Response);

      const client = new ServerClient();

      await expect(client.get('/nonexistent')).rejects.toThrow('Resource not found');
    });

    it('should handle HTTP error without JSON body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON'))
      } as Response);

      const client = new ServerClient();

      await expect(client.get('/error')).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should throw ConnectionError for network failures', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

      const client = new ServerClient();

      await expect(client.get('/test')).rejects.toThrow(ConnectionError);
    });

    it('should throw ConnectionError for ECONNREFUSED', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const client = new ServerClient();

      await expect(client.get('/test')).rejects.toThrow(ConnectionError);
    });
  });

  describe('API methods', () => {
    const mockFetch = <T>(data: T) => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(data)
      } as Response);
    };

    describe('getHealth', () => {
      it('should fetch health status', async () => {
        const healthData = {
          status: 'ok' as const,
          timestamp: Date.now(),
          uptime: 1234,
          version: '1.0.0',
          engine: { name: 'noex-rules', running: true }
        };
        mockFetch(healthData);

        const client = new ServerClient();
        const result = await client.getHealth();

        expect(result).toEqual(healthData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/health'),
          expect.anything()
        );
      });
    });

    describe('getStats', () => {
      it('should fetch engine stats', async () => {
        const statsData = {
          rulesCount: 10,
          factsCount: 25,
          timersCount: 3,
          eventsProcessed: 1000,
          rulesExecuted: 500,
          avgProcessingTimeMs: 2.5,
          timestamp: Date.now()
        };
        mockFetch(statsData);

        const client = new ServerClient();
        const result = await client.getStats();

        expect(result).toEqual(statsData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/stats'),
          expect.anything()
        );
      });
    });

    describe('getRules', () => {
      it('should fetch list of rules', async () => {
        const rulesData = [
          { id: 'rule-1', name: 'Rule 1', enabled: true },
          { id: 'rule-2', name: 'Rule 2', enabled: false }
        ];
        mockFetch(rulesData);

        const client = new ServerClient();
        const result = await client.getRules();

        expect(result).toEqual(rulesData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rules'),
          expect.anything()
        );
      });
    });

    describe('getRule', () => {
      it('should fetch single rule by ID', async () => {
        const ruleData = { id: 'rule-1', name: 'Rule 1', enabled: true };
        mockFetch(ruleData);

        const client = new ServerClient();
        const result = await client.getRule('rule-1');

        expect(result).toEqual(ruleData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rules/rule-1'),
          expect.anything()
        );
      });

      it('should encode special characters in ID', async () => {
        mockFetch({});

        const client = new ServerClient();
        await client.getRule('rule/with/slashes');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rules/rule%2Fwith%2Fslashes'),
          expect.anything()
        );
      });
    });

    describe('enableRule', () => {
      it('should enable rule', async () => {
        const ruleData = { id: 'rule-1', enabled: true };
        mockFetch(ruleData);

        const client = new ServerClient();
        const result = await client.enableRule('rule-1');

        expect(result).toEqual(ruleData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rules/rule-1/enable'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    describe('disableRule', () => {
      it('should disable rule', async () => {
        const ruleData = { id: 'rule-1', enabled: false };
        mockFetch(ruleData);

        const client = new ServerClient();
        const result = await client.disableRule('rule-1');

        expect(result).toEqual(ruleData);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rules/rule-1/disable'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    describe('deleteRule', () => {
      it('should delete rule', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
          json: () => Promise.resolve(null)
        } as Response);

        const client = new ServerClient();
        await client.deleteRule('rule-1');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rules/rule-1'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });
});
