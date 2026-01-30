import { describe, it, expect } from 'vitest';
import * as versioningExports from '../../../src/versioning/index.js';

describe('Versioning barrel exports (src/versioning/index.ts)', () => {
  it('exports RuleVersionStore class', () => {
    expect(versioningExports.RuleVersionStore).toBeDefined();
    expect(typeof versioningExports.RuleVersionStore.start).toBe('function');
  });

  it('RuleVersionStore is constructable via start()', async () => {
    const store = await versioningExports.RuleVersionStore.start({
      adapter: { save: async () => {}, load: async () => null, delete: async () => {}, listKeys: async () => [] },
    });
    expect(store).toBeInstanceOf(versioningExports.RuleVersionStore);
    await store.stop();
  });

  it('re-exports all type definitions from types.ts', () => {
    // Verify runtime-accessible exports exist on the module.
    // Type-only exports (interfaces) are not available at runtime,
    // but the module should at least contain the RuleVersionStore class.
    const keys = Object.keys(versioningExports);
    expect(keys).toContain('RuleVersionStore');
  });

  it('does not export internal implementation details', () => {
    const keys = Object.keys(versioningExports);
    // Private helpers like deepEqual and diffSnapshots should not be exported
    expect(keys).not.toContain('deepEqual');
    expect(keys).not.toContain('diffSnapshots');
    expect(keys).not.toContain('DIFF_FIELDS');
  });
});
