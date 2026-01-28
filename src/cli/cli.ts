/**
 * Hlavní CLI setup pomocí CAC.
 */

import { cac } from 'cac';
import { version } from './version.js';
import type { GlobalOptions, OutputFormat } from './types.js';
import { ExitCode } from './types.js';
import { loadConfig } from './utils/config.js';
import { setOutputOptions, printError, error } from './utils/output.js';
import { getExitCode, formatError } from './utils/errors.js';
import { validateCommand, type ValidateOptions } from './commands/validate.js';
import { importCommand, type ImportCommandOptions } from './commands/import.js';
import { exportCommand, type ExportCommandOptions } from './commands/export.js';
import { testCommand, type TestCommandOptions } from './commands/test.js';
import { statsCommand, type StatsCommandOptions } from './commands/stats.js';

/** CLI instance */
const cli = cac('noex-rules');

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
    .action(async (file: string, options: Record<string, unknown>) => {
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
    });
}

/** Registruje příkaz import */
function registerImportCommand(): void {
  cli
    .command('import <file>', 'Import rules from file')
    .option('-d, --dry-run', 'Show what would be imported without making changes')
    .option('-m, --merge', 'Merge with existing rules instead of replacing')
    .option('--no-validate', 'Skip validation')
    .option('-s, --strict', 'Strict validation mode')
    .action(async (file: string, options: Record<string, unknown>) => {
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
    });
}

/** Registruje příkaz export */
function registerExportCommand(): void {
  cli
    .command('export [output]', 'Export rules to file')
    .option('-p, --pretty', 'Pretty print JSON output')
    .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
    .option('-e, --enabled', 'Export only enabled rules')
    .action(async (output: string | undefined, options: Record<string, unknown>) => {
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
    });
}

/** Registruje příkaz test */
function registerTestCommand(): void {
  cli
    .command('test <file>', 'Test rules with scenarios')
    .option('-d, --dry-run', 'Run tests without side effects', { default: true })
    .option('-v, --verbose', 'Show detailed test output')
    .option('-r, --rules <path>', 'Path to rules file')
    .option('-t, --timeout <ms>', 'Test timeout in milliseconds')
    .action(async (file: string, options: Record<string, unknown>) => {
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
    });
}

/** Registruje placeholder příkazy (budou implementovány v dalších fázích) */
function registerPlaceholderCommands(): void {
  cli
    .command('server start', 'Start the REST API server')
    .option('-p, --port <port>', 'Server port', { default: 3000 })
    .option('-h, --host <host>', 'Server host', { default: '0.0.0.0' })
    .action(async (options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'server start' not yet implemented.`));
      process.exit(ExitCode.GeneralError);
    });

  cli.command('server status', 'Show server status').action(async (options: Record<string, unknown>) => {
    processGlobalOptions(options);
    printError(error(`Command 'server status' not yet implemented.`));
    process.exit(ExitCode.GeneralError);
  });

  cli.command('rule list', 'List all rules').action(async (options: Record<string, unknown>) => {
    processGlobalOptions(options);
    printError(error(`Command 'rule list' not yet implemented.`));
    process.exit(ExitCode.GeneralError);
  });

  cli
    .command('rule get <id>', 'Get rule details')
    .action(async (id: string, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'rule get' not yet implemented. ID: ${id}`));
      process.exit(ExitCode.GeneralError);
    });

  cli
    .command('rule enable <id>', 'Enable a rule')
    .action(async (id: string, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'rule enable' not yet implemented. ID: ${id}`));
      process.exit(ExitCode.GeneralError);
    });

  cli
    .command('rule disable <id>', 'Disable a rule')
    .action(async (id: string, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'rule disable' not yet implemented. ID: ${id}`));
      process.exit(ExitCode.GeneralError);
    });

  cli
    .command('rule delete <id>', 'Delete a rule')
    .action(async (id: string, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'rule delete' not yet implemented. ID: ${id}`));
      process.exit(ExitCode.GeneralError);
    });

  cli
    .command('stats', 'Show engine statistics')
    .option('-u, --url <url>', 'Server URL')
    .action(async (options: Record<string, unknown>) => {
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
    });

  cli.command('init', 'Initialize configuration file').action(async (options: Record<string, unknown>) => {
    processGlobalOptions(options);
    printError(error(`Command 'init' not yet implemented.`));
    process.exit(ExitCode.GeneralError);
  });
}

/** Inicializuje a spustí CLI */
export async function run(args: string[] = process.argv): Promise<void> {
  registerGlobalOptions();
  registerVersionCommand();
  registerValidateCommand();
  registerImportCommand();
  registerExportCommand();
  registerTestCommand();
  registerPlaceholderCommands();

  cli.help();
  cli.version(version);

  try {
    cli.parse(args);
  } catch (err) {
    printError(formatError(err));
    process.exit(getExitCode(err));
  }
}

export { cli };
