import { createHash } from 'node:crypto';
import { GenServer } from '@hamicek/noex';
import type { GenServerRef, TimerRef } from '@hamicek/noex';
import type { RuleInput } from '../../types/rule.js';
import type { RuleEngine } from '../rule-engine.js';
import type { AuditLogService } from '../../audit/audit-log-service.js';
import { RuleInputValidator } from '../../validation/index.js';
import { FileRuleSource, StorageRuleSource } from './sources.js';
import type {
  HotReloadConfig,
  HotReloadCastMsg,
  HotReloadState,
  HotReloadStatus,
  RuleDiff,
  ReloadResult,
  RuleSource,
} from './types.js';

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 5000;

// ── HotReloadWatcher ────────────────────────────────────────────────────────

/**
 * Sleduje změny pravidel z externích zdrojů a automaticky je aplikuje do enginu.
 *
 * Polling implementován přes GenServer + sendAfter — spolehlivý na všech
 * platformách, zajišťuje sekvenční zpracování (žádné překrývání checků).
 */
export class HotReloadWatcher {
  private readonly engine: RuleEngine;
  private readonly sources: RuleSource[];
  private readonly intervalMs: number;
  private readonly validateBeforeApply: boolean;
  private readonly atomicReload: boolean;
  private readonly validator: RuleInputValidator;
  private readonly auditLog: AuditLogService | null;

  private ref: GenServerRef | null = null;
  private timerRef: TimerRef | null = null;

  private readonly state: HotReloadState = {
    ruleHashes: new Map(),
    lastReloadAt: null,
    reloadCount: 0,
    failureCount: 0,
  };

  private constructor(engine: RuleEngine, config: HotReloadConfig, sources: RuleSource[]) {
    this.engine = engine;
    this.sources = sources;
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.validateBeforeApply = config.validateBeforeApply ?? true;
    this.atomicReload = config.atomicReload ?? true;
    this.validator = new RuleInputValidator();
    this.auditLog = engine.getAuditLog();
  }

  /**
   * Vytvoří a spustí HotReloadWatcher.
   *
   * Sestaví zdroje pravidel podle konfigurace, inicializuje baseline hashe
   * z aktuálně registrovaných pravidel a naplánuje první kontrolu.
   */
  static async start(engine: RuleEngine, config: HotReloadConfig): Promise<HotReloadWatcher> {
    const sources = HotReloadWatcher.buildSources(config);
    const watcher = new HotReloadWatcher(engine, config, sources);

    watcher.initializeHashes();
    await watcher.startGenServer();
    watcher.scheduleNextCheck();

    return watcher;
  }

  /**
   * Zastaví watcher a uvolní GenServer.
   */
  async stop(): Promise<void> {
    if (this.timerRef) {
      GenServer.cancelTimer(this.timerRef);
      this.timerRef = null;
    }

    if (this.ref) {
      await GenServer.stop(this.ref);
      this.ref = null;
    }
  }

  /**
   * Vrátí aktuální stav watcheru.
   */
  getStatus(): HotReloadStatus {
    return {
      running: this.ref !== null && GenServer.isRunning(this.ref),
      intervalMs: this.intervalMs,
      trackedRulesCount: this.state.ruleHashes.size,
      lastReloadAt: this.state.lastReloadAt,
      reloadCount: this.state.reloadCount,
      failureCount: this.state.failureCount,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                         GENSERVER LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  private async startGenServer(): Promise<void> {
    const watcher = this;

    this.ref = await GenServer.start({
      init: () => ({}),
      handleCall(_msg: unknown, state: Record<string, never>) {
        return [null, state] as const;
      },
      async handleCast(msg: unknown, state: Record<string, never>) {
        if ((msg as HotReloadCastMsg).type === 'check') {
          await watcher.performCheck();
        }
        return state;
      },
    });
  }

  private scheduleNextCheck(): void {
    if (!this.ref || !GenServer.isRunning(this.ref)) return;
    this.timerRef = GenServer.sendAfter(this.ref, { type: 'check' } as never, this.intervalMs);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                           CHECK & RELOAD
  // ═══════════════════════════════════════════════════════════════════════════

  /** Hlavní polling cyklus — volán z GenServer handleCast. */
  async performCheck(): Promise<ReloadResult | null> {
    const startTime = Date.now();

    try {
      const loadedRules = await this.loadAllSources();
      const diff = this.computeDiff(loadedRules);

      if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
        this.scheduleNextCheck();
        return null;
      }

      this.auditLog?.record('hot_reload_started', {
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
        sources: this.sources.map((s) => s.name),
      });

      if (this.validateBeforeApply) {
        const allNewRules = [...diff.added, ...diff.modified];
        if (allNewRules.length > 0) {
          const validation = this.validator.validateMany(allNewRules);
          if (!validation.valid) {
            const errorMsg = validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
            this.state.failureCount++;

            this.auditLog?.record('hot_reload_failed', {
              reason: 'validation_failed',
              errors: errorMsg,
            });

            this.scheduleNextCheck();
            return {
              success: false,
              addedCount: 0,
              removedCount: 0,
              modifiedCount: 0,
              durationMs: Date.now() - startTime,
              error: `Validation failed: ${errorMsg}`,
              timestamp: Date.now(),
            };
          }
        }
      }

      await this.applyChanges(diff, loadedRules);

      const durationMs = Date.now() - startTime;
      this.state.lastReloadAt = Date.now();
      this.state.reloadCount++;

      const result: ReloadResult = {
        success: true,
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
        durationMs,
        timestamp: Date.now(),
      };

      this.auditLog?.record('hot_reload_completed', {
        addedCount: result.addedCount,
        removedCount: result.removedCount,
        modifiedCount: result.modifiedCount,
        durationMs: result.durationMs,
      });

      this.scheduleNextCheck();
      return result;
    } catch (error) {
      this.state.failureCount++;

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.auditLog?.record('hot_reload_failed', {
        reason: 'unexpected_error',
        error: errorMsg,
      });

      this.scheduleNextCheck();
      return {
        success: false,
        addedCount: 0,
        removedCount: 0,
        modifiedCount: 0,
        durationMs: Date.now() - startTime,
        error: errorMsg,
        timestamp: Date.now(),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                          SOURCE LOADING
  // ═══════════════════════════════════════════════════════════════════════════

  private async loadAllSources(): Promise<RuleInput[]> {
    const allRules: RuleInput[] = [];

    for (const source of this.sources) {
      const rules = await source.loadRules();
      allRules.push(...rules);
    }

    return allRules;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                            DIFFING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Porovná nově načtená pravidla s aktuálními hashi.
   *
   * Vrací trojici: přidaná, odebraná a modifikovaná pravidla.
   */
  computeDiff(newRules: RuleInput[]): RuleDiff {
    const newHashes = new Map<string, string>();
    const newRuleMap = new Map<string, RuleInput>();

    for (const rule of newRules) {
      const hash = HotReloadWatcher.computeRuleHash(rule);
      newHashes.set(rule.id, hash);
      newRuleMap.set(rule.id, rule);
    }

    const added: RuleInput[] = [];
    const removed: string[] = [];
    const modified: RuleInput[] = [];

    // Nová nebo modifikovaná pravidla
    for (const [id, hash] of newHashes) {
      const existingHash = this.state.ruleHashes.get(id);
      if (existingHash === undefined) {
        added.push(newRuleMap.get(id)!);
      } else if (existingHash !== hash) {
        modified.push(newRuleMap.get(id)!);
      }
    }

    // Odebraná pravidla
    for (const id of this.state.ruleHashes.keys()) {
      if (!newHashes.has(id)) {
        removed.push(id);
      }
    }

    return { added, removed, modified };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                         APPLYING CHANGES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Aplikuje diff do enginu: odebere → aktualizuje → přidá.
   *
   * Před aplikací čeká na dokončení processing queue enginu
   * pro bezpečnou výměnu pravidel.
   */
  private async applyChanges(diff: RuleDiff, allNewRules: RuleInput[]): Promise<void> {
    await this.engine.waitForProcessingQueue();

    // 1. Odebrat odebraná pravidla
    for (const ruleId of diff.removed) {
      this.engine.unregisterRule(ruleId);
    }

    // 2. Aktualizovat modifikovaná pravidla (unregister + register)
    for (const rule of diff.modified) {
      this.engine.unregisterRule(rule.id);
      this.engine.registerRule(rule, { skipValidation: true });
    }

    // 3. Přidat nová pravidla
    for (const rule of diff.added) {
      this.engine.registerRule(rule, { skipValidation: true });
    }

    // 4. Aktualizovat hash cache
    this.updateHashes(allNewRules);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                            HASHING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializuje hash cache z aktuálně registrovaných pravidel enginu.
   *
   * Tím se zajistí, že první check detekuje pouze skutečné rozdíly
   * oproti běžícímu stavu.
   */
  private initializeHashes(): void {
    const currentRules = this.engine.getRules();
    this.state.ruleHashes.clear();

    for (const rule of currentRules) {
      const ruleInput: RuleInput = {
        id: rule.id,
        name: rule.name,
        ...(rule.description !== undefined && { description: rule.description }),
        priority: rule.priority,
        enabled: rule.enabled,
        tags: rule.tags,
        ...(rule.group !== undefined && { group: rule.group }),
        trigger: rule.trigger,
        conditions: rule.conditions,
        actions: rule.actions,
      };
      this.state.ruleHashes.set(rule.id, HotReloadWatcher.computeRuleHash(ruleInput));
    }
  }

  /** Přepíše hash cache novým stavem. */
  private updateHashes(rules: RuleInput[]): void {
    this.state.ruleHashes.clear();
    for (const rule of rules) {
      this.state.ruleHashes.set(rule.id, HotReloadWatcher.computeRuleHash(rule));
    }
  }

  /**
   * Deterministický SHA-256 hash pravidla.
   *
   * Klíče jsou seřazeny abecedně pro zajištění konzistence
   * bez ohledu na pořadí vlastností ve zdrojovém objektu.
   */
  static computeRuleHash(rule: RuleInput): string {
    const normalized = JSON.stringify(rule, Object.keys(rule).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                         SOURCE BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  private static buildSources(config: HotReloadConfig): RuleSource[] {
    const sources: RuleSource[] = [];

    if (config.files) {
      sources.push(new FileRuleSource(config.files));
    }

    if (config.storage) {
      sources.push(new StorageRuleSource(config.storage));
    }

    return sources;
  }
}
