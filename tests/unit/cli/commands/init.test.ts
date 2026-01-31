import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initCommand, type InitCommandOptions } from '../../../../src/cli/commands/init.js';
import { CliError } from '../../../../src/cli/utils/errors.js';
import { setOutputOptions } from '../../../../src/cli/utils/output.js';
import * as fs from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn()
}));

function createOptions(overrides: Partial<InitCommandOptions> = {}): InitCommandOptions {
  return {
    format: 'pretty',
    quiet: false,
    noColor: true,
    config: undefined,
    force: false,
    serverUrl: undefined,
    storageAdapter: undefined,
    storagePath: undefined,
    ...overrides
  };
}

describe('initCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setOutputOptions({ format: 'pretty', quiet: false, noColor: true });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('successful initialization', () => {
    it('should create configuration file with default values', async () => {
      const options = createOptions();

      await initCommand(options);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [path, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
      expect(path).toContain('.noex-rules.json');

      const config = JSON.parse((content as string).trim());
      expect(config.server.url).toBe('http://localhost:7226');
      expect(config.storage.adapter).toBe('memory');
      expect(config.output.format).toBe('pretty');
      expect(config.output.colors).toBe(true);
    });

    it('should display success message in pretty format', async () => {
      const options = createOptions({ format: 'pretty' });

      await initCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Configuration file created successfully');
      expect(output).toContain('Path:');
      expect(output).toContain('.noex-rules.json');
    });

    it('should output JSON when format is json', async () => {
      const options = createOptions({ format: 'json' });
      setOutputOptions({ format: 'json', quiet: false, noColor: true });

      await initCommand(options);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.message.created).toBe(true);
      expect(parsed.message.config).toBeDefined();
    });

    it('should use custom server URL when provided', async () => {
      const options = createOptions({ serverUrl: 'http://custom:8080' });

      await initCommand(options);

      const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
      const config = JSON.parse((content as string).trim());
      expect(config.server.url).toBe('http://custom:8080');
    });

    it('should use custom storage adapter when provided', async () => {
      const options = createOptions({ storageAdapter: 'sqlite' });

      await initCommand(options);

      const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
      const config = JSON.parse((content as string).trim());
      expect(config.storage.adapter).toBe('sqlite');
      expect(config.storage.path).toBe('./data/rules.db');
    });

    it('should use custom storage path when provided', async () => {
      const options = createOptions({
        storageAdapter: 'sqlite',
        storagePath: './custom/path.db'
      });

      await initCommand(options);

      const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
      const config = JSON.parse((content as string).trim());
      expect(config.storage.path).toBe('./custom/path.db');
    });

    it('should set default path for file adapter', async () => {
      const options = createOptions({ storageAdapter: 'file' });

      await initCommand(options);

      const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
      const config = JSON.parse((content as string).trim());
      expect(config.storage.adapter).toBe('file');
      expect(config.storage.path).toBe('./data/rules.json');
    });

    it('should not set path for memory adapter', async () => {
      const options = createOptions({ storageAdapter: 'memory' });

      await initCommand(options);

      const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
      const config = JSON.parse((content as string).trim());
      expect(config.storage.adapter).toBe('memory');
      expect(config.storage.path).toBeUndefined();
    });
  });

  describe('existing file handling', () => {
    it('should throw error when config file exists without force flag', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const options = createOptions({ force: false });

      await expect(initCommand(options)).rejects.toThrow(CliError);
      await expect(initCommand(options)).rejects.toThrow('already exists');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should overwrite existing file with force flag', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const options = createOptions({ force: true });

      await initCommand(options);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('quiet mode', () => {
    it('should suppress output in quiet mode', async () => {
      const options = createOptions({ quiet: true });
      setOutputOptions({ format: 'pretty', quiet: true, noColor: true });

      await initCommand(options);

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('output formatting', () => {
    it('should display server configuration in pretty output', async () => {
      const options = createOptions({
        format: 'pretty',
        serverUrl: 'http://test:3000'
      });

      await initCommand(options);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Server:');
      expect(output).toContain('http://test:3000');
    });

    it('should display storage configuration in pretty output', async () => {
      const options = createOptions({
        format: 'pretty',
        storageAdapter: 'sqlite',
        storagePath: './db/rules.db'
      });

      await initCommand(options);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Storage:');
      expect(output).toContain('sqlite');
      expect(output).toContain('./db/rules.db');
    });

    it('should display output configuration in pretty output', async () => {
      const options = createOptions({ format: 'pretty' });

      await initCommand(options);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Output:');
      expect(output).toContain('Format:');
      expect(output).toContain('Colors:');
    });
  });
});
