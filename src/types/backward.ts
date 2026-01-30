/** Cíl pro backward chaining query */
export type Goal =
  | FactGoal
  | EventGoal;

/** Cíl: ověření faktu */
export interface FactGoal {
  type: 'fact';
  key: string;                                            // Klíč faktu (pattern)
  value?: unknown;                                        // Očekávaná hodnota (undefined = existence)
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';  // Výchozí: 'eq'
}

/** Cíl: emise eventu */
export interface EventGoal {
  type: 'event';
  topic: string;                                          // Event topic
}

/** Výsledek backward chaining query */
export interface QueryResult {
  goal: Goal;
  achievable: boolean;
  proof: ProofNode;
  exploredRules: number;
  maxDepthReached: boolean;
  durationMs: number;
}

/** Uzel v důkazovém stromu */
export type ProofNode =
  | FactExistsNode
  | RuleProofNode
  | UnachievableNode;

/** Fakt již existuje ve store */
export interface FactExistsNode {
  type: 'fact_exists';
  key: string;
  currentValue: unknown;
  satisfied: boolean;
}

/** Pravidlo v důkazovém stromu */
export interface RuleProofNode {
  type: 'rule';
  ruleId: string;
  ruleName: string;
  satisfied: boolean;
  conditions: ConditionProofNode[];
  children: ProofNode[];                                  // Rekurzivní sub-goals
}

/** Podmínka v důkazovém stromu */
export interface ConditionProofNode {
  source: string;                                         // Lidsky čitelný popis zdroje
  operator: string;
  expectedValue: unknown;
  actualValue: unknown;
  satisfied: boolean;
}

/** Cíl je nedosažitelný */
export interface UnachievableNode {
  type: 'unachievable';
  reason: 'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed';
  details?: string;
}

/** Konfigurace backward chaining */
export interface BackwardChainingConfig {
  maxDepth?: number;                                      // Výchozí: 10
  maxExploredRules?: number;                              // Výchozí: 100
}
