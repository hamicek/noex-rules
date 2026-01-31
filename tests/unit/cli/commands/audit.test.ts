import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  auditListCommand,
  auditSearchCommand,
  auditExportCommand,
  type AuditListOptions,
  type AuditSearchOptions,
  type AuditExportOptions,
} from '../../../../src/cli/commands/audit.js';
import type { CliConfig } from '../../../../src/cli/types.js';
import * as output from '../../../../src/cli/utils/output.js';
import * as serverClient from '../../../../src/cli/services/server-client.js';
import type { AuditEntry, AuditQueryResult } from '../../../../src/audit/types.js';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';

describe('Audit commands', () => {
  let mockPrint: ReturnType<typeof vi.fn>;
  let mockPrintData: ReturnType<typeof vi.fn>;
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
  };

  const defaultConfig: CliConfig = {
    server: { url: 'http://localhost:7226' },
    storage: { adapter: 'memory' },
    output: { format: 'pretty', colors: true },
  };

  const defaultListOptions: AuditListOptions = {
    format: 'pretty',
    quiet: false,
    noColor: false,
    config: undefined,
    url: undefined,
  };

  const defaultSearchOptions: AuditSearchOptions = {
    format: 'pretty',
    quiet: false,
    noColor: false,
    config: undefined,
    url: undefined,
  };

  const defaultExportOptions: AuditExportOptions = {
    format: 'pretty',
    quiet: false,
    noColor: false,
    config: undefined,
    url: undefined,
  };

  const sampleEntry: AuditEntry = {
    id: 'audit-1',
    timestamp: 1700000000000,
    category: 'rule_execution',
    type: 'rule_executed',
    summary: 'Rule "test-rule" executed successfully',
    source: 'rule-engine',
    ruleId: 'rule-1',
    ruleName: 'Test Rule',
    correlationId: 'corr-1',
    details: { result: 'success', factKey: 'temperature' },
    durationMs: 15,
  };

  const sampleEntry2: AuditEntry = {
    id: 'audit-2',
    timestamp: 1700000001000,
    category: 'fact_change',
    type: 'fact_updated',
    summary: 'Fact "temperature" updated from 20 to 25',
    source: 'rule-engine',
    details: { key: 'temperature', oldValue: 20, newValue: 25 },
  };

  const sampleEntry3: AuditEntry = {
    id: 'audit-3',
    timestamp: 1700000002000,
    category: 'system',
    type: 'engine_started',
    summary: 'Engine started',
    source: 'rule-engine',
    details: { rulesCount: 5 },
  };

  const sampleQueryResult: AuditQueryResult = {
    entries: [sampleEntry, sampleEntry2, sampleEntry3],
    totalCount: 3,
    queryTimeMs: 2,
    hasMore: false,
  };

  beforeEach(() => {
    mockPrint = vi.fn();
    mockPrintData = vi.fn();
    vi.spyOn(output, 'print').mockImplementation(mockPrint);
    vi.spyOn(output, 'printData').mockImplementation(mockPrintData);

    mockClient = {
      get: vi.fn(),
    };

    vi.spyOn(serverClient, 'createServerClient').mockReturnValue(
      mockClient as unknown as serverClient.ServerClient,
    );

    vi.mocked(writeFileSync).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // auditListCommand
  // ---------------------------------------------------------------------------
  describe('auditListCommand', () => {
    it('should list audit entries in pretty format', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(defaultListOptions, defaultConfig);

      expect(mockClient.get).toHaveBeenCalledWith('/audit/entries');
      expect(mockPrint).toHaveBeenCalled();

      const allOutput = mockPrint.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('Audit Log (3 of 3)');
      expect(allOutput).toContain('rule_executed');
      expect(allOutput).toContain('Rule "test-rule" executed successfully');
    });

    it('should list audit entries in json format', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand({ ...defaultListOptions, format: 'json' }, defaultConfig);

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'table',
        data: expect.objectContaining({
          entries: sampleQueryResult.entries,
          totalCount: 3,
          hasMore: false,
        }),
      });
    });

    it('should show warning when no entries found', async () => {
      mockClient.get.mockResolvedValue({
        entries: [],
        totalCount: 0,
        queryTimeMs: 1,
        hasMore: false,
      });

      await auditListCommand(defaultListOptions, defaultConfig);

      expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('No audit entries found'));
    });

    it('should show pagination hint when hasMore is true', async () => {
      mockClient.get.mockResolvedValue({
        ...sampleQueryResult,
        totalCount: 100,
        hasMore: true,
      });

      await auditListCommand(defaultListOptions, defaultConfig);

      const allOutput = mockPrint.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('3 of 100');
      expect(allOutput).toContain('--limit');
    });

    it('should pass filter parameters as query string', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(
        {
          ...defaultListOptions,
          category: 'rule_execution',
          type: 'rule_executed',
          ruleId: 'rule-1',
          limit: 50,
        },
        defaultConfig,
      );

      const url = mockClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('category=rule_execution');
      expect(url).toContain('types=rule_executed');
      expect(url).toContain('ruleId=rule-1');
      expect(url).toContain('limit=50');
    });

    it('should parse ISO date string for --from and --to', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(
        {
          ...defaultListOptions,
          from: '2024-01-15T00:00:00Z',
          to: '2024-01-16T00:00:00Z',
        },
        defaultConfig,
      );

      const url = mockClient.get.mock.calls[0]![0] as string;
      expect(url).toContain(`from=${new Date('2024-01-15T00:00:00Z').getTime()}`);
      expect(url).toContain(`to=${new Date('2024-01-16T00:00:00Z').getTime()}`);
    });

    it('should parse numeric timestamps for --from and --to', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(
        {
          ...defaultListOptions,
          from: '1700000000000',
          to: '1700001000000',
        },
        defaultConfig,
      );

      const url = mockClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('from=1700000000000');
      expect(url).toContain('to=1700001000000');
    });

    it('should use custom URL from options', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(
        { ...defaultListOptions, url: 'http://custom:8080' },
        defaultConfig,
      );

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://custom:8080',
      });
    });

    it('should fall back to config URL when option not provided', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(defaultListOptions, {
        ...defaultConfig,
        server: { url: 'http://from-config:8080' },
      });

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://from-config:8080',
      });
    });

    it('should display rule info and duration when present', async () => {
      mockClient.get.mockResolvedValue({
        entries: [sampleEntry],
        totalCount: 1,
        queryTimeMs: 1,
        hasMore: false,
      });

      await auditListCommand(defaultListOptions, defaultConfig);

      const allOutput = mockPrint.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('rule-1');
      expect(allOutput).toContain('Test Rule');
      expect(allOutput).toContain('15ms');
      expect(allOutput).toContain('corr-1');
    });

    it('should omit undefined filter parameters from query string', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(defaultListOptions, defaultConfig);

      expect(mockClient.get).toHaveBeenCalledWith('/audit/entries');
    });
  });

  // ---------------------------------------------------------------------------
  // auditSearchCommand
  // ---------------------------------------------------------------------------
  describe('auditSearchCommand', () => {
    it('should filter entries by summary text', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand('temperature', defaultSearchOptions, defaultConfig);

      const allOutput = mockPrint.mock.calls.map(c => c[0]).join('\n');
      // Should match sampleEntry2 (summary contains "temperature") and sampleEntry (details has factKey: "temperature")
      expect(allOutput).toContain('Search Results');
      expect(allOutput).toContain('temperature');
    });

    it('should filter entries by details content', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand('rulesCount', defaultSearchOptions, defaultConfig);

      const allOutput = mockPrint.mock.calls.map(c => c[0]).join('\n');
      // Only sampleEntry3 has rulesCount in details
      expect(allOutput).toContain('1 matches');
    });

    it('should perform case-insensitive search', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand('TEMPERATURE', defaultSearchOptions, defaultConfig);

      const allOutput = mockPrint.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('Search Results');
      expect(allOutput).not.toContain('No audit entries matching');
    });

    it('should show warning when no matches found', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand('nonexistent-query-xyz', defaultSearchOptions, defaultConfig);

      expect(mockPrint).toHaveBeenCalledWith(
        expect.stringContaining("No audit entries matching 'nonexistent-query-xyz'"),
      );
    });

    it('should output json format with matched entries', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand(
        'engine_started',
        { ...defaultSearchOptions, format: 'json' },
        defaultConfig,
      );

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'table',
        data: expect.objectContaining({
          query: 'engine_started',
          totalCount: expect.any(Number),
        }),
      });
    });

    it('should pass filter parameters to API', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand(
        'test',
        {
          ...defaultSearchOptions,
          category: 'system',
          ruleId: 'rule-1',
        },
        defaultConfig,
      );

      const url = mockClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('category=system');
      expect(url).toContain('ruleId=rule-1');
    });

    it('should use default limit of 1000 for search', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand('test', defaultSearchOptions, defaultConfig);

      const url = mockClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('limit=1000');
    });

    it('should respect custom limit option', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand(
        'test',
        { ...defaultSearchOptions, limit: 500 },
        defaultConfig,
      );

      const url = mockClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('limit=500');
    });
  });

  // ---------------------------------------------------------------------------
  // auditExportCommand
  // ---------------------------------------------------------------------------
  describe('auditExportCommand', () => {
    it('should export JSON to stdout when no output file specified', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await auditExportCommand(defaultExportOptions, defaultConfig);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const jsonOutput = consoleSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].id).toBe('audit-1');

      consoleSpy.mockRestore();
    });

    it('should export CSV to stdout when no output file specified', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await auditExportCommand(
        { ...defaultExportOptions, exportFormat: 'csv' },
        defaultConfig,
      );

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const csvOutput = consoleSpy.mock.calls[0]![0] as string;
      const lines = csvOutput.split('\n');
      expect(lines[0]).toBe(
        'id,timestamp,category,type,summary,source,ruleId,ruleName,correlationId,details,durationMs',
      );
      expect(lines).toHaveLength(4); // header + 3 entries

      consoleSpy.mockRestore();
    });

    it('should write JSON to file when output path specified', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditExportCommand(
        { ...defaultExportOptions, output: 'audit-export.json' },
        defaultConfig,
      );

      expect(writeFileSync).toHaveBeenCalledTimes(1);
      const [filePath, content] = vi.mocked(writeFileSync).mock.calls[0]!;
      expect(String(filePath)).toContain('audit-export.json');
      const parsed = JSON.parse(content as string);
      expect(parsed).toHaveLength(3);
    });

    it('should write CSV to file when output path and csv format specified', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditExportCommand(
        { ...defaultExportOptions, output: 'audit-export.csv', exportFormat: 'csv' },
        defaultConfig,
      );

      expect(writeFileSync).toHaveBeenCalledTimes(1);
      const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
      const lines = (content as string).split('\n');
      expect(lines[0]).toContain('id,timestamp,category');
      expect(lines).toHaveLength(4);
    });

    it('should show success message in pretty format after file export', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditExportCommand(
        { ...defaultExportOptions, output: 'out.json' },
        defaultConfig,
      );

      expect(mockPrint).toHaveBeenCalledWith(
        expect.stringContaining('Exported 3 entries'),
      );
    });

    it('should show json message after file export in json format', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditExportCommand(
        { ...defaultExportOptions, output: 'out.json', format: 'json' },
        defaultConfig,
      );

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'message',
        data: expect.objectContaining({
          count: 3,
          format: 'json',
        }),
      });
    });

    it('should pass filter parameters to API with limit 10000', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await auditExportCommand(
        {
          ...defaultExportOptions,
          category: 'rule_execution',
          type: 'rule_executed',
          from: '1700000000000',
          to: '1700001000000',
        },
        defaultConfig,
      );

      const url = mockClient.get.mock.calls[0]![0] as string;
      expect(url).toContain('category=rule_execution');
      expect(url).toContain('types=rule_executed');
      expect(url).toContain('from=1700000000000');
      expect(url).toContain('to=1700001000000');
      expect(url).toContain('limit=10000');
    });

    it('should properly escape CSV values with commas and quotes', async () => {
      const entryWithSpecialChars: AuditEntry = {
        id: 'audit-special',
        timestamp: 1700000000000,
        category: 'fact_change',
        type: 'fact_updated',
        summary: 'Fact "value,with" special chars',
        source: 'rule-engine',
        details: { note: 'has "quotes" and, commas' },
      };

      mockClient.get.mockResolvedValue({
        entries: [entryWithSpecialChars],
        totalCount: 1,
        queryTimeMs: 1,
        hasMore: false,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await auditExportCommand(
        { ...defaultExportOptions, exportFormat: 'csv' },
        defaultConfig,
      );

      const csvOutput = consoleSpy.mock.calls[0]![0] as string;
      const dataRow = csvOutput.split('\n')[1]!;
      // Summary with commas and quotes should be escaped
      expect(dataRow).toContain('"Fact ""value,with"" special chars"');

      consoleSpy.mockRestore();
    });

    it('should default to json export format when not specified', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await auditExportCommand(defaultExportOptions, defaultConfig);

      const jsonOutput = consoleSpy.mock.calls[0]![0] as string;
      // Should be valid JSON (not CSV)
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Server URL resolution
  // ---------------------------------------------------------------------------
  describe('server URL resolution', () => {
    it('should use URL from options when provided for list', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditListCommand(
        { ...defaultListOptions, url: 'http://override:9000' },
        defaultConfig,
      );

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://override:9000',
      });
    });

    it('should use URL from options when provided for search', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);

      await auditSearchCommand(
        'test',
        { ...defaultSearchOptions, url: 'http://override:9000' },
        defaultConfig,
      );

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://override:9000',
      });
    });

    it('should use URL from options when provided for export', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await auditExportCommand(
        { ...defaultExportOptions, url: 'http://override:9000' },
        defaultConfig,
      );

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://override:9000',
      });
    });

    it('should fall back to config URL for all commands', async () => {
      mockClient.get.mockResolvedValue(sampleQueryResult);
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const customConfig = {
        ...defaultConfig,
        server: { url: 'http://from-config:7777' },
      };

      await auditListCommand(defaultListOptions, customConfig);
      await auditSearchCommand('q', defaultSearchOptions, customConfig);
      await auditExportCommand(defaultExportOptions, customConfig);

      const calls = vi.mocked(serverClient.createServerClient).mock.calls;
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call[0]).toEqual({ baseUrl: 'http://from-config:7777' });
      }
    });
  });
});
