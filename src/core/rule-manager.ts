import type { Rule, RuleInput } from '../types/rule.js';
import type { RuleGroup, RuleGroupInput } from '../types/group.js';
import type { RuleAction } from '../types/action.js';
import type { RulePersistence } from '../persistence/rule-persistence.js';
import { matchesTopic, matchesFactPattern, matchesTimerPattern } from '../utils/pattern-matcher.js';

/**
 * Správa pravidel s indexací podle triggerů.
 *
 * TODO: Implementovat jako GenServer pro thread-safety.
 */
export class RuleManager {
  private rules: Map<string, Rule> = new Map();
  private persistence: RulePersistence | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly persistDebounceMs = 10;

  // Dvouúrovňová indexace pro optimální vyhledávání
  // Exact indexy - O(1) lookup
  private exactFactPatterns: Map<string, Set<string>> = new Map();
  private exactEventTopics: Map<string, Set<string>> = new Map();
  private exactTimerNames: Map<string, Set<string>> = new Map();

  // Wildcard indexy - O(k) scan kde k << n
  private wildcardFactPatterns: Map<string, Set<string>> = new Map();
  private wildcardEventTopics: Map<string, Set<string>> = new Map();
  private wildcardTimerNames: Map<string, Set<string>> = new Map();

  // Reverse index — pravidla podle akcí (co produkují)
  private exactFactActions: Map<string, Set<string>> = new Map();
  private templateFactActions: Map<string, Set<string>> = new Map();
  private exactEventActions: Map<string, Set<string>> = new Map();
  private templateEventActions: Map<string, Set<string>> = new Map();

  private byTags: Map<string, Set<string>> = new Map();
  private groups: Map<string, RuleGroup> = new Map();
  private byGroup: Map<string, Set<string>> = new Map();
  private temporalRules: Set<string> = new Set();
  private nextVersion = 1;

  static async start(): Promise<RuleManager> {
    return new RuleManager();
  }

  /**
   * Registruje nové pravidlo.
   */
  register(input: RuleInput): Rule {
    const rule: Rule = {
      ...input,
      version: this.nextVersion++,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.rules.set(rule.id, rule);
    this.indexRule(rule);
    this.schedulePersist();

    return rule;
  }

  /**
   * Odregistruje pravidlo.
   */
  unregister(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    this.unindexRule(rule);
    this.rules.delete(ruleId);
    this.temporalRules.delete(ruleId);
    this.schedulePersist();

    return true;
  }

  /**
   * Povolí pravidlo.
   */
  enable(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = true;
    rule.updatedAt = Date.now();
    this.schedulePersist();
    return true;
  }

  /**
   * Zakáže pravidlo.
   */
  disable(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = false;
    rule.updatedAt = Date.now();
    this.schedulePersist();
    return true;
  }

  /**
   * Zjistí, zda je pravidlo aktivní (enabled + skupina enabled).
   */
  isRuleActive(rule: Rule): boolean {
    if (!rule.enabled) return false;
    if (rule.group) {
      const group = this.groups.get(rule.group);
      if (group && !group.enabled) return false;
    }
    return true;
  }

  /**
   * Získá pravidlo podle ID.
   */
  get(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Vrátí pravidla podle fact patternu.
   * Optimalizováno: O(1) lookup pro exact match + O(k) scan pro wildcardy.
   */
  getByFactPattern(key: string): Rule[] {
    const results: Rule[] = [];

    // O(1) exact match lookup
    const exactRuleIds = this.exactFactPatterns.get(key);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        const rule = this.rules.get(id);
        if (rule && this.isRuleActive(rule)) results.push(rule);
      }
    }

    // O(k) wildcard scan kde k << n
    for (const [pattern, ruleIds] of this.wildcardFactPatterns) {
      if (matchesFactPattern(key, pattern)) {
        for (const id of ruleIds) {
          const rule = this.rules.get(id);
          if (rule && this.isRuleActive(rule)) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí pravidla podle event topicu.
   * Optimalizováno: O(1) lookup pro exact match + O(k) scan pro wildcardy.
   */
  getByEventTopic(topic: string): Rule[] {
    const results: Rule[] = [];

    // O(1) exact match lookup
    const exactRuleIds = this.exactEventTopics.get(topic);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        const rule = this.rules.get(id);
        if (rule && this.isRuleActive(rule)) results.push(rule);
      }
    }

    // O(k) wildcard scan kde k << n
    for (const [pattern, ruleIds] of this.wildcardEventTopics) {
      if (matchesTopic(topic, pattern)) {
        for (const id of ruleIds) {
          const rule = this.rules.get(id);
          if (rule && this.isRuleActive(rule)) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí pravidla podle timer jména.
   * Podporuje wildcardy: "payment-timeout:*" matchuje "payment-timeout:order123"
   * Optimalizováno: O(1) lookup pro exact match + O(k) scan pro wildcardy.
   */
  getByTimerName(name: string): Rule[] {
    const results: Rule[] = [];

    // O(1) exact match lookup
    const exactRuleIds = this.exactTimerNames.get(name);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        const rule = this.rules.get(id);
        if (rule && this.isRuleActive(rule)) results.push(rule);
      }
    }

    // O(k) wildcard scan kde k << n
    for (const [pattern, ruleIds] of this.wildcardTimerNames) {
      if (matchesTimerPattern(name, pattern)) {
        for (const id of ruleIds) {
          const rule = this.rules.get(id);
          if (rule && this.isRuleActive(rule)) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí pravidla, jejichž akce nastavují fakt s daným klíčem (set_fact).
   * Používá se pro backward chaining — hledání pravidel produkujících cílový fakt.
   */
  getByFactAction(key: string): Rule[] {
    const results: Rule[] = [];
    const seen = new Set<string>();

    const exactRuleIds = this.exactFactActions.get(key);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const rule = this.rules.get(id);
        if (rule && this.isRuleActive(rule)) results.push(rule);
      }
    }

    for (const [pattern, ruleIds] of this.templateFactActions) {
      if (matchesFactPattern(key, pattern)) {
        for (const id of ruleIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          const rule = this.rules.get(id);
          if (rule && this.isRuleActive(rule)) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí pravidla, jejichž akce emitují event s daným topikem (emit_event).
   * Používá se pro backward chaining — hledání pravidel produkujících cílový event.
   */
  getByEventAction(topic: string): Rule[] {
    const results: Rule[] = [];
    const seen = new Set<string>();

    const exactRuleIds = this.exactEventActions.get(topic);
    if (exactRuleIds) {
      for (const id of exactRuleIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const rule = this.rules.get(id);
        if (rule && this.isRuleActive(rule)) results.push(rule);
      }
    }

    for (const [pattern, ruleIds] of this.templateEventActions) {
      if (matchesTopic(topic, pattern)) {
        for (const id of ruleIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          const rule = this.rules.get(id);
          if (rule && this.isRuleActive(rule)) results.push(rule);
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Vrátí všechna temporální pravidla.
   */
  getTemporalRules(): Rule[] {
    return [...this.temporalRules]
      .map(id => this.rules.get(id))
      .filter((r): r is Rule => r !== undefined && this.isRuleActive(r));
  }

  /**
   * Vrátí všechna pravidla.
   */
  getAll(): Rule[] {
    return [...this.rules.values()];
  }

  /**
   * Počet pravidel.
   */
  get size(): number {
    return this.rules.size;
  }

  private indexRule(rule: Rule): void {
    switch (rule.trigger.type) {
      case 'fact': {
        const pattern = rule.trigger.pattern;
        const index = pattern.includes('*') ? this.wildcardFactPatterns : this.exactFactPatterns;
        this.addToIndex(index, pattern, rule.id);
        break;
      }
      case 'event': {
        const topic = rule.trigger.topic;
        const index = topic.includes('*') ? this.wildcardEventTopics : this.exactEventTopics;
        this.addToIndex(index, topic, rule.id);
        break;
      }
      case 'timer': {
        const name = rule.trigger.name;
        const index = name.includes('*') ? this.wildcardTimerNames : this.exactTimerNames;
        this.addToIndex(index, name, rule.id);
        break;
      }
      case 'temporal':
        this.temporalRules.add(rule.id);
        break;
    }

    this.indexActions(rule.id, rule.actions);

    for (const tag of rule.tags) {
      this.addToIndex(this.byTags, tag, rule.id);
    }

    if (rule.group) {
      this.addToIndex(this.byGroup, rule.group, rule.id);
    }
  }

  private unindexRule(rule: Rule): void {
    switch (rule.trigger.type) {
      case 'fact': {
        const pattern = rule.trigger.pattern;
        const index = pattern.includes('*') ? this.wildcardFactPatterns : this.exactFactPatterns;
        this.removeFromIndex(index, pattern, rule.id);
        break;
      }
      case 'event': {
        const topic = rule.trigger.topic;
        const index = topic.includes('*') ? this.wildcardEventTopics : this.exactEventTopics;
        this.removeFromIndex(index, topic, rule.id);
        break;
      }
      case 'timer': {
        const name = rule.trigger.name;
        const index = name.includes('*') ? this.wildcardTimerNames : this.exactTimerNames;
        this.removeFromIndex(index, name, rule.id);
        break;
      }
      case 'temporal':
        this.temporalRules.delete(rule.id);
        break;
    }

    this.unindexActions(rule.id, rule.actions);

    for (const tag of rule.tags) {
      this.removeFromIndex(this.byTags, tag, rule.id);
    }

    if (rule.group) {
      this.removeFromIndex(this.byGroup, rule.group, rule.id);
    }
  }

  private addToIndex(index: Map<string, Set<string>>, key: string, ruleId: string): void {
    const set = index.get(key) ?? new Set();
    set.add(ruleId);
    index.set(key, set);
  }

  private removeFromIndex(index: Map<string, Set<string>>, key: string, ruleId: string): void {
    const set = index.get(key);
    if (set) {
      set.delete(ruleId);
      if (set.size === 0) {
        index.delete(key);
      }
    }
  }

  /**
   * Indexuje akce pravidla do reverse indexů.
   * Rekurzivně prochází i vnořené conditional akce.
   */
  private indexActions(ruleId: string, actions: RuleAction[] | undefined): void {
    if (!actions) return;
    for (const action of actions) {
      switch (action.type) {
        case 'set_fact': {
          const normalized = this.normalizeActionKey(action.key);
          const index = normalized.includes('*') ? this.templateFactActions : this.exactFactActions;
          this.addToIndex(index, normalized, ruleId);
          break;
        }
        case 'emit_event': {
          const normalized = this.normalizeActionKey(action.topic);
          const index = normalized.includes('*') ? this.templateEventActions : this.exactEventActions;
          this.addToIndex(index, normalized, ruleId);
          break;
        }
        case 'conditional':
          this.indexActions(ruleId, action.then);
          if (action.else) {
            this.indexActions(ruleId, action.else);
          }
          break;
      }
    }
  }

  /**
   * Odstraní akce pravidla z reverse indexů.
   */
  private unindexActions(ruleId: string, actions: RuleAction[] | undefined): void {
    if (!actions) return;
    for (const action of actions) {
      switch (action.type) {
        case 'set_fact': {
          const normalized = this.normalizeActionKey(action.key);
          const index = normalized.includes('*') ? this.templateFactActions : this.exactFactActions;
          this.removeFromIndex(index, normalized, ruleId);
          break;
        }
        case 'emit_event': {
          const normalized = this.normalizeActionKey(action.topic);
          const index = normalized.includes('*') ? this.templateEventActions : this.exactEventActions;
          this.removeFromIndex(index, normalized, ruleId);
          break;
        }
        case 'conditional':
          this.unindexActions(ruleId, action.then);
          if (action.else) {
            this.unindexActions(ruleId, action.else);
          }
          break;
      }
    }
  }

  /**
   * Normalizuje klíč akce — šablonové výrazy `${...}` nahradí wildcardem `*`.
   */
  private normalizeActionKey(key: string): string {
    return key.replace(/\$\{[^}]+\}/g, '*');
  }

  // --- Group management ---

  /**
   * Registruje novou skupinu pravidel.
   */
  registerGroup(input: RuleGroupInput): RuleGroup {
    const group: RuleGroup = {
      id: input.id,
      name: input.name,
      ...(input.description !== undefined && { description: input.description }),
      enabled: input.enabled ?? true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.groups.set(group.id, group);
    this.schedulePersist();
    return group;
  }

  /**
   * Odregistruje skupinu. Odstraní group referenci z přiřazených pravidel.
   */
  unregisterGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    const ruleIds = this.byGroup.get(groupId);
    if (ruleIds) {
      for (const ruleId of ruleIds) {
        const rule = this.rules.get(ruleId);
        if (rule) {
          delete rule.group;
          rule.updatedAt = Date.now();
        }
      }
      this.byGroup.delete(groupId);
    }

    this.groups.delete(groupId);
    this.schedulePersist();
    return true;
  }

  /**
   * Povolí skupinu pravidel.
   */
  enableGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    group.enabled = true;
    group.updatedAt = Date.now();
    this.schedulePersist();
    return true;
  }

  /**
   * Zakáže skupinu pravidel.
   */
  disableGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    group.enabled = false;
    group.updatedAt = Date.now();
    this.schedulePersist();
    return true;
  }

  /**
   * Aktualizuje skupinu pravidel (name, description, enabled).
   */
  updateGroup(groupId: string, updates: { name?: string; description?: string; enabled?: boolean }): RuleGroup | undefined {
    const group = this.groups.get(groupId);
    if (!group) return undefined;

    if (updates.name !== undefined) group.name = updates.name;
    if (updates.description !== undefined) group.description = updates.description;
    if (updates.enabled !== undefined) group.enabled = updates.enabled;
    group.updatedAt = Date.now();

    this.schedulePersist();
    return group;
  }

  /**
   * Získá skupinu podle ID.
   */
  getGroup(groupId: string): RuleGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Vrátí všechny skupiny.
   */
  getAllGroups(): RuleGroup[] {
    return [...this.groups.values()];
  }

  /**
   * Vrátí pravidla ve skupině.
   */
  getGroupRules(groupId: string): Rule[] {
    const ruleIds = this.byGroup.get(groupId);
    if (!ruleIds) return [];
    return [...ruleIds]
      .map(id => this.rules.get(id))
      .filter((r): r is Rule => r !== undefined);
  }

  /**
   * Nastaví persistence adapter pro ukládání pravidel.
   */
  setPersistence(persistence: RulePersistence): void {
    this.persistence = persistence;
  }

  /**
   * Načte pravidla a skupiny z persistence storage.
   * Skupiny se obnovují před pravidly, aby group reference fungovala správně.
   * @returns Počet načtených pravidel
   */
  async restore(): Promise<number> {
    if (!this.persistence) {
      return 0;
    }

    const { rules, groups } = await this.persistence.load();

    // Skupiny se obnovují první — pravidla mohou odkazovat na skupiny
    for (const group of groups) {
      this.groups.set(group.id, group);
    }

    let maxVersion = 0;

    for (const rule of rules) {
      this.rules.set(rule.id, rule);
      this.indexRule(rule);
      if (rule.version > maxVersion) {
        maxVersion = rule.version;
      }
    }

    // Zajistí, že nová pravidla budou mít vyšší verzi než načtená
    this.nextVersion = maxVersion + 1;

    return rules.length;
  }

  /**
   * Manuálně uloží všechna pravidla a skupiny do persistence storage.
   */
  async persist(): Promise<void> {
    if (!this.persistence) {
      return;
    }

    // Zruš případný naplánovaný persist
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    await this.persistence.save(this.getAll(), this.getAllGroups());
  }

  /**
   * Naplánuje debounced persist.
   * Volá se automaticky při změnách pravidel i skupin.
   */
  private schedulePersist(): void {
    if (!this.persistence) {
      return;
    }

    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistence?.save(this.getAll(), this.getAllGroups()).catch(() => {
        // Ignoruj chyby při background persistenci
      });
    }, this.persistDebounceMs);
  }
}
