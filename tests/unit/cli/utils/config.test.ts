import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, resetConfigCache, getConfigPath } from '../../../../src/cli/utils/config.js';
import { DEFAULT_CLI_CONFIG } from '../../../../src/cli/types.js';

describe('CLI Config', () => {
  const testConfigPath = join(process.cwd(), '.noex-rules.json');

  beforeEach(() => {
    resetConfigCache();
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  afterEach(() => {
    resetConfigCache();
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  describe('loadConfig', () => {
    it('should return default config when no config file exists', () => {
      const config = loadConfig();

      expect(config).toEqual(DEFAULT_CLI_CONFIG);
    });

    it('should load config from file', () => {
      const customConfig = {
        server: { url: 'http://custom:8080' },
        output: { format: 'json' }
      };
      writeFileSync(testConfigPath, JSON.stringify(customConfig));

      const config = loadConfig();

      expect(config.server.url).toBe('http://custom:8080');
      expect(config.output.format).toBe('json');
      expect(config.storage).toEqual(DEFAULT_CLI_CONFIG.storage);
    });

    it('should merge partial config with defaults', () => {
      const partialConfig = {
        output: { colors: false }
      };
      writeFileSync(testConfigPath, JSON.stringify(partialConfig));

      const config = loadConfig();

      expect(config.output.colors).toBe(false);
      expect(config.output.format).toBe(DEFAULT_CLI_CONFIG.output.format);
      expect(config.server).toEqual(DEFAULT_CLI_CONFIG.server);
    });

    it('should load explicit config path', () => {
      const explicitPath = join(process.cwd(), 'custom-config.json');
      const customConfig = {
        server: { url: 'http://explicit:9000' }
      };
      writeFileSync(explicitPath, JSON.stringify(customConfig));

      try {
        const config = loadConfig(explicitPath);

        expect(config.server.url).toBe('http://explicit:9000');
      } finally {
        if (existsSync(explicitPath)) {
          unlinkSync(explicitPath);
        }
      }
    });

    it('should throw error for invalid JSON', () => {
      writeFileSync(testConfigPath, 'not valid json');

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('should throw error when explicit path does not exist', () => {
      expect(() => loadConfig('/nonexistent/config.json')).toThrow('Configuration file not found');
    });

    it('should cache loaded config', () => {
      writeFileSync(testConfigPath, JSON.stringify({ server: { url: 'http://cached:1000' } }));

      const config1 = loadConfig();
      writeFileSync(testConfigPath, JSON.stringify({ server: { url: 'http://changed:2000' } }));
      const config2 = loadConfig();

      expect(config1).toBe(config2);
      expect(config2.server.url).toBe('http://cached:1000');
    });
  });

  describe('getConfigPath', () => {
    it('should return null when no config loaded', () => {
      expect(getConfigPath()).toBeNull();
    });

    it('should return config path after loading', () => {
      writeFileSync(testConfigPath, JSON.stringify({}));
      loadConfig();

      expect(getConfigPath()).toBe(testConfigPath);
    });

    it('should return null for default config', () => {
      loadConfig();

      expect(getConfigPath()).toBeNull();
    });
  });

  describe('resetConfigCache', () => {
    it('should clear cached config', () => {
      writeFileSync(testConfigPath, JSON.stringify({ server: { url: 'http://first:1000' } }));
      loadConfig();

      resetConfigCache();
      writeFileSync(testConfigPath, JSON.stringify({ server: { url: 'http://second:2000' } }));
      const config = loadConfig();

      expect(config.server.url).toBe('http://second:2000');
    });
  });
});
