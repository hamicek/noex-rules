/**
 * Příkaz init pro CLI.
 * Inicializuje konfigurační soubor .noex-rules.json v aktuálním adresáři.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GlobalOptions, CliConfig } from '../types.js';
import { DEFAULT_CLI_CONFIG, ExitCode } from '../types.js';
import { printData, print, colorize, success } from '../utils/output.js';
import { CliError } from '../utils/errors.js';

const CONFIG_FILENAME = '.noex-rules.json';

/** Options pro příkaz init */
export interface InitCommandOptions extends GlobalOptions {
  /** Přepsat existující konfiguraci */
  force: boolean;
  /** URL serveru */
  serverUrl: string | undefined;
  /** Storage adapter (memory, sqlite, file) */
  storageAdapter: 'memory' | 'sqlite' | 'file' | undefined;
  /** Cesta k storage souboru */
  storagePath: string | undefined;
}

/** Výstup příkazu init */
interface InitOutput {
  path: string;
  created: boolean;
  config: CliConfig;
}

/**
 * Vytvoří konfiguraci na základě options.
 */
function buildConfig(options: InitCommandOptions): CliConfig {
  const config: CliConfig = {
    server: {
      url: options.serverUrl ?? DEFAULT_CLI_CONFIG.server.url
    },
    storage: {
      adapter: options.storageAdapter ?? DEFAULT_CLI_CONFIG.storage.adapter,
      ...(options.storagePath && { path: options.storagePath })
    },
    output: {
      format: DEFAULT_CLI_CONFIG.output.format,
      colors: DEFAULT_CLI_CONFIG.output.colors
    }
  };

  // Automaticky nastav path pro sqlite/file adaptéry pokud nebyl specifikován
  if (config.storage.adapter === 'sqlite' && !config.storage.path) {
    config.storage.path = './data/rules.db';
  } else if (config.storage.adapter === 'file' && !config.storage.path) {
    config.storage.path = './data/rules.json';
  }

  return config;
}

/**
 * Formátuje výstup pro pretty formát.
 */
function formatPrettyOutput(output: InitOutput): string {
  const lines: string[] = [];

  lines.push(success('Configuration file created successfully'));
  lines.push('');
  lines.push(colorize('Path:', 'cyan') + ` ${output.path}`);
  lines.push('');
  lines.push(colorize('Configuration:', 'cyan'));
  lines.push(colorize('  Server:', 'dim'));
  lines.push(`    URL: ${output.config.server.url}`);
  lines.push(colorize('  Storage:', 'dim'));
  lines.push(`    Adapter: ${output.config.storage.adapter}`);
  if (output.config.storage.path) {
    lines.push(`    Path: ${output.config.storage.path}`);
  }
  lines.push(colorize('  Output:', 'dim'));
  lines.push(`    Format: ${output.config.output.format}`);
  lines.push(`    Colors: ${output.config.output.colors}`);

  return lines.join('\n');
}

/**
 * Akce příkazu init.
 */
export async function initCommand(options: InitCommandOptions): Promise<void> {
  const configPath = join(process.cwd(), CONFIG_FILENAME);

  // Kontrola existence souboru
  if (existsSync(configPath) && !options.force) {
    throw new CliError(
      `Configuration file already exists: ${configPath}\nUse --force to overwrite.`,
      ExitCode.GeneralError
    );
  }

  const config = buildConfig(options);
  const configJson = JSON.stringify(config, null, 2);

  writeFileSync(configPath, configJson + '\n', 'utf-8');

  const output: InitOutput = {
    path: configPath,
    created: true,
    config
  };

  if (options.format === 'json') {
    printData({
      type: 'message',
      data: output
    });
  } else {
    print(formatPrettyOutput(output));
  }
}
