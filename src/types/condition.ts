/** Podmínka pravidla */
export interface RuleCondition {
  // Co kontrolujeme
  source:
    | { type: 'fact'; pattern: string }                    // Hodnota faktu
    | { type: 'event'; field: string }                     // Pole z triggering eventu
    | { type: 'context'; key: string }                     // Kontext (proměnné)
    | { type: 'lookup'; name: string; field?: string };    // Výsledek externího lookupu

  // Operátor
  operator:
    | 'eq' | 'neq'                              // Rovnost
    | 'gt' | 'gte' | 'lt' | 'lte'              // Porovnání
    | 'in' | 'not_in'                          // Seznam
    | 'contains' | 'not_contains'              // Řetězce/pole
    | 'matches'                                 // Regex
    | 'exists' | 'not_exists';                 // Existence

  // Hodnota pro porovnání
  value: unknown | { ref: string };             // Literál nebo reference na jinou hodnotu
}
