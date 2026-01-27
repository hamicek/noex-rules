/** Matcher pro eventy v temporálních vzorech */
export interface EventMatcher {
  topic: string;                    // Topic pattern: "order.*", "payment.received"
  filter?: Record<string, unknown>; // Filtr na data: { status: 'failed' }
  as?: string;                      // Alias pro referenci v akcích
}

/** Sekvence - události musí přijít v daném pořadí */
export interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];           // Seznam očekávaných eventů
  within: string | number;          // Časové okno: "5m", "1h"
  groupBy?: string;                 // Seskupit podle pole (např. "orderId")
  strict?: boolean;                 // true = žádné jiné eventy mezi (default: false)
}

/** Absence - očekávaný event nepřišel */
export interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;              // Po tomto eventu...
  expected: EventMatcher;           // ...očekáváme tento event...
  within: string | number;          // ...do této doby
  groupBy?: string;
}

/** Počet - N výskytů eventu v časovém okně */
export interface CountPattern {
  type: 'count';
  event: EventMatcher;              // Jaký event počítáme
  threshold: number;                // Minimální počet
  comparison: 'gte' | 'lte' | 'eq'; // Porovnání (default: gte)
  window: string | number;          // Časové okno: "1m", "1h"
  groupBy?: string;
  sliding?: boolean;                // Klouzavé okno (default: false = tumbling)
}

/** Agregace - agregační funkce nad hodnotami v čase */
export interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;              // Jaký event agregujeme
  field: string;                    // Které pole agregujeme
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;                // Prahová hodnota
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
}

/** Temporální vzor - kombinace událostí v čase */
export type TemporalPattern =
  | SequencePattern      // A pak B pak C (v pořadí)
  | AbsencePattern       // A bez B (do určité doby)
  | CountPattern         // N výskytů X (v časovém okně)
  | AggregatePattern;    // Agregace hodnot (sum, avg, min, max)
