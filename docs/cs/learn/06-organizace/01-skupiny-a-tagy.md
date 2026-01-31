# Skupiny a tagy pravidel

Kdyz vas pravidlovy engine preroste hrstku pravidel, potrebujete zpusob, jak je spravovat jako logicke celky. Vypnuti funkce by nemelo znamenat hledani a zakazovani 12 jednotlivych pravidel. Spusteni A/B testu by nemelo vyzadovat sledovani, ktera pravidla patri k variante A. Skupiny pravidel vam davaji **hlavni prepinac** pro sady souvisejicich pravidel a tagy vam davaji **flexibilni system stitku** pro prurezeove koncerny.

## Co se naucite

- Jak vytvaret a spravovat skupiny pravidel
- Semantiku `isRuleActive()` a dvouurovnovy model povoleni/zakazani
- Jak prirazovat pravidla ke skupinam pomoci fluent builderu
- Jak pouzivat tagy pro kategorizaci a filtrovani
- Prakticke vzory: feature flagy, A/B testovani, prostredove pravidla

## Skupiny pravidel

Skupina pravidel je pojmenovany kontejner s priznakem `enabled`. Kdyz je skupina zakazana, **vsechna pravidla v teto skupine jsou deaktivovana** — bez ohledu na jejich individualni stav `enabled`.

### Rozhrani RuleGroup

```typescript
interface RuleGroup {
  id: string;          // Unikatni identifikator
  name: string;        // Lidsky citelny nazev
  description?: string;
  enabled: boolean;    // Hlavni prepinac
  createdAt: number;
  updatedAt: number;
}
```

### Vytvareni a sprava skupin

Skupiny musi byt vytvoreny pred tim, nez na ne mohou pravidla odkazovat:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, log } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Vytvoreni skupiny
const group = engine.createGroup({
  id: 'holiday-promotions',
  name: 'Prazdninove akce',
  description: 'Sezonni ceny a slevova pravidla',
  enabled: true,
});

// Registrace pravidla ve skupine
engine.registerRule(
  Rule.create('holiday-discount')
    .name('Prazdninova sleva 20%')
    .group('holiday-promotions')
    .when(onEvent('order.created'))
    .if(event('total').gte(50))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.2,
    }))
    .build()
);

// Registrace dalsiho pravidla ve stejne skupine
engine.registerRule(
  Rule.create('holiday-free-shipping')
    .name('Prazdninove doprava zdarma')
    .group('holiday-promotions')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:freeShipping', true))
    .build()
);
```

### Zivotni cyklus skupiny

```text
  createGroup()         enableGroup()         deleteGroup()
       │                     │                     │
       ▼                     ▼                     ▼
  ┌─────────┐          ┌─────────┐          ┌─────────────┐
  │ enabled │──────────▶│ enabled │          │   smazana   │
  │  true   │          │  true   │          │ pravidla se │
  └─────────┘          └─────────┘          │ odseskupi   │
       │                     ▲               └─────────────┘
       │ disableGroup()      │                     ▲
       ▼                     │                     │
  ┌─────────┐               │                     │
  │ enabled │───────────────┘                      │
  │  false  │──────────────────────────────────────┘
  └─────────┘
```

**Klicove chovani**:
- `createGroup()` — Vytvori novou skupinu. Vyhodi vyjimku, pokud ID jiz existuje. Vychozi: `enabled: true`.
- `enableGroup(id)` / `disableGroup(id)` — Prepina hlavni prepinac. Ovlivni vsechna pravidla ve skupine okamzite.
- `deleteGroup(id)` — Odstrani skupinu. Pravidla, ktera do ni patrila, se stanou **neseskupenymi** (jejich pole `group` se vymaze), nejsou smazana.
- `updateGroup(id, updates)` — Aktualizuje nazev, popis nebo stav enabled.
- `getGroup(id)` — Vrati skupinu, nebo `undefined`.
- `getGroups()` — Vrati vsechny skupiny.
- `getGroupRules(id)` — Vrati vsechna pravidla prirazena ke skupine.

### Zakazani skupiny

```typescript
// Prazdninova sezona skoncila — zakazat vsechna prazdninova pravidla najednou
engine.disableGroup('holiday-promotions');

// Obe pravidla 'holiday-discount' i 'holiday-free-shipping' jsou nyni neaktivni.
// Nespusti se, i kdyz jejich individualni priznak enabled je stale true.
```

### Smazani skupiny

```typescript
// Uplne odstranit skupinu
engine.deleteGroup('holiday-promotions');

// Pravidla NEJSOU smazana — stanou se neseskupenymi.
// 'holiday-discount' a 'holiday-free-shipping' jsou nyni zase aktivni
// (za predpokladu, ze jejich individualni priznak enabled je true).
```

## Dvouurovnovy model povoleni/zakazani

Engine pouziva dvouurovnovou kontrolu aktivace. Pravidlo se spusti pouze tehdy, kdyz jsou **obe** urovne aktivni:

```text
  isRuleActive(rule)?
       │
       ├── rule.enabled === false?  ──→  NEAKTIVNI
       │
       ├── rule.group existuje?
       │      │
       │      ├── group.enabled === false?  ──→  NEAKTIVNI
       │      │
       │      └── group.enabled === true?   ──→  AKTIVNI
       │
       └── bez skupiny?  ──→  AKTIVNI
```

Implementace je primocare:

```typescript
isRuleActive(rule: Rule): boolean {
  if (!rule.enabled) return false;
  if (rule.group) {
    const group = this.groups.get(rule.group);
    if (group && !group.enabled) return false;
  }
  return true;
}
```

To znamena:

| `rule.enabled` | Skupina existuje? | `group.enabled` | Vysledek |
|:-:|:-:|:-:|:-:|
| `false` | — | — | **Neaktivni** |
| `true` | Ne | — | **Aktivni** |
| `true` | Ano | `true` | **Aktivni** |
| `true` | Ano | `false` | **Neaktivni** |

### Proc dve urovne?

Dvouurovnovy model vam umozni zakazat jednotliva pravidla pro debugging, zatimco skupina zustane aktivni, **a zaroven** zakazat cele skupiny pro spravu funkci bez zasahu do jednotlivych pravidel:

```typescript
// Debug: zakazat jedno problematicke pravidlo bez ovlivneni skupiny
engine.disableRule('holiday-discount');
// 'holiday-free-shipping' stale funguje

// Feature flag: zakazat celou funkci
engine.disableGroup('holiday-promotions');
// Vsechna pravidla se zastavi, bez ohledu na jejich individualni stav

// Znovu povolit skupinu — 'holiday-free-shipping' opet funguje,
// ale 'holiday-discount' zustava zakazano (jeho vlastni priznak je stale false)
engine.enableGroup('holiday-promotions');
```

## Tagy

Tagy jsou textove stitky pripojene k jednotlivym pravidlum. Na rozdil od skupin nemaji tagy zadny vestavenou efekt na chovani — jsou to metadata pro **kategorizaci, filtrovani a dotazovani**.

### Prirazovani tagu

```typescript
engine.registerRule(
  Rule.create('fraud-velocity-check')
    .name('Kontrola rychlosti transakci')
    .tags('fraud', 'security', 'payments')
    .when(onEvent('transaction.created'))
    .if(event('amount').gte(1000))
    .then(emit('fraud.check_required', {
      transactionId: ref('event.transactionId'),
    }))
    .build()
);
```

Tagy jsou ulozeny jako pole na pravidle: `tags: string[]`. Pravidlo muze mit nula nebo vice tagu.

### Tagy vs skupiny

| Aspekt | Skupiny | Tagy |
|--------|---------|------|
| **Kardinalita** | Pravidlo patri do **nejvyse jedne** skupiny | Pravidlo muze mit **libovolny pocet** tagu |
| **Efekt na chovani** | Zakazani skupiny deaktivuje jeji pravidla | Zadny vestavenou efekt na aktivaci pravidel |
| **Ucel** | Sprava zivotniho cyklu (povoleni/zakazani sad pravidel) | Kategorizace, filtrovani, dokumentace |
| **Hierarchie** | Plocha (zadne vnorene skupiny) | Plocha (zadna hierarchie tagu) |

### Kdy pouzit co

Pouzijte **skupiny** kdyz potrebujete:
- Povolit/zakazat vice pravidel jednim volanim
- Implementovat feature flagy nebo A/B testovani
- Oddelit pravidla podle prostredi nasazeni

Pouzijte **tagy** kdyz potrebujete:
- Kategorizovat pravidla ve vice dimenzich
- Filtrovat pravidla v API dotazech nebo admin rozhranich
- Zdokumentovat ucel pravidla (napr. `'security'`, `'billing'`, `'notifications'`)

Muzete kombinovat oboji — pravidlo muze patrit do skupiny **a** mit tagy:

```typescript
engine.registerRule(
  Rule.create('beta-fraud-ml')
    .name('ML detekce podvodu (Beta)')
    .group('beta-features')
    .tags('fraud', 'ml', 'beta')
    .when(onEvent('transaction.created'))
    .then(callService('mlFraudService', 'analyze', {
      data: ref('event'),
    }))
    .build()
);
```

## Kompletni priklad: Feature flagy se skupinami

Bezny vzor je pouziti skupin jako feature flagu. Tento priklad spravuje e-commerce doporucovaci engine, ktery lze prepnout:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, onFact, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Vytvoreni skupiny pro funkci
engine.createGroup({
  id: 'recommendations',
  name: 'Doporuceni produktu',
  description: 'Pravidla pro AI doporuceni produktu',
  enabled: true,
});

// Pravidlo 1: Sledovani prohlizeni
engine.registerRule(
  Rule.create('track-browse')
    .name('Sledovani prohlizeni produktu')
    .group('recommendations')
    .tags('recommendations', 'tracking')
    .when(onEvent('product.viewed'))
    .then(setFact(
      'customer:${event.customerId}:lastViewed',
      ref('event.productId')
    ))
    .build()
);

// Pravidlo 2: Doporuceni na zaklade historie nakupu
engine.registerRule(
  Rule.create('cross-sell')
    .name('Cross-sell doporuceni')
    .group('recommendations')
    .tags('recommendations', 'sales')
    .priority(5)
    .when(onEvent('order.completed'))
    .then(emit('recommendation.generate', {
      customerId: ref('event.customerId'),
      type: 'cross-sell',
      basedOn: ref('event.items'),
    }))
    .build()
);

// Pravidlo 3: Odeslani doporucovaciho emailu
engine.registerRule(
  Rule.create('recommend-email')
    .name('Email s doporucenim')
    .group('recommendations')
    .tags('recommendations', 'email')
    .priority(1)
    .when(onEvent('recommendation.generated'))
    .then(callService('emailService', 'send', {
      to: ref('event.customerId'),
      template: 'recommendation',
      products: ref('event.products'),
    }))
    .build()
);

// --- Sprava funkce ---

// Zjistit, ktera pravidla jsou ve skupine
const rules = engine.getGroupRules('recommendations');
console.log(`Pravidla doporuceni: ${rules.length}`);
// Pravidla doporuceni: 3

// Zakazat funkci behem nasazeni
engine.disableGroup('recommendations');
// Vsechna 3 pravidla se okamzite prestanu spoustet

// Znovu povolit po nasazeni
engine.enableGroup('recommendations');
// Vsechna 3 pravidla opet funguji
```

## Cviceni

Navrhnete schemat organizace pravidel pro e-commerce platformu s temito pozadavky:

1. **Cenova pravidla** (slevy, akce, kupony), ktera lze prepnout jako celek
2. **Pravidla detekce podvodu**, ktera musi byt vzdy aktivni (nikdy nahodne nezakazana)
3. **Beta funkce** (novy doporucovaci algoritmus, experimentalni checkout), ktere bezi jen ve stagingu
4. Vsechna pravidla by mela byt dotazovatelna podle domeny (`pricing`, `fraud`, `checkout`, `recommendations`)

Vytvorte skupiny a registrujte jedno prikladove pravidlo ke kazde skupine s odpovidajicimi tagy.

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Skupina 1: Ceny — prepinatelna
engine.createGroup({
  id: 'pricing',
  name: 'Cenova pravidla',
  description: 'Slevy, akce a kuponova pravidla',
  enabled: true,
});

// Skupina 2: Podvody — vzdy aktivni (vynutit politikou, ne kodem)
// Skupinu pouzivame pro organizacni prehlednost, ale nikdy ji nezakazeme.
engine.createGroup({
  id: 'fraud-detection',
  name: 'Detekce podvodu',
  description: 'Monitoring transakci a prevence podvodu',
  enabled: true,
});

// Skupina 3: Beta funkce — zakazane v produkci
const isProduction = process.env.NODE_ENV === 'production';
engine.createGroup({
  id: 'beta-features',
  name: 'Beta funkce',
  description: 'Experimentalni funkce pouze pro staging',
  enabled: !isProduction,
});

// Cenove pravidlo
engine.registerRule(
  Rule.create('summer-sale')
    .name('Letni vyprodej sleva 15%')
    .group('pricing')
    .tags('pricing', 'promotions', 'seasonal')
    .when(onEvent('order.created'))
    .if(event('total').gte(30))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.15,
      reason: 'summer-sale',
    }))
    .build()
);

// Pravidlo detekce podvodu
engine.registerRule(
  Rule.create('high-value-check')
    .name('Kontrola vysoke hodnoty transakce')
    .group('fraud-detection')
    .tags('fraud', 'security', 'payments')
    .priority(100)
    .when(onEvent('transaction.created'))
    .if(event('amount').gte(5000))
    .then(emit('fraud.review_required', {
      transactionId: ref('event.transactionId'),
      amount: ref('event.amount'),
    }))
    .build()
);

// Pravidlo beta funkce
engine.registerRule(
  Rule.create('ml-recommendations')
    .name('ML doporuceni')
    .group('beta-features')
    .tags('recommendations', 'ml', 'beta')
    .when(onEvent('product.viewed'))
    .then(callService('mlService', 'recommend', {
      customerId: ref('event.customerId'),
      productId: ref('event.productId'),
    }))
    .build()
);

// Neseskupene pravidlo s tagy pro checkout domenu
engine.registerRule(
  Rule.create('checkout-validation')
    .name('Validace adresy pri checkoutu')
    .tags('checkout', 'validation')
    .when(onEvent('checkout.started'))
    .then(callService('addressService', 'validate', {
      address: ref('event.shippingAddress'),
    }))
    .build()
);
```

Klicova rozhodnuti:
- **Ceny** pouzivaji skupinu, aby akce sly prepnout behem prodejnich akci
- **Detekce podvodu** pouziva skupinu pro organizaci, ale nikdy se nezakaze — to je tymova politika
- **Beta funkce** pouzivaji skupinu s `enabled` rizenym prostredim
- **Tagy** umoznuji prurezeove dotazy: najdi vsechna `'security'` pravidla, vsechna `'payments'` pravidla atd.
- Checkout pravidlo je **neseskupene** ale otagovane — ne vsechno potrebuje skupinu

</details>

## Shrnuti

- **Skupiny pravidel** poskytuji hlavni prepinac povoleni/zakazani pro sady souvisejicich pravidel
- Pravidlo je aktivni pouze kdyz `rule.enabled === true` **a** jeho skupina (pokud existuje) je povolena
- Skupiny musi byt vytvoreny pred tim, nez na ne mohou pravidla odkazovat; smazani skupiny odseskupi pravidla, nemaze je
- **Tagy** jsou metadatove stitky bez efektu na chovani — pouzijte je pro kategorizaci a filtrovani
- Pravidlo patri do **nejvyse jedne skupiny**, ale muze mit **libovolny pocet tagu**
- Skupiny jsou idealni pro feature flagy, A/B testovani a pravidla specificka pro prostredi
- Tagy jsou idealni pro prurezeovou kategorizaci napric domenami

---

Dalsi: [Priorita a poradi provadeni](./02-priorita-a-razeni.md)
