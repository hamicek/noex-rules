/**
 * Factory pro vytváření storage adapterů podle konfigurace.
 */

import { MemoryAdapter, SQLiteAdapter, type StorageAdapter } from '@hamicek/noex';
import type { CliConfig } from '../types.js';

/**
 * Vytvoří storage adapter podle konfigurace.
 */
export function createStorageAdapter(config: CliConfig['storage']): StorageAdapter {
  switch (config.adapter) {
    case 'memory':
      return new MemoryAdapter();

    case 'sqlite': {
      const filename = config.path ?? './data/rules.db';
      return new SQLiteAdapter({ filename });
    }

    case 'file': {
      // File adapter není v noex, použijeme memory jako fallback
      // V budoucnu může být implementován
      return new MemoryAdapter();
    }

    default: {
      const exhaustiveCheck: never = config.adapter;
      throw new Error(`Unknown storage adapter: ${exhaustiveCheck}`);
    }
  }
}
