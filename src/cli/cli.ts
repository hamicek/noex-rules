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

/** Registruje placeholder příkazy (budou implementovány v dalších fázích) */
function registerPlaceholderCommands(): void {
  cli
    .command('validate <file>', 'Validate rules file')
    .option('-s, --strict', 'Enable strict validation mode')
    .action(async (file: string, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'validate' not yet implemented. File: ${file}`));
      process.exit(ExitCode.GeneralError);
    });

  cli
    .command('import <file>', 'Import rules from file')
    .option('-d, --dry-run', 'Show what would be imported without making changes')
    .option('-m, --merge', 'Merge with existing rules instead of replacing')
    .action(async (file: string, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'import' not yet implemented. File: ${file}`));
      process.exit(ExitCode.GeneralError);
    });

  cli
    .command('export [output]', 'Export rules to file')
    .option('-p, --pretty', 'Pretty print JSON output')
    .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
    .action(async (output: string | undefined, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'export' not yet implemented. Output: ${output ?? 'stdout'}`));
      process.exit(ExitCode.GeneralError);
    });

  cli
    .command('test <file>', 'Test rules with scenarios')
    .option('-d, --dry-run', 'Run tests without side effects')
    .option('-v, --verbose', 'Show detailed test output')
    .option('-r, --rules <path>', 'Path to rules file')
    .action(async (file: string, options: Record<string, unknown>) => {
      processGlobalOptions(options);
      printError(error(`Command 'test' not yet implemented. File: ${file}`));
      process.exit(ExitCode.GeneralError);
    });

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

  cli.command('stats', 'Show engine statistics').action(async (options: Record<string, unknown>) => {
    processGlobalOptions(options);
    printError(error(`Command 'stats' not yet implemented.`));
    process.exit(ExitCode.GeneralError);
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
