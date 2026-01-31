# Skupiny a tagy pravidel

Když váš pravidlový engine přeroste hrstku pravidel, potřebujete způsob, jak je spravovat jako logické celky. Vypnutí funkce by nemělo znamenat hledání a zakazování 12 jednotlivých pravidel. Spuštění A/B testu by nemělo vyžadovat sledování, která pravidla patří k variantě A. Skupiny pravidel vám dávají **hlavní přepínač** pro sady souvisejících pravidel a tagy vám dávají **flexibilní systém štítků** pro průřezové koncerny.

## Co se naučíte

- Jak vytvářet a spravovat skupiny pravidel
- Sémantiku `isRuleActive()` a dvouúrovňový model povolení/zakázání
- Jak přiřazovat pravidla ke skupinám pomocí fluent builderu
- Jak používat tagy pro kategorizaci a filtrování
- Praktické vzory: feature flagy, A/B testování, prostředová pravidla

## Skupiny pravidel

Skupina pravidel je pojmenovaný kontejner s příznakem `enabled`. Když je skupina zakázána, **všechna pravidla v této skupině jsou deaktivována** — bez ohledu na jejich individuální stav `enabled`.

### Rozhraní RuleGroup

```typescript
interface RuleGroup {
  id: string;          // Unikátní identifikátor
  name: string;        // Lidsky čitelný název
  description?: string;
  enabled: boolean;    // Hlavní přepínač
  createdAt: number;
  updatedAt: number;
}
```

### Vytváření a správa skupin

Skupiny musí být vytvořeny před tím, než na ně mohou pravidla odkazovat:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, log } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Vytvoření skupiny
const group = engine.createGroup({
  id: 'holiday-promotions',
  name: 'Prázdninové akce',
  description: 'Sezónní ceny a slevová pravidla',
  enabled: true,
});

// Registrace pravidla ve skupině
engine.registerRule(
  Rule.create('holiday-discount')
    .name('Prázdninová sleva 20%')
    .group('holiday-promotions')
    .when(onEvent('order.created'))
    .if(event('total').gte(50))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.2,
    }))
    .build()
);

// Registrace dalšího pravidla ve stejné skupině
engine.registerRule(
  Rule.create('holiday-free-shipping')
    .name('Prázdninové doprava zdarma')
    .group('holiday-promotions')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:freeShipping', true))
    .build()
);
```

### Životní cyklus skupiny

```text
  createGroup()         enableGroup()         deleteGroup()
       │                     │                     │
       ▼                     ▼                     ▼
  ┌─────────┐          ┌─────────┐          ┌─────────────┐
  │ enabled │──────────▶│ enabled │          │   smazána   │
  │  true   │          │  true   │          │ pravidla se │
  └─────────┘          └─────────┘          │ odseskupí   │
       │                     ▲               └─────────────┘
       │ disableGroup()      │                     ▲
       ▼                     │                     │
  ┌─────────┐               │                     │
  │ enabled │───────────────┘                      │
  │  false  │──────────────────────────────────────┘
  └─────────┘
```

**Klíčové chování**:
- `createGroup()` — Vytvoří novou skupinu. Vyhodí výjimku, pokud ID již existuje. Výchozí: `enabled: true`.
- `enableGroup(id)` / `disableGroup(id)` — Přepíná hlavní přepínač. Ovlivní všechna pravidla ve skupině okamžitě.
- `deleteGroup(id)` — Odstraní skupinu. Pravidla, která do ní patřila, se stanou **neseskupenými** (jejich pole `group` se vymaže), nejsou smazána.
- `updateGroup(id, updates)` — Aktualizuje název, popis nebo stav enabled.
- `getGroup(id)` — Vrátí skupinu, nebo `undefined`.
- `getGroups()` — Vrátí všechny skupiny.
- `getGroupRules(id)` — Vrátí všechna pravidla přiřazená ke skupině.

### Zakázání skupiny

```typescript
// Prázdninová sezóna skončila — zakázat všechna prázdninová pravidla najednou
engine.disableGroup('holiday-promotions');

// Obě pravidla 'holiday-discount' i 'holiday-free-shipping' jsou nyní neaktivní.
// Nespustí se, i když jejich individuální příznak enabled je stále true.
```

### Smazání skupiny

```typescript
// Úplně odstranit skupinu
engine.deleteGroup('holiday-promotions');

// Pravidla NEJSOU smazána — stanou se neseskupenými.
// 'holiday-discount' a 'holiday-free-shipping' jsou nyní zase aktivní
// (za předpokladu, že jejich individuální příznak enabled je true).
```

## Dvouúrovňový model povolení/zakázání

Engine používá dvouúrovňovou kontrolu aktivace. Pravidlo se spustí pouze tehdy, když jsou **obě** úrovně aktivní:

```text
  isRuleActive(rule)?
       │
       ├── rule.enabled === false?  ──→  NEAKTIVNÍ
       │
       ├── rule.group existuje?
       │      │
       │      ├── group.enabled === false?  ──→  NEAKTIVNÍ
       │      │
       │      └── group.enabled === true?   ──→  AKTIVNÍ
       │
       └── bez skupiny?  ──→  AKTIVNÍ
```

Implementace je přímočará:

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

To znamená:

| `rule.enabled` | Skupina existuje? | `group.enabled` | Výsledek |
|:-:|:-:|:-:|:-:|
| `false` | — | — | **Neaktivní** |
| `true` | Ne | — | **Aktivní** |
| `true` | Ano | `true` | **Aktivní** |
| `true` | Ano | `false` | **Neaktivní** |

### Proč dvě úrovně?

Dvouúrovňový model vám umožní zakázat jednotlivá pravidla pro debugging, zatímco skupina zůstane aktivní, **a zároveň** zakázat celé skupiny pro správu funkcí bez zásahu do jednotlivých pravidel:

```typescript
// Debug: zakázat jedno problematické pravidlo bez ovlivnění skupiny
engine.disableRule('holiday-discount');
// 'holiday-free-shipping' stále funguje

// Feature flag: zakázat celou funkci
engine.disableGroup('holiday-promotions');
// Všechna pravidla se zastaví, bez ohledu na jejich individuální stav

// Znovu povolit skupinu — 'holiday-free-shipping' opět funguje,
// ale 'holiday-discount' zůstává zakázáno (jeho vlastní příznak je stále false)
engine.enableGroup('holiday-promotions');
```

## Tagy

Tagy jsou textové štítky připojené k jednotlivým pravidlům. Na rozdíl od skupin nemají tagy žádný vestavěný efekt na chování — jsou to metadata pro **kategorizaci, filtrování a dotazování**.

### Přiřazování tagů

```typescript
engine.registerRule(
  Rule.create('fraud-velocity-check')
    .name('Kontrola rychlosti transakcí')
    .tags('fraud', 'security', 'payments')
    .when(onEvent('transaction.created'))
    .if(event('amount').gte(1000))
    .then(emit('fraud.check_required', {
      transactionId: ref('event.transactionId'),
    }))
    .build()
);
```

Tagy jsou uloženy jako pole na pravidle: `tags: string[]`. Pravidlo může mít nula nebo více tagů.

### Tagy vs skupiny

| Aspekt | Skupiny | Tagy |
|--------|---------|------|
| **Kardinalita** | Pravidlo patří do **nejvýše jedné** skupiny | Pravidlo může mít **libovolný počet** tagů |
| **Efekt na chování** | Zakázání skupiny deaktivuje její pravidla | Žádný vestavěný efekt na aktivaci pravidel |
| **Účel** | Správa životního cyklu (povolení/zakázání sad pravidel) | Kategorizace, filtrování, dokumentace |
| **Hierarchie** | Plochá (žádné vnořené skupiny) | Plochá (žádná hierarchie tagů) |

### Kdy použít co

Použijte **skupiny** když potřebujete:
- Povolit/zakázat více pravidel jedním voláním
- Implementovat feature flagy nebo A/B testování
- Oddělit pravidla podle prostředí nasazení

Použijte **tagy** když potřebujete:
- Kategorizovat pravidla ve více dimenzích
- Filtrovat pravidla v API dotazech nebo admin rozhraních
- Zdokumentovat účel pravidla (např. `'security'`, `'billing'`, `'notifications'`)

Můžete kombinovat obojí — pravidlo může patřit do skupiny **a** mít tagy:

```typescript
engine.registerRule(
  Rule.create('beta-fraud-ml')
    .name('ML detekce podvodů (Beta)')
    .group('beta-features')
    .tags('fraud', 'ml', 'beta')
    .when(onEvent('transaction.created'))
    .then(callService('mlFraudService', 'analyze', {
      data: ref('event'),
    }))
    .build()
);
```

## Kompletní příklad: Feature flagy se skupinami

Běžný vzor je použití skupin jako feature flagů. Tento příklad spravuje e-commerce doporučovací engine, který lze přepnout:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, onFact, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Vytvoření skupiny pro funkci
engine.createGroup({
  id: 'recommendations',
  name: 'Doporučení produktů',
  description: 'Pravidla pro AI doporučení produktů',
  enabled: true,
});

// Pravidlo 1: Sledování prohlížení
engine.registerRule(
  Rule.create('track-browse')
    .name('Sledování prohlížení produktů')
    .group('recommendations')
    .tags('recommendations', 'tracking')
    .when(onEvent('product.viewed'))
    .then(setFact(
      'customer:${event.customerId}:lastViewed',
      ref('event.productId')
    ))
    .build()
);

// Pravidlo 2: Doporučení na základě historie nákupů
engine.registerRule(
  Rule.create('cross-sell')
    .name('Cross-sell doporučení')
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

// Pravidlo 3: Odeslání doporučovacího emailu
engine.registerRule(
  Rule.create('recommend-email')
    .name('Email s doporučením')
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

// --- Správa funkce ---

// Zjistit, která pravidla jsou ve skupině
const rules = engine.getGroupRules('recommendations');
console.log(`Pravidla doporučení: ${rules.length}`);
// Pravidla doporučení: 3

// Zakázat funkci během nasazení
engine.disableGroup('recommendations');
// Všechna 3 pravidla se okamžitě přestanou spouštět

// Znovu povolit po nasazení
engine.enableGroup('recommendations');
// Všechna 3 pravidla opět fungují
```

## Cvičení

Navrhněte schéma organizace pravidel pro e-commerce platformu s těmito požadavky:

1. **Cenová pravidla** (slevy, akce, kupóny), která lze přepnout jako celek
2. **Pravidla detekce podvodů**, která musí být vždy aktivní (nikdy náhodně nezakázána)
3. **Beta funkce** (nový doporučovací algoritmus, experimentální checkout), které běží jen ve stagingu
4. Všechna pravidla by měla být dotazovatelná podle domény (`pricing`, `fraud`, `checkout`, `recommendations`)

Vytvořte skupiny a registrujte jedno příkladové pravidlo ke každé skupině s odpovídajícími tagy.

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Skupina 1: Ceny — přepínatelná
engine.createGroup({
  id: 'pricing',
  name: 'Cenová pravidla',
  description: 'Slevy, akce a kupónová pravidla',
  enabled: true,
});

// Skupina 2: Podvody — vždy aktivní (vynutit politikou, ne kódem)
// Skupinu používáme pro organizační přehlednost, ale nikdy ji nezakážeme.
engine.createGroup({
  id: 'fraud-detection',
  name: 'Detekce podvodů',
  description: 'Monitoring transakcí a prevence podvodů',
  enabled: true,
});

// Skupina 3: Beta funkce — zakázané v produkci
const isProduction = process.env.NODE_ENV === 'production';
engine.createGroup({
  id: 'beta-features',
  name: 'Beta funkce',
  description: 'Experimentální funkce pouze pro staging',
  enabled: !isProduction,
});

// Cenové pravidlo
engine.registerRule(
  Rule.create('summer-sale')
    .name('Letní výprodej sleva 15%')
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

// Pravidlo detekce podvodů
engine.registerRule(
  Rule.create('high-value-check')
    .name('Kontrola vysoké hodnoty transakce')
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
    .name('ML doporučení')
    .group('beta-features')
    .tags('recommendations', 'ml', 'beta')
    .when(onEvent('product.viewed'))
    .then(callService('mlService', 'recommend', {
      customerId: ref('event.customerId'),
      productId: ref('event.productId'),
    }))
    .build()
);

// Neseskupené pravidlo s tagy pro checkout doménu
engine.registerRule(
  Rule.create('checkout-validation')
    .name('Validace adresy při checkoutu')
    .tags('checkout', 'validation')
    .when(onEvent('checkout.started'))
    .then(callService('addressService', 'validate', {
      address: ref('event.shippingAddress'),
    }))
    .build()
);
```

Klíčová rozhodnutí:
- **Ceny** používají skupinu, aby akce šly přepnout během prodejních akcí
- **Detekce podvodů** používá skupinu pro organizaci, ale nikdy se nezakáže — to je týmová politika
- **Beta funkce** používají skupinu s `enabled` řízeným prostředím
- **Tagy** umožňují průřezové dotazy: najdi všechna `'security'` pravidla, všechna `'payments'` pravidla atd.
- Checkout pravidlo je **neseskupené** ale otagované — ne všechno potřebuje skupinu

</details>

## Shrnutí

- **Skupiny pravidel** poskytují hlavní přepínač povolení/zakázání pro sady souvisejících pravidel
- Pravidlo je aktivní pouze když `rule.enabled === true` **a** jeho skupina (pokud existuje) je povolena
- Skupiny musí být vytvořeny před tím, než na ně mohou pravidla odkazovat; smazání skupiny odseskupí pravidla, nemaže je
- **Tagy** jsou metadatové štítky bez efektu na chování — použijte je pro kategorizaci a filtrování
- Pravidlo patří do **nejvýše jedné skupiny**, ale může mít **libovolný počet tagů**
- Skupiny jsou ideální pro feature flagy, A/B testování a pravidla specifická pro prostředí
- Tagy jsou ideální pro průřezovou kategorizaci napříč doménami

---

Další: [Priorita a pořadí provádění](./02-priorita-a-razeni.md)
