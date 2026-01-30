import DataLoader from 'dataloader';
import type { RuleEngine } from '../../../core/rule-engine.js';
import type { RuleGroup } from '../../../types/group.js';
import type { Rule } from '../../../types/rule.js';

export interface GraphQLLoaders {
  groupLoader: DataLoader<string, RuleGroup | null>;
  groupRulesLoader: DataLoader<string, readonly Rule[]>;
}

/**
 * Vytvoří sadu DataLoaderů pro jeden GraphQL request.
 *
 * Loadery řeší N+1 problém: namísto individuálních volání
 * `engine.getGroup()` pro každé pravidlo se všechny požadavky
 * z jednoho execution ticku sdruží do jedné dávky.
 *
 * Musí se vytvářet per-request — interní cache nesmí přetékat
 * mezi požadavky, jinak by resolvery vracely stale data.
 */
export function createLoaders(engine: RuleEngine): GraphQLLoaders {
  const groupLoader = new DataLoader<string, RuleGroup | null>(
    (ids) => {
      const groups = engine.getGroups();
      const byId = new Map(groups.map((g) => [g.id, g]));
      return Promise.resolve(ids.map((id) => byId.get(id) ?? null));
    },
  );

  const groupRulesLoader = new DataLoader<string, readonly Rule[]>(
    (groupIds) => {
      const allRules = engine.getRules();
      const byGroup = new Map<string, Rule[]>();
      for (const rule of allRules) {
        if (rule.group) {
          let bucket = byGroup.get(rule.group);
          if (!bucket) {
            bucket = [];
            byGroup.set(rule.group, bucket);
          }
          bucket.push(rule);
        }
      }
      return Promise.resolve(groupIds.map((id) => byGroup.get(id) ?? []));
    },
  );

  return { groupLoader, groupRulesLoader };
}
