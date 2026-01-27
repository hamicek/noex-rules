import { describe, it, expect } from 'vitest';
import { MemoryAdapter, SQLiteAdapter } from '@hamicek/noex';
import type { PersistenceConfig } from '../../../src/types/index.js';

describe('PersistenceConfig', () => {
  describe('type compatibility', () => {
    it('should accept MemoryAdapter', () => {
      const config: PersistenceConfig = {
        adapter: new MemoryAdapter(),
      };

      expect(config.adapter).toBeDefined();
      expect(config.key).toBeUndefined();
      expect(config.schemaVersion).toBeUndefined();
    });

    it('should accept SQLiteAdapter', () => {
      const config: PersistenceConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
      };

      expect(config.adapter).toBeDefined();
    });

    it('should accept optional key parameter', () => {
      const config: PersistenceConfig = {
        adapter: new MemoryAdapter(),
        key: 'custom-rules-key',
      };

      expect(config.key).toBe('custom-rules-key');
    });

    it('should accept optional schemaVersion parameter', () => {
      const config: PersistenceConfig = {
        adapter: new MemoryAdapter(),
        schemaVersion: 2,
      };

      expect(config.schemaVersion).toBe(2);
    });

    it('should accept full configuration', () => {
      const config: PersistenceConfig = {
        adapter: new SQLiteAdapter({ filename: ':memory:' }),
        key: 'my-rules',
        schemaVersion: 3,
      };

      expect(config.adapter).toBeDefined();
      expect(config.key).toBe('my-rules');
      expect(config.schemaVersion).toBe(3);
    });
  });

  describe('type constraints', () => {
    it('should require adapter property', () => {
      // @ts-expect-error - adapter is required
      const _invalidConfig: PersistenceConfig = {};
      expect(true).toBe(true);
    });

    it('should not accept invalid adapter type', () => {
      // @ts-expect-error - adapter must be StorageAdapter
      const _invalidConfig: PersistenceConfig = {
        adapter: { notAStorageAdapter: true },
      };
      expect(true).toBe(true);
    });
  });
});
