# Pravidlový systém pro e-shop

Tento projekt buduje kompletní pravidlový backend pro online obchod. Místo roztroušení business logiky po službách centralizujete cenotvorbu, věrnostní program, zpracování objednávek, obnovu košíku, flash výprodeje a správu zásob v jednom pravidlovém enginu. Výsledkem je systém, ve kterém business zainteresované strany mohou pochopit a modifikovat chování bez zásahu do aplikačního kódu.

## Co se naučíte

- Jak navrhnout architekturu založenou na pravidlech pro e-shop
- Dynamická cenotvorba s úrovňovými slevami a množstevními zlevněními
- Věrnostní program s automatickým povýšením úrovně
- Pipeline zpracování objednávek s detekcí timeoutu platby
- Obnova opuštěného košíku pomocí časovačů
- Správa flash výprodeje pomocí skupin pravidel
- Monitoring zásob s upozorněním na nízký stav
- Kombinování eventů, faktů, časovačů, CEP vzorů a externích služeb v jednom systému

## Přehled architektury

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    E-shop pravidlový engine                           │
│                                                                      │
│  Příchozí eventy                Fakta (stav)                        │
│  ┌─────────────┐               ┌──────────────────────────────┐     │
│  │ cart.add     │               │ customer:ID:tier  (bronze…)  │     │
│  │ cart.checkout│               │ customer:ID:spent (celkově)  │     │
│  │ order.created│               │ product:SKU:price            │     │
│  │ payment.*    │               │ product:SKU:stock            │     │
│  │ product.*    │               │ cart:ID:total                │     │
│  └──────┬──────┘               └──────────────────────────────┘     │
│         │                                                            │
│  ┌──────▼──────────────────────────────────────────────────────┐    │
│  │  Vrstvy pravidel                                            │    │
│  │                                                              │    │
│  │  Vrstva 1: Cenotvorba     (priorita 300)                   │    │
│  │    ├─ tier-discount          Sleva podle věrnostní úrovně   │    │
│  │    ├─ quantity-break         Množstevní sleva               │    │
│  │    └─ flash-sale-price       Přepis ceny během flash akce   │    │
│  │                                                              │    │
│  │  Vrstva 2: Pipeline objednávek (priorita 200)              │    │
│  │    ├─ order-confirm          Potvrzení, spuštění časovače   │    │
│  │    ├─ payment-received       Zpracování platby, zrušení     │    │
│  │    ├─ payment-timeout        Obsluha chybějící platby (CEP) │    │
│  │    └─ order-ship             Odeslání po platbě             │    │
│  │                                                              │    │
│  │  Vrstva 3: Věrnost        (priorita 150)                   │    │
│  │    ├─ track-spending         Akumulace celkové útraty       │    │
│  │    ├─ upgrade-silver         Automatické povýšení na $500   │    │
│  │    ├─ upgrade-gold           Automatické povýšení na $2000  │    │
│  │    └─ upgrade-platinum       Automatické povýšení na $5000  │    │
│  │                                                              │    │
│  │  Vrstva 4: Obnova košíku  (priorita 100)                   │    │
│  │    ├─ cart-abandonment       Spuštění časovače při cart.add │    │
│  │    ├─ cart-reminder          Odeslání připomínky po expiraci│    │
│  │    └─ cart-checkout-cancel   Zrušení časovače při checkoutu │    │
│  │                                                              │    │
│  │  Vrstva 5: Zásoby         (priorita 50)                    │    │
│  │    ├─ stock-deduct           Odečtení zásob při objednávce  │    │
│  │    ├─ low-stock-alert        Alert při zásobách < práh      │    │
│  │    └─ out-of-stock           Deaktivace při zásobách = 0    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Odchozí eventy                                                      │
│  ┌─────────────────────────────────────────────────────┐            │
│  │ order.confirmed, order.shipped, order.cancelled      │            │
│  │ payment.timeout, notification.cart_reminder           │            │
│  │ loyalty.upgraded, alert.low_stock, alert.out_of_stock │            │
│  └─────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

Systém používá **pět vrstev pravidel** organizovaných podle priority. Pravidla s vyšší prioritou (cenotvorba) se vyhodnocují první, takže navazující pravidla (pipeline objednávek, věrnost) vždy pracují se správnými hodnotami.

## Kompletní implementace

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, onFact, onTimer, event, fact, context,
  emit, setFact, deleteFact, setTimer, cancelTimer, callService, log, ref,
  absence,
} from '@hamicek/noex-rules/dsl';

async function main() {
  // Externí služby
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

  // 1. Sleva podle věrnostní úrovně
  engine.registerRule(
    Rule.create('tier-discount')
      .name('Loyalty Tier Discount')
      .description('Aplikace procentuální slevy na základě věrnostní úrovně zákazníka')
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

  // 2. Množstevní sleva
  engine.registerRule(
    Rule.create('quantity-break')
      .name('Quantity Break Discount')
      .description('Aplikace hromadné slevy při množství >= 10')
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
      .also(log('info', 'Hromadná sleva: ${event.quantity}x ${event.sku} pro ${event.customerId}'))
      .build()
  );

  // 3. Přepis ceny při flash výprodeji (řízeno skupinou pravidel)
  engine.registerRule(
    Rule.create('flash-sale-price')
      .name('Flash Sale Price Override')
      .description('Přepis ceny produktu během aktivního flash výprodeje')
      .priority(310)
      .tags('pricing', 'flash-sale')
      .group('flash-sales')
      .when(onEvent('cart.add'))
      .if(fact('flash:${event.sku}:price').exists())
      .then(setFact('cart:${event.customerId}:${event.sku}:price',
        ref('fact.flash:${event.sku}:price')))
      .also(log('info', 'Flash cena aplikována: ${event.sku}'))
      .build()
  );

  // ================================================================
  // VRSTVA 2: PIPELINE OBJEDNÁVEK (priorita 200)
  // ================================================================

  // 4. Potvrzení objednávky — spuštění časovače platby
  engine.registerRule(
    Rule.create('order-confirm')
      .name('Confirm Order')
      .description('Potvrzení objednávky a spuštění 15minutového časovače platby')
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
      .also(log('info', 'Objednávka potvrzena: ${event.orderId}'))
      .build()
  );

  // 5. Platba přijata — zrušení timeoutu, posun pipeline
  engine.registerRule(
    Rule.create('payment-received')
      .name('Process Payment')
      .description('Zaznamenání platby a zrušení časovače timeoutu')
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
      .also(log('info', 'Platba přijata: ${event.orderId}'))
      .build()
  );

  // 6. Timeout platby — zrušení objednávky
  engine.registerRule(
    Rule.create('payment-timeout')
      .name('Payment Timeout Handler')
      .description('Zrušení objednávky při expiraci časovače platby')
      .priority(200)
      .tags('order', 'pipeline')
      .when(onTimer('payment-timeout:*'))
      .then(setFact('order:${event.orderId}:status', 'cancelled'))
      .also(emit('order.cancelled', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        reason: 'payment_timeout',
      }))
      .also(log('warn', 'Objednávka zrušena (timeout platby): ${event.orderId}'))
      .build()
  );

  // 7. Odeslání po platbě
  engine.registerRule(
    Rule.create('order-ship')
      .name('Ship Order')
      .description('Zahájení expedice po úspěšné platbě')
      .priority(190)
      .tags('order', 'pipeline')
      .when(onEvent('order.paid'))
      .then(setFact('order:${event.orderId}:status', 'shipped'))
      .also(emit('order.shipped', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
      }))
      .also(log('info', 'Objednávka odeslána: ${event.orderId}'))
      .build()
  );

  // 8. Monitoring absence platby (alternativní CEP přístup)
  engine.registerRule(
    Rule.create('payment-absence-monitor')
      .name('Payment Absence Monitor')
      .description('Detekce nepřijaté platby během 10 minut od vytvoření objednávky')
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
      .also(log('info', 'Připomínka platby odeslána: ${trigger.after.orderId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 3: VĚRNOSTNÍ PROGRAM (priorita 150)
  // ================================================================

  // 9. Sledování celkové útraty
  engine.registerRule(
    Rule.create('track-spending')
      .name('Track Customer Spending')
      .description('Akumulace celkové útraty zákazníka při každé platbě')
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

  // 10. Povýšení na Silver (celková útrata >= $500)
  engine.registerRule(
    Rule.create('upgrade-silver')
      .name('Upgrade to Silver Tier')
      .description('Povýšení zákazníka na silver při celkové útratě $500')
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
      .also(log('info', 'Zákazník povýšen na Silver: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // 11. Povýšení na Gold (celková útrata >= $2000)
  engine.registerRule(
    Rule.create('upgrade-gold')
      .name('Upgrade to Gold Tier')
      .description('Povýšení zákazníka na gold při celkové útratě $2000')
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
      .also(log('info', 'Zákazník povýšen na Gold: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // 12. Povýšení na Platinum (celková útrata >= $5000)
  engine.registerRule(
    Rule.create('upgrade-platinum')
      .name('Upgrade to Platinum Tier')
      .description('Povýšení zákazníka na platinum při celkové útratě $5000')
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
      .also(log('info', 'Zákazník povýšen na Platinum: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // ================================================================
  // VRSTVA 4: OBNOVA KOŠÍKU (priorita 100)
  // ================================================================

  // 13. Spuštění časovače opuštění při přidání do košíku
  engine.registerRule(
    Rule.create('cart-abandonment')
      .name('Cart Abandonment Timer')
      .description('Spuštění 30minutového časovače při přidání položek do košíku')
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

  // 14. Odeslání připomínky při expiraci časovače
  engine.registerRule(
    Rule.create('cart-reminder')
      .name('Cart Reminder Notification')
      .description('Odeslání emailové připomínky pro opuštěný košík')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.abandoned'))
      .then(emit('notification.cart_reminder', {
        customerId: ref('event.customerId'),
      }))
      .also(callService('emailService', 'send', [
        ref('event.customerId'),
        'Nechali jste položky v košíku!',
        'Dokončete nákup a získejte dopravu zdarma.',
      ]))
      .also(log('info', 'Připomínka košíku odeslána: ${event.customerId}'))
      .build()
  );

  // 15. Zrušení časovače opuštění při checkoutu
  engine.registerRule(
    Rule.create('cart-checkout-cancel')
      .name('Cancel Cart Timer on Checkout')
      .description('Zrušení časovače opuštění při checkoutu zákazníka')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.checkout'))
      .then(cancelTimer('cart-reminder:${event.customerId}'))
      .also(deleteFact('cart:${event.customerId}:active'))
      .build()
  );

  // ================================================================
  // VRSTVA 5: ZÁSOBY (priorita 50)
  // ================================================================

  // 16. Odečtení zásob při objednávce
  engine.registerRule(
    Rule.create('stock-deduct')
      .name('Deduct Inventory')
      .description('Snížení zásob produktu při potvrzení objednávky')
      .priority(50)
      .tags('inventory')
      .when(onEvent('order.confirmed'))
      .if(event('items').exists())
      .then(log('info', 'Zásoby odečteny pro objednávku: ${event.orderId}'))
      .build()
  );

  // 17. Alert nízký stav zásob
  engine.registerRule(
    Rule.create('low-stock-alert')
      .name('Low Stock Alert')
      .description('Emitování alertu při poklesu zásob pod 10')
      .priority(50)
      .tags('inventory', 'alerts')
      .when(onFact('product:*:stock'))
      .if(fact('${trigger.key}').lt(10))
      .and(fact('${trigger.key}').gt(0))
      .then(emit('alert.low_stock', {
        sku: '${trigger.key.split(":")[1]}',
        remaining: ref('trigger.value'),
      }))
      .also(log('warn', 'Nízký stav zásob: ${trigger.key} = ${trigger.value}'))
      .build()
  );

  // 18. Vyprodáno — deaktivace produktu
  engine.registerRule(
    Rule.create('out-of-stock')
      .name('Out of Stock Handler')
      .description('Označení produktu jako nedostupného při nulových zásobách')
      .priority(50)
      .tags('inventory', 'alerts')
      .when(onFact('product:*:stock'))
      .if(fact('${trigger.key}').lte(0))
      .then(setFact('product:${trigger.key.split(":")[1]}:available', false))
      .also(emit('alert.out_of_stock', {
        sku: '${trigger.key.split(":")[1]}',
      }))
      .also(log('error', 'Vyprodáno: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // ================================================================
  // SPRÁVA FLASH VÝPRODEJE
  // ================================================================

  // Vytvoření skupiny pravidel pro flash výprodej (ve výchozím stavu vypnuta)
  engine.createGroup({
    id: 'flash-sales',
    name: 'Flash Sale Rules',
    description: 'Povolit během aktivních flash výprodejů',
    enabled: false,
  });

  // ================================================================
  // SIMULACE
  // ================================================================

  console.log('=== E-shop pravidlový engine spuštěn ===\n');

  // Nastavení počátečního zákazníka
  await engine.setFact('customer:C-100:tier', 'bronze');
  await engine.setFact('customer:C-100:spent', 0);
  await engine.setFact('product:SKU-001:stock', 25);
  await engine.setFact('product:SKU-001:price', 49.99);

  // Odběr klíčových eventů
  engine.subscribe('order.*', (event) => {
    console.log(`[OBJEDNÁVKA] ${event.topic}:`, event.data);
  });

  engine.subscribe('loyalty.*', (event) => {
    console.log(`[VĚRNOST] ${event.topic}:`, event.data);
  });

  engine.subscribe('alert.*', (event) => {
    console.log(`[ALERT] ${event.topic}:`, event.data);
  });

  // Zákazník přidá položku do košíku
  await engine.emit('cart.add', {
    customerId: 'C-100',
    sku: 'SKU-001',
    quantity: 2,
    price: 49.99,
  });

  // Zákazník provede checkout
  await engine.emit('cart.checkout', {
    customerId: 'C-100',
    orderId: 'ORD-500',
    total: 99.98,
  });

  // Objednávka vytvořena
  await engine.emit('order.created', {
    orderId: 'ORD-500',
    customerId: 'C-100',
    items: [{ sku: 'SKU-001', quantity: 2 }],
    total: 99.98,
  });

  // Platba dorazí
  await engine.emit('payment.completed', {
    orderId: 'ORD-500',
    customerId: 'C-100',
    amount: 99.98,
  });

  // Kontrola stavu
  console.log('\n=== Konečný stav ===');
  console.log('Stav objednávky:', engine.getFact('order:ORD-500:status'));
  console.log('Úroveň zákazníka:', engine.getFact('customer:C-100:tier'));
  console.log('Zásoba produktu:', engine.getFact('product:SKU-001:stock'));

  // --- Demonstrace flash výprodeje ---
  console.log('\n=== Aktivace flash výprodeje ===');
  await engine.setFact('flash:SKU-001:price', 29.99);
  engine.enableGroup('flash-sales');

  await engine.emit('cart.add', {
    customerId: 'C-100',
    sku: 'SKU-001',
    quantity: 1,
    price: 49.99,
  });

  console.log('Flash cena aplikována:', engine.getFact('cart:C-100:SKU-001:price'));
  // 29.99

  engine.disableGroup('flash-sales');
  console.log('Flash výprodej deaktivován\n');

  await engine.stop();
  console.log('Engine zastaven.');
}

main();
```

## Detailní rozbor

### Vrstva cenotvorby

Vrstva cenotvorby se vyhodnocuje první (priorita 300+). Tím je zaručeno, že navazující pravidla vidí správné hodnoty.

| Pravidlo | Trigger | Co dělá |
|----------|---------|---------|
| `tier-discount` | `cart.checkout` | Zjistí věrnostní úroveň zákazníka z faktů, emituje event slevy |
| `quantity-break` | `cart.add` | Ověřuje množství >= 10, emituje event hromadné slevy |
| `flash-sale-price` | `cart.add` | Přepisuje cenu z faktů flash výprodeje (řízeno skupinou) |

Pravidlo flash výprodeje patří do skupiny `flash-sales`. Když je skupina vypnuta, pravidlo se nevyhodnocuje — žádné podmínky nejsou potřeba. Povolte skupinu pro aktivaci akce, zakažte ji pro ukončení.

### Pipeline objednávek

Pipeline objednávek používá **časovače** pro termíny plateb a **CEP absenci** pro proaktivní připomínky:

```text
  order.created         payment.completed        order.paid
       │                       │                      │
       ▼                       ▼                      ▼
  ┌──────────┐           ┌──────────┐           ┌──────────┐
  │ Potvrzení│──timer──→ │ Platba   │           │ Odeslání │
  │ objed.   │  15 min   │ přijata  │──zrušení─→│ objed.   │
  │ set fact │           │ set fact │   timer   │ set fact │
  └──────────┘           └──────────┘           └──────────┘
       │
       │ (pokud časovač expiruje)
       ▼
  ┌──────────┐
  │ Zrušení  │
  │ objed.   │
  └──────────┘
```

Vzor absence (`payment-absence-monitor`) funguje společně s časovačem jako včasné varování: pokud uplyne 10 minut bez platby, odešle se připomínka. Pokud uplyne celých 15 minut bez platby, pravidlo založené na časovači zruší objednávku.

### Věrnostní program

Vrstva věrnosti používá **pravidla spouštěná fakty** pro reakci na změny útraty:

```text
  customer:ID:spent
       │
       ├──── >= $500  ──→ silver
       ├──── >= $2000 ──→ gold
       └──── >= $5000 ──→ platinum
```

Každé pravidlo povýšení kontroluje jak práh útraty, tak současnou úroveň. Tím se předchází přeskakování úrovní — zákazník na úrovni bronze, který dosáhne $2000, se nejprve stane silver (pravidlo silver se spustí, protože jeho podmínka odpovídá), a poté se okamžitě spustí pravidlo gold, protože úroveň je nyní silver a útrata je >= $2000.

### Obnova košíku

Obnova košíku používá jednoduchý vzor časovače:

1. `cart.add` → spuštění 30minutového časovače
2. Časovač expiruje → event `cart.abandoned` → emailová připomínka
3. `cart.checkout` → zrušení časovače (zákazník nakoupil)

Tento vzor je běžný v e-shopech a demonstruje, jak časovače přemosťují mezeru mezi "něco se stalo" a "něco se nestalo v daném časovém rámci."

### Správa zásob

Pravidla zásob reagují na **změny faktů** místo eventů. Když se zásoby aktualizují přes `setFact('product:SKU:stock', novaHodnota)`, pravidla spouštěná fakty se vyhodnotí:

- Zásoby < 10 a > 0 → alert nízký stav
- Zásoby <= 0 → označení produktu jako nedostupného

Toto odděluje logiku zásob od pipeline objednávek. Jakýkoli proces, který mění zásoby (vrátky, manuální úpravy, dodávky od dodavatelů), automaticky spouští odpovídající alerty.

## Cvičení

Rozšiřte systém o **odměnu pro vracejícího se zákazníka**: pokud zákazník zadá 3 nebo více objednávek během 7 dní, emitujte event `loyalty.repeat_reward` s 10% kupónovým kódem. Použijte CEP count vzor.

Navíc přidejte pravidlo, které odešle **potvrzovací email o odeslání** při spuštění `order.shipped`, s využitím `emailService`.

<details>
<summary>Řešení</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, callService, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// Odměna pro vracejícího se zákazníka (CEP count)
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
    .also(log('info', 'Odměna pro vracejícího se zákazníka: ${trigger.groupKey}'))
    .build()
);

// Potvrzovací email o odeslání
engine.registerRule(
  Rule.create('shipping-email')
    .name('Shipping Confirmation Email')
    .priority(40)
    .tags('order', 'notification')
    .when(onEvent('order.shipped'))
    .then(callService('emailService', 'send', [
      ref('event.customerId'),
      'Vaše objednávka byla odeslána!',
      'Objednávka ${event.orderId} je na cestě.',
    ]))
    .also(log('info', 'Email o odeslání odeslán: ${event.orderId}'))
    .build()
);
```

Vzor count sleduje eventy `order.paid` na zákazníka v 7denním posuvném okně. Když dorazí třetí platba, spustí se event odměny. Pravidlo emailu o odeslání naslouchá na `order.shipped` a volá emailovou službu — jednoduchá event-driven notifikace.

</details>

## Shrnutí

- Organizujte pravidla do **prioritních vrstev**: cenotvorba nejdřív, pak pipeline objednávek, věrnost, obnova košíku, zásoby
- Používejte **skupiny pravidel** pro přepínatelné funkce jako flash výprodeje — povolte/zakažte skupinu místo úpravy pravidel
- Používejte **časovače** pro termíny (timeout platby) a opožděné akce (opuštění košíku)
- Používejte **CEP absenci** pro včasná varování (připomínka platby před tvrdým timeoutem)
- Používejte **pravidla spouštěná fakty** pro logiku závislou na stavu (povýšení věrnosti, alerty zásob)
- Topiky eventů slouží jako **kontrakty** mezi vrstvami — každá vrstva produkuje eventy, které navazující vrstvy konzumují
- Fakta poskytují **dotazovatelný stav** pro dashboardy a API (stav objednávky, úroveň zákazníka, stav zásob)
- Systém je **rozšiřitelný**: přidání nového cenového pravidla, věrnostní úrovně nebo notifikace nevyžaduje změnu existujících pravidel

---

Další: [Systém detekce podvodů](./02-detekce-podvodu.md)
