/**
 * Služba pro import a export pravidel.
 * Zajišťuje komunikaci s persistence vrstvou a transformaci dat.
 */

import type { Rule } from '../../types/rule.js';
import type { RulePersistence } from '../../persistence/rule-persistence.js';
import { createValidator, type ValidationResult } from './validator.js';

/** Výsledek importu pravidel */
export interface ImportResult {
  /** Počet úspěšně importovaných pravidel */
  imported: number;
  /** Počet přeskočených pravidel (při merge s duplicitami) */
  skipped: number;
  /** Počet aktualizovaných pravidel (při merge) */
  updated: number;
  /** Celkový počet pravidel po importu */
  total: number;
  /** ID importovaných pravidel */
  importedIds: string[];
  /** ID přeskočených pravidel */
  skippedIds: string[];
  /** ID aktualizovaných pravidel */
  updatedIds: string[];
}

/** Výsledek exportu pravidel */
export interface ExportResult {
  /** Exportovaná pravidla */
  rules: Rule[];
  /** Celkový počet pravidel */
  total: number;
  /** Počet vyfiltrovaných pravidel */
  filtered: number;
}

/** Options pro import */
export interface ImportOptions {
  /** Sloučit s existujícími pravidly místo nahrazení */
  merge?: boolean;
  /** Validovat pravidla před importem */
  validate?: boolean;
  /** Strict mode pro validaci */
  strict?: boolean;
}

/** Options pro export */
export interface ExportOptions {
  /** Filtrovat podle tagů (pravidlo musí mít alespoň jeden z tagů) */
  tags?: string[];
  /** Filtrovat podle enabled stavu */
  enabled?: boolean;
}

/** Normalizované pravidlo z JSON vstupu */
interface RuleInput {
  id: string;
  name: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags?: string[];
  trigger: unknown;
  conditions?: unknown[];
  actions?: unknown[];
}

/**
 * Služba pro import a export pravidel.
 */
export class RuleIOService {
  private readonly persistence: RulePersistence;

  constructor(persistence: RulePersistence) {
    this.persistence = persistence;
  }

  /**
   * Importuje pravidla do persistence.
   * @param rules - Pravidla k importu (z JSON)
   * @param options - Import options
   * @returns Výsledek importu
   */
  async import(rules: unknown[], options: ImportOptions = {}): Promise<ImportResult> {
    const { merge = false, validate = true, strict = false } = options;

    // Validace pokud je povolena
    if (validate) {
      const validator = createValidator({ strict });
      const validation = validator.validateMany(rules);
      if (!validation.valid) {
        throw new ValidationError(validation);
      }
    }

    // Normalizace pravidel
    const normalizedRules = rules.map((r) => this.normalizeRule(r as RuleInput));
    const newIds = new Set(normalizedRules.map((r) => r.id));

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      updated: 0,
      total: 0,
      importedIds: [],
      skippedIds: [],
      updatedIds: []
    };

    if (merge) {
      // Merge mode - sloučit s existujícími
      const { rules: existingRules } = await this.persistence.load();
      const existingById = new Map(existingRules.map((r) => [r.id, r]));

      const finalRules: Rule[] = [];

      // Zachovat existující pravidla, která nejsou v importu
      for (const existing of existingRules) {
        if (!newIds.has(existing.id)) {
          finalRules.push(existing);
        }
      }

      // Přidat/aktualizovat importovaná pravidla
      for (const newRule of normalizedRules) {
        if (existingById.has(newRule.id)) {
          // Update - zvýšit verzi
          const existingRule = existingById.get(newRule.id)!;
          const updatedRule: Rule = {
            ...newRule,
            version: existingRule.version + 1,
            createdAt: existingRule.createdAt,
            updatedAt: Date.now()
          };
          finalRules.push(updatedRule);
          result.updated++;
          result.updatedIds.push(newRule.id);
        } else {
          // Nové pravidlo
          finalRules.push(newRule);
          result.imported++;
          result.importedIds.push(newRule.id);
        }
      }

      await this.persistence.save(finalRules);
      result.total = finalRules.length;
    } else {
      // Replace mode - nahradit vše
      await this.persistence.save(normalizedRules);
      result.imported = normalizedRules.length;
      result.importedIds = normalizedRules.map((r) => r.id);
      result.total = normalizedRules.length;
    }

    return result;
  }

  /**
   * Exportuje pravidla z persistence.
   * @param options - Export options
   * @returns Výsledek exportu
   */
  async export(options: ExportOptions = {}): Promise<ExportResult> {
    const { tags, enabled } = options;

    const { rules: allRules } = await this.persistence.load();
    let filteredRules = allRules;

    // Filtrování podle tagů
    if (tags && tags.length > 0) {
      const tagSet = new Set(tags);
      filteredRules = filteredRules.filter((rule) => rule.tags.some((tag) => tagSet.has(tag)));
    }

    // Filtrování podle enabled
    if (enabled !== undefined) {
      filteredRules = filteredRules.filter((rule) => rule.enabled === enabled);
    }

    return {
      rules: filteredRules,
      total: allRules.length,
      filtered: filteredRules.length
    };
  }

  /**
   * Vrátí náhled importu bez provedení změn.
   * @param rules - Pravidla k importu
   * @param options - Import options
   * @returns Náhled co by se stalo
   */
  async previewImport(rules: unknown[], options: ImportOptions = {}): Promise<ImportPreview> {
    const { merge = false, validate = true, strict = false } = options;

    const preview: ImportPreview = {
      valid: true,
      validationErrors: [],
      toImport: [],
      toUpdate: [],
      toSkip: [],
      unchanged: []
    };

    // Validace
    if (validate) {
      const validator = createValidator({ strict });
      const validation = validator.validateMany(rules);
      preview.valid = validation.valid;
      if (!validation.valid) {
        preview.validationErrors = validation.errors.map((e) => `${e.path}: ${e.message}`);
        return preview;
      }
    }

    const normalizedRules = rules.map((r) => this.normalizeRule(r as RuleInput));

    if (merge) {
      const { rules: existingRules } = await this.persistence.load();
      const existingById = new Map(existingRules.map((r) => [r.id, r]));
      const newIds = new Set(normalizedRules.map((r) => r.id));

      for (const newRule of normalizedRules) {
        if (existingById.has(newRule.id)) {
          preview.toUpdate.push({
            id: newRule.id,
            name: newRule.name,
            oldVersion: existingById.get(newRule.id)!.version,
            newVersion: existingById.get(newRule.id)!.version + 1
          });
        } else {
          preview.toImport.push({ id: newRule.id, name: newRule.name });
        }
      }

      // Pravidla, která zůstanou beze změny
      for (const existing of existingRules) {
        if (!newIds.has(existing.id)) {
          preview.unchanged.push({ id: existing.id, name: existing.name });
        }
      }
    } else {
      // Replace mode - všechna jsou nová
      for (const rule of normalizedRules) {
        preview.toImport.push({ id: rule.id, name: rule.name });
      }
    }

    return preview;
  }

  /**
   * Normalizuje pravidlo z JSON vstupu do plného Rule formátu.
   */
  private normalizeRule(input: RuleInput): Rule {
    const now = Date.now();

    const rule: Rule = {
      id: input.id,
      name: input.name,
      priority: input.priority ?? 0,
      enabled: input.enabled ?? true,
      tags: input.tags ?? [],
      trigger: input.trigger as Rule['trigger'],
      conditions: (input.conditions ?? []) as Rule['conditions'],
      actions: (input.actions ?? []) as Rule['actions'],
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    if (input.description !== undefined) {
      rule.description = input.description;
    }

    return rule;
  }
}

/** Náhled importu */
export interface ImportPreview {
  /** Je import validní */
  valid: boolean;
  /** Validační chyby */
  validationErrors: string[];
  /** Pravidla k importu (nová) */
  toImport: Array<{ id: string; name: string }>;
  /** Pravidla k aktualizaci */
  toUpdate: Array<{ id: string; name: string; oldVersion: number; newVersion: number }>;
  /** Pravidla k přeskočení */
  toSkip: Array<{ id: string; name: string; reason: string }>;
  /** Pravidla bez změny (při merge) */
  unchanged: Array<{ id: string; name: string }>;
}

/** Chyba validace při importu */
class ValidationError extends Error {
  public readonly validation: ValidationResult;

  constructor(validation: ValidationResult) {
    const errorMessages = validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    super(`Validation failed: ${errorMessages}`);
    this.name = 'ValidationError';
    this.validation = validation;
  }
}

export { ValidationError as RuleIOValidationError };

/**
 * Vytvoří instanci RuleIOService.
 */
export function createRuleIOService(persistence: RulePersistence): RuleIOService {
  return new RuleIOService(persistence);
}
