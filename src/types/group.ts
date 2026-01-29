/** Skupina pravidel se sdíleným životním cyklem */
export interface RuleGroup {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Vstup pro vytvoření skupiny (bez auto-generovaných polí) */
export interface RuleGroupInput {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean; // default true
}
