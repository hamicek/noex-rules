import { describe, it, expect, vi } from 'vitest';

/**
 * Tests that audit subcommands are properly registered in the CLI
 * with correct names, descriptions, and options.
 *
 * Command handler logic (auditListCommand, auditSearchCommand, auditExportCommand)
 * is covered by audit.test.ts (32 tests).
 */

// Mock process.exit to prevent test runner from exiting
vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

vi.mock('../../../../src/cli/commands/audit.js', () => ({
  auditListCommand: vi.fn().mockResolvedValue(undefined),
  auditSearchCommand: vi.fn().mockResolvedValue(undefined),
  auditExportCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/cli/commands/validate.js', () => ({
  validateCommand: vi.fn(),
}));
vi.mock('../../../../src/cli/commands/import.js', () => ({
  importCommand: vi.fn(),
}));
vi.mock('../../../../src/cli/commands/export.js', () => ({
  exportCommand: vi.fn(),
}));
vi.mock('../../../../src/cli/commands/test.js', () => ({
  testCommand: vi.fn(),
}));
vi.mock('../../../../src/cli/commands/stats.js', () => ({
  statsCommand: vi.fn(),
}));
vi.mock('../../../../src/cli/commands/server.js', () => ({
  serverStartCommand: vi.fn(),
  serverStatusCommand: vi.fn(),
}));
vi.mock('../../../../src/cli/commands/rule.js', () => ({
  ruleListCommand: vi.fn(),
  ruleGetCommand: vi.fn(),
  ruleEnableCommand: vi.fn(),
  ruleDisableCommand: vi.fn(),
  ruleDeleteCommand: vi.fn(),
}));
vi.mock('../../../../src/cli/commands/init.js', () => ({
  initCommand: vi.fn(),
}));

vi.mock('../../../../src/cli/utils/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    server: { url: 'http://localhost:3000' },
    storage: { adapter: 'memory' },
    output: { format: 'pretty', colors: true },
  }),
}));

vi.mock('../../../../src/cli/utils/output.js', () => ({
  setOutputOptions: vi.fn(),
  printError: vi.fn(),
  print: vi.fn(),
  printData: vi.fn(),
  colorize: vi.fn((s: string) => s),
  warning: vi.fn((s: string) => s),
  success: vi.fn((s: string) => s),
}));

import { run, cli } from '../../../../src/cli/cli.js';

interface CacCommand {
  name: string;
  rawName: string;
  description: string;
  options: Array<{ rawName: string; description: string }>;
  commandAction?: (...args: unknown[]) => void;
}

function findCommand(name: string): CacCommand | undefined {
  return (cli.commands as CacCommand[]).find(cmd => cmd.name === name);
}

function getOptionNames(cmd: CacCommand): string[] {
  return cmd.options.map(opt => opt.rawName);
}

describe('Audit CLI registration', () => {
  // Register all commands once — CAC is a singleton and this is safe
  // because run() is idempotent for command registration assertions.
  run(['node', 'noex-rules', '--help']);

  describe('audit list', () => {
    it('should be registered with correct name and description', () => {
      const cmd = findCommand('audit list');
      expect(cmd).toBeDefined();
      expect(cmd!.description).toBe('List audit log entries');
    });

    it('should have --url option', () => {
      const opts = getOptionNames(findCommand('audit list')!);
      expect(opts.some(n => n.includes('--url'))).toBe(true);
    });

    it('should have filter options: --category, --type, --rule-id, --from, --to, --limit', () => {
      const opts = getOptionNames(findCommand('audit list')!);
      expect(opts.some(n => n.includes('--category'))).toBe(true);
      expect(opts.some(n => n.includes('--type'))).toBe(true);
      expect(opts.some(n => n.includes('--rule-id'))).toBe(true);
      expect(opts.some(n => n.includes('--from'))).toBe(true);
      expect(opts.some(n => n.includes('--to'))).toBe(true);
      expect(opts.some(n => n.includes('--limit'))).toBe(true);
    });

    it('should have an action handler', () => {
      const cmd = findCommand('audit list');
      expect(cmd!.commandAction).toBeTypeOf('function');
    });
  });

  describe('audit search', () => {
    it('should be registered with <query> argument', () => {
      const cmd = findCommand('audit search');
      expect(cmd).toBeDefined();
      expect(cmd!.rawName).toContain('<query>');
      expect(cmd!.description).toBe('Search audit log entries');
    });

    it('should have --url option', () => {
      const opts = getOptionNames(findCommand('audit search')!);
      expect(opts.some(n => n.includes('--url'))).toBe(true);
    });

    it('should have filter options: --category, --type, --rule-id, --from, --to, --limit', () => {
      const opts = getOptionNames(findCommand('audit search')!);
      expect(opts.some(n => n.includes('--category'))).toBe(true);
      expect(opts.some(n => n.includes('--type'))).toBe(true);
      expect(opts.some(n => n.includes('--rule-id'))).toBe(true);
      expect(opts.some(n => n.includes('--from'))).toBe(true);
      expect(opts.some(n => n.includes('--to'))).toBe(true);
      expect(opts.some(n => n.includes('--limit'))).toBe(true);
    });

    it('should have an action handler', () => {
      const cmd = findCommand('audit search');
      expect(cmd!.commandAction).toBeTypeOf('function');
    });
  });

  describe('audit export', () => {
    it('should be registered with correct name and description', () => {
      const cmd = findCommand('audit export');
      expect(cmd).toBeDefined();
      expect(cmd!.description).toBe('Export audit log entries');
    });

    it('should have --url option', () => {
      const opts = getOptionNames(findCommand('audit export')!);
      expect(opts.some(n => n.includes('--url'))).toBe(true);
    });

    it('should have --output and --export-format options', () => {
      const opts = getOptionNames(findCommand('audit export')!);
      expect(opts.some(n => n.includes('--output'))).toBe(true);
      expect(opts.some(n => n.includes('--export-format'))).toBe(true);
    });

    it('should have filter options: --category, --type, --rule-id, --from, --to', () => {
      const opts = getOptionNames(findCommand('audit export')!);
      expect(opts.some(n => n.includes('--category'))).toBe(true);
      expect(opts.some(n => n.includes('--type'))).toBe(true);
      expect(opts.some(n => n.includes('--rule-id'))).toBe(true);
      expect(opts.some(n => n.includes('--from'))).toBe(true);
      expect(opts.some(n => n.includes('--to'))).toBe(true);
    });

    it('should have an action handler', () => {
      const cmd = findCommand('audit export');
      expect(cmd!.commandAction).toBeTypeOf('function');
    });
  });
});
