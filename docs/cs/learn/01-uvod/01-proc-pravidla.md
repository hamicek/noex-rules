# Proč pravidlový engine?

Každá aplikace začíná jednoduchou business logikou. Sleva tady, notifikace tamhle. Jenže business logika roste rychleji než kód, který ji obklopuje. Než se nadějete, udržujete spletitou síť podmínek, kterou žádný jednotlivec plně nechápe.

Pravidlový engine odděluje *co se má stát* od *jak aplikace funguje*, takže business logika je explicitní, testovatelná a měnitelná bez zásahu do aplikačního kódu.

## Co se naučíte

- Proč se hardcoded business logika stává údržbovou zátěží
- Jak roztroušené podmínky vytvářejí skrytou vazbu
- Co nabízí model trigger-podmínka-akce místo toho
- Jak pravidlový engine mění, kdo může upravovat business chování

## Problémy

### Hardcoded logika přeroste v spleteninu

Zvažte funkci pro zpracování objednávek v e-shopu:

```typescript
async function processOrder(order: Order) {
  let discount = 0;

  // VIP zákazníci mají 10% slevu
  if (order.customer.tier === 'vip') {
    discount = 0.1;
  }

  // Objednávky nad $500 mají dopravu zdarma
  if (order.total > 500) {
    order.shipping = 0;
  }

  // Flash výprodej: 20% sleva na elektroniku (ale ne na položky již ve slevě)
  if (
    order.category === 'electronics' &&
    !order.isOnSale &&
    isFlashSaleActive()
  ) {
    discount = Math.max(discount, 0.2);
  }

  // Věrnostní body: 2x během svátků
  const pointsMultiplier = isHolidaySeason() ? 2 : 1;
  const points = Math.floor(order.total * pointsMultiplier);

  // Označení objednávek vysoké hodnoty pro manuální kontrolu
  if (order.total > 10000) {
    await flagForReview(order, 'high_value');
  }

  // Kontrola podvodu: nový zákazník + vysoká hodnota + mezinárodní doprava
  if (
    order.customer.accountAgeDays < 30 &&
    order.total > 1000 &&
    order.shipping.country !== order.customer.country
  ) {
    await flagForReview(order, 'potential_fraud');
  }

  order.discount = discount;
  await applyOrder(order);
  await addLoyaltyPoints(order.customer.id, points);
}
```

To je šest pravidel zabudovaných v jedné funkci. Příští měsíc marketing chce sedmé. Měsíc poté compliance přidá osmé. Každé pravidlo se týká jiného tématu (cenotvorba, podvody, věrnostní program), přesto jsou všechna spojená v jednom kódu.

### Roztroušené podmínky vytvářejí skrytou vazbu

Business pravidla jen zřídka žijí na jednom místě. Stejná logika slev se často objevuje v několika službách:

```text
┌──────────────────────────────────────────────────────┐
│                   ORDER SERVICE                       │
│   if (customer.tier === 'vip') discount = 0.1        │
│   if (order.total > 500) shipping = 0                │
└──────────────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
┌──────────────────┐    ┌──────────────────────────────┐
│  PRICING SERVICE │    │    NOTIFICATION SERVICE       │
│  if (tier==='vip')│    │  if (total > 10000)           │
│    applyDiscount  │    │    sendReviewAlert            │
│  if (flashSale)   │    │  if (tier==='vip')            │
│    applyFlash     │    │    sendVIPConfirmation        │
└──────────────────┘    └──────────────────────────────┘
        │
        ▼
┌──────────────────┐
│ ANALYTICS SERVICE│
│  if (tier==='vip')│
│    trackVIP       │
│  if (flashSale)   │
│    trackFlash     │
└──────────────────┘
```

Teď se někdo zeptá: „Co se stane, když VIP zákazník zadá objednávku?" Musíte prohledat tři služby, abyste sestavili odpověď. A když se změní práh pro VIP, musíte aktualizovat všechny.

### Důsledky

| Problém | Dopad |
|---------|-------|
| Pravidla smíchaná s aplikačním kódem | Změna business pravidla vyžaduje deploy |
| Duplicitní podmínky napříč službami | Změna politiky vyžaduje úpravu na N místech |
| Žádný centrální pohled na aktivní pravidla | Nikdo nezná všechna pravidla, která platí |
| Testování vyžaduje plnou integraci | Nelze testovat cenové pravidlo bez spuštění order service |
| Business stakeholdeři nemohou číst logiku | Každá změna prochází přes vývojáře |
| Vedlejší efekty jsou implicitní | Žádný jasný obraz toho, co pravidlo spouští |

## Řešení: Trigger-podmínka-akce

Pravidlový engine nahrazuje roztroušenou if/else logiku deklarativními pravidly. Každé pravidlo je samostatná jednotka se třemi částmi:

```text
┌─────────────────────────────────────────────────────────┐
│                       PRAVIDLO                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  TRIGGER     "Kdy se toto pravidlo aktivuje?"            │
│  ─────────────────────────────────────────               │
│  Přijde událost, změní se fakt nebo vyprší časovač.      │
│                                                          │
│  PODMÍNKA    "Má se toto pravidlo spustit?"              │
│  ─────────────────────────────────────────               │
│  Kontrola dat události, faktů nebo externího kontextu.   │
│  Všechny podmínky musí projít.                           │
│                                                          │
│  AKCE        "Co se má stát?"                            │
│  ─────────────────────────────────────────               │
│  Emitovat události, aktualizovat fakta, nastavit         │
│  časovače, volat služby.                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

Zde je VIP sleva z předchozího příkladu, vyjádřená jako pravidlo:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({ name: 'ecommerce' });

engine.registerRule({
  id: 'vip-discount',
  name: 'VIP Customer Discount',
  priority: 100,
  enabled: true,
  tags: ['pricing', 'vip'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    {
      source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
      operator: 'eq',
      value: 'vip',
    },
  ],
  actions: [
    {
      type: 'set_fact',
      key: 'order:${event.orderId}:discount',
      value: 0.1,
    },
    {
      type: 'emit_event',
      topic: 'discount.applied',
      data: {
        orderId: { ref: 'event.orderId' },
        discount: 0.1,
        reason: 'VIP customer',
      },
    },
  ],
});
```

Pravidlo se popisuje samo. Kdokoli — včetně nevývojářů — může pochopit, co dělá. Žije mimo order service, může být povoleno nebo zakázáno bez deploye a lze ho testovat izolovaně.

## Hardcoded vs pravidlový engine

Následující tabulka porovnává oba přístupy v klíčových dimenzích:

| Dimenze | Hardcoded (if/else) | Pravidlový engine |
|---------|-------------------|-------------------|
| **Kde pravidla žijí** | Roztroušená v aplikačním kódu | Centralizovaná, každé pravidlo je datová struktura |
| **Změna pravidla** | Úprava kódu + deploy | Aktualizace objektu pravidla, volitelně hot-reload |
| **Testování** | Integrační testy celého flow | Unit test každého pravidla nezávisle |
| **Viditelnost** | Číst zdrojový kód | Dotaz na aktivní pravidla, filtrování podle tagu/skupiny |
| **Kdo může měnit pravidla** | Pouze vývojáři | Kdokoli, kdo rozumí schématu |
| **Audit** | Přidat logování ručně | Vestavěný audit trail pro každou změnu pravidla |
| **Temporální logika** | Ruční správa timerů/cronů | Deklarativní časovače a CEP vzory |
| **Vedlejší efekty** | Implicitní v těle funkce | Explicitní v seznamu akcí |

## Průchod požadavku: s a bez pravidlového enginu

```text
BEZ PRAVIDLOVÉHO ENGINU
───────────────────────
  Request ──► Order Service ──► if/else ──► if/else ──► if/else ──► Response
                                   │           │           │
                                   ▼           ▼           ▼
                              Pricing DB   Fraud API   Email Service


S PRAVIDLOVÝM ENGINEM
─────────────────────
  Request ──► Order Service ──► engine.emit('order.created', data)
                                         │
                                         ▼
                                ┌─────────────────┐
                                │   Rule Engine    │
                                │                  │
                                │  Rule: VIP       │──► set_fact (sleva)
                                │  Rule: Doprava   │──► set_fact (doprava zdarma)
                                │  Rule: Podvod    │──► emit_event (alert kontroly)
                                │  Rule: Věrnost   │──► call_service (přidání bodů)
                                │  Rule: Notifik.  │──► emit_event (potvrzení)
                                └─────────────────┘
```

Aplikační kód se zmenší na jedno volání `emit()`. Engine vyhodnotí všechna odpovídající pravidla a vykoná jejich akce. Přidání nebo odebrání pravidla nezasahuje do aplikace.

## Kompletní funkční příklad

Minimální, ale kompletní příklad se třemi pravidly: VIP sleva, doprava zdarma pro velké objednávky a upozornění na podvod pro podezřelé vzory.

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'ecommerce-demo' });

  // Pravidlo 1: VIP zákazníci mají 10% slevu
  engine.registerRule({
    id: 'vip-discount',
    name: 'VIP Customer Discount',
    priority: 100,
    enabled: true,
    tags: ['pricing'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'eq',
        value: 'vip',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:discount',
        value: 0.1,
      },
      {
        type: 'log',
        level: 'info',
        message: 'VIP sleva aplikována na objednávku ${event.orderId}',
      },
    ],
  });

  // Pravidlo 2: Doprava zdarma pro objednávky nad $500
  engine.registerRule({
    id: 'free-shipping',
    name: 'Free Shipping Over $500',
    priority: 90,
    enabled: true,
    tags: ['shipping'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gte',
        value: 500,
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:freeShipping',
        value: true,
      },
    ],
  });

  // Pravidlo 3: Alert na podvod pro nové účty s objednávkami vysoké hodnoty ze zahraničí
  engine.registerRule({
    id: 'fraud-alert',
    name: 'Suspicious Order Detection',
    priority: 200,
    enabled: true,
    tags: ['fraud', 'security'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: 1000,
      },
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:accountAgeDays' },
        operator: 'lt',
        value: 30,
      },
      {
        source: { type: 'event', field: 'isInternational' },
        operator: 'eq',
        value: true,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'fraud.alert',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          reason: 'Nový účet, vysoká hodnota, zahraničí',
        },
      },
    ],
  });

  // Odběr alertů na podvody
  engine.subscribe('fraud.*', (event) => {
    console.log('ALERT NA PODVOD:', event.data);
  });

  // Nastavení faktů o zákaznících
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-100:accountAgeDays', 365);

  await engine.setFact('customer:C-200:tier', 'standard');
  await engine.setFact('customer:C-200:accountAgeDays', 7);

  // Zpracování objednávek
  await engine.emit('order.created', {
    orderId: 'ORD-1',
    customerId: 'C-100',
    total: 750,
    isInternational: false,
  });
  // Výsledek: VIP sleva aplikována, doprava zdarma aplikována

  await engine.emit('order.created', {
    orderId: 'ORD-2',
    customerId: 'C-200',
    total: 2000,
    isInternational: true,
  });
  // Výsledek: Doprava zdarma aplikována, alert na podvod emitován

  await engine.stop();
}

main();
```

## Co se změnilo?

Porovnejte oba přístupy:

**Předtím** (hardcoded):
- 6 pravidel zabudovaných v `processOrder()`, každé vyžadující jiný kontext
- Přidání pravidla znamená úpravu kritické funkce a redeploy
- Testování jednoho pravidla vyžaduje nastavení celého order flow

**Potom** (pravidlový engine):
- Každé pravidlo je samostatná deklarace s vlastním triggerem, podmínkami a akcemi
- Pravidla lze přidávat, upravovat nebo zakázat za běhu
- Každé pravidlo lze testovat emitováním jedné události s odpovídajícími fakty

## Cvičení

Níže je funkce s pěti hardcoded business pravidly. Identifikujte každé pravidlo a přepište ho jako trojici trigger-podmínka-akce (prostý text, ne kód).

```typescript
function handleUserActivity(userId: string, action: string, metadata: any) {
  const user = getUser(userId);

  // 1) Odeslat uvítací email po prvním přihlášení
  if (action === 'login' && user.loginCount === 1) {
    sendEmail(userId, 'welcome');
  }

  // 2) Uzamknout účet po 5 neúspěšných pokusech o přihlášení
  if (action === 'login_failed' && user.failedAttempts >= 5) {
    lockAccount(userId);
  }

  // 3) Udělit odznak po 100 příspěvcích
  if (action === 'post_created' && user.postCount >= 100) {
    awardBadge(userId, 'prolific_writer');
  }

  // 4) Odeslat připomínku při neaktivitě, pokud poslední přihlášení > 30 dní
  if (action === 'daily_check' && daysSince(user.lastLogin) > 30) {
    sendEmail(userId, 'we_miss_you');
  }

  // 5) Upgrade na premium, pokud útrata > $1000 za posledních 90 dní
  if (action === 'purchase' && user.spending90d > 1000) {
    upgradeTier(userId, 'premium');
  }
}
```

<details>
<summary>Řešení</summary>

**Pravidlo 1: Uvítací email**
- Trigger: událost `user.login`
- Podmínka: fakt `user:{userId}:loginCount` se rovná 1
- Akce: emitovat událost `email.send` se šablonou "welcome"

**Pravidlo 2: Uzamčení účtu**
- Trigger: událost `user.login_failed`
- Podmínka: fakt `user:{userId}:failedAttempts` >= 5
- Akce: nastavit fakt `user:{userId}:locked` na true, emitovat událost `security.account_locked`

**Pravidlo 3: Odznak plodného autora**
- Trigger: událost `post.created`
- Podmínka: fakt `user:{userId}:postCount` >= 100
- Akce: emitovat událost `badge.award` s odznáčkem "prolific_writer"

**Pravidlo 4: Připomínka při neaktivitě**
- Trigger: časovač `inactivity-check:{userId}` (nastavený na 30 dní po posledním přihlášení)
- Podmínka: fakt `user:{userId}:lastLoginDays` > 30
- Akce: emitovat událost `email.send` se šablonou "we_miss_you"

**Pravidlo 5: Upgrade na premium**
- Trigger: událost `user.purchase`
- Podmínka: fakt `user:{userId}:spending90d` > 1000
- Akce: nastavit fakt `user:{userId}:tier` na "premium", emitovat událost `tier.upgraded`

Všimněte si, jak je každé pravidlo nyní nezávislé. Pravidlo 4 je obzvlášť zajímavé: časovač je lepší volba než periodická kontrola, protože engine ho může naplánovat při přihlášení uživatele a zrušit, pokud se uživatel znovu přihlásí.

</details>

## Shrnutí

- Hardcoded business logika začíná jednoduše, ale přeroste v roztroušené, provázané a netestovatelné spleteniny
- Každý if/else řetězec je pravidlo skryté v aplikačním kódu
- Model trigger-podmínka-akce činí každé pravidlo explicitním a samostatným
- Pravidlový engine centralizuje business logiku tak, že ji lze prohlížet, testovat a měnit nezávisle
- Aplikační kód se redukuje na emitování událostí a správu faktů — engine se postará o zbytek

---

Další: [Klíčové koncepty](./02-klicove-koncepty.md)
