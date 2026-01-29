import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ServerClient,
  createServerClient,
  type ServerClientConfig,
  type AuditEntriesParams,
  type AuditExportParams,
  type AuditCleanupResult,
} from '../../../../src/cli/services/server-client.js';
import { ConnectionError } from '../../../../src/cli/utils/errors.js';
import type { AuditEntry, AuditQueryResult, AuditStats } from '../../../../src/audit/types.js';

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

    describe('getAuditEntries', () => {
      it('should fetch audit entries without params', async () => {
        const queryResult: AuditQueryResult = {
          entries: [],
          totalCount: 0,
          queryTimeMs: 1,
          hasMore: false,
        };
        mockFetch(queryResult);

        const client = new ServerClient();
        const result = await client.getAuditEntries();

        expect(result).toEqual(queryResult);
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v1/audit/entries',
          expect.anything()
        );
      });

      it('should build query string from filter params', async () => {
        mockFetch({ entries: [], totalCount: 0, queryTimeMs: 1, hasMore: false });

        const client = new ServerClient();
        await client.getAuditEntries({
          category: 'rule_execution',
          types: ['rule_executed', 'rule_failed'],
          ruleId: 'my-rule',
          source: 'engine',
          correlationId: 'corr-123',
          from: 1000,
          to: 2000,
          limit: 50,
          offset: 10,
        });

        const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(calledUrl).toContain('/audit/entries?');
        expect(calledUrl).toContain('category=rule_execution');
        expect(calledUrl).toContain('types=rule_executed%2Crule_failed');
        expect(calledUrl).toContain('ruleId=my-rule');
        expect(calledUrl).toContain('source=engine');
        expect(calledUrl).toContain('correlationId=corr-123');
        expect(calledUrl).toContain('from=1000');
        expect(calledUrl).toContain('to=2000');
        expect(calledUrl).toContain('limit=50');
        expect(calledUrl).toContain('offset=10');
      });

      it('should omit undefined params from query string', async () => {
        mockFetch({ entries: [], totalCount: 0, queryTimeMs: 1, hasMore: false });

        const client = new ServerClient();
        await client.getAuditEntries({ category: 'system' });

        const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(calledUrl).toContain('category=system');
        expect(calledUrl).not.toContain('types=');
        expect(calledUrl).not.toContain('ruleId=');
        expect(calledUrl).not.toContain('source=');
        expect(calledUrl).not.toContain('from=');
        expect(calledUrl).not.toContain('to=');
        expect(calledUrl).not.toContain('limit=');
        expect(calledUrl).not.toContain('offset=');
      });

      it('should return entries from the API', async () => {
        const entry: AuditEntry = {
          id: 'audit-1',
          timestamp: Date.now(),
          category: 'rule_execution',
          type: 'rule_executed',
          summary: 'Rule executed successfully',
          source: 'rule-engine',
          ruleId: 'rule-1',
          ruleName: 'Test Rule',
          details: { result: 'ok' },
          durationMs: 5,
        };
        const queryResult: AuditQueryResult = {
          entries: [entry],
          totalCount: 1,
          queryTimeMs: 2,
          hasMore: false,
        };
        mockFetch(queryResult);

        const client = new ServerClient();
        const result = await client.getAuditEntries();

        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].id).toBe('audit-1');
        expect(result.entries[0].type).toBe('rule_executed');
        expect(result.totalCount).toBe(1);
      });
    });

    describe('getAuditEntry', () => {
      it('should fetch single audit entry by ID', async () => {
        const entry: AuditEntry = {
          id: 'audit-42',
          timestamp: Date.now(),
          category: 'fact_change',
          type: 'fact_updated',
          summary: 'Fact updated',
          source: 'rule-engine',
          details: { key: 'temperature', value: 25 },
        };
        mockFetch(entry);

        const client = new ServerClient();
        const result = await client.getAuditEntry('audit-42');

        expect(result).toEqual(entry);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/audit/entries/audit-42'),
          expect.anything()
        );
      });

      it('should encode special characters in entry ID', async () => {
        mockFetch({});

        const client = new ServerClient();
        await client.getAuditEntry('id/with/slashes');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/audit/entries/id%2Fwith%2Fslashes'),
          expect.anything()
        );
      });
    });

    describe('getAuditStats', () => {
      it('should fetch audit stats', async () => {
        const stats: AuditStats = {
          totalEntries: 500,
          memoryEntries: 200,
          oldestEntry: 1000000,
          newestEntry: 2000000,
          entriesByCategory: {
            rule_management: 50,
            rule_execution: 300,
            fact_change: 100,
            event_emitted: 30,
            system: 20,
          },
          subscribersCount: 2,
        };
        mockFetch(stats);

        const client = new ServerClient();
        const result = await client.getAuditStats();

        expect(result).toEqual(stats);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/audit/stats'),
          expect.anything()
        );
      });
    });

    describe('exportAudit', () => {
      const mockTextResponse = (text: string, status = 200) => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: status >= 200 && status < 300,
          status,
          statusText: status === 200 ? 'OK' : 'Error',
          text: () => Promise.resolve(text),
          json: () => Promise.resolve(null),
        } as Response);
      };

      it('should export audit entries as CSV text', async () => {
        const csvContent = 'id,timestamp,category\naudit-1,1000,system';
        mockTextResponse(csvContent);

        const client = new ServerClient();
        const result = await client.exportAudit({ format: 'csv' });

        expect(result).toBe(csvContent);
        const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(calledUrl).toContain('/audit/export');
        expect(calledUrl).toContain('format=csv');
      });

      it('should export audit entries as JSON text', async () => {
        const jsonContent = JSON.stringify([{ id: 'audit-1' }], null, 2);
        mockTextResponse(jsonContent);

        const client = new ServerClient();
        const result = await client.exportAudit({ format: 'json' });

        expect(result).toBe(jsonContent);
        const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(calledUrl).toContain('format=json');
      });

      it('should pass filter params to export endpoint', async () => {
        mockTextResponse('[]');

        const client = new ServerClient();
        await client.exportAudit({
          format: 'csv',
          category: 'rule_management',
          types: ['rule_enabled', 'rule_disabled'],
          ruleId: 'rule-1',
          source: 'api',
          from: 1000,
          to: 2000,
        });

        const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(calledUrl).toContain('format=csv');
        expect(calledUrl).toContain('category=rule_management');
        expect(calledUrl).toContain('types=rule_enabled%2Crule_disabled');
        expect(calledUrl).toContain('ruleId=rule-1');
        expect(calledUrl).toContain('source=api');
        expect(calledUrl).toContain('from=1000');
        expect(calledUrl).toContain('to=2000');
      });

      it('should export with no params', async () => {
        mockTextResponse('[]');

        const client = new ServerClient();
        await client.exportAudit();

        const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(calledUrl).toBe('http://localhost:3000/api/v1/audit/export');
      });

      it('should use Accept: */* header for text requests', async () => {
        mockTextResponse('data');

        const client = new ServerClient();
        await client.exportAudit();

        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: { Accept: '*/*' },
          })
        );
      });

      it('should throw error for non-ok response', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: () => Promise.resolve({ message: 'Audit log is not configured' }),
        } as Response);

        const client = new ServerClient();
        await expect(client.exportAudit()).rejects.toThrow('Audit log is not configured');
      });

      it('should throw ConnectionError for network failures', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

        const client = new ServerClient();
        await expect(client.exportAudit()).rejects.toThrow(ConnectionError);
      });
    });

    describe('cleanupAudit', () => {
      it('should trigger audit cleanup', async () => {
        const cleanupResult: AuditCleanupResult = {
          removedCount: 150,
          remainingCount: 350,
        };
        mockFetch(cleanupResult);

        const client = new ServerClient();
        const result = await client.cleanupAudit();

        expect(result).toEqual(cleanupResult);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/audit/cleanup'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });
});
