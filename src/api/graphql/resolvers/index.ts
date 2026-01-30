import { ruleResolvers } from './rule.resolvers.js';
import { factResolvers } from './fact.resolvers.js';
import { eventResolvers } from './event.resolvers.js';
import { timerResolvers } from './timer.resolvers.js';
import { groupResolvers } from './group.resolvers.js';
import { engineResolvers } from './engine.resolvers.js';
import { auditResolvers } from './audit.resolvers.js';
import { versionResolvers } from './version.resolvers.js';
import { backwardResolvers } from './backward.resolvers.js';
import { subscriptionResolvers } from './subscription.resolvers.js';

/**
 * Sloučí pole resolver modulů do jednoho resolver mapu.
 *
 * Každý modul poskytuje Query/Mutation/TypeResolver fragmenty.
 * Merge probíhá po top-level klíčích (Query, Mutation, Rule, RuleGroup, …).
 */
function mergeResolvers(
  ...modules: Record<string, Record<string, unknown>>[]
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = {};

  for (const mod of modules) {
    for (const [key, value] of Object.entries(mod)) {
      if (!merged[key]) {
        merged[key] = {};
      }
      Object.assign(merged[key], value);
    }
  }

  return merged;
}

export const resolvers = mergeResolvers(
  ruleResolvers,
  factResolvers,
  eventResolvers,
  timerResolvers,
  groupResolvers,
  engineResolvers,
  auditResolvers,
  versionResolvers,
  backwardResolvers,
  subscriptionResolvers,
);
