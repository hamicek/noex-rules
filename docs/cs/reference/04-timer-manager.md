# TimerManager

Plánování časovačů s podporou opakování a trvalé persistence. Používá se interně v RuleEngine pro naplánované akce; přístup přes `engine.getTimerManager()` pro debugging nebo manuální správu timerů.

## Import

```typescript
import { TimerManager } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: TimerManagerConfig): Promise<TimerManager>
```

Vytvoří novou instanci TimerManager. Bez adaptéru používá in-memory setTimeout (netrvalé). S adaptérem používá DurableTimerService z `@hamicek/noex` pro timery, které přežijí restart procesu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `TimerManagerConfig` | ne | Konfigurace manageru |

**Návratová hodnota:** `Promise<TimerManager>` — instance manageru

**Příklad:**

```typescript
// In-memory režim (netrvalý)
const manager = await TimerManager.start();

// Durable režim (přežije restart)
const manager = await TimerManager.start({
  adapter: new FileAdapter('./data'),
  checkIntervalMs: 1000,
});
```

---

## Metody

### onExpire()

```typescript
onExpire(callback: TimerCallback): void
```

Registruje callback volaný při expiraci libovolného timeru. Může být registrován pouze jeden callback; další volání nahradí předchozí.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| callback | `TimerCallback` | ano | Funkce volaná při expiraci |

**Návratová hodnota:** `void`

**Příklad:**

```typescript
manager.onExpire(async (timer) => {
  console.log(`Timer ${timer.name} expiroval`);
  await processExpiredTimer(timer);
});
```

### setTimer()

```typescript
async setTimer(config: TimerConfig, correlationId?: string): Promise<Timer>
```

Vytvoří nový timer. Pokud timer se stejným jménem již existuje, je nejprve zrušen.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `TimerConfig` | ano | Konfigurace timeru |
| correlationId | `string` | ne | Volitelné ID pro korelační tracking |

**Návratová hodnota:** `Promise<Timer>` — vytvořený timer

**Příklad:**

```typescript
// Jednorázový timer
const timer = await manager.setTimer({
  name: 'payment-timeout:ORD-123',
  duration: '15m',
  onExpire: {
    topic: 'payment.timeout',
    data: { orderId: 'ORD-123' },
  },
});

// Opakující se timer s limitem
const heartbeat = await manager.setTimer({
  name: 'session-heartbeat:user-abc',
  duration: '30s',
  onExpire: {
    topic: 'session.heartbeat',
    data: { userId: 'user-abc' },
  },
  repeat: {
    interval: '30s',
    maxCount: 10,
  },
});
```

### cancelTimer()

```typescript
async cancelTimer(name: string): Promise<boolean>
```

Zruší timer podle jména.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Jméno timeru |

**Návratová hodnota:** `Promise<boolean>` — true pokud byl timer nalezen a zrušen

**Příklad:**

```typescript
const cancelled = await manager.cancelTimer('payment-timeout:ORD-123');
if (cancelled) {
  console.log('Timer zrušen');
}
```

### getTimer()

```typescript
getTimer(name: string): Timer | undefined
```

Vrátí timer podle jména.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Jméno timeru |

**Návratová hodnota:** `Timer | undefined` — timer nebo undefined pokud nenalezen

**Příklad:**

```typescript
const timer = manager.getTimer('payment-timeout:ORD-123');
if (timer) {
  const remaining = timer.expiresAt - Date.now();
  console.log(`Expiruje za ${remaining}ms`);
}
```

### getAll()

```typescript
getAll(): Timer[]
```

Vrátí všechny aktivní timery.

**Návratová hodnota:** `Timer[]` — pole aktivních timerů

**Příklad:**

```typescript
const timers = manager.getAll();
console.log(`Aktivní timery: ${timers.length}`);
for (const timer of timers) {
  console.log(`- ${timer.name}: expiruje ${new Date(timer.expiresAt)}`);
}
```

### stop()

```typescript
async stop(): Promise<void>
```

Zastaví všechny timery a uvolní zdroje. V durable režimu také zastaví podkladový DurableTimerService.

**Návratová hodnota:** `Promise<void>`

**Příklad:**

```typescript
await manager.stop();
```

---

## Vlastnosti

### size

```typescript
get size(): number
```

Vrátí počet aktivních timerů.

**Příklad:**

```typescript
console.log(`Aktivní timery: ${manager.size}`);
```

---

## Typy

### Timer

```typescript
interface Timer {
  id: string;
  name: string;
  expiresAt: number;
  onExpire: {
    topic: string;
    data: Record<string, unknown>;
  };
  repeat?: {
    interval: number;
    maxCount?: number;
  };
  correlationId?: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| id | `string` | Unikátní identifikátor timeru |
| name | `string` | Logické jméno pro vyhledání a zrušení |
| expiresAt | `number` | Unix timestamp expirace timeru |
| onExpire.topic | `string` | Topic události emitované při expiraci |
| onExpire.data | `Record<string, unknown>` | Payload události |
| repeat.interval | `number` | Interval opakování v milisekundách |
| repeat.maxCount | `number` | Maximální počet opakování (undefined = nekonečno) |
| correlationId | `string` | Volitelné korelační ID pro tracking |

### TimerConfig

```typescript
interface TimerConfig {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data: Record<string, unknown | { ref: string }>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Unikátní jméno timeru (pro zrušení) |
| duration | `string \| number` | Doba do expirace (viz Syntaxe doby trvání) |
| onExpire.topic | `string` | Topic události k emitování |
| onExpire.data | `Record<string, unknown>` | Payload události (podporuje `{ ref: string }` pro dynamické hodnoty) |
| repeat.interval | `string \| number` | Interval opakování (viz Syntaxe doby trvání) |
| repeat.maxCount | `number` | Maximální počet opakování |

### TimerManagerConfig

```typescript
interface TimerManagerConfig {
  adapter?: StorageAdapter;
  checkIntervalMs?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Storage adaptér pro durable režim |
| checkIntervalMs | `number` | `1000` | Interval kontroly expirovaných timerů (durable režim) |

### TimerCallback

```typescript
type TimerCallback = (timer: Timer) => void | Promise<void>;
```

Callback funkce volaná při expiraci timeru.

---

## Syntaxe doby trvání

Doby trvání lze specifikovat jako číslo (milisekundy) nebo jako string s jednotkou:

| Jednotka | Význam | Příklad | Milisekundy |
|----------|--------|---------|-------------|
| `ms` | Milisekundy | `500ms` | 500 |
| `s` | Sekundy | `30s` | 30 000 |
| `m` | Minuty | `15m` | 900 000 |
| `h` | Hodiny | `2h` | 7 200 000 |
| `d` | Dny | `7d` | 604 800 000 |
| `w` | Týdny | `1w` | 604 800 000 |
| `y` | Roky | `1y` | 31 536 000 000 |

**Příklady:**

```typescript
'30s'    // 30 sekund
'15m'    // 15 minut
'2h'     // 2 hodiny
'7d'     // 7 dní
5000     // 5000 milisekund
```

---

## Režimy provozu

### In-Memory režim (výchozí)

Bez storage adaptéru používá TimerManager `setTimeout` pro plánování:

- Timery jsou ztraceny při restartu procesu
- Vhodné pro vývoj a krátkodobé procesy
- Nižší režie

```typescript
const manager = await TimerManager.start();
```

### Durable režim

Se storage adaptérem používá TimerManager DurableTimerService z `@hamicek/noex`:

- Timery přežijí restart procesu
- Vhodné pro produkční zátěž
- Automatická obnova při startu

```typescript
import { FileAdapter } from '@hamicek/noex';

const manager = await TimerManager.start({
  adapter: new FileAdapter('./data/timers'),
  checkIntervalMs: 500, // Kontrola každých 500ms
});
```

**Chování při obnově:**

Při startu v durable režimu TimerManager:
1. Načte persistovaná metadata timerů
2. Přeplánuje timery se správným zbývajícím časem
3. Pokračuje tam, kde skončil

---

## Konvence pojmenování timerů

Používejte popisná jména s identifikátory kontextu pro snadnou správu:

```typescript
// Vzor: {účel}:{id-entity}
'payment-timeout:ORD-123'
'session-heartbeat:user-abc'
'retry:webhook:hook-456'
'escalation:ticket-789'
```

To umožňuje:
- Snadné vyhledání: `manager.getTimer('payment-timeout:ORD-123')`
- Snadné zrušení: `manager.cancelTimer('payment-timeout:ORD-123')`
- Debugging: jasné pochopení účelu každého timeru

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor
- [DSL Akce](./12-dsl-actions.md) — setTimer() a cancelTimer() akce
- [Časovače](../learn/05-timers-persistence/01-timers.md) — Tutoriál
