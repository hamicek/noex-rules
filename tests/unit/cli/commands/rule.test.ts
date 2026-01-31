import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ruleListCommand,
  ruleGetCommand,
  ruleEnableCommand,
  ruleDisableCommand,
  ruleDeleteCommand,
  type RuleCommandOptions
} from '../../../../src/cli/commands/rule.js';
import type { CliConfig } from '../../../../src/cli/types.js';
import * as output from '../../../../src/cli/utils/output.js';
import * as serverClient from '../../../../src/cli/services/server-client.js';

describe('Rule commands', () => {
  let mockPrint: ReturnType<typeof vi.fn>;
  let mockPrintData: ReturnType<typeof vi.fn>;
  let mockClient: {
    getRules: ReturnType<typeof vi.fn>;
    getRule: ReturnType<typeof vi.fn>;
    enableRule: ReturnType<typeof vi.fn>;
    disableRule: ReturnType<typeof vi.fn>;
    deleteRule: ReturnType<typeof vi.fn>;
  };

  const defaultConfig: CliConfig = {
    server: { url: 'http://localhost:7226' },
    storage: { adapter: 'memory' },
    output: { format: 'pretty', colors: true }
  };

  const defaultOptions: RuleCommandOptions = {
    format: 'pretty',
    quiet: false,
    noColor: false,
    config: undefined,
    url: undefined
  };

  const sampleRule: serverClient.RuleResponse = {
    id: 'rule-1',
    name: 'Test Rule',
    description: 'A test rule',
    priority: 100,
    enabled: true,
    tags: ['test', 'sample'],
    trigger: { type: 'event', eventType: 'test.event' },
    conditions: [],
    actions: [{ type: 'log', message: 'Test' }]
  };

  beforeEach(() => {
    mockPrint = vi.fn();
    mockPrintData = vi.fn();
    vi.spyOn(output, 'print').mockImplementation(mockPrint);
    vi.spyOn(output, 'printData').mockImplementation(mockPrintData);

    mockClient = {
      getRules: vi.fn(),
      getRule: vi.fn(),
      enableRule: vi.fn(),
      disableRule: vi.fn(),
      deleteRule: vi.fn()
    };

    vi.spyOn(serverClient, 'createServerClient').mockReturnValue(mockClient as unknown as serverClient.ServerClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ruleListCommand', () => {
    it('should list rules in pretty format', async () => {
      mockClient.getRules.mockResolvedValue([sampleRule]);

      await ruleListCommand(defaultOptions, defaultConfig);

      expect(mockClient.getRules).toHaveBeenCalled();
      expect(mockPrint).toHaveBeenCalled();
    });

    it('should list rules in json format', async () => {
      mockClient.getRules.mockResolvedValue([sampleRule]);

      await ruleListCommand({ ...defaultOptions, format: 'json' }, defaultConfig);

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'rules',
        data: expect.objectContaining({
          rules: [sampleRule],
          count: 1
        })
      });
    });

    it('should show warning when no rules found', async () => {
      mockClient.getRules.mockResolvedValue([]);

      await ruleListCommand(defaultOptions, defaultConfig);

      expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('No rules found'));
    });

    it('should use custom URL from options', async () => {
      mockClient.getRules.mockResolvedValue([]);

      await ruleListCommand({ ...defaultOptions, url: 'http://custom:8080' }, defaultConfig);

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://custom:8080'
      });
    });
  });

  describe('ruleGetCommand', () => {
    it('should get rule details in pretty format', async () => {
      mockClient.getRule.mockResolvedValue(sampleRule);

      await ruleGetCommand('rule-1', defaultOptions, defaultConfig);

      expect(mockClient.getRule).toHaveBeenCalledWith('rule-1');
      expect(mockPrint).toHaveBeenCalled();
    });

    it('should get rule details in json format', async () => {
      mockClient.getRule.mockResolvedValue(sampleRule);

      await ruleGetCommand('rule-1', { ...defaultOptions, format: 'json' }, defaultConfig);

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'rule',
        data: expect.objectContaining({
          rule: sampleRule
        })
      });
    });
  });

  describe('ruleEnableCommand', () => {
    it('should enable rule and show success message', async () => {
      mockClient.enableRule.mockResolvedValue({ ...sampleRule, enabled: true });

      await ruleEnableCommand('rule-1', defaultOptions, defaultConfig);

      expect(mockClient.enableRule).toHaveBeenCalledWith('rule-1');
      expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('enabled'));
    });

    it('should enable rule in json format', async () => {
      mockClient.enableRule.mockResolvedValue({ ...sampleRule, enabled: true });

      await ruleEnableCommand('rule-1', { ...defaultOptions, format: 'json' }, defaultConfig);

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'rule',
        data: expect.objectContaining({
          action: 'enabled'
        })
      });
    });
  });

  describe('ruleDisableCommand', () => {
    it('should disable rule and show success message', async () => {
      mockClient.disableRule.mockResolvedValue({ ...sampleRule, enabled: false });

      await ruleDisableCommand('rule-1', defaultOptions, defaultConfig);

      expect(mockClient.disableRule).toHaveBeenCalledWith('rule-1');
      expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    });

    it('should disable rule in json format', async () => {
      mockClient.disableRule.mockResolvedValue({ ...sampleRule, enabled: false });

      await ruleDisableCommand('rule-1', { ...defaultOptions, format: 'json' }, defaultConfig);

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'rule',
        data: expect.objectContaining({
          action: 'disabled'
        })
      });
    });
  });

  describe('ruleDeleteCommand', () => {
    it('should delete rule and show success message', async () => {
      mockClient.deleteRule.mockResolvedValue(undefined);

      await ruleDeleteCommand('rule-1', defaultOptions, defaultConfig);

      expect(mockClient.deleteRule).toHaveBeenCalledWith('rule-1');
      expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('deleted'));
    });

    it('should delete rule in json format', async () => {
      mockClient.deleteRule.mockResolvedValue(undefined);

      await ruleDeleteCommand('rule-1', { ...defaultOptions, format: 'json' }, defaultConfig);

      expect(mockPrintData).toHaveBeenCalledWith({
        type: 'message',
        data: expect.objectContaining({
          action: 'deleted',
          ruleId: 'rule-1'
        })
      });
    });
  });

  describe('server URL resolution', () => {
    it('should use URL from options when provided', async () => {
      mockClient.getRules.mockResolvedValue([]);

      await ruleListCommand({ ...defaultOptions, url: 'http://override:9000' }, defaultConfig);

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://override:9000'
      });
    });

    it('should fall back to config URL when option not provided', async () => {
      mockClient.getRules.mockResolvedValue([]);

      await ruleListCommand(defaultOptions, {
        ...defaultConfig,
        server: { url: 'http://from-config:8080' }
      });

      expect(serverClient.createServerClient).toHaveBeenCalledWith({
        baseUrl: 'http://from-config:8080'
      });
    });
  });
});
