# Priorita a poradi provadeni

Kdyz vice pravidel odpovida stejnemu triggeru, engine musi rozhodnout, ktere vyhodnotit prvni. Slevove pravidlo, ktere nastavuje fakt, mozna musi bezet pred notifikacnim pravidlem, ktere ho cte. Validacni pravidlo by melo odmitnou neplatna data pred tim, nez je zpracuji navazujici pravidla. Pole `priority` vam dava explicitni kontrolu nad poradim vyhodnoceni a nastaveni soubehu enginu vam umoznuji ladit, jak se triggery siri pravidlovymi retezci.

## Co se naucite

- Jak priorita ridi poradi vyhodnocovani pravidel
- Jak funguje retezeni pravidel, kdyz akce spousti dalsi pravidla
- Jak se vyhnout nekonecnym smyckam s `maxConcurrency`
- Jak `debounceMs` shlukuje rychle zmeny faktu
- Navrhove vzory pro predvidatelne vyhodnocovani pravidel

## Priorita

Kazde pravidlo ma pole `priority` — cislo, ktere urcuje poradi vyhodnoceni, kdyz vice pravidel odpovida stejnemu triggeru. **Vyssi priorita = vyhodnoceni drive**.

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, log, ref, event } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Validace bezi prvni (priorita 100)
engine.registerRule(
  Rule.create('validate-order')
    .name('Validace objednavky')
    .priority(100)
    .when(onEvent('order.created'))
    .if(event('total').lte(0))
    .then(emit('order.rejected', {
      orderId: ref('event.orderId'),
      reason: 'invalid-total',
    }))
    .build()
);

// Business logika bezi druha (priorita 50)
engine.registerRule(
  Rule.create('apply-discount')
    .name('Aplikace vernostni slevy')
    .priority(50)
    .when(onEvent('order.created'))
    .if(fact('customer:${event.customerId}:tier').eq('gold'))
    .then(setFact('order:${event.orderId}:discount', 0.1))
    .build()
);

// Notifikace bezi posledni (priorita 10)
engine.registerRule(
  Rule.create('notify-order')
    .name('Email s potvrzenim objednavky')
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
| **Typ** | Konecne cislo (`number`, bez `Infinity` nebo `NaN`) |
| **Vychozi** | `0` |
| **Smer** | Vyssi cislo = vyhodnoceni drive |
| **Rozsah platnosti** | Per-trigger — priorita ma vyznam pouze mezi pravidly sdilejicimi stejny trigger |
| **Shody** | Pravidla se stejnou prioritou nemaji zarucene poradi vuci sobe |

### Rozsahy priorit

Zadny vynuceny rozsah neexistuje, ale konzistentni konvence pomaha:

```text
  ┌────────────────┬───────────────────────────────────┐
  │  Priorita      │  Typicke pouziti                  │
  ├────────────────┼───────────────────────────────────┤
  │  100+          │  Validace, bezpecnostni kontroly  │
  │  50-99         │  Jadro business logiky            │
  │  10-49         │  Sekundarni efekty, vypocty       │
  │  1-9           │  Notifikace, logovani             │
  │  0 (vychozi)   │  Pravidla, kde poradi neni dulezite│
  │  zaporna       │  Uklid, fallback handlery         │
  └────────────────┴───────────────────────────────────┘
```

### Priorita ve fluent builderu

```typescript
Rule.create('my-rule')
  .priority(75)    // Musi byt konecne cislo
  .when(/* ... */)
  .then(/* ... */)
  .build()
```

Builder validuje hodnotu pri sestaveni:

```typescript
Rule.create('bad-priority')
  .priority(Infinity)  // Vyhodi DslValidationError: Priority must be a finite number
```

## Retezeni pravidel

Kdyz akce pravidla emituje event, nastavi fakt nebo spusti casovac, dalsi pravidla, ktera odpovidaji novemu triggeru, se vyhodnoti. Toto je **retezeni pravidel** — zname take jako dopredne retezeni (forward chaining).

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
  │ akce: setFact()     │──→ zmena faktu spusti dalsi pravidla
  └─────────────────────┘
       │                        │
       ▼                        ▼
  ┌─────────────────────┐  ┌──────────────────────┐
  │ notify-order         │  │ recalculate-total     │  spusteno
  │ priorita: 10        │  │ fakt: order:*:discount │  zmenou faktu
  └─────────────────────┘  └──────────────────────┘
```

Retezeni pravidel je mocne, ale vyzaduje opatrnost — retez akci muze spustit neomezenou kaskadu.

## Rizeni soubehu a kaskad

Konfigurace `RuleEngine.start()` poskytuje dva parametry pro spravu retezeni pravidel:

```typescript
const engine = await RuleEngine.start({
  maxConcurrency: 10,  // Max paralelnich vyhodnoceni pravidel (vychozi: 10)
  debounceMs: 0,       // Debounce pro triggery ze zmen faktu (vychozi: 0)
});
```

### maxConcurrency

Omezuje pocet vyhodnoceni pravidel, ktera mohou probihat soucasne. Toto zabranuje nekontrolovanym retezcum ve spotrebe neomezenych zdroju:

```typescript
const engine = await RuleEngine.start({
  maxConcurrency: 5,
});
```

Kdyz je limit dosazeny, dalsi zpracovani triggeru se zaradi do fronty a provede se po dokonceni drivejsich vyhodnoceni.

### debounceMs

Kdyz akce pravidla zmeni fakt a dalsi pravidlo se spusti na tento vzor faktu, `debounceMs` ridi, jak rychle se kaskadovy trigger spusti. Hodnota `0` znamena okamzite vyhodnoceni:

```typescript
const engine = await RuleEngine.start({
  debounceMs: 50,  // Pockat 50ms pred vyhodnocenim kaskadovych triggeru faktu
});
```

Toto je uzitecne, kdyz se vice faktu meni v rychlem sledu — debounce je shlukne do mensiho poctu vyhodnoceni triggeru.

## Vyhybani se nekonecnym smyckam

Nejcastejsi uskaili retezeni pravidel je nekonecna smycka: Pravidlo A nastavi fakt, Pravidlo B se spusti na tento fakt a emituje event, Pravidlo A se spusti na tento event a nastavi fakt znovu.

```text
  ┌─────────┐  setFact()  ┌─────────┐  emit()  ┌─────────┐
  │Pravidlo A│────────────▶│Pravidlo B│─────────▶│Pravidlo A│ ← smycka!
  └─────────┘             └─────────┘          └─────────┘
```

### Strategie prevence

**1. Pouzijte podminky k preruseni cyklu**

Nejjednodussi pristup — pridejte podminku, ktera se stane nepravdivou po prvni iteraci:

```typescript
// Pravidlo A: nastavit fakt pouze pokud jeste neni nastaven
engine.registerRule(
  Rule.create('calculate-total')
    .name('Vypocet celkove castky objednavky')
    .when(onEvent('order.items_changed'))
    .if(fact('order:${event.orderId}:totalCalculated').neq(true))
    .then(
      setFact('order:${event.orderId}:total', ref('event.newTotal')),
      setFact('order:${event.orderId}:totalCalculated', true),
    )
    .build()
);
```

**2. Pouzijte ruzne typy triggeru pro vyhnutise cyklum**

Strukturujte pravidla tak, aby pravidla spoustena fakty neprodukovala zmeny faktu, ktere spusti dalsi pravidla spoustena fakty:

```text
  Eventy  ──→  Pravidla  ──→  Fakta  ──→  Pravidla  ──→  Eventy (nebo sluzby)
                                                           (zadne dalsi zmeny faktu)
```

**3. Pouzijte prioritu k vynuceni jednosmerneho toku**

Pravidla s vyssi prioritou produkuji data, pravidla s nizsi prioritou je konzumuji:

```typescript
// Vysoka priorita: produkuje fakta
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

// Nizka priorita: konzumuje fakta, produkuje eventy (zadne dalsi zmeny faktu)
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

## Kompletni priklad: Pipeline zpracovani objednavek

Tento priklad ukazuje vrstveny pipeline pravidel s explicitnimi urovnemi priorit:

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

// ── Uroven 1: Validace (priorita 100) ─────────────────────

engine.registerRule(
  Rule.create('validate-order-amount')
    .name('Validace castky objednavky')
    .priority(100)
    .tags('validation', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').lte(0))
    .then(
      emit('order.invalid', {
        orderId: ref('event.orderId'),
        reason: 'Castka musi byt kladna',
      }),
      log('warn', 'Neplatna objednavka ${event.orderId}: nezaporna castka'),
    )
    .build()
);

// ── Uroven 2: Obohaceni (priorita 70) ─────────────────────

engine.registerRule(
  Rule.create('classify-order')
    .name('Klasifikace objednavky podle hodnoty')
    .priority(70)
    .tags('enrichment', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .then(setFact('order:${event.orderId}:tier',
      ref('event.total >= 500 ? "premium" : event.total >= 100 ? "standard" : "basic"'),
    ))
    .build()
);

// ── Uroven 3: Business logika (priorita 50) ───────────────

engine.registerRule(
  Rule.create('premium-express')
    .name('Premium objednavky dostanou expresni dopravu')
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

// ── Uroven 4: Vedlejsi efekty (priorita 10) ───────────────

engine.registerRule(
  Rule.create('order-confirmation')
    .name('Odeslani potvrzeni objednavky')
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

// ── Uroven 5: Monitoring (priorita -10) ────────────────────

engine.registerRule(
  Rule.create('log-order')
    .name('Logovani vsech objednavek')
    .priority(-10)
    .tags('monitoring', 'orders')
    .when(onEvent('order.created'))
    .then(log('info', 'Objednavka ${event.orderId} zpracovana (castka: ${event.total})'))
    .build()
);
```

## Cviceni

Mate tri pravidla, ktera zpracovavaji registraci uzivatele:

1. **Validace formatu emailu** — odmitnout neplatne emaily
2. **Vytvoreni uvitaciho bonusu** — dat novym uzivatelum 100 bodu
3. **Odeslani uvitaciho emailu** — odeslat potvrzovaci email pres externi sluzbu

Uvitaci email by mel obsahovat castku bonusu. Navrhete prioritu a strukturu triggeru tak, aby:
- Validace bezela prvni a mohla zabranit dalsimu zpracovani
- Bonus byl nastaven jako fakt pred tim, nez ho emailove pravidlo precte
- Nebyly mozne zadne nekonecne smycky

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, onFact, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Priorita 100: Validace — odmitnout spatne emaily, emitovat rejection event
engine.registerRule(
  Rule.create('validate-email')
    .name('Validace formatu emailu')
    .priority(100)
    .when(onEvent('user.registered'))
    .if(event('email').not_matches('^[^@]+@[^@]+\\.[^@]+$'))
    .then(emit('user.registration_rejected', {
      userId: ref('event.userId'),
      reason: 'invalid-email',
    }))
    .build()
);

// Priorita 50: Business logika — nastavit uvitaci bonus jako fakt
engine.registerRule(
  Rule.create('welcome-bonus')
    .name('Vytvoreni uvitaciho bonusu')
    .priority(50)
    .when(onEvent('user.registered'))
    .if(event('email').matches('^[^@]+@[^@]+\\.[^@]+$'))
    .then(setFact('user:${event.userId}:bonusPoints', 100))
    .build()
);

// Priorita 10: Notifikace — precte fakt bonusu, odesle email
// Spusti se na fakt nastaveny pravidlem welcome-bonus, ne na puvodni event.
// To zarucuje, ze bonus je nastaven pred odeslanim emailu.
engine.registerRule(
  Rule.create('welcome-email')
    .name('Odeslani uvitaciho emailu')
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

**Proc to funguje**:
- Validace (100) bezi prvni na `user.registered` — pokud je email neplatny, rejection event se emituje, ale nespusti zadne z nasich dalsich pravidel
- Uvitaci bonus (50) bezi druhy na `user.registered` — nastavi fakt
- Uvitaci email (10) se spusti na **zmenu faktu**, ne na event — je zaruceno, ze bonus existuje
- Zadne nekonecne smycky: eventy → fakta → volani sluzby (terminalni, zadne dalsi triggery)

</details>

## Shrnuti

- **Priorita** je konecne cislo; vyssi hodnoty znamenaji drivejsi vyhodnoceni mezi pravidly sdilejicimi stejny trigger
- Vychozi priorita je `0`; pouzivejte konzistentni rozsahy (100 pro validaci, 50 pro business logiku, 10 pro notifikace)
- Pravidla se stejnou prioritou nemaji zarucene vzajemne poradi
- **Retezeni pravidel** nastava, kdyz akce emituji eventy, nastavuji fakta nebo spousti casovace, ktere triggeruji dalsi pravidla
- `maxConcurrency` omezuje paralelni vyhodnoceni pravidel (vychozi: 10) pro zabraneni vycerpani zdroju
- `debounceMs` shlukuje rychle zmeny faktu pred spustenim zavislych pravidel
- Zabranujte nekonecnym smyckam pomoci podminek, oddelenim typu triggeru nebo vynucenim jednosmerneho toku dat pres urovne priorit

---

Dalsi: [Verzovani pravidel](./03-verzovani.md)
