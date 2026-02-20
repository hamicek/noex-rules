/** Timer - naplánovaný časovač */
export interface Timer {
  id: string;               // Unikátní ID
  name: string;             // Pojmenování pro cancel: "payment-timeout:order123"
  expiresAt: number;        // Kdy expiruje (next fire time)
  onExpire: {               // Co se stane při expiraci
    topic: string;          // Event topic
    data: Record<string, unknown>;
  };
  repeat?: {                // Opakování (volitelné)
    interval: number;       // Interval v ms
    maxCount?: number | undefined;      // Max počet opakování
  } | undefined;
  cron?: string | undefined;            // Cron výraz ("0 8 * * MON")
  correlationId?: string | undefined;   // Pro spojení s původním kontextem
}

/** Metadata persistovaná vedle DurableTimerService záznamu */
export interface TimerMetadata {
  /** Logické jméno timeru (klíč pro cancel/lookup) */
  name: string;
  /** ID záznamu v DurableTimerService */
  durableTimerId: string;
  /** ID Timer objektu v TimerManager */
  timerId: string;
  /** Akce při expiraci */
  onExpire: { topic: string; data: Record<string, unknown> };
  /** Korelační ID pro spojení s původním kontextem */
  correlationId?: string;
  /** Maximální počet opakování */
  maxCount?: number;
  /** Kolikrát již timer expiroval */
  fireCount: number;
  /** Interval opakování v ms (undefined = one-shot) */
  repeatIntervalMs?: number;
  /** Cron výraz pro plánování */
  cronExpression?: string;
}

/** Konfigurace timeru */
export interface TimerConfig {
  name: string;                                // Pro pozdější cancel
  duration?: string | number | undefined;      // "15m", "24h", "7d" nebo ms (povinné bez cron)
  onExpire: {
    topic: string;
    data: Record<string, unknown | { ref: string }>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number | undefined;
  } | undefined;
  cron?: string | undefined;                   // Cron výraz ("0 8 * * MON")
  maxCount?: number | undefined;               // Max počet spuštění (pro cron timery)
}
