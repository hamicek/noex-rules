import { describe, it, expect } from 'vitest';
import { loadGroupsFromYAML } from '../../src/dsl/yaml/group-loader.js';
import { YamlLoadError } from '../../src/dsl/yaml/loader.js';

describe('loadGroupsFromYAML', () => {
  // ---------------------------------------------------------------------------
  // Single group object
  // ---------------------------------------------------------------------------

  describe('single group object', () => {
    it('parses a minimal group', () => {
      const groups = loadGroupsFromYAML(`
id: billing
name: Billing Rules
`);

      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('billing');
      expect(groups[0].name).toBe('Billing Rules');
      expect(groups[0]).not.toHaveProperty('enabled');
      expect(groups[0]).not.toHaveProperty('description');
    });

    it('parses a full group', () => {
      const groups = loadGroupsFromYAML(`
id: billing
name: Billing Rules
description: All billing-related rules
enabled: false
`);

      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('billing');
      expect(groups[0].name).toBe('Billing Rules');
      expect(groups[0].description).toBe('All billing-related rules');
      expect(groups[0].enabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Array format
  // ---------------------------------------------------------------------------

  describe('array format', () => {
    it('parses an array of groups', () => {
      const groups = loadGroupsFromYAML(`
- id: billing
  name: Billing Rules
- id: shipping
  name: Shipping Rules
`);

      expect(groups).toHaveLength(2);
      expect(groups[0].id).toBe('billing');
      expect(groups[1].id).toBe('shipping');
    });

    it('throws for empty array', () => {
      expect(() => loadGroupsFromYAML('[]')).toThrow(YamlLoadError);
    });
  });

  // ---------------------------------------------------------------------------
  // Object with groups key
  // ---------------------------------------------------------------------------

  describe('object with groups key', () => {
    it('parses groups from object format', () => {
      const groups = loadGroupsFromYAML(`
groups:
  - id: billing
    name: Billing Rules
  - id: shipping
    name: Shipping Rules
`);

      expect(groups).toHaveLength(2);
      expect(groups[0].id).toBe('billing');
      expect(groups[1].id).toBe('shipping');
    });

    it('throws for empty groups array', () => {
      expect(() => loadGroupsFromYAML('groups: []')).toThrow(YamlLoadError);
    });

    it('throws when groups is not an array', () => {
      expect(() => loadGroupsFromYAML('groups: not-array')).toThrow(YamlLoadError);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation errors
  // ---------------------------------------------------------------------------

  describe('validation errors', () => {
    it('throws for missing id', () => {
      expect(() => loadGroupsFromYAML(`
name: No ID Group
`)).toThrow();
    });

    it('throws for missing name', () => {
      expect(() => loadGroupsFromYAML(`
id: no-name
`)).toThrow();
    });

    it('throws for non-string description', () => {
      expect(() => loadGroupsFromYAML(`
id: g
name: G
description: 123
`)).toThrow();
    });

    it('throws for non-boolean enabled', () => {
      expect(() => loadGroupsFromYAML(`
id: g
name: G
enabled: yes-please
`)).toThrow();
    });

    it('throws for empty YAML content', () => {
      expect(() => loadGroupsFromYAML('')).toThrow(YamlLoadError);
    });

    it('throws for non-object/array top-level', () => {
      expect(() => loadGroupsFromYAML('just a string')).toThrow(YamlLoadError);
    });

    it('throws for YAML syntax error', () => {
      expect(() => loadGroupsFromYAML(':\n  -:\n  invalid: [[')).toThrow(YamlLoadError);
    });
  });
});
