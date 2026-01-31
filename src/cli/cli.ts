/**
 * Hlavní CLI setup pomocí CAC.
 */

import { cac } from 'cac';
import { version } from './version.js';
import type { GlobalOptions, OutputFormat } from './types.js';
import { loadConfig } from './utils/config.js';
import { setOutputOptions, printError } from './utils/output.js';
import { getExitCode, formatError } from './utils/errors.js';
import { validateCommand, type ValidateOptions } from './commands/validate.js';
import { importCommand, type ImportCommandOptions } from './commands/import.js';
import { exportCommand, type ExportCommandOptions } from './commands/export.js';
import { testCommand, type TestCommandOptions } from './commands/test.js';
import { statsCommand, type StatsCommandOptions } from './commands/stats.js';
import {
  serverStartCommand,
  serverStatusCommand,
  type ServerStartOptions,
  type ServerStatusOptions
} from './commands/server.js';
import {
  ruleListCommand,
  ruleGetCommand,
  ruleEnableCommand,
  ruleDisableCommand,
  ruleDeleteCommand,
  type RuleCommandOptions
} from './commands/rule.js';
import { initCommand, type InitCommandOptions } from './commands/init.js';
import {
  auditListCommand,
  auditSearchCommand,
  auditExportCommand,
  type AuditListOptions,
  type AuditSearchOptions,
  type AuditExportOptions
} from './commands/audit.js';

/** CLI instance */
const cli = cac('noex-rules');

/**
 * Promise z běžící async akce.
 * CAC neawaituje async action handlery — musíme to udělat sami.
 */
let _actionPromise: Promise<void> | undefined;

/** Obalí async action handler tak, aby se jeho Promise dala awaitovat v run(). */
function tracked<T extends unknown[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => void {
  return (...args: T) => {
    _actionPromise = fn(...args);
  };
}

/** Zpracuje globální options */
function processGlobalOptions(options: Record<string, unknown>): GlobalOptions {
  const configPath = options['config'] as string | undefined;
  const config = loadConfig(configPath);

  const format = (options['format'] as OutputFormat | undefined) ?? config.output.format;
  const quiet = (options['quiet'] as boolean | undefined) ?? false;
  const noColor = (options['noColor'] as boolean | undefined) ?? !config.output.colors;

  setOutputOptions({ format, quiet, noColor });

  return {
    format,
    quiet,
    noColor,
    config: configPath
  };
}

/** Registruje globální options */
function registerGlobalOptions(): void {
  cli
    .option('-f, --format <format>', 'Output format: json, table, pretty', {
      default: undefined
    })
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('--no-color', 'Disable colored output')
    .option('-c, --config <path>', 'Path to config file');
}

/** Registruje příkaz version */
function registerVersionCommand(): void {
  cli.command('version', 'Show version information').action(() => {
    console.log(`noex-rules v${version}`);
  });
}

/** Registruje příkaz validate */
function registerValidateCommand(): void {
  cli
    .command('validate <file>', 'Validate rules file')
    .option('-s, --strict', 'Enable strict validation mode')
    .action(tracked(async (file: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const validateOptions: ValidateOptions = {
        ...globalOptions,
        strict: (options['strict'] as boolean | undefined) ?? false
      };
      try {
        await validateCommand(file, validateOptions);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/** Registruje příkaz import */
function registerImportCommand(): void {
  cli
    .command('import <file>', 'Import rules from file')
    .option('-d, --dry-run', 'Show what would be imported without making changes')
    .option('-m, --merge', 'Merge with existing rules instead of replacing')
    .option('--no-validate', 'Skip validation')
    .option('-s, --strict', 'Strict validation mode')
    .action(tracked(async (file: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const importOptions: ImportCommandOptions = {
        ...globalOptions,
        dryRun: (options['dryRun'] as boolean | undefined) ?? false,
        merge: (options['merge'] as boolean | undefined) ?? false,
        validate: (options['validate'] as boolean | undefined) ?? true,
        strict: (options['strict'] as boolean | undefined) ?? false
      };
      try {
        await importCommand(file, importOptions);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/** Registruje příkaz export */
function registerExportCommand(): void {
  cli
    .command('export [output]', 'Export rules to file')
    .option('-p, --pretty', 'Pretty print JSON output')
    .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
    .option('-e, --enabled', 'Export only enabled rules')
    .action(tracked(async (output: string | undefined, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const tags = options['tags'] as string | undefined;
      const enabled = options['enabled'] as boolean | undefined;
      const exportOptions: ExportCommandOptions = {
        ...globalOptions,
        pretty: (options['pretty'] as boolean | undefined) ?? false,
        ...(tags !== undefined && { tags }),
        ...(enabled !== undefined && { enabled })
      };
      try {
        await exportCommand(output, exportOptions);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/** Registruje příkaz test */
function registerTestCommand(): void {
  cli
    .command('test <file>', 'Test rules with scenarios')
    .option('-d, --dry-run', 'Run tests without side effects', { default: true })
    .option('-v, --verbose', 'Show detailed test output')
    .option('-r, --rules <path>', 'Path to rules file')
    .option('-t, --timeout <ms>', 'Test timeout in milliseconds')
    .action(tracked(async (file: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const testOptions: TestCommandOptions = {
        ...globalOptions,
        dryRun: (options['dryRun'] as boolean | undefined) ?? true,
        verbose: (options['verbose'] as boolean | undefined) ?? false,
        rules: options['rules'] as string | undefined,
        timeout: options['timeout'] ? Number(options['timeout']) : undefined
      };
      try {
        await testCommand(file, testOptions);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/** Registruje server příkazy */
function registerServerCommands(): void {
  cli
    .command('server start', 'Start the REST API server')
    .option('-p, --port <port>', 'Server port', { default: 7226 })
    .option('-H, --host <host>', 'Server host', { default: '0.0.0.0' })
    .option('--no-swagger', 'Disable Swagger documentation')
    .option('--no-logger', 'Disable request logging')
    .action(tracked(async (options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const serverStartOptions: ServerStartOptions = {
        ...globalOptions,
        port: Number(options['port']) || 7226,
        host: (options['host'] as string) || '0.0.0.0',
        noSwagger: options['swagger'] === false,
        noLogger: options['logger'] === false
      };
      try {
        await serverStartCommand(serverStartOptions);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

  cli
    .command('server status', 'Show server status')
    .option('-u, --url <url>', 'Server URL')
    .action(tracked(async (options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const serverStatusOptions: ServerStatusOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined
      };
      try {
        await serverStatusCommand(serverStatusOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/** Registruje rule příkazy */
function registerRuleCommands(): void {

  cli
    .command('rule list', 'List all rules')
    .option('-u, --url <url>', 'Server URL')
    .action(tracked(async (options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const ruleOptions: RuleCommandOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined
      };
      try {
        await ruleListCommand(ruleOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

  cli
    .command('rule get <id>', 'Get rule details')
    .option('-u, --url <url>', 'Server URL')
    .action(tracked(async (id: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const ruleOptions: RuleCommandOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined
      };
      try {
        await ruleGetCommand(id, ruleOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

  cli
    .command('rule enable <id>', 'Enable a rule')
    .option('-u, --url <url>', 'Server URL')
    .action(tracked(async (id: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const ruleOptions: RuleCommandOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined
      };
      try {
        await ruleEnableCommand(id, ruleOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

  cli
    .command('rule disable <id>', 'Disable a rule')
    .option('-u, --url <url>', 'Server URL')
    .action(tracked(async (id: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const ruleOptions: RuleCommandOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined
      };
      try {
        await ruleDisableCommand(id, ruleOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

  cli
    .command('rule delete <id>', 'Delete a rule')
    .option('-u, --url <url>', 'Server URL')
    .action(tracked(async (id: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const ruleOptions: RuleCommandOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined
      };
      try {
        await ruleDeleteCommand(id, ruleOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

}

/** Registruje stats příkaz */
function registerStatsCommand(): void {
  cli
    .command('stats', 'Show engine statistics')
    .option('-u, --url <url>', 'Server URL')
    .action(tracked(async (options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const statsOptions: StatsCommandOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined
      };
      try {
        await statsCommand(statsOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/** Registruje init příkaz */
function registerInitCommand(): void {
  cli
    .command('init', 'Initialize configuration file')
    .option('--force', 'Overwrite existing configuration file')
    .option('--server-url <url>', 'Server URL')
    .option('--storage-adapter <adapter>', 'Storage adapter (memory, sqlite, file)')
    .option('--storage-path <path>', 'Storage file path')
    .action(tracked(async (options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const initOptions: InitCommandOptions = {
        ...globalOptions,
        force: (options['force'] as boolean | undefined) ?? false,
        serverUrl: options['serverUrl'] as string | undefined,
        storageAdapter: options['storageAdapter'] as 'memory' | 'sqlite' | 'file' | undefined,
        storagePath: options['storagePath'] as string | undefined
      };
      try {
        await initCommand(initOptions);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/** Registruje audit příkazy */
function registerAuditCommands(): void {

  cli
    .command('audit list', 'List audit log entries')
    .option('-u, --url <url>', 'Server URL')
    .option('--category <category>', 'Filter by category')
    .option('--type <type>', 'Filter by event type')
    .option('--rule-id <ruleId>', 'Filter by rule ID')
    .option('--from <from>', 'From timestamp or ISO date')
    .option('--to <to>', 'To timestamp or ISO date')
    .option('-l, --limit <limit>', 'Max entries to return')
    .action(tracked(async (options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const category = options['category'] as string | undefined;
      const type = options['type'] as string | undefined;
      const ruleId = options['ruleId'] as string | undefined;
      const from = options['from'] as string | undefined;
      const to = options['to'] as string | undefined;
      const limit = options['limit'] ? Number(options['limit']) : undefined;
      const auditOptions: AuditListOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined,
        ...(category !== undefined && { category }),
        ...(type !== undefined && { type }),
        ...(ruleId !== undefined && { ruleId }),
        ...(from !== undefined && { from }),
        ...(to !== undefined && { to }),
        ...(limit !== undefined && { limit }),
      };
      try {
        await auditListCommand(auditOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

  cli
    .command('audit search <query>', 'Search audit log entries')
    .option('-u, --url <url>', 'Server URL')
    .option('--category <category>', 'Filter by category')
    .option('--type <type>', 'Filter by event type')
    .option('--rule-id <ruleId>', 'Filter by rule ID')
    .option('--from <from>', 'From timestamp or ISO date')
    .option('--to <to>', 'To timestamp or ISO date')
    .option('-l, --limit <limit>', 'Max entries to search')
    .action(tracked(async (query: string, options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const sCategory = options['category'] as string | undefined;
      const sType = options['type'] as string | undefined;
      const sRuleId = options['ruleId'] as string | undefined;
      const sFrom = options['from'] as string | undefined;
      const sTo = options['to'] as string | undefined;
      const sLimit = options['limit'] ? Number(options['limit']) : undefined;
      const searchOptions: AuditSearchOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined,
        ...(sCategory !== undefined && { category: sCategory }),
        ...(sType !== undefined && { type: sType }),
        ...(sRuleId !== undefined && { ruleId: sRuleId }),
        ...(sFrom !== undefined && { from: sFrom }),
        ...(sTo !== undefined && { to: sTo }),
        ...(sLimit !== undefined && { limit: sLimit }),
      };
      try {
        await auditSearchCommand(query, searchOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));

  cli
    .command('audit export', 'Export audit log entries')
    .option('-u, --url <url>', 'Server URL')
    .option('-o, --output <file>', 'Output file path (stdout if omitted)')
    .option('--export-format <format>', 'Export format: json or csv', { default: 'json' })
    .option('--category <category>', 'Filter by category')
    .option('--type <type>', 'Filter by event type')
    .option('--rule-id <ruleId>', 'Filter by rule ID')
    .option('--from <from>', 'From timestamp or ISO date')
    .option('--to <to>', 'To timestamp or ISO date')
    .action(tracked(async (options: Record<string, unknown>) => {
      const globalOptions = processGlobalOptions(options);
      const config = loadConfig(options['config'] as string | undefined);
      const eOutput = options['output'] as string | undefined;
      const eFormat = options['exportFormat'] as 'json' | 'csv' | undefined;
      const eCategory = options['category'] as string | undefined;
      const eType = options['type'] as string | undefined;
      const eRuleId = options['ruleId'] as string | undefined;
      const eFrom = options['from'] as string | undefined;
      const eTo = options['to'] as string | undefined;
      const exportOptions: AuditExportOptions = {
        ...globalOptions,
        url: options['url'] as string | undefined,
        ...(eOutput !== undefined && { output: eOutput }),
        ...(eFormat !== undefined && { exportFormat: eFormat }),
        ...(eCategory !== undefined && { category: eCategory }),
        ...(eType !== undefined && { type: eType }),
        ...(eRuleId !== undefined && { ruleId: eRuleId }),
        ...(eFrom !== undefined && { from: eFrom }),
        ...(eTo !== undefined && { to: eTo }),
      };
      try {
        await auditExportCommand(exportOptions, config);
      } catch (err) {
        printError(formatError(err));
        process.exit(getExitCode(err));
      }
    }));
}

/**
 * CAC rozpoznává multi-word příkazy (např. "server start") jen pokud
 * je celý název v jednom argv elementu. V process.argv jsou ale vždy
 * jako oddělené položky. Tato funkce je sloučí zpět.
 */
const SUB_COMMAND_PREFIXES = ['server', 'rule', 'audit'] as const;

function mergeSubcommandArgs(args: string[]): string[] {
  // args[0] = node, args[1] = script, args[2..] = user args
  if (args.length < 4) return args;
  const first = args[2]!;
  const second = args[3]!;
  if (
    SUB_COMMAND_PREFIXES.includes(first as typeof SUB_COMMAND_PREFIXES[number]) &&
    !second.startsWith('-')
  ) {
    return [...args.slice(0, 2), `${first} ${second}`, ...args.slice(4)];
  }
  return args;
}

/** Inicializuje a spustí CLI */
export async function run(args: string[] = process.argv): Promise<void> {
  registerGlobalOptions();
  registerVersionCommand();
  registerValidateCommand();
  registerImportCommand();
  registerExportCommand();
  registerTestCommand();
  registerServerCommands();
  registerRuleCommands();
  registerStatsCommand();
  registerInitCommand();
  registerAuditCommands();

  cli.help();
  cli.version(version);

  try {
    cli.parse(mergeSubcommandArgs(args));
    if (_actionPromise) {
      await _actionPromise;
    }
  } catch (err) {
    printError(formatError(err));
    process.exit(getExitCode(err));
  }
}

export { cli };
