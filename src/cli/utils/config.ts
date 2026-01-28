/**
 * CLI konfigurace - načítání a správa konfiguračního souboru.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import type { CliConfig } from '../types.js';
import { DEFAULT_CLI_CONFIG } from '../types.js';

const CONFIG_FILENAME = '.noex-rules.json';

/** Hledá konfigurační soubor v hierarchii adresářů */
function findConfigFile(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const configPath = join(currentDir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return configPath;
    }

    const parentDir = resolve(currentDir, '..');
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  // Zkus home adresář
  const homeConfig = join(homedir(), CONFIG_FILENAME);
  if (existsSync(homeConfig)) {
    return homeConfig;
  }

  return null;
}

/** Parsuje JSON konfiguraci s validací */
function parseConfig(content: string, filePath: string): Partial<CliConfig> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Configuration must be an object');
    }
    return parsed as Partial<CliConfig>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid configuration in ${filePath}: ${message}`);
  }
}

/** Merge konfigurace s defaulty */
function mergeConfig(base: CliConfig, override: Partial<CliConfig>): CliConfig {
  return {
    server: {
      ...base.server,
      ...override.server
    },
    storage: {
      ...base.storage,
      ...override.storage
    },
    output: {
      ...base.output,
      ...override.output
    }
  };
}

/** Cache pro načtenou konfiguraci */
let cachedConfig: CliConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Načte CLI konfiguraci.
 *
 * Priorita:
 * 1. Explicitně zadaná cesta
 * 2. Konfigurační soubor v aktuálním adresáři nebo jeho rodičích
 * 3. Konfigurační soubor v home adresáři
 * 4. Výchozí konfigurace
 */
export function loadConfig(explicitPath?: string): CliConfig {
  const pathToLoad = explicitPath ? resolve(explicitPath) : findConfigFile(process.cwd());

  // Vrať cached konfiguraci pokud je stejná cesta
  if (cachedConfig && cachedConfigPath === pathToLoad) {
    return cachedConfig;
  }

  if (!pathToLoad) {
    cachedConfig = { ...DEFAULT_CLI_CONFIG };
    cachedConfigPath = null;
    return cachedConfig;
  }

  if (!existsSync(pathToLoad)) {
    if (explicitPath) {
      throw new Error(`Configuration file not found: ${pathToLoad}`);
    }
    cachedConfig = { ...DEFAULT_CLI_CONFIG };
    cachedConfigPath = null;
    return cachedConfig;
  }

  const content = readFileSync(pathToLoad, 'utf-8');
  const parsed = parseConfig(content, pathToLoad);
  cachedConfig = mergeConfig(DEFAULT_CLI_CONFIG, parsed);
  cachedConfigPath = pathToLoad;

  return cachedConfig;
}

/** Resetuje cache konfigurace (pro testování) */
export function resetConfigCache(): void {
  cachedConfig = null;
  cachedConfigPath = null;
}

/** Vrátí cestu k načtené konfiguraci */
export function getConfigPath(): string | null {
  return cachedConfigPath;
}
