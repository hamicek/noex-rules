import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadRulesFromFile } from '../../dsl/yaml/loader.js';
import type { FileSourceConfig, StorageSourceConfig, RuleSource } from './types.js';
import type { RuleInput } from '../../types/rule.js';

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PATTERNS = ['*.yaml', '*.yml'];
const DEFAULT_STORAGE_KEY = 'hot-reload:rules';

// ── FileRuleSource ──────────────────────────────────────────────────────────

/**
 * Načítá pravidla z YAML souborů a adresářů.
 *
 * Každá cesta v konfiguraci může být buď soubor (načte se přímo),
 * nebo adresář (prohledá se podle vzorů, volitelně rekurzivně).
 */
export class FileRuleSource implements RuleSource {
  readonly name = 'file';

  private readonly paths: string[];
  private readonly patterns: string[];
  private readonly recursive: boolean;

  constructor(config: FileSourceConfig) {
    this.paths = config.paths;
    this.patterns = config.patterns ?? DEFAULT_PATTERNS;
    this.recursive = config.recursive ?? false;
  }

  async loadRules(): Promise<RuleInput[]> {
    const rules: RuleInput[] = [];

    for (const p of this.paths) {
      const absolutePath = resolve(p);
      const info = await stat(absolutePath);

      if (info.isFile()) {
        const loaded = await loadRulesFromFile(absolutePath);
        rules.push(...loaded);
      } else if (info.isDirectory()) {
        const files = await this.scanDirectory(absolutePath);
        for (const file of files) {
          const loaded = await loadRulesFromFile(file);
          rules.push(...loaded);
        }
      }
    }

    return rules;
  }

  /** Rekurzivně prohledá adresář a vrátí seřazené cesty k souborům odpovídajícím vzorům. */
  private async scanDirectory(dirPath: string): Promise<string[]> {
    const matched: string[] = [];
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isFile() && this.matchesPattern(entry.name)) {
        matched.push(fullPath);
      } else if (entry.isDirectory() && this.recursive) {
        const nested = await this.scanDirectory(fullPath);
        matched.push(...nested);
      }
    }

    return matched.sort();
  }

  /** Ověří, zda název souboru odpovídá některému z nakonfigurovaných vzorů. */
  private matchesPattern(filename: string): boolean {
    return this.patterns.some((pattern) => {
      if (pattern.startsWith('*.')) {
        return filename.endsWith(pattern.slice(1));
      }
      return filename === pattern;
    });
  }
}

// ── StorageRuleSource ───────────────────────────────────────────────────────

/** Formát dat uložených v StorageAdapteru pro hot-reload. */
interface StoredRulesState {
  rules: RuleInput[];
}

/**
 * Načítá pravidla z externího StorageAdapteru.
 *
 * Očekává, že pod nakonfigurovaným klíčem je uložen objekt
 * `{ rules: RuleInput[] }` zabalený v `PersistedState`.
 */
export class StorageRuleSource implements RuleSource {
  readonly name = 'storage';

  private readonly adapter: StorageSourceConfig['adapter'];
  private readonly key: string;

  constructor(config: StorageSourceConfig) {
    this.adapter = config.adapter;
    this.key = config.key ?? DEFAULT_STORAGE_KEY;
  }

  async loadRules(): Promise<RuleInput[]> {
    const result = await this.adapter.load<StoredRulesState>(this.key);
    if (!result) {
      return [];
    }

    const { rules } = result.state;
    if (!Array.isArray(rules)) {
      return [];
    }

    return rules;
  }
}
