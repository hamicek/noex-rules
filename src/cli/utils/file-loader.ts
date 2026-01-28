/**
 * Utility pro načítání a parsování souborů.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { FileNotFoundError, ValidationError } from './errors.js';

/** Výsledek načtení JSON souboru */
export interface LoadResult<T = unknown> {
  data: T;
  path: string;
}

/**
 * Načte a parsuje JSON soubor.
 * @param filePath - Cesta k souboru (relativní nebo absolutní)
 * @returns Parsovaná data a absolutní cesta
 * @throws FileNotFoundError pokud soubor neexistuje
 * @throws ValidationError pokud soubor není validní JSON
 */
export function loadJsonFile<T = unknown>(filePath: string): LoadResult<T> {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new FileNotFoundError(filePath);
  }

  const content = readFileSync(absolutePath, 'utf-8');

  try {
    const data = JSON.parse(content) as T;
    return { data, path: absolutePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Invalid JSON in file: ${message}`);
  }
}

/** Options pro zápis JSON souboru */
export interface WriteJsonOptions {
  /** Hezký formát s odsazením (výchozí: false) */
  pretty?: boolean;
  /** Počet mezer pro odsazení (výchozí: 2) */
  indent?: number;
  /** Vytvořit nadřazené adresáře pokud neexistují (výchozí: true) */
  createDirs?: boolean;
}

/**
 * Zapíše data do JSON souboru.
 * @param filePath - Cesta k souboru (relativní nebo absolutní)
 * @param data - Data k zápisu
 * @param options - Volby zápisu
 * @returns Absolutní cesta k zapsanému souboru
 */
export function writeJsonFile(filePath: string, data: unknown, options: WriteJsonOptions = {}): string {
  const absolutePath = resolve(filePath);
  const { pretty = false, indent = 2, createDirs = true } = options;

  if (createDirs) {
    const dir = dirname(absolutePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const content = pretty ? JSON.stringify(data, null, indent) : JSON.stringify(data);

  writeFileSync(absolutePath, content + '\n', 'utf-8');

  return absolutePath;
}

/**
 * Zkontroluje, zda soubor existuje.
 */
export function fileExists(filePath: string): boolean {
  return existsSync(resolve(filePath));
}

/**
 * Serializuje data do JSON stringu.
 * @param data - Data k serializaci
 * @param pretty - Hezký formát
 * @returns JSON string
 */
export function toJson(data: unknown, pretty = false): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}
