/**
 * CLI verze - načtená z package.json.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // V dist adresáři je potřeba jít o 2 úrovně nahoru
    const packagePath = resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const version = loadVersion();
