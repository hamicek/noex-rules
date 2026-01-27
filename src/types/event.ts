/** Event - něco se stalo */
export interface Event {
  id: string;               // Unikátní ID eventu
  topic: string;            // Téma: "order.created", "payment.received"
  data: Record<string, unknown>;  // Payload
  timestamp: number;        // Kdy se to stalo
  correlationId?: string | undefined;   // Pro spojení souvisejících eventů
  causationId?: string | undefined;     // ID eventu, který tento způsobil
  source: string;           // Původce
}
