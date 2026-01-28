import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { loadJsonFile, writeJsonFile, fileExists, toJson } from '../../../../src/cli/utils/file-loader.js';
import { FileNotFoundError, ValidationError } from '../../../../src/cli/utils/errors.js';

const fixturesDir = resolve(__dirname, '../../../fixtures/cli');
const tempDir = resolve(__dirname, '../../../temp/file-loader');

describe('file-loader', () => {
  beforeEach(() => {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('loadJsonFile', () => {
    it('should load a valid JSON file', () => {
      const result = loadJsonFile(resolve(fixturesDir, 'valid-rules/simple.json'));

      expect(result.data).toBeDefined();
      expect(result.path).toContain('simple.json');
      expect((result.data as Record<string, unknown>)['id']).toBe('simple-rule');
    });

    it('should load an array of rules', () => {
      const result = loadJsonFile(resolve(fixturesDir, 'valid-rules/multiple.json'));

      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBe(2);
    });

    it('should return absolute path', () => {
      const result = loadJsonFile('tests/fixtures/cli/valid-rules/simple.json');

      expect(result.path).toMatch(/^[/\\]/);
      expect(result.path).toContain('simple.json');
    });

    it('should throw FileNotFoundError for non-existent file', () => {
      expect(() => loadJsonFile('non-existent.json')).toThrow(FileNotFoundError);
    });

    it('should throw ValidationError for invalid JSON', () => {
      expect(() => loadJsonFile(resolve(fixturesDir, 'invalid-rules/invalid-json.json'))).toThrow(ValidationError);
    });

    it('should provide meaningful error message for invalid JSON', () => {
      try {
        loadJsonFile(resolve(fixturesDir, 'invalid-rules/invalid-json.json'));
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as ValidationError).message).toContain('Invalid JSON');
      }
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON to file', () => {
      const filePath = join(tempDir, 'test.json');
      const data = { foo: 'bar' };

      const result = writeJsonFile(filePath, data);

      expect(result).toContain('test.json');
      expect(existsSync(result)).toBe(true);

      const loaded = loadJsonFile(result);
      expect(loaded.data).toEqual(data);
    });

    it('should write compact JSON by default', () => {
      const filePath = join(tempDir, 'compact.json');
      const data = { foo: 'bar', nested: { a: 1 } };

      writeJsonFile(filePath, data);

      const { readFileSync } = require('node:fs');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('{"foo":"bar","nested":{"a":1}}\n');
    });

    it('should write pretty JSON when requested', () => {
      const filePath = join(tempDir, 'pretty.json');
      const data = { foo: 'bar' };

      writeJsonFile(filePath, data, { pretty: true });

      const { readFileSync } = require('node:fs');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('\n');
      expect(content).toContain('  ');
    });

    it('should use custom indent', () => {
      const filePath = join(tempDir, 'indent.json');
      const data = { foo: 'bar' };

      writeJsonFile(filePath, data, { pretty: true, indent: 4 });

      const { readFileSync } = require('node:fs');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('    ');
    });

    it('should create parent directories', () => {
      const filePath = join(tempDir, 'nested/deep/test.json');
      const data = { test: true };

      writeJsonFile(filePath, data);

      expect(existsSync(filePath)).toBe(true);
    });

    it('should not create parent directories when disabled', () => {
      const filePath = join(tempDir, 'nonexistent/test.json');
      const data = { test: true };

      expect(() => writeJsonFile(filePath, data, { createDirs: false })).toThrow();
    });

    it('should overwrite existing file', () => {
      const filePath = join(tempDir, 'overwrite.json');

      writeJsonFile(filePath, { version: 1 });
      writeJsonFile(filePath, { version: 2 });

      const loaded = loadJsonFile(filePath);
      expect((loaded.data as Record<string, number>)['version']).toBe(2);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', () => {
      expect(fileExists(resolve(fixturesDir, 'valid-rules/simple.json'))).toBe(true);
    });

    it('should return false for non-existing file', () => {
      expect(fileExists('non-existent-file.json')).toBe(false);
    });

    it('should work with relative paths', () => {
      expect(fileExists('tests/fixtures/cli/valid-rules/simple.json')).toBe(true);
    });
  });

  describe('toJson', () => {
    it('should serialize object to JSON string', () => {
      const result = toJson({ foo: 'bar' });
      expect(result).toBe('{"foo":"bar"}');
    });

    it('should serialize with pretty formatting', () => {
      const result = toJson({ foo: 'bar' }, true);
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });

    it('should serialize arrays', () => {
      const result = toJson([1, 2, 3]);
      expect(result).toBe('[1,2,3]');
    });

    it('should handle nested objects', () => {
      const result = toJson({ a: { b: { c: 1 } } }, true);
      expect(result).toContain('      "c"');
    });

    it('should handle null and undefined', () => {
      expect(toJson(null)).toBe('null');
      expect(toJson({ a: undefined })).toBe('{}');
    });
  });
});
