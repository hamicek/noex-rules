import type { RuleManager } from '../core/rule-manager.js';
import type { ConditionEvaluator, EvaluationContext } from '../evaluation/condition-evaluator.js';
import type { FactStore } from '../core/fact-store.js';
import type { Rule } from '../types/rule.js';
import type { RuleCondition } from '../types/condition.js';
import type {
  Goal,
  FactGoal,
  EventGoal,
  QueryResult,
  ProofNode,
  RuleProofNode,
  ConditionProofNode,
  BackwardChainingConfig,
} from '../types/backward.js';
import type { ConditionEvaluationResult } from '../debugging/types.js';

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_EXPLORED_RULES = 100;

interface EvaluationState {
  exploredRules: number;
  maxDepthReached: boolean;
}

/**
 * Goal-driven backward chaining engine.
 *
 * Given a goal (fact or event), the chainer searches the rule graph
 * in reverse — finding rules whose **actions** produce the goal,
 * then recursively checking whether their **conditions** can be
 * satisfied from existing facts or from other rules.
 *
 * The evaluation is **read-only** — it never modifies facts or fires
 * actions. The result is a proof tree that explains *why* the goal
 * is achievable or not.
 */
export class BackwardChainer {
  private readonly maxDepth: number;
  private readonly maxExploredRules: number;

  constructor(
    private readonly ruleManager: RuleManager,
    private readonly conditionEvaluator: ConditionEvaluator,
    private readonly factStore: FactStore,
    config: BackwardChainingConfig = {},
  ) {
    this.maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxExploredRules = config.maxExploredRules ?? DEFAULT_MAX_EXPLORED_RULES;
  }

  /**
   * Evaluates whether the given goal is achievable using the current
   * fact store and registered rules.
   */
  evaluate(goal: Goal): QueryResult {
    const startTime = performance.now();
    const state: EvaluationState = { exploredRules: 0, maxDepthReached: false };
    const visited = new Set<string>();

    const proof = goal.type === 'fact'
      ? this.evaluateFactGoal(goal, visited, 0, state)
      : this.evaluateEventGoal(goal, visited, 0, state);

    return {
      goal,
      achievable: isProofSatisfied(proof),
      proof,
      exploredRules: state.exploredRules,
      maxDepthReached: state.maxDepthReached,
      durationMs: performance.now() - startTime,
    };
  }

  // -------------------------------------------------------------------
  // Fact goal
  // -------------------------------------------------------------------

  private evaluateFactGoal(
    goal: FactGoal,
    visited: Set<string>,
    depth: number,
    state: EvaluationState,
  ): ProofNode {
    if (depth >= this.maxDepth) {
      state.maxDepthReached = true;
      return { type: 'unachievable', reason: 'max_depth', details: `Reached depth ${depth}` };
    }

    // Base case — fact already exists and satisfies the goal.
    const existingFact = this.factStore.get(goal.key);
    if (existingFact !== undefined && this.matchesFactGoal(goal, existingFact.value)) {
      return { type: 'fact_exists', key: goal.key, currentValue: existingFact.value, satisfied: true };
    }

    // Find rules whose actions produce this fact.
    const rules = this.ruleManager.getByFactAction(goal.key);

    if (rules.length === 0) {
      if (existingFact !== undefined) {
        return { type: 'fact_exists', key: goal.key, currentValue: existingFact.value, satisfied: false };
      }
      return { type: 'unachievable', reason: 'no_rules' };
    }

    return this.tryRules(rules, visited, depth, state, (rule) => `rule:${rule.id}+fact:${goal.key}`);
  }

  // -------------------------------------------------------------------
  // Event goal
  // -------------------------------------------------------------------

  private evaluateEventGoal(
    goal: EventGoal,
    visited: Set<string>,
    depth: number,
    state: EvaluationState,
  ): ProofNode {
    if (depth >= this.maxDepth) {
      state.maxDepthReached = true;
      return { type: 'unachievable', reason: 'max_depth', details: `Reached depth ${depth}` };
    }

    const rules = this.ruleManager.getByEventAction(goal.topic);

    if (rules.length === 0) {
      return { type: 'unachievable', reason: 'no_rules' };
    }

    return this.tryRules(rules, visited, depth, state, (rule) => `rule:${rule.id}+event:${goal.topic}`);
  }

  // -------------------------------------------------------------------
  // Rule iteration (shared logic)
  // -------------------------------------------------------------------

  private tryRules(
    rules: Rule[],
    visited: Set<string>,
    depth: number,
    state: EvaluationState,
    visitKey: (rule: Rule) => string,
  ): ProofNode {
    let skippedByCycle = 0;
    let failedByCycle = 0;
    let evaluated = 0;

    for (const rule of rules) {
      if (state.exploredRules >= this.maxExploredRules) break;

      const key = visitKey(rule);

      if (visited.has(key)) {
        skippedByCycle++;
        continue;
      }

      visited.add(key);
      state.exploredRules++;

      const proof = this.evaluateRuleConditions(rule, visited, depth, state);

      visited.delete(key);

      if (proof.satisfied) {
        return proof;
      }

      evaluated++;

      // Check whether the failure was caused by a cycle in sub-goals.
      if (hasNestedCycle(proof)) {
        failedByCycle++;
      }
    }

    const totalFailed = skippedByCycle + evaluated;
    if (totalFailed > 0 && (skippedByCycle + failedByCycle) === totalFailed) {
      return { type: 'unachievable', reason: 'cycle_detected', details: `All ${totalFailed} candidate rules form a cycle` };
    }

    return { type: 'unachievable', reason: 'all_paths_failed' };
  }

  // -------------------------------------------------------------------
  // Condition evaluation within a rule
  // -------------------------------------------------------------------

  private evaluateRuleConditions(
    rule: Rule,
    visited: Set<string>,
    depth: number,
    state: EvaluationState,
  ): RuleProofNode {
    const { conditions } = rule;

    // Rule with no conditions is always satisfiable.
    if (conditions.length === 0) {
      return {
        type: 'rule',
        ruleId: rule.id,
        ruleName: rule.name,
        satisfied: true,
        conditions: [],
        children: [],
      };
    }

    const conditionProofs: ConditionProofNode[] = [];
    const children: ProofNode[] = [];
    let allSatisfied = true;

    // Minimal context — backward chaining has no triggering event.
    const context: EvaluationContext = {
      trigger: { type: 'fact', data: {} },
      facts: this.factStore,
      variables: new Map(),
    };

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i]!;

      // Evaluate with tracing callback to capture intermediate values.
      let evalResult: ConditionEvaluationResult | undefined;
      const satisfied = this.conditionEvaluator.evaluate(condition, context, i, {
        onConditionEvaluated: (r) => { evalResult = r; },
      });

      const conditionProof: ConditionProofNode = {
        source: describeSource(condition.source),
        operator: condition.operator,
        expectedValue: evalResult?.expectedValue ?? condition.value,
        actualValue: evalResult?.actualValue,
        satisfied,
      };

      // If a fact-based condition is unsatisfied AND the fact does not
      // exist yet, attempt backward chaining to discover whether a rule
      // chain could produce it.  When the fact already exists but
      // simply doesn't satisfy the comparison, recursion is pointless —
      // backward chaining cannot change existing values.
      if (!satisfied && condition.source.type === 'fact') {
        const existingFact = this.factStore.get(condition.source.pattern);
        if (existingFact === undefined) {
          const subGoal: FactGoal = { type: 'fact', key: condition.source.pattern };
          const subProof = this.evaluateFactGoal(subGoal, visited, depth + 1, state);
          children.push(subProof);

          if (isProofSatisfied(subProof)) {
            conditionProof.satisfied = true;
          }
        }
      }

      conditionProofs.push(conditionProof);

      if (!conditionProof.satisfied) {
        allSatisfied = false;
      }
    }

    return {
      type: 'rule',
      ruleId: rule.id,
      ruleName: rule.name,
      satisfied: allSatisfied,
      conditions: conditionProofs,
      children,
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private matchesFactGoal(goal: FactGoal, value: unknown): boolean {
    if (goal.value === undefined) return true;

    const op = goal.operator ?? 'eq';

    switch (op) {
      case 'eq':  return value === goal.value;
      case 'neq': return value !== goal.value;
      case 'gt':  return typeof value === 'number' && typeof goal.value === 'number' && value > goal.value;
      case 'gte': return typeof value === 'number' && typeof goal.value === 'number' && value >= goal.value;
      case 'lt':  return typeof value === 'number' && typeof goal.value === 'number' && value < goal.value;
      case 'lte': return typeof value === 'number' && typeof goal.value === 'number' && value <= goal.value;
    }
  }
}

// -------------------------------------------------------------------
// Pure helpers (module-private)
// -------------------------------------------------------------------

function isProofSatisfied(proof: ProofNode): boolean {
  switch (proof.type) {
    case 'fact_exists': return proof.satisfied;
    case 'rule':        return proof.satisfied;
    case 'unachievable': return false;
  }
}

function hasNestedCycle(proof: RuleProofNode): boolean {
  for (const child of proof.children) {
    if (child.type === 'unachievable' && child.reason === 'cycle_detected') return true;
    if (child.type === 'rule' && hasNestedCycle(child)) return true;
  }
  return false;
}

function describeSource(source: RuleCondition['source']): string {
  switch (source.type) {
    case 'fact':     return `fact:${source.pattern}`;
    case 'event':    return `event:${source.field}`;
    case 'context':  return `context:${source.key}`;
    case 'lookup':   return source.field ? `lookup:${source.name}.${source.field}` : `lookup:${source.name}`;
    case 'baseline': return `baseline:${source.metric}`;
  }
}
