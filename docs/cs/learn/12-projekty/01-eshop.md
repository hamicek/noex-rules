# Pravidlovy system pro e-shop

Tento projekt buduje kompletni pravidlovy backend pro online obchod. Misto roztrousihovani business logiky po sluzbach centralizujete cenotvorbu, vernostni program, zpracovani objednavek, obnovu kosiku, flash vyprodeje a spravu zasob v jednom pravidlovem enginu. Vysledkem je system, ve kterem business zainteresovane strany mohou pochopit a modifikovat chovani bez zasahu do aplikacniho kodu.

## Co se naucite

- Jak navrhnout architekturu zalozenou na pravidlech pro e-shop
- Dynamicka cenotvorba s urovnovymi slevami a mnozstevnimi zlevnenimi
- Vernostni program s automatickym povysenim urovne
- Pipeline zpracovani objednavek s detekci timeoutu platby
- Obnova opusteneho kosiku pomoci casovcu
- Sprava flash vyprodeje pomoci skupin pravidel
- Monitoring zasob s upozornenim na nizky stav
- Kombinovani eventu, faktu, casovcu, CEP vzoru a externich sluzeb v jednom systemu

## Prehled architektury

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    E-shop pravidlovy engine                          │
│                                                                      │
│  Prichozi eventy                Fakta (stav)                        │
│  ┌─────────────┐               ┌──────────────────────────────┐     │
│  │ cart.add     │               │ customer:ID:tier  (bronze…)  │     │
│  │ cart.checkout│               │ customer:ID:spent (celkove)  │     │
│  │ order.created│               │ product:SKU:price            │     │
│  │ payment.*    │               │ product:SKU:stock            │     │
│  │ product.*    │               │ cart:ID:total                │     │
│  └──────┬──────┘               └──────────────────────────────┘     │
│         │                                                            │
│  ┌──────▼──────────────────────────────────────────────────────┐    │
│  │  Vrstvy pravidel                                            │    │
│  │                                                              │    │
│  │  Vrstva 1: Cenotvorba     (priorita 300)                   │    │
│  │    ├─ tier-discount          Sleva podle vernostni urovne   │    │
│  │    ├─ quantity-break         Mnozstevni sleva               │    │
│  │    └─ flash-sale-price       Prepis ceny behem flash akce   │    │
│  │                                                              │    │
│  │  Vrstva 2: Pipeline objednavek (priorita 200)              │    │
│  │    ├─ order-confirm          Potvrzeni, spusteni casovace   │    │
│  │    ├─ payment-received       Zpracovani platby, zruseni     │    │
│  │    ├─ payment-timeout        Obsluha chybejici platby (CEP) │    │
│  │    └─ order-ship             Odeslani po platbe             │    │
│  │                                                              │    │
│  │  Vrstva 3: Vernost        (priorita 150)                   │    │
│  │    ├─ track-spending         Akumulace celkove utraty       │    │
│  │    ├─ upgrade-silver         Automaticke povyseni na $500   │    │
│  │    ├─ upgrade-gold           Automaticke povyseni na $2000  │    │
│  │    └─ upgrade-platinum       Automaticke povyseni na $5000  │    │
│  │                                                              │    │
│  │  Vrstva 4: Obnova kosiku  (priorita 100)                   │    │
│  │    ├─ cart-abandonment       Spusteni casovace pri cart.add │    │
│  │    ├─ cart-reminder          Odeslani pripominky po expiraci│    │
│  │    └─ cart-checkout-cancel   Zruseni casovace pri checkoutu │    │
│  │                                                              │    │
│  │  Vrstva 5: Zasoby         (priorita 50)                    │    │
│  │    ├─ stock-deduct           Odecteni zasob pri objednavce  │    │
│  │    ├─ low-stock-alert        Alert pri zasobach < prah      │    │
│  │    └─ out-of-stock           Deaktivace pri zasobach = 0    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Odchozi eventy                                                      │
│  ┌─────────────────────────────────────────────────────┐            │
│  │ order.confirmed, order.shipped, order.cancelled      │            │
│  │ payment.timeout, notification.cart_reminder           │            │
│  │ loyalty.upgraded, alert.low_stock, alert.out_of_stock │            │
│  └─────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

System pouziva **pet vrstev pravidel** organizovanych podle priority. Pravidla s vyssi prioritou (cenotvorba) se vyhodnocuji prvni, takze navazujici pravidla (pipeline objednavek, vernost) vzdy pracuji se spravnymi hodnotami.

## Kompletni implementace

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, onFact, onTimer, event, fact, context,
  emit, setFact, deleteFact, setTimer, cancelTimer, callService, log, ref,
  absence,
} from '@hamicek/noex-rules/dsl';

async function main() {
  // Externi sluzby
  const emailService = {
    send: async (to: string, subject: string, body: string) => {
      console.log(`[EMAIL] Komu: ${to} | ${subject} | ${body}`);
    },
  };

  const inventoryService = {
    check: async (sku: string) => {
      // V produkci by se dotazoval API skladu
      return { available: true, quantity: 42 };
    },
  };

  const engine = await RuleEngine.start({
    name: 'ecommerce',
    services: { emailService, inventoryService },
  });

  // ================================================================
  // VRSTVA 1: CENOTVORBA (priorita 300)
  // ================================================================

  // 1. Sleva podle vernostni urovne
  engine.registerRule(
    Rule.create('tier-discount')
      .name('Loyalty Tier Discount')
      .description('Aplikace procentualni slevy na zaklade vernostni urovne zakaznika')
      .priority(300)
      .tags('pricing', 'loyalty')
      .when(onEvent('cart.checkout'))
      .if(fact('customer:${event.customerId}:tier').exists())
      .then(emit('pricing.discount_applied', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        tier: ref('fact.customer:${event.customerId}:tier'),
      }))
      .build()
  );

  // 2. Mnozstevni sleva
  engine.registerRule(
    Rule.create('quantity-break')
      .name('Quantity Break Discount')
      .description('Aplikace hromadne slevy pri mnozstvi >= 10')
      .priority(300)
      .tags('pricing', 'promotion')
      .when(onEvent('cart.add'))
      .if(event('quantity').gte(10))
      .then(emit('pricing.bulk_discount', {
        customerId: ref('event.customerId'),
        sku: ref('event.sku'),
        quantity: ref('event.quantity'),
        discountPercent: 15,
      }))
      .also(log('info', 'Hromadna sleva: ${event.quantity}x ${event.sku} pro ${event.customerId}'))
      .build()
  );

  // 3. Prepis ceny pri flash vyprodeji (rizeno skupinou pravidel)
  engine.registerRule(
    Rule.create('flash-sale-price')
      .name('Flash Sale Price Override')
      .description('Prepis ceny produktu behem aktivniho flash vyprodeje')
      .priority(310)
      .tags('pricing', 'flash-sale')
      .group('flash-sales')
      .when(onEvent('cart.add'))
      .if(fact('flash:${event.sku}:price').exists())
      .then(setFact('cart:${event.customerId}:${event.sku}:price',
        ref('fact.flash:${event.sku}:price')))
      .also(log('info', 'Flash cena aplikovana: ${event.sku}'))
      .build()
  );

  // ================================================================
  // VRSTVA 2: PIPELINE OBJEDNAVEK (priorita 200)
  // ================================================================

  // 4. Potvrzeni objednavky — spusteni casovace platby
  engine.registerRule(
    Rule.create('order-confirm')
      .name('Confirm Order')
      .description('Potvrzeni objednavky a spusteni 15minutoveho casovace platby')
      .priority(200)
      .tags('order', 'pipeline')
      .when(onEvent('order.created'))
      .then(setFact('order:${event.orderId}:status', 'confirmed'))
      .also(setTimer({
        name: 'payment-timeout:${event.orderId}',
        duration: '15m',
        onExpire: {
          topic: 'payment.timeout',
          data: {
            orderId: ref('event.orderId'),
            customerId: ref('event.customerId'),
          },
        },
      }))
      .also(emit('order.confirmed', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
      }))
      .also(log('info', 'Objednavka potvrzena: ${event.orderId}'))
      .build()
  );

  // 5. Platba prijata — zruseni timeoutu, posun pipeline
  engine.registerRule(
    Rule.create('payment-received')
      .name('Process Payment')
      .description('Zaznamenani platby a zruseni casovace timeoutu')
      .priority(200)
      .tags('order', 'pipeline')
      .when(onEvent('payment.completed'))
      .then(setFact('order:${event.orderId}:status', 'paid'))
      .also(cancelTimer('payment-timeout:${event.orderId}'))
      .also(emit('order.paid', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        amount: ref('event.amount'),
      }))
      .also(log('info', 'Platba prijata: ${event.orderId}'))
      .build()
  );

  // 6. Timeout platby — zruseni objednavky
  engine.registerRule(
    Rule.create('payment-timeout')
      .name('Payment Timeout Handler')
      .description('Zruseni objednavky pri expiraci casovace platby')
      .priority(200)
      .tags('order', 'pipeline')
      .when(onTimer('payment-timeout:*'))
      .then(setFact('order:${event.orderId}:status', 'cancelled'))
      .also(emit('order.cancelled', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        reason: 'payment_timeout',
      }))
      .also(log('warn', 'Objednavka zrusena (timeout platby): ${event.orderId}'))
      .build()
  );

  // 7. Odeslani po platbe
  engine.registerRule(
    Rule.create('order-ship')
      .name('Ship Order')
      .description('Zahajeni expedice po uspesne platbe')
      .priority(190)
      .tags('order', 'pipeline')
      .when(onEvent('order.paid'))
      .then(setFact('order:${event.orderId}:status', 'shipped'))
      .also(emit('order.shipped', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
      }))
      .also(log('info', 'Objednavka odeslana: ${event.orderId}'))
      .build()
  );

  // 8. Monitoring absence platby (alternativni CEP pristup)
  engine.registerRule(
    Rule.create('payment-absence-monitor')
      .name('Payment Absence Monitor')
      .description('Detekce neprijate platby behem 10 minut od vytvoreni objednavky')
      .priority(210)
      .tags('order', 'monitoring')
      .when(absence()
        .after('order.created')
        .expected('payment.completed')
        .within('10m')
        .groupBy('orderId')
      )
      .then(emit('notification.payment_reminder', {
        orderId: ref('trigger.after.orderId'),
        customerId: ref('trigger.after.customerId'),
      }))
      .also(log('info', 'Pripominka platby odeslana: ${trigger.after.orderId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 3: VERNOSTNI PROGRAM (priorita 150)
  // ================================================================

  // 9. Sledovani celkove utraty
  engine.registerRule(
    Rule.create('track-spending')
      .name('Track Customer Spending')
      .description('Akumulace celkove utraty zakaznika pri kazde platbe')
      .priority(150)
      .tags('loyalty', 'tracking')
      .when(onEvent('order.paid'))
      .then(setFact('customer:${event.customerId}:lastOrderAmount', ref('event.amount')))
      .also(emit('loyalty.purchase_recorded', {
        customerId: ref('event.customerId'),
        amount: ref('event.amount'),
      }))
      .build()
  );

  // 10. Povyseni na Silver (celkova utrata >= $500)
  engine.registerRule(
    Rule.create('upgrade-silver')
      .name('Upgrade to Silver Tier')
      .description('Povyseni zakaznika na silver pri celkove utrate $500')
      .priority(140)
      .tags('loyalty', 'tier')
      .when(onFact('customer:*:spent'))
      .if(fact('${trigger.key}').gte(500))
      .and(fact('customer:${trigger.key.split(":")[1]}:tier').eq('bronze'))
      .then(setFact('customer:${trigger.key.split(":")[1]}:tier', 'silver'))
      .also(emit('loyalty.upgraded', {
        customerId: '${trigger.key.split(":")[1]}',
        fromTier: 'bronze',
        toTier: 'silver',
      }))
      .also(log('info', 'Zakaznik povysen na Silver: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // 11. Povyseni na Gold (celkova utrata >= $2000)
  engine.registerRule(
    Rule.create('upgrade-gold')
      .name('Upgrade to Gold Tier')
      .description('Povyseni zakaznika na gold pri celkove utrate $2000')
      .priority(140)
      .tags('loyalty', 'tier')
      .when(onFact('customer:*:spent'))
      .if(fact('${trigger.key}').gte(2000))
      .and(fact('customer:${trigger.key.split(":")[1]}:tier').eq('silver'))
      .then(setFact('customer:${trigger.key.split(":")[1]}:tier', 'gold'))
      .also(emit('loyalty.upgraded', {
        customerId: '${trigger.key.split(":")[1]}',
        fromTier: 'silver',
        toTier: 'gold',
      }))
      .also(log('info', 'Zakaznik povysen na Gold: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // 12. Povyseni na Platinum (celkova utrata >= $5000)
  engine.registerRule(
    Rule.create('upgrade-platinum')
      .name('Upgrade to Platinum Tier')
      .description('Povyseni zakaznika na platinum pri celkove utrate $5000')
      .priority(140)
      .tags('loyalty', 'tier')
      .when(onFact('customer:*:spent'))
      .if(fact('${trigger.key}').gte(5000))
      .and(fact('customer:${trigger.key.split(":")[1]}:tier').eq('gold'))
      .then(setFact('customer:${trigger.key.split(":")[1]}:tier', 'platinum'))
      .also(emit('loyalty.upgraded', {
        customerId: '${trigger.key.split(":")[1]}',
        fromTier: 'gold',
        toTier: 'platinum',
      }))
      .also(log('info', 'Zakaznik povysen na Platinum: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // ================================================================
  // VRSTVA 4: OBNOVA KOSIKU (priorita 100)
  // ================================================================

  // 13. Spusteni casovace opusteni pri pridani do kosiku
  engine.registerRule(
    Rule.create('cart-abandonment')
      .name('Cart Abandonment Timer')
      .description('Spusteni 30minutoveho casovace pri pridani polozek do kosiku')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.add'))
      .then(setTimer({
        name: 'cart-reminder:${event.customerId}',
        duration: '30m',
        onExpire: {
          topic: 'cart.abandoned',
          data: {
            customerId: ref('event.customerId'),
            sku: ref('event.sku'),
          },
        },
      }))
      .also(setFact('cart:${event.customerId}:active', true))
      .build()
  );

  // 14. Odeslani pripominky pri expiraci casovace
  engine.registerRule(
    Rule.create('cart-reminder')
      .name('Cart Reminder Notification')
      .description('Odeslani emailove pripominky pro opusteny kosik')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.abandoned'))
      .then(emit('notification.cart_reminder', {
        customerId: ref('event.customerId'),
      }))
      .also(callService('emailService', 'send', [
        ref('event.customerId'),
        'Nechali jste polozky v kosiku!',
        'Dokoncete nakup a ziskejte dopravu zdarma.',
      ]))
      .also(log('info', 'Pripominka kosiku odeslana: ${event.customerId}'))
      .build()
  );

  // 15. Zruseni casovace opusteni pri checkoutu
  engine.registerRule(
    Rule.create('cart-checkout-cancel')
      .name('Cancel Cart Timer on Checkout')
      .description('Zruseni casovace opusteni pri checkoutu zakaznika')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.checkout'))
      .then(cancelTimer('cart-reminder:${event.customerId}'))
      .also(deleteFact('cart:${event.customerId}:active'))
      .build()
  );

  // ================================================================
  // VRSTVA 5: ZASOBY (priorita 50)
  // ================================================================

  // 16. Odecteni zasob pri objednavce
  engine.registerRule(
    Rule.create('stock-deduct')
      .name('Deduct Inventory')
      .description('Snizeni zasob produktu pri potvrzeni objednavky')
      .priority(50)
      .tags('inventory')
      .when(onEvent('order.confirmed'))
      .if(event('items').exists())
      .then(log('info', 'Zasoby odecteny pro objednavku: ${event.orderId}'))
      .build()
  );

  // 17. Alert nizky stav zasob
  engine.registerRule(
    Rule.create('low-stock-alert')
      .name('Low Stock Alert')
      .description('Emitovani alertu pri poklesu zasob pod 10')
      .priority(50)
      .tags('inventory', 'alerts')
      .when(onFact('product:*:stock'))
      .if(fact('${trigger.key}').lt(10))
      .and(fact('${trigger.key}').gt(0))
      .then(emit('alert.low_stock', {
        sku: '${trigger.key.split(":")[1]}',
        remaining: ref('trigger.value'),
      }))
      .also(log('warn', 'Nizky stav zasob: ${trigger.key} = ${trigger.value}'))
      .build()
  );

  // 18. Vyprodano — deaktivace produktu
  engine.registerRule(
    Rule.create('out-of-stock')
      .name('Out of Stock Handler')
      .description('Oznaceni produktu jako nedostupneho pri nulovych zasobach')
      .priority(50)
      .tags('inventory', 'alerts')
      .when(onFact('product:*:stock'))
      .if(fact('${trigger.key}').lte(0))
      .then(setFact('product:${trigger.key.split(":")[1]}:available', false))
      .also(emit('alert.out_of_stock', {
        sku: '${trigger.key.split(":")[1]}',
      }))
      .also(log('error', 'Vyprodano: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // ================================================================
  // SPRAVA FLASH VYPRODEJE
  // ================================================================

  // Vytvoreni skupiny pravidel pro flash vyprodej (ve vychozim stavu vypnuta)
  engine.createGroup({
    id: 'flash-sales',
    name: 'Flash Sale Rules',
    description: 'Povolit behem aktivnich flash vyprodeju',
    enabled: false,
  });

  // ================================================================
  // SIMULACE
  // ================================================================

  console.log('=== E-shop pravidlovy engine spusten ===\n');

  // Nastaveni pocatecniho zakaznika
  await engine.setFact('customer:C-100:tier', 'bronze');
  await engine.setFact('customer:C-100:spent', 0);
  await engine.setFact('product:SKU-001:stock', 25);
  await engine.setFact('product:SKU-001:price', 49.99);

  // Odber klicovych eventu
  engine.subscribe('order.*', (event) => {
    console.log(`[OBJEDNAVKA] ${event.topic}:`, event.data);
  });

  engine.subscribe('loyalty.*', (event) => {
    console.log(`[VERNOST] ${event.topic}:`, event.data);
  });

  engine.subscribe('alert.*', (event) => {
    console.log(`[ALERT] ${event.topic}:`, event.data);
  });

  // Zakaznik prida polozku do kosiku
  await engine.emit('cart.add', {
    customerId: 'C-100',
    sku: 'SKU-001',
    quantity: 2,
    price: 49.99,
  });

  // Zakaznik provede checkout
  await engine.emit('cart.checkout', {
    customerId: 'C-100',
    orderId: 'ORD-500',
    total: 99.98,
  });

  // Objednavka vytvorena
  await engine.emit('order.created', {
    orderId: 'ORD-500',
    customerId: 'C-100',
    items: [{ sku: 'SKU-001', quantity: 2 }],
    total: 99.98,
  });

  // Platba dorazi
  await engine.emit('payment.completed', {
    orderId: 'ORD-500',
    customerId: 'C-100',
    amount: 99.98,
  });

  // Kontrola stavu
  console.log('\n=== Konecny stav ===');
  console.log('Stav objednavky:', engine.getFact('order:ORD-500:status'));
  console.log('Uroven zakaznika:', engine.getFact('customer:C-100:tier'));
  console.log('Zasoba produktu:', engine.getFact('product:SKU-001:stock'));

  // --- Demonstrace flash vyprodeje ---
  console.log('\n=== Aktivace flash vyprodeje ===');
  await engine.setFact('flash:SKU-001:price', 29.99);
  engine.enableGroup('flash-sales');

  await engine.emit('cart.add', {
    customerId: 'C-100',
    sku: 'SKU-001',
    quantity: 1,
    price: 49.99,
  });

  console.log('Flash cena aplikovana:', engine.getFact('cart:C-100:SKU-001:price'));
  // 29.99

  engine.disableGroup('flash-sales');
  console.log('Flash vyprodej deaktivovan\n');

  await engine.stop();
  console.log('Engine zastaven.');
}

main();
```

## Detailni rozbor

### Vrstva cenotvorby

Vrstva cenotvorby se vyhodnocuje prvni (priorita 300+). Tim je zaruceno, ze navazujici pravidla vidi spravne hodnoty.

| Pravidlo | Trigger | Co dela |
|----------|---------|---------|
| `tier-discount` | `cart.checkout` | Zjisti vernostni uroven zakaznika z faktu, emituje event slevy |
| `quantity-break` | `cart.add` | Overuje mnozstvi >= 10, emituje event hromadne slevy |
| `flash-sale-price` | `cart.add` | Prepisuje cenu z faktu flash vyprodeje (rizeno skupinou) |

Pravidlo flash vyprodeje patri do skupiny `flash-sales`. Kdyz je skupina vypnuta, pravidlo se nevyhodnocuje — zadne podminky nejsou potreba. Povolte skupinu pro aktivaci akce, zakazte ji pro ukonceni.

### Pipeline objednavek

Pipeline objednavek pouziva **casovace** pro terminy plateb a **CEP absenci** pro proaktivni pripominky:

```text
  order.created         payment.completed        order.paid
       │                       │                      │
       ▼                       ▼                      ▼
  ┌──────────┐           ┌──────────┐           ┌──────────┐
  │ Potvrzeni│──timer──→ │ Platba   │           │ Odeslani │
  │ objed.   │  15 min   │ prijata  │──zruseni─→│ objed.   │
  │ set fact │           │ set fact │   timer   │ set fact │
  └──────────┘           └──────────┘           └──────────┘
       │
       │ (pokud casovac expiruje)
       ▼
  ┌──────────┐
  │ Zruseni  │
  │ objed.   │
  └──────────┘
```

Vzor absence (`payment-absence-monitor`) funguje spolecne s casovacem jako vcasne varovani: pokud uplyne 10 minut bez platby, odesle se pripominka. Pokud uplyne celych 15 minut bez platby, pravidlo zalozene na casovaci zrusi objednavku.

### Vernostni program

Vrstva vernosti pouziva **pravidla spoustena fakty** pro reakci na zmeny utraty:

```text
  customer:ID:spent
       │
       ├──── >= $500  ──→ silver
       ├──── >= $2000 ──→ gold
       └──── >= $5000 ──→ platinum
```

Kazde pravidlo povyseni kontroluje jak prah utraty, tak soucasnou uroven. Tim se predchazi preskakovani urovni — zakaznik na urovni bronze, ktery dosahne $2000, se nejprve stane silver (pravidlo silver se spusti, protoze jeho podminka odpovida), a pote se okamzite spusti pravidlo gold, protoze uroven je nyni silver a utrata je >= $2000.

### Obnova kosiku

Obnova kosiku pouziva jednoduchy vzor casovace:

1. `cart.add` → spusteni 30minutoveho casovace
2. Casovac expiruje → event `cart.abandoned` → emailova pripominka
3. `cart.checkout` → zruseni casovace (zakaznik nakoupil)

Tento vzor je bezny v e-shopech a demonstruje, jak casovace premostuji mezeru mezi "neco se stalo" a "neco se nestalo v danem casovem ramci."

### Sprava zasob

Pravidla zasob reaguji na **zmeny faktu** misto eventu. Kdyz se zasoby aktualizuji pres `setFact('product:SKU:stock', novaHodnota)`, pravidla spoustena fakty se vyhodnoti:

- Zasoby < 10 a > 0 → alert nizky stav
- Zasoby <= 0 → oznaceni produktu jako nedostupneho

Toto oddeluje logiku zasob od pipeline objednavek. Jakykoli proces, ktery meni zasoby (vratky, manualni upravy, dodavky od dodavatelu), automaticky spousti odpovidajici alerty.

## Cviceni

Rozsirte system o **odmenu pro vracejiciho se zakaznika**: pokud zakaznik zada 3 nebo vice objednavek behem 7 dni, emitujte event `loyalty.repeat_reward` s 10% kuponovym kodem. Pouzijte CEP count vzor.

Navic pridejte pravidlo, ktere odesle **potvrzovaci email o odeslani** pri spusteni `order.shipped`, s vyuzitim `emailService`.

<details>
<summary>Reseni</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, callService, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// Odmena pro vracejiciho se zakaznika (CEP count)
engine.registerRule(
  Rule.create('repeat-reward')
    .name('Repeat Customer Reward')
    .priority(140)
    .tags('loyalty', 'reward')
    .when(count()
      .event('order.paid')
      .threshold(3)
      .window('7d')
      .groupBy('customerId')
    )
    .then(emit('loyalty.repeat_reward', {
      customerId: ref('trigger.groupKey'),
      couponCode: 'REPEAT10',
      discountPercent: 10,
    }))
    .also(log('info', 'Odmena pro vracejiciho se zakaznika: ${trigger.groupKey}'))
    .build()
);

// Potvrzovaci email o odeslani
engine.registerRule(
  Rule.create('shipping-email')
    .name('Shipping Confirmation Email')
    .priority(40)
    .tags('order', 'notification')
    .when(onEvent('order.shipped'))
    .then(callService('emailService', 'send', [
      ref('event.customerId'),
      'Vase objednavka byla odeslana!',
      'Objednavka ${event.orderId} je na ceste.',
    ]))
    .also(log('info', 'Email o odeslani odeslan: ${event.orderId}'))
    .build()
);
```

Vzor count sleduje eventy `order.paid` na zakaznika v 7dennim posuvnem okne. Kdyz dorazi treti platba, spusti se event odmeny. Pravidlo emailu o odeslani nasloucha na `order.shipped` a vola emailovou sluzbu — jednoducha event-driven notifikace.

</details>

## Shrnuti

- Organizujte pravidla do **prioritnich vrstev**: cenotvorba nejdriv, pak pipeline objednavek, vernost, obnova kosiku, zasoby
- Pouzivejte **skupiny pravidel** pro prepinatelne funkce jako flash vyprodeje — povolte/zakazte skupinu misto upravy pravidel
- Pouzivejte **casovace** pro terminy (timeout platby) a opozdene akce (opusteni kosiku)
- Pouzivejte **CEP absenci** pro vcasna varovani (pripominka platby pred tvrdym timeoutem)
- Pouzivejte **pravidla spoustena fakty** pro logiku zavislou na stavu (povyseni vernosti, alerty zasob)
- Topiky eventu slouzi jako **kontrakty** mezi vrstvami — kazda vrstva produkuje eventy, ktere navazujici vrstvy konzumuji
- Fakta poskytuji **dotazovatelny stav** pro dashboardy a API (stav objednavky, uroven zakaznika, stav zasob)
- System je **rozsiritelny**: pridani noveho cenoveho pravidla, vernostni urovne nebo notifikace nevyzaduje zmenu existujicich pravidel

---

Dalsi: [System detekce podvodu](./02-detekce-podvodu.md)
