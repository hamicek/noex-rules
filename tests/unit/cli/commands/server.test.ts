import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  serverStatusCommand,
  type ServerStatusOptions
} from '../../../../src/cli/commands/server.js';
import type { CliConfig } from '../../../../src/cli/types.js';
import { ConnectionError } from '../../../../src/cli/utils/errors.js';
import { setOutputOptions } from '../../../../src/cli/utils/output.js';

function createStatusOptions(overrides: Partial<ServerStatusOptions> = {}): ServerStatusOptions {
  return {
    format: 'pretty',
    quiet: false,
    noColor: true,
    config: undefined,
    url: undefined,
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

const mockHealthResponse = {
  status: 'ok' as const,
  timestamp: 1700000000000,
  uptime: 3665,
  version: '1.0.0',
  engine: {
    name: 'noex-rules',
    running: true
  }
};

describe('serverStatusCommand', () => {
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
        json: () => Promise.resolve(mockHealthResponse)
      } as Response);
    });

    it('should display status in pretty format', async () => {
      const options = createStatusOptions({ format: 'pretty' });
      const config = createConfig();

      await serverStatusCommand(options, config);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Server Status');
      expect(output).toContain('http://localhost:3000');
      expect(output).toContain('ok');
      expect(output).toContain('1.0.0');
      expect(output).toContain('Engine:');
      expect(output).toContain('noex-rules');
    });

    it('should display status in JSON format', async () => {
      const options = createStatusOptions({ format: 'json' });
      const config = createConfig();
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await serverStatusCommand(options, config);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.version).toBe('1.0.0');
      expect(parsed.data.serverUrl).toBe('http://localhost:3000');
    });

    it('should use URL from options over config', async () => {
      const options = createStatusOptions({ url: 'http://custom:8080' });
      const config = createConfig();

      await serverStatusCommand(options, config);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://custom:8080'),
        expect.anything()
      );
    });

    it('should use URL from config when not specified', async () => {
      const options = createStatusOptions();
      const config = createConfig({ server: { url: 'http://config-server:4000' } });

      await serverStatusCommand(options, config);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://config-server:4000'),
        expect.anything()
      );
    });

    it('should format uptime in seconds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockHealthResponse, uptime: 45 })
      } as Response);

      const options = createStatusOptions();
      const config = createConfig();

      await serverStatusCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('45s');
    });

    it('should format uptime in minutes and seconds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockHealthResponse, uptime: 125 })
      } as Response);

      const options = createStatusOptions();
      const config = createConfig();

      await serverStatusCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('2m 5s');
    });

    it('should format uptime in hours and minutes', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockHealthResponse, uptime: 7380 })
      } as Response);

      const options = createStatusOptions();
      const config = createConfig();

      await serverStatusCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('2h 3m');
    });

    it('should format uptime in days and hours', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockHealthResponse, uptime: 176400 })
      } as Response);

      const options = createStatusOptions();
      const config = createConfig();

      await serverStatusCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('2d 1h');
    });

    it('should show degraded status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockHealthResponse, status: 'degraded' })
      } as Response);

      const options = createStatusOptions();
      const config = createConfig();

      await serverStatusCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('degraded');
    });

    it('should show engine not running', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockHealthResponse,
            engine: { ...mockHealthResponse.engine, running: false }
          })
      } as Response);

      const options = createStatusOptions();
      const config = createConfig();

      await serverStatusCommand(options, config);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('no');
    });
  });

  describe('error handling', () => {
    it('should throw ConnectionError when server is unreachable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

      const options = createStatusOptions();
      const config = createConfig();

      await expect(serverStatusCommand(options, config)).rejects.toThrow(ConnectionError);
    });

    it('should propagate API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: 'Server error' })
      } as Response);

      const options = createStatusOptions();
      const config = createConfig();

      await expect(serverStatusCommand(options, config)).rejects.toThrow('Server error');
    });
  });

  describe('quiet mode', () => {
    it('should suppress output in quiet mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockHealthResponse)
      } as Response);

      const options = createStatusOptions({ quiet: true });
      const config = createConfig();
      setOutputOptions({ format: 'pretty', quiet: true, noColor: true });

      await serverStatusCommand(options, config);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
