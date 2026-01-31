# Priorita a pořadí provádění

Když více pravidel odpovídá stejnému triggeru, engine musí rozhodnout, které vyhodnotit první. Slevové pravidlo, které nastavuje fakt, možná musí běžet před notifikačním pravidlem, které ho čte. Validační pravidlo by mělo odmítnout neplatná data před tím, než je zpracují navazující pravidla. Pole `priority` vám dává explicitní kontrolu nad pořadím vyhodnocení a nastavení souběhu enginu vám umožňují ladit, jak se triggery šíří pravidlovými řetězci.

## Co se naučíte

- Jak priorita řídí pořadí vyhodnocování pravidel
- Jak funguje řetězení pravidel, když akce spouští další pravidla
- Jak se vyhnout nekonečným smyčkám s `maxConcurrency`
- Jak `debounceMs` shlukuje rychlé změny faktů
- Návrhové vzory pro předvídatelné vyhodnocování pravidel

## Priorita

Každé pravidlo má pole `priority` — číslo, které určuje pořadí vyhodnocení, když více pravidel odpovídá stejnému triggeru. **Vyšší priorita = vyhodnocení dříve**.

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, log, ref, event } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Validace běží první (priorita 100)
engine.registerRule(
  Rule.create('validate-order')
    .name('Validace objednávky')
    .priority(100)
    .when(onEvent('order.created'))
    .if(event('total').lte(0))
    .then(emit('order.rejected', {
      orderId: ref('event.orderId'),
      reason: 'invalid-total',
    }))
    .build()
);

// Business logika běží druhá (priorita 50)
engine.registerRule(
  Rule.create('apply-discount')
    .name('Aplikace věrnostní slevy')
    .priority(50)
    .when(onEvent('order.created'))
    .if(fact('customer:${event.customerId}:tier').eq('gold'))
    .then(setFact('order:${event.orderId}:discount', 0.1))
    .build()
);

// Notifikace běží poslední (priorita 10)
engine.registerRule(
  Rule.create('notify-order')
    .name('Email s potvrzením objednávky')
    .priority(10)
    .when(onEvent('order.created'))
    .then(callService('emailService', 'send', {
      to: ref('event.customerId'),
      template: 'order-confirmation',
    }))
    .build()
);
```

### Vlastnosti priority

| Vlastnost | Hodnota |
|-----------|---------|
| **Typ** | Konečné číslo (`number`, bez `Infinity` nebo `NaN`) |
| **Výchozí** | `0` |
| **Směr** | Vyšší číslo = vyhodnocení dříve |
| **Rozsah platnosti** | Per-trigger — priorita má význam pouze mezi pravidly sdílejícími stejný trigger |
| **Shody** | Pravidla se stejnou prioritou nemají zaručené pořadí vůči sobě |

### Rozsahy priorit

Žádný vynucený rozsah neexistuje, ale konzistentní konvence pomáhá:

```text
  ┌────────────────┬───────────────────────────────────┐
  │  Priorita      │  Typické použití                  │
  ├────────────────┼───────────────────────────────────┤
  │  100+          │  Validace, bezpečnostní kontroly  │
  │  50-99         │  Jádro business logiky            │
  │  10-49         │  Sekundární efekty, výpočty       │
  │  1-9           │  Notifikace, logování             │
  │  0 (výchozí)   │  Pravidla, kde pořadí není důležité│
  │  záporná       │  Úklid, fallback handlery         │
  └────────────────┴───────────────────────────────────┘
```

### Priorita ve fluent builderu

```typescript
Rule.create('my-rule')
  .priority(75)    // Musí být konečné číslo
  .when(/* ... */)
  .then(/* ... */)
  .build()
```

Builder validuje hodnotu při sestavení:

```typescript
Rule.create('bad-priority')
  .priority(Infinity)  // Vyhodí DslValidationError: Priority must be a finite number
```

## Řetězení pravidel

Když akce pravidla emituje event, nastaví fakt nebo spustí časovač, další pravidla, která odpovídají novému triggeru, se vyhodnotí. Toto je **řetězení pravidel** — známé také jako dopředné řetězení (forward chaining).

```text
  Event: order.created
       │
       ▼
  ┌─────────────────────┐
  │ validate-order       │  priorita: 100
  │ (projde)            │
  └─────────────────────┘
       │
       ▼
  ┌─────────────────────┐
  │ apply-discount       │  priorita: 50
  │ akce: setFact()     │──→ změna faktu spustí další pravidla
  └─────────────────────┘
       │                        │
       ▼                        ▼
  ┌─────────────────────┐  ┌──────────────────────┐
  │ notify-order         │  │ recalculate-total     │  spuštěno
  │ priorita: 10        │  │ fakt: order:*:discount │  změnou faktu
  └─────────────────────┘  └──────────────────────┘
```

Řetězení pravidel je mocné, ale vyžaduje opatrnost — řetěz akcí může spustit neomezenou kaskádu.

## Řízení souběhu a kaskád

Konfigurace `RuleEngine.start()` poskytuje dva parametry pro správu řetězení pravidel:

```typescript
const engine = await RuleEngine.start({
  maxConcurrency: 10,  // Max paralelních vyhodnocení pravidel (výchozí: 10)
  debounceMs: 0,       // Debounce pro triggery ze změn faktů (výchozí: 0)
});
```

### maxConcurrency

Omezuje počet vyhodnocení pravidel, která mohou probíhat současně. Toto zabraňuje nekontrolovaným řetězcům ve spotřebě neomezených zdrojů:

```typescript
const engine = await RuleEngine.start({
  maxConcurrency: 5,
});
```

Když je limit dosažený, další zpracování triggerů se zařadí do fronty a provede se po dokončení dřívějších vyhodnocení.

### debounceMs

Když akce pravidla změní fakt a další pravidlo se spustí na tento vzor faktu, `debounceMs` řídí, jak rychle se kaskádový trigger spustí. Hodnota `0` znamená okamžité vyhodnocení:

```typescript
const engine = await RuleEngine.start({
  debounceMs: 50,  // Počkat 50ms před vyhodnocením kaskádových triggerů faktů
});
```

Toto je užitečné, když se více faktů mění v rychlém sledu — debounce je shlukne do menšího počtu vyhodnocení triggerů.

## Vyhýbání se nekonečným smyčkám

Nejčastější úskalí řetězení pravidel je nekonečná smyčka: Pravidlo A nastaví fakt, Pravidlo B se spustí na tento fakt a emituje event, Pravidlo A se spustí na tento event a nastaví fakt znovu.

```text
  ┌─────────┐  setFact()  ┌─────────┐  emit()  ┌─────────┐
  │Pravidlo A│────────────▶│Pravidlo B│─────────▶│Pravidlo A│ ← smyčka!
  └─────────┘             └─────────┘          └─────────┘
```

### Strategie prevence

**1. Použijte podmínky k přerušení cyklu**

Nejjednodušší přístup — přidejte podmínku, která se stane nepravdivou po první iteraci:

```typescript
// Pravidlo A: nastavit fakt pouze pokud ještě není nastaven
engine.registerRule(
  Rule.create('calculate-total')
    .name('Výpočet celkové částky objednávky')
    .when(onEvent('order.items_changed'))
    .if(fact('order:${event.orderId}:totalCalculated').neq(true))
    .then(
      setFact('order:${event.orderId}:total', ref('event.newTotal')),
      setFact('order:${event.orderId}:totalCalculated', true),
    )
    .build()
);
```

**2. Použijte různé typy triggerů pro vyhnutí se cyklům**

Strukturujte pravidla tak, aby pravidla spouštěná fakty neprodukovala změny faktů, které spustí další pravidla spouštěná fakty:

```text
  Eventy  ──→  Pravidla  ──→  Fakta  ──→  Pravidla  ──→  Eventy (nebo služby)
                                                           (žádné další změny faktů)
```

**3. Použijte prioritu k vynucení jednosměrného toku**

Pravidla s vyšší prioritou produkují data, pravidla s nižší prioritou je konzumují:

```typescript
// Vysoká priorita: produkuje fakta
engine.registerRule(
  Rule.create('enrich-order')
    .priority(80)
    .when(onEvent('order.created'))
    .then(
      setFact('order:${event.orderId}:region', ref('event.region')),
      setFact('order:${event.orderId}:currency', ref('event.currency')),
    )
    .build()
);

// Nízká priorita: konzumuje fakta, produkuje eventy (žádné další změny faktů)
engine.registerRule(
  Rule.create('route-order')
    .priority(20)
    .when(onEvent('order.created'))
    .if(fact('order:${event.orderId}:region').eq('EU'))
    .then(emit('order.routed', {
      orderId: ref('event.orderId'),
      warehouse: 'eu-central',
    }))
    .build()
);
```

## Kompletní příklad: Pipeline zpracování objednávek

Tento příklad ukazuje vrstvený pipeline pravidel s explicitními úrovněmi priorit:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, setFact, emit, log, setTimer,
  ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  maxConcurrency: 10,
  debounceMs: 0,
});

// ── Úroveň 1: Validace (priorita 100) ─────────────────────

engine.registerRule(
  Rule.create('validate-order-amount')
    .name('Validace částky objednávky')
    .priority(100)
    .tags('validation', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').lte(0))
    .then(
      emit('order.invalid', {
        orderId: ref('event.orderId'),
        reason: 'Částka musí být kladná',
      }),
      log('warn', 'Neplatná objednávka ${event.orderId}: nezáporná částka'),
    )
    .build()
);

// ── Úroveň 2: Obohacení (priorita 70) ─────────────────────

engine.registerRule(
  Rule.create('classify-order')
    .name('Klasifikace objednávky podle hodnoty')
    .priority(70)
    .tags('enrichment', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .then(setFact('order:${event.orderId}:tier',
      ref('event.total >= 500 ? "premium" : event.total >= 100 ? "standard" : "basic"'),
    ))
    .build()
);

// ── Úroveň 3: Business logika (priorita 50) ───────────────

engine.registerRule(
  Rule.create('premium-express')
    .name('Premium objednávky dostanou expresní dopravu')
    .priority(50)
    .tags('shipping', 'orders')
    .when(onFact('order:*:tier'))
    .if(fact('${trigger.key}').eq('premium'))
    .then(setFact(
      'order:${trigger.key.split(":")[1]}:shipping',
      'express',
    ))
    .build()
);

// ── Úroveň 4: Vedlejší efekty (priorita 10) ───────────────

engine.registerRule(
  Rule.create('order-confirmation')
    .name('Odeslání potvrzení objednávky')
    .priority(10)
    .tags('notifications', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .then(emit('notification.send', {
      type: 'order-confirmation',
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
    }))
    .build()
);

// ── Úroveň 5: Monitoring (priorita -10) ────────────────────

engine.registerRule(
  Rule.create('log-order')
    .name('Logování všech objednávek')
    .priority(-10)
    .tags('monitoring', 'orders')
    .when(onEvent('order.created'))
    .then(log('info', 'Objednávka ${event.orderId} zpracována (částka: ${event.total})'))
    .build()
);
```

## Cvičení

Máte tři pravidla, která zpracovávají registraci uživatele:

1. **Validace formátu emailu** — odmítnout neplatné emaily
2. **Vytvoření uvítacího bonusu** — dát novým uživatelům 100 bodů
3. **Odeslání uvítacího emailu** — odeslat potvrzovací email přes externí službu

Uvítací email by měl obsahovat částku bonusu. Navrhněte prioritu a strukturu triggerů tak, aby:
- Validace běžela první a mohla zabránit dalšímu zpracování
- Bonus byl nastaven jako fakt před tím, než ho emailové pravidlo přečte
- Nebyly možné žádné nekonečné smyčky

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, onFact, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Priorita 100: Validace — odmítnout špatné emaily, emitovat rejection event
engine.registerRule(
  Rule.create('validate-email')
    .name('Validace formátu emailu')
    .priority(100)
    .when(onEvent('user.registered'))
    .if(event('email').not_matches('^[^@]+@[^@]+\\.[^@]+$'))
    .then(emit('user.registration_rejected', {
      userId: ref('event.userId'),
      reason: 'invalid-email',
    }))
    .build()
);

// Priorita 50: Business logika — nastavit uvítací bonus jako fakt
engine.registerRule(
  Rule.create('welcome-bonus')
    .name('Vytvoření uvítacího bonusu')
    .priority(50)
    .when(onEvent('user.registered'))
    .if(event('email').matches('^[^@]+@[^@]+\\.[^@]+$'))
    .then(setFact('user:${event.userId}:bonusPoints', 100))
    .build()
);

// Priorita 10: Notifikace — přečte fakt bonusu, odešle email
// Spustí se na fakt nastavený pravidlem welcome-bonus, ne na původní event.
// To zaručuje, že bonus je nastaven před odesláním emailu.
engine.registerRule(
  Rule.create('welcome-email')
    .name('Odeslání uvítacího emailu')
    .priority(10)
    .when(onFact('user:*:bonusPoints'))
    .then(callService('emailService', 'send', {
      to: ref('trigger.key').replace(':bonusPoints', ''),
      template: 'welcome',
      bonusPoints: ref('trigger.value'),
    }))
    .build()
);
```

**Proč to funguje**:
- Validace (100) běží první na `user.registered` — pokud je email neplatný, rejection event se emituje, ale nespustí žádné z našich dalších pravidel
- Uvítací bonus (50) běží druhý na `user.registered` — nastaví fakt
- Uvítací email (10) se spustí na **změnu faktu**, ne na event — je zaručeno, že bonus existuje
- Žádné nekonečné smyčky: eventy → fakta → volání služby (terminální, žádné další triggery)

</details>

## Shrnutí

- **Priorita** je konečné číslo; vyšší hodnoty znamenají dřívější vyhodnocení mezi pravidly sdílejícími stejný trigger
- Výchozí priorita je `0`; používejte konzistentní rozsahy (100 pro validaci, 50 pro business logiku, 10 pro notifikace)
- Pravidla se stejnou prioritou nemají zaručené vzájemné pořadí
- **Řetězení pravidel** nastává, když akce emitují eventy, nastavují fakta nebo spouští časovače, které triggerují další pravidla
- `maxConcurrency` omezuje paralelní vyhodnocení pravidel (výchozí: 10) pro zabránění vyčerpání zdrojů
- `debounceMs` shlukuje rychlé změny faktů před spuštěním závislých pravidel
- Zabraňujte nekonečným smyčkám pomocí podmínek, oddělením typů triggerů nebo vynucením jednosměrného toku dat přes úrovně priorit

---

Další: [Verzování pravidel](./03-verzovani.md)
