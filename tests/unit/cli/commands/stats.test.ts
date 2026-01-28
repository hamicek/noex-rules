import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { statsCommand, type StatsCommandOptions } from '../../../../src/cli/commands/stats.js';
import type { CliConfig } from '../../../../src/cli/types.js';
import { ConnectionError } from '../../../../src/cli/utils/errors.js';
import { setOutputOptions } from '../../../../src/cli/utils/output.js';

function createOptions(overrides: Partial<StatsCommandOptions> = {}): StatsCommandOptions {
  return {
    format: 'pretty',
    quiet: false,
    noColor: true,
    config: undefined,
    ...overrides
  };
}

function createConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  return {
    server: { url: 'http://localhost:3000' },
    storage: { adapter: 'memory' },
    output: { format: 'pretty', colors: true },
    ...overrides
  };
}

const mockStatsResponse = {
  rulesCount: 15,
  factsCount: 42,
  timersCount: 5,
  eventsProcessed: 1234,
  rulesExecuted: 567,
  avgProcessingTimeMs: 1.25,
  timestamp: 1700000000000
};

describe('statsCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalFetch = global.fetch;
    setOutputOptions({ format: 'pretty', quiet: false, noColor: true });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('successful fetch', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockStatsResponse)
      } as Response);
    });

    it('should fetch and display stats in pretty format', async () => {
      const options = createOptions({ format: 'pretty' });
      const config = createConfig();

      await statsCommand(options, config);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Engine Statistics');
      expect(output).toContain('Rules:');
      expect(output).toContain('Facts:');
      expect(output).toContain('Timers:');
      expect(output).toContain('Events processed:');
      expect(output).toContain('Rules executed:');
      expect(output).toContain('Avg processing time:');
    });

    it('should fetch and display stats in JSON format', async () => {
      const options = createOptions({ format: 'json' });
      const config = createConfig();
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await statsCommand(options, config);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.rulesCount).toBe(15);
      expect(parsed.data.factsCount).toBe(42);
      expect(parsed.data.serverUrl).toBe('http://localhost:3000');
    });

    it('should use URL from options over config', async () => {
      const options = createOptions({ url: 'http://custom:8080' });
      const config = createConfig({ server: { url: 'http://localhost:3000' } });

      await statsCommand(options, config);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://custom:8080'),
        expect.anything()
      );
    });

    it('should use URL from config when not specified in options', async () => {
      const options = createOptions();
      const config = createConfig({ server: { url: 'http://config-server:4000' } });

      await statsCommand(options, config);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://config-server:4000'),
        expect.anything()
      );
    });

    it('should format numbers correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockStatsResponse,
            eventsProcessed: 1234567,
            rulesExecuted: 987654
          })
      } as Response);

      const options = createOptions({ format: 'pretty' });
      const config = createConfig();

      await statsCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('1,234,567');
      expect(output).toContain('987,654');
    });

    it('should format time in microseconds for small values', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockStatsResponse,
            avgProcessingTimeMs: 0.5
          })
      } as Response);

      const options = createOptions({ format: 'pretty' });
      const config = createConfig();

      await statsCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('μs');
    });

    it('should format time in seconds for large values', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockStatsResponse,
            avgProcessingTimeMs: 2500
          })
      } as Response);

      const options = createOptions({ format: 'pretty' });
      const config = createConfig();

      await statsCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('s');
    });
  });

  describe('error handling', () => {
    it('should throw ConnectionError when server is unreachable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

      const options = createOptions();
      const config = createConfig();

      await expect(statsCommand(options, config)).rejects.toThrow(ConnectionError);
    });

    it('should propagate API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: 'Server error' })
      } as Response);

      const options = createOptions();
      const config = createConfig();

      await expect(statsCommand(options, config)).rejects.toThrow('Server error');
    });
  });

  describe('quiet mode', () => {
    it('should suppress output in quiet mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockStatsResponse)
      } as Response);

      const options = createOptions({ quiet: true });
      const config = createConfig();
      setOutputOptions({ format: 'pretty', quiet: true, noColor: true });

      await statsCommand(options, config);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
