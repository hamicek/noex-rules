import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { loadGroupsFromYAML, loadGroupsFromFile } from '../../../../src/dsl/yaml/group-loader';
import { YamlLoadError } from '../../../../src/dsl/yaml/loader';
import { YamlValidationError } from '../../../../src/dsl/yaml/schema';

const FIXTURES = resolve(__dirname, '../../../fixtures/yaml');

// ---------------------------------------------------------------------------
// loadGroupsFromYAML
// ---------------------------------------------------------------------------

describe('loadGroupsFromYAML', () => {
  describe('single group', () => {
    it('loads a single group object', () => {
      const groups = loadGroupsFromYAML(`
        id: billing
        name: Billing Rules
      `);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toEqual({ id: 'billing', name: 'Billing Rules' });
    });

    it('loads group with all optional fields', () => {
      const groups = loadGroupsFromYAML(`
        id: security
        name: Security Rules
        description: All security-related rules
        enabled: false
      `);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toEqual({
        id: 'security',
        name: 'Security Rules',
        description: 'All security-related rules',
        enabled: false,
      });
    });

    it('does not include enabled when not specified', () => {
      const groups = loadGroupsFromYAML(`
        id: billing
        name: Billing Rules
      `);

      expect(groups[0]).not.toHaveProperty('enabled');
    });

    it('does not include description when not specified', () => {
      const groups = loadGroupsFromYAML(`
        id: billing
        name: Billing Rules
      `);

      expect(groups[0]).not.toHaveProperty('description');
    });
  });

  describe('multiple groups', () => {
    it('loads groups from top-level array', () => {
      const groups = loadGroupsFromYAML(`
        - id: billing
          name: Billing Rules
        - id: security
          name: Security Rules
      `);

      expect(groups).toHaveLength(2);
      expect(groups[0]!.id).toBe('billing');
      expect(groups[1]!.id).toBe('security');
    });

    it('loads groups from "groups" wrapper', () => {
      const groups = loadGroupsFromYAML(`
        groups:
          - id: billing
            name: Billing Rules
            description: Billing group
          - id: notifications
            name: Notification Rules
            enabled: true
      `);

      expect(groups).toHaveLength(2);
      expect(groups[0]!.id).toBe('billing');
      expect(groups[0]!.description).toBe('Billing group');
      expect(groups[1]!.id).toBe('notifications');
      expect(groups[1]!.enabled).toBe(true);
    });
  });

  describe('validation errors', () => {
    it('throws on missing id', () => {
      expect(() => loadGroupsFromYAML(`
        name: No ID Group
      `)).toThrow(YamlValidationError);
      expect(() => loadGroupsFromYAML(`
        name: No ID Group
      `)).toThrow(/id/);
    });

    it('throws on missing name', () => {
      expect(() => loadGroupsFromYAML(`
        id: no-name
      `)).toThrow(YamlValidationError);
      expect(() => loadGroupsFromYAML(`
        id: no-name
      `)).toThrow(/name/);
    });

    it('throws on non-string description', () => {
      expect(() => loadGroupsFromYAML(`
        id: bad
        name: Bad Group
        description: 123
      `)).toThrow(YamlValidationError);
      expect(() => loadGroupsFromYAML(`
        id: bad
        name: Bad Group
        description: 123
      `)).toThrow(/description/);
    });

    it('throws on non-boolean enabled', () => {
      expect(() => loadGroupsFromYAML(`
        id: bad
        name: Bad Group
        enabled: "yes"
      `)).toThrow(YamlValidationError);
      expect(() => loadGroupsFromYAML(`
        id: bad
        name: Bad Group
        enabled: "yes"
      `)).toThrow(/enabled/);
    });

    it('throws on non-object group entry', () => {
      expect(() => loadGroupsFromYAML(`
        - just a string
      `)).toThrow(YamlValidationError);
    });

    it('throws on empty id', () => {
      expect(() => loadGroupsFromYAML(`
        id: ""
        name: Empty ID
      `)).toThrow(YamlValidationError);
    });

    it('throws on empty name', () => {
      expect(() => loadGroupsFromYAML(`
        id: good-id
        name: ""
      `)).toThrow(YamlValidationError);
    });
  });

  describe('error handling', () => {
    it('throws YamlLoadError on empty content', () => {
      expect(() => loadGroupsFromYAML('')).toThrow(YamlLoadError);
      expect(() => loadGroupsFromYAML('')).toThrow(/empty/);
    });

    it('throws YamlLoadError on null YAML', () => {
      expect(() => loadGroupsFromYAML('~')).toThrow(YamlLoadError);
      expect(() => loadGroupsFromYAML('null')).toThrow(YamlLoadError);
    });

    it('throws YamlLoadError on empty array', () => {
      expect(() => loadGroupsFromYAML('[]')).toThrow(YamlLoadError);
      expect(() => loadGroupsFromYAML('[]')).toThrow(/empty/);
    });

    it('throws YamlLoadError on empty groups array', () => {
      expect(() => loadGroupsFromYAML('groups: []')).toThrow(YamlLoadError);
    });

    it('throws YamlLoadError on non-array groups', () => {
      expect(() => loadGroupsFromYAML('groups: invalid')).toThrow(YamlLoadError);
      expect(() => loadGroupsFromYAML('groups: invalid')).toThrow(/"groups" must be an array/);
    });

    it('throws YamlLoadError on invalid YAML syntax', () => {
      expect(() => loadGroupsFromYAML('{{invalid yaml')).toThrow(YamlLoadError);
      expect(() => loadGroupsFromYAML('{{invalid yaml')).toThrow(/YAML syntax error/);
    });

    it('throws YamlLoadError on scalar YAML', () => {
      expect(() => loadGroupsFromYAML('"just a string"')).toThrow(YamlLoadError);
    });
  });

  describe('path reporting', () => {
    it('reports correct path for single group validation error', () => {
      try {
        loadGroupsFromYAML(`
          id: bad
          name: OK
          enabled: "not-bool"
        `);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('group.enabled');
      }
    });

    it('reports correct path for array item validation error', () => {
      try {
        loadGroupsFromYAML(`
          - id: ok
            name: OK Group
          - id: bad
            name: Bad Group
            description: 42
        `);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('groups[1].description');
      }
    });

    it('reports correct path for groups wrapper validation error', () => {
      try {
        loadGroupsFromYAML(`
          groups:
            - id: ok
              name: Good
            - name: Missing ID
        `);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(YamlValidationError);
        expect((err as YamlValidationError).path).toBe('groups[1]');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// loadGroupsFromFile
// ---------------------------------------------------------------------------

describe('loadGroupsFromFile', () => {
  it('loads groups from YAML file', async () => {
    const groups = await loadGroupsFromFile(resolve(FIXTURES, 'groups.yaml'));

    expect(groups).toHaveLength(2);
    expect(groups[0]!.id).toBe('billing');
    expect(groups[0]!.name).toBe('Billing Rules');
    expect(groups[0]!.description).toBe('All billing-related rules');
    expect(groups[1]!.id).toBe('security');
    expect(groups[1]!.name).toBe('Security Rules');
    expect(groups[1]!.enabled).toBe(true);
  });

  it('throws YamlLoadError on non-existent file', async () => {
    await expect(loadGroupsFromFile('/nonexistent/path.yaml'))
      .rejects.toThrow(YamlLoadError);
  });

  it('includes file path in error', async () => {
    try {
      await loadGroupsFromFile('/nonexistent/path.yaml');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(YamlLoadError);
      expect((err as YamlLoadError).filePath).toBe('/nonexistent/path.yaml');
    }
  });

  it('wraps validation errors with file path', async () => {
    const tmpFile = resolve(FIXTURES, '_invalid_group_temp.yaml');

    try {
      await writeFile(tmpFile, 'id: bad\nenabled: "not-bool"');
      await expect(loadGroupsFromFile(tmpFile)).rejects.toThrow(YamlLoadError);
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  });
});
