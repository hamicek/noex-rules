/** Fakt - statická hodnota v systému */
export interface Fact {
  key: string;              // Hierarchický klíč: "customer:123:age"
  value: unknown;           // Hodnota
  timestamp: number;        // Kdy byl nastaven
  source: string;           // Kdo ho nastavil
  version: number;          // Verze (pro optimistic locking)
}
