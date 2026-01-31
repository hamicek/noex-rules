# Volání externích služeb

Pravidla nežijí izolovaně. Potřebují odesílat e-maily, dotazovat databáze, volat API a kontrolovat externí systémy. noex-rules to řeší dvěma mechanismy: akcí `call_service` pro jednorázové volání služeb a datovými požadavky (lookups) pro načítání dat, která podmínky a akce potřebují. Tato kapitola pokrývá obojí.

## Co se naučíte

- Jak registrovat externí služby do enginu
- Jak volat služby z pravidel pomocí `call_service`
- Jak fungují datové požadavky (lookups) pro předběžné načítání dat
- Jak cachování lookupů snižuje zbytečná volání
- Jak strategie chyb řídí chování pravidel při selhání služeb
- Jak používat výsledky lookupů v podmínkách a akcích

## Registrace služeb

Služby jsou prosté JavaScriptové objekty registrované v konfiguraci enginu. Každá služba vystavuje metody, které mohou pravidla volat:

```typescript
const emailService = {
  send: async (to: string, subject: string, body: string) => {
    // Odeslání e-mailu přes SMTP, API atd.
    console.log(`E-mail pro ${to}: ${subject}`);
    return { sent: true, messageId: 'msg-123' };
  },
};

const inventoryService = {
  checkStock: async (productId: string) => {
    // Dotaz na databázi skladu
    return { productId, available: 42 };
  },
  reserve: async (productId: string, quantity: number) => {
    // Rezervace položek
    return { reserved: true };
  },
};

const engine = await RuleEngine.start({
  name: 'my-app',
  services: {
    emailService,
    inventoryService,
  },
});
```

Služby mohou být jakékoli objekty s asynchronními metodami. Engine nevynucuje žádné rozhraní — jednoduše vyhledá službu podle názvu a zavolá zadanou metodu.

## Akce call_service

Akce `call_service` vyvolá metodu na registrované službě. Argumenty se rozlišují na reference před zavoláním.

```typescript
{
  type: 'call_service',
  service: 'emailService',
  method: 'send',
  args: [
    { ref: 'event.customerEmail' },
    'Potvrzení objednávky',
    'Vaše objednávka ${event.orderId} byla potvrzena.',
  ],
}
```

### Vlastnosti

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `service` | `string` | Název registrované služby. |
| `method` | `string` | Název metody k zavolání na službě. |
| `args` | `unknown[]` | Argumenty předané metodě. Každý podporuje `{ ref: 'path' }`. |

### Jak to funguje

1. Engine vyhledá službu podle názvu v mapě registrovaných služeb
2. Engine vyhledá metodu na objektu služby
3. Každý argument se rozliší — `{ ref: 'event.email' }` se stane skutečným e-mailovým řetězcem
4. Metoda se zavolá s rozlišenými argumenty: `await service.method(...resolvedArgs)`
5. Návratová hodnota se zachytí v `ActionResult.result`

### Příklad: Odeslání notifikace po objednávce

```typescript
engine.registerRule({
  id: 'order-notification',
  name: 'Order Confirmation Email',
  priority: 50,
  enabled: true,
  tags: ['orders', 'notifications'],
  trigger: { type: 'event', topic: 'order.confirmed' },
  conditions: [],
  actions: [
    {
      type: 'call_service',
      service: 'emailService',
      method: 'send',
      args: [
        { ref: 'event.customerEmail' },
        'Objednávka potvrzena',
        'Vaše objednávka byla potvrzena. Děkujeme!',
      ],
    },
    {
      type: 'log',
      level: 'info',
      message: 'Potvrzovací e-mail odeslán na ${event.customerEmail}',
    },
  ],
});
```

### Selhání volání služeb

Pokud metoda služby vyhodí chybu, výsledek akce zaznamená selhání:

```typescript
// ActionResult pro selhané volání
{
  action: { type: 'call_service', ... },
  success: false,
  error: 'Connection refused',
}
```

Zbývající akce v pravidle se stále vykonají. Engine automaticky neopakuje — implementujte logiku opakování ve vaší službě, pokud je potřeba.

## Datové požadavky (lookups)

Někdy potřebujete externí data *před* vyhodnocením podmínek. Například můžete potřebovat kreditní skóre zákazníka z API, než rozhodnete, zda schválíte půjčku. Datové požadavky toto řeší předběžným načtením dat a jejich zpřístupněním podmínkám a akcím.

### Jak se lookups liší od call_service

| Aspekt | `call_service` | Lookups |
|--------|---------------|---------|
| Načasování | Běží během vykonávání akcí (po podmínkách) | Běží před vyhodnocením podmínek |
| Účel | Vedlejší efekty (e-mail, zápis do DB) | Načtení dat pro rozhodování |
| Výsledky | Dostupné pouze v `ActionResult` | Dostupné v podmínkách a akcích přes `lookup.name` |
| Cachování | Bez vestavěné cache | Vestavěná TTL cache |
| Ošetření chyb | Akce selže, ostatní pokračují | `skip` (přeskočení pravidla) nebo `fail` (vyhození chyby) |

### Definice lookupů na pravidle

Lookups se definují v poli `lookups` pravidla:

```typescript
engine.registerRule({
  id: 'credit-check',
  name: 'Credit Score Check',
  priority: 100,
  enabled: true,
  tags: ['lending'],
  trigger: { type: 'event', topic: 'loan.requested' },
  lookups: [
    {
      name: 'creditScore',
      service: 'creditService',
      method: 'getScore',
      args: [{ ref: 'event.customerId' }],
      cache: { ttl: '5m' },
      onError: 'skip',
    },
  ],
  conditions: [
    {
      source: { type: 'lookup', name: 'creditScore', field: 'score' },
      operator: 'gte',
      value: 700,
    },
  ],
  actions: [
    {
      type: 'emit_event',
      topic: 'loan.approved',
      data: {
        customerId: { ref: 'event.customerId' },
        score: { ref: 'lookup.creditScore.score' },
      },
    },
  ],
});
```

### Vlastnosti DataRequirement

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `name` | `string` | Unikátní identifikátor. Používá se v podmínkách jako `lookup.name` a v akcích jako `{ ref: 'lookup.name' }`. |
| `service` | `string` | Název registrované služby. |
| `method` | `string` | Metoda k zavolání na službě. |
| `args` | `unknown[]` | Argumenty. Podporují reference `{ ref: 'path' }`. |
| `cache` | `{ ttl: string \| number }` | Volitelné. Cachování výsledku po zadanou dobu. |
| `onError` | `'skip' \| 'fail'` | Strategie chyb. Výchozí: `'skip'`. |

### Tok vykonávání lookupů

```text
  Pravidlo spuštěno
      │
      ▼
  ┌───────────────────────────────┐
  │  Rozlišení lookupů (paralelně)│
  │                               │
  │  creditScore ──► creditSvc    │
  │  userProfile ──► userSvc      │
  │                               │
  │  Kontrola cache → hit? vrátit │
  │                    miss? volat│
  │  Cachovat výsledek s TTL      │
  └───────────────┬───────────────┘
                  │
          vše uspělo?
          ┌───────┴───────┐
          │               │
         ANO          chyba s
          │           onError='skip'
          ▼               ▼
  Vyhodnotit podmínky   Přeskočit pravidlo
  (lze použít lookup.*) (žádné akce neběží)
```

### Cache lookupů

Když je nastaven `cache.ttl`, výsledek se cachuje pomocí kompozitního klíče sestaveného z názvu služby, názvu metody a serializovaných argumentů:

```typescript
lookups: [
  {
    name: 'userProfile',
    service: 'userService',
    method: 'getProfile',
    args: [{ ref: 'event.userId' }],
    cache: { ttl: '5m' },  // Cachovat 5 minut
    onError: 'skip',
  },
]
```

Pokud je stejná kombinace služba + metoda + argumenty požadována v rámci TTL okna, vrátí se cachovaný výsledek bez volání služby. To je užitečné zejména když více pravidel potřebuje stejná externí data.

Klíč cache je deterministický: objekty mají klíče seřazené, takže `{a: 1, b: 2}` a `{b: 2, a: 1}` produkují stejný klíč.

### Strategie chyb

| Strategie | Chování | Kdy použít |
|-----------|---------|------------|
| `'skip'` (výchozí) | Pravidlo se přeskočí celé. Podmínky se nevyhodnocují, akce neběží. Chyba se zaloguje. | Pravidlo vyžaduje data — běh bez nich nemá smysl. |
| `'fail'` | Vyhodí `DataResolutionError`. Zastaví zpracování pravidel pro tento trigger. | Data jsou kritická a selhání by mělo být okamžitě zaznamenáno. |

```typescript
// Skip: pravidlo se nespustí, pokud je kreditní služba nedostupná
{ onError: 'skip' }

// Fail: vyhodit chybu, pokud je kreditní služba nedostupná
{ onError: 'fail' }
```

### Použití výsledků lookupů

**V podmínkách** — použijte typ zdroje `lookup`:

```typescript
conditions: [
  {
    source: { type: 'lookup', name: 'creditScore', field: 'score' },
    operator: 'gte',
    value: 700,
  },
  {
    source: { type: 'lookup', name: 'userProfile', field: 'isVerified' },
    operator: 'eq',
    value: true,
  },
]
```

**V akcích** — použijte `{ ref: 'lookup.name.field' }`:

```typescript
actions: [
  {
    type: 'set_fact',
    key: 'customer:${event.customerId}:creditScore',
    value: { ref: 'lookup.creditScore.score' },
  },
  {
    type: 'log',
    level: 'info',
    message: 'Kreditní skóre pro ${event.customerId}: ${lookup.creditScore.score}',
  },
]
```

## Kompletní funkční příklad

E-mailová notifikační služba, která kontroluje preference uživatele před odesláním, s cachováním pro zamezení opakovaného načítání preferencí:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

// Simulované externí služby
const userService = {
  getPreferences: async (userId: string) => {
    console.log(`[userService] Načítání preferencí pro ${userId}`);
    // Simulace DB lookupu
    const prefs: Record<string, { emailEnabled: boolean; email: string }> = {
      'U-100': { emailEnabled: true, email: 'alice@example.com' },
      'U-200': { emailEnabled: false, email: 'bob@example.com' },
      'U-300': { emailEnabled: true, email: 'carol@example.com' },
    };
    return prefs[userId] ?? { emailEnabled: false, email: '' };
  },
};

const emailService = {
  send: async (to: string, subject: string, body: string) => {
    console.log(`[emailService] Odesílání na ${to}: "${subject}"`);
    return { sent: true };
  },
};

async function main() {
  const engine = await RuleEngine.start({
    name: 'notifications',
    services: { userService, emailService },
  });

  // Pravidlo 1: Potvrzovací e-mail objednávky (nejdříve kontrola preferencí)
  engine.registerRule({
    id: 'order-email',
    name: 'Order Confirmation Email',
    priority: 100,
    enabled: true,
    tags: ['notifications', 'orders'],
    trigger: { type: 'event', topic: 'order.confirmed' },
    lookups: [
      {
        name: 'prefs',
        service: 'userService',
        method: 'getPreferences',
        args: [{ ref: 'event.userId' }],
        cache: { ttl: '10m' },
        onError: 'skip',
      },
    ],
    conditions: [
      {
        source: { type: 'lookup', name: 'prefs', field: 'emailEnabled' },
        operator: 'eq',
        value: true,
      },
    ],
    actions: [
      {
        type: 'call_service',
        service: 'emailService',
        method: 'send',
        args: [
          { ref: 'lookup.prefs.email' },
          'Objednávka potvrzena',
          'Vaše objednávka byla potvrzena!',
        ],
      },
      {
        type: 'log',
        level: 'info',
        message: 'E-mail objednávky odeslán na ${lookup.prefs.email}',
      },
    ],
  });

  // Pravidlo 2: Notifikace o odeslání (také kontroluje preference)
  engine.registerRule({
    id: 'shipping-email',
    name: 'Shipping Notification Email',
    priority: 100,
    enabled: true,
    tags: ['notifications', 'shipping'],
    trigger: { type: 'event', topic: 'order.shipped' },
    lookups: [
      {
        name: 'prefs',
        service: 'userService',
        method: 'getPreferences',
        args: [{ ref: 'event.userId' }],
        cache: { ttl: '10m' },
        onError: 'skip',
      },
    ],
    conditions: [
      {
        source: { type: 'lookup', name: 'prefs', field: 'emailEnabled' },
        operator: 'eq',
        value: true,
      },
    ],
    actions: [
      {
        type: 'call_service',
        service: 'emailService',
        method: 'send',
        args: [
          { ref: 'lookup.prefs.email' },
          'Objednávka odeslána',
          'Vaše objednávka je na cestě!',
        ],
      },
      {
        type: 'log',
        level: 'info',
        message: 'E-mail o odeslání odeslán na ${lookup.prefs.email}',
      },
    ],
  });

  // Test: Uživatel U-100 (e-mail povolen)
  console.log('=== Uživatel U-100 (e-mail povolen) ===');
  await engine.emit('order.confirmed', { userId: 'U-100', orderId: 'ORD-001' });
  // [userService] Načítání preferencí pro U-100  ← skutečné volání služby
  // [emailService] Odesílání na alice@example.com: "Objednávka potvrzena"

  await engine.emit('order.shipped', { userId: 'U-100', orderId: 'ORD-001' });
  // Žádný log "Načítání preferencí" — výsledek byl cachován z prvního volání
  // [emailService] Odesílání na alice@example.com: "Objednávka odeslána"

  // Test: Uživatel U-200 (e-mail zakázán)
  console.log('\n=== Uživatel U-200 (e-mail zakázán) ===');
  await engine.emit('order.confirmed', { userId: 'U-200', orderId: 'ORD-002' });
  // [userService] Načítání preferencí pro U-200
  // Žádný e-mail odeslán — emailEnabled je false, podmínka nesplněna

  await engine.stop();
}

main();
```

### Co se děje

1. Když nastane `order.confirmed` pro U-100, engine rozliší lookup `prefs` zavoláním `userService.getPreferences('U-100')`
2. Výsledek se cachuje s 10minutovým TTL
3. Podmínka zkontroluje `prefs.emailEnabled` — je `true`, takže pravidlo uspěje
4. Akce `call_service` zavolá `emailService.send` s e-mailem z výsledku lookupu
5. Když nastane `order.shipped` pro stejného uživatele, lookup `prefs` najde výsledek v cache — žádné volání služby
6. Pro U-200 lookup uspěje, ale `emailEnabled` je `false`, takže podmínka nesplněna a žádný e-mail se neodešle

## Cvičení

Vytvořte systém kontroly podvodů, který používá externí službu pro hodnocení rizik:

1. Zaregistrujte `riskService` s metodou `assessRisk(userId: string, amount: number)`, která vrací `{ score: number, factors: string[] }`. Simulujte ji tak, že pro jakýkoli vstup vrátí `{ score: 85, factors: ['new_account', 'high_amount'] }`.
2. Vytvořte pravidlo spouštěné `transaction.initiated`, které:
   - Má lookup pojmenovaný `risk` volající `riskService.assessRisk` s `event.userId` a `event.amount`, cachovaný na `2m`, s `onError: 'skip'`
   - Podmínka: `risk.score` je větší než 70
   - Akce: emitovat `transaction.flagged` s userId, amount, rizikovým skóre a faktory. Také nastavit fakt `user:${userId}:riskScore` na skóre.
3. Vytvořte druhé pravidlo spouštěné `transaction.flagged`, které zaloguje varování s detaily rizika.

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const riskService = {
  assessRisk: async (userId: string, amount: number) => {
    console.log(`[riskService] Hodnocení rizika pro ${userId}, částka: ${amount}`);
    return { score: 85, factors: ['new_account', 'high_amount'] };
  },
};

async function main() {
  const engine = await RuleEngine.start({
    name: 'fraud-check',
    services: { riskService },
  });

  // Pravidlo 1: Kontrola rizikového skóre pro transakce
  engine.registerRule({
    id: 'risk-check',
    name: 'Transaction Risk Check',
    priority: 200,
    enabled: true,
    tags: ['fraud', 'risk'],
    trigger: { type: 'event', topic: 'transaction.initiated' },
    lookups: [
      {
        name: 'risk',
        service: 'riskService',
        method: 'assessRisk',
        args: [{ ref: 'event.userId' }, { ref: 'event.amount' }],
        cache: { ttl: '2m' },
        onError: 'skip',
      },
    ],
    conditions: [
      {
        source: { type: 'lookup', name: 'risk', field: 'score' },
        operator: 'gt',
        value: 70,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'transaction.flagged',
        data: {
          userId: { ref: 'event.userId' },
          amount: { ref: 'event.amount' },
          riskScore: { ref: 'lookup.risk.score' },
          factors: { ref: 'lookup.risk.factors' },
        },
      },
      {
        type: 'set_fact',
        key: 'user:${event.userId}:riskScore',
        value: { ref: 'lookup.risk.score' },
      },
    ],
  });

  // Pravidlo 2: Log označených transakcí
  engine.registerRule({
    id: 'flag-logger',
    name: 'Flagged Transaction Logger',
    priority: 100,
    enabled: true,
    tags: ['fraud', 'audit'],
    trigger: { type: 'event', topic: 'transaction.flagged' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'warn',
        message: 'OZNAČENO: Uživatel ${event.userId}, částka ${event.amount}, rizikové skóre ${event.riskScore}',
      },
    ],
  });

  // Test
  engine.subscribe('transaction.*', (event) => {
    console.log(`[${event.topic}]`, event.data);
  });

  await engine.emit('transaction.initiated', {
    userId: 'U-100',
    amount: 5000,
  });

  console.log('Fakt rizikového skóre:', engine.getFact('user:U-100:riskScore'));
  // 85

  await engine.stop();
}

main();
```

Pravidlo 1 načte rizikové skóre přes lookup, zkontroluje, zda přesahuje 70, a označí transakci. Skóre je cachováno na 2 minuty, takže rychlé opakované transakce pro stejného uživatele a částku přeskočí volání služby. Pravidlo 2 zaloguje varování pro každou označenou transakci.

</details>

## Shrnutí

- Služby se registrují jako prosté objekty s asynchronními metodami v `RuleEngineConfig.services`
- `call_service` vyvolá metodu služby během vykonávání akcí — použijte pro vedlejší efekty (e-maily, zápisy, API volání)
- Argumenty podporují `{ ref: 'path' }` pro dynamické hodnoty rozlišené v době vykonávání
- Datové požadavky (lookups) předběžně načítají data před podmínkami — použijte je, když podmínky nebo akce potřebují externí data
- Výsledky lookupů jsou dostupné jako `{ type: 'lookup', name, field }` v podmínkách a `{ ref: 'lookup.name.field' }` v akcích
- Cachujte lookups pomocí `cache: { ttl: '5m' }` pro zamezení zbytečných volání napříč pravidly
- Strategie chyb `'skip'` (výchozí) tiše přeskočí pravidlo; `'fail'` vyhodí chybu a zastaví zpracování
- Klíče cache jsou deterministické: stejná služba + metoda + argumenty vždy produkují stejný klíč
- Selhání služeb v `call_service` nezastavují ostatní akce — implementujte opakování ve vaší vrstvě služeb, pokud je potřeba

---

Další: [Fluent Builder API](../04-dsl/01-fluent-builder.md)
