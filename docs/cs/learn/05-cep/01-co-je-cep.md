# Co je CEP?

Vše, co jste dosud postavili, reaguje na jednu událost nebo jednu změnu faktu. To je silné, ale reálná business logika často závisí na **vztazích mezi událostmi v čase**. Zaplatil zákazník do 15 minut od vytvoření objednávky? Došlo k pěti neúspěšným pokusům o přihlášení za poslední minutu? Překročila průměrná teplota senzoru bezpečnostní práh za poslední hodinu? Complex Event Processing (CEP) vám umožní vyjádřit tyto temporální vzory jako deklarativní pravidla, bez psaní imperativních polling smyček nebo manuální správy stavu.

## Co se naučíte

- Proč pravidla pro jednu událost nedokáží zachytit temporální business logiku
- Čtyři typy CEP vzorů a kdy použít který
- Jak TemporalProcessor zapadá do architektury enginu
- Jak rozpoznat CEP požadavky v reálných problémech

## Limity pravidel pro jednu událost

Uvažme scénář timeoutu platby. Po vytvoření objednávky má zákazník 15 minut na zaplacení. Pokud platba nepřijde, objednávka se má zrušit.

S pravidly pro jednu událost byste potřebovali něco jako:

```typescript
// Pravidlo 1: Při vytvoření objednávky spustit časovač
engine.registerRule(
  Rule.create('start-payment-timer')
    .when(onEvent('order.created'))
    .then(setTimer({
      name: 'payment-timeout:${event.orderId}',
      duration: '15m',
      onExpire: {
        topic: 'order.payment_timeout',
        data: { orderId: ref('event.orderId') },
      },
    }))
    .build()
);

// Pravidlo 2: Při příjmu platby zrušit časovač
engine.registerRule(
  Rule.create('cancel-payment-timer')
    .when(onEvent('payment.received'))
    .then(cancelTimer('payment-timeout:${event.orderId}'))
    .build()
);

// Pravidlo 3: Při timeoutu zrušit objednávku
engine.registerRule(
  Rule.create('cancel-unpaid-order')
    .when(onEvent('order.payment_timeout'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .build()
);
```

Tři pravidla, manuální správa časovače a business záměr — "pokud platba nenásleduje objednávku do 15 minut" — je roztroušen přes všechna. S CEP je stejná logika jediná deklarace:

```typescript
engine.registerRule(
  Rule.create('payment-timeout')
    .when(absence()
      .after('order.created')
      .expected('payment.received')
      .within('15m')
      .groupBy('orderId')
    )
    .then(setFact('order:${trigger.after.orderId}:status', 'cancelled'))
    .build()
);
```

Jedno pravidlo. Jeden záměr. Engine se postará o časovač, zrušení a grupování.

## Čtyři typy vzorů

CEP v noex-rules poskytuje čtyři temporální typy vzorů. Každý detekuje jiný druh vztahu mezi událostmi v čase:

```text
  ┌─────────────────────────────────────────────────────────────────────┐
  │                      Typy CEP vzorů                                │
  ├─────────────┬───────────────────────────────────────────────────────┤
  │  SEKVENCE   │  Události přijdou v určitém pořadí                  │
  │             │  "A se stalo, pak B, během 5 minut"                 │
  ├─────────────┼───────────────────────────────────────────────────────┤
  │  ABSENCE    │  Očekávaná událost nikdy nepřišla                   │
  │             │  "A se stalo, ale B nenásledovalo do 15 min"        │
  ├─────────────┼───────────────────────────────────────────────────────┤
  │  POČET      │  Příliš mnoho (nebo málo) událostí v časovém okně   │
  │             │  "5+ neúspěšných přihlášení během 1 minuty"         │
  ├─────────────┼───────────────────────────────────────────────────────┤
  │  AGREGACE   │  Numerická agregace překročí práh                   │
  │             │  "Součet objednávek překročil $10 000 za 1 hodinu"  │
  └─────────────┴───────────────────────────────────────────────────────┘
```

### Sekvence

Detekuje události přicházející v určitém pořadí v časovém okně. Použijte ji pro vícekrokové workflow, kde potřebujete potvrdit, že každý krok proběhl ve správném pořadí.

**Příklady**: tok objednávka → platba → odeslání, registrace uživatele → ověření emailu → první přihlášení.

### Absence

Detekuje, že očekávaná událost **nepřišla** v časovém okně po spouštěcí události. Použijte ji pro detekci timeoutu a monitoring SLA.

**Příklady**: objednávka vytvořena, ale žádná platba do 15 minut; tikety podpory otevřeny, ale žádná odpověď do 1 hodiny.

### Počet

Detekuje, když počet odpovídajících událostí v časovém okně překročí práh. Použijte ho pro frekvenčně založené alertování a omezení rychlosti.

**Příklady**: 5+ neúspěšných přihlášení za 5 minut (brute force), 100+ API chyb za 1 minutu (detekce výpadku).

### Agregace

Detekuje, když numerická agregace (součet, průměr, min, max) hodnot polí událostí překročí práh v časovém okně. Použijte ji pro monitoring na základě hodnot.

**Příklady**: celkové tržby > $10 000 za 1 hodinu, průměrná doba odezvy > 500ms za 5 minut.

## Jak CEP zapadá do architektury

TemporalProcessor je dedikovaná komponenta, která funguje vedle standardního vyhodnocování pravidel enginu:

```text
  Událost přichází
       │
       ▼
  ┌─────────────┐
  │ RuleEngine  │
  │             │
  │  ┌──────────────────────────────┐
  │  │ Standardní vyhodnocení       │──── event/fact triggery → podmínky → akce
  │  └──────────────────────────────┘
  │             │
  │  ┌──────────────────────────────┐
  │  │ TemporalProcessor            │──── CEP pattern matching
  │  │                              │
  │  │  SequenceMatcher             │──── sleduje uspořádané řetězce událostí
  │  │  AbsenceMatcher              │──── sleduje chybějící události + timeouty
  │  │  CountMatcher                │──── sleduje frekvenční okna událostí
  │  │  AggregateMatcher            │──── sleduje okna numerické agregace
  │  └──────────────────────────────┘
  │             │
  │  ┌──────────────────────────────┐
  │  │ TimerManager                 │──── spravuje timeout callbacky
  │  └──────────────────────────────┘
  │             │
  │  ┌──────────────────────────────┐
  │  │ EventStore                   │──── historie událostí pro časové dotazy
  │  └──────────────────────────────┘
  └─────────────┘
       │
       ▼
  Shoda vzoru → vyhodnocení podmínek pravidla → provedení akcí
```

**Klíčové komponenty**:

| Komponenta | Role |
|------------|------|
| `TemporalProcessor` | Koordinuje všechny čtyři matchery, registruje pravidla, směruje události |
| `SequenceMatcher` | Spravuje instance sekvencí, sleduje matchnuté události v pořadí |
| `AbsenceMatcher` | Spravuje instance absencí, spouští se při timeoutu |
| `CountMatcher` | Spravuje okna počtu (klouzavá a pevná) |
| `AggregateMatcher` | Spravuje okna agregace, počítá sum/avg/min/max |
| `TimerManager` | Vytváří a ruší časovače pro deadliny sekvencí/absencí |
| `EventStore` | Ukládá nedávné události pro časové dotazy počtu/agregace |

Když je CEP pravidlo registrováno, jeho temporální trigger je naparsován a předán příslušnému matcheru. Jak události protékají enginem, TemporalProcessor kontroluje každou vůči všem aktivním vzorům. Když vzor matchne, engine vyhodnotí podmínky pravidla a — pokud projdou — provede jeho akce.

## Životní cyklus vzorů

Každý CEP vzor udržuje **instance** — jednu na unikátní skupinu (definovanou `groupBy`). Každá instance prochází stavovým automatem:

```text
  Sekvence:   pending ──→ matching ──→ completed
                                  └──→ expired

  Absence:    pending ──→ waiting  ──→ completed  (timeout, událost nepřišla)
                                  └──→ cancelled  (očekávaná událost přišla)

  Počet:      active ──→ triggered
                    └──→ expired

  Agregace:   active ──→ triggered
                    └──→ expired
```

Instance jsou automaticky uklizeny po dokončení nebo expiraci. Pole `groupBy` zajišťuje, že každá logická skupina (např. každé `orderId`) má vlastní nezávislou instanci.

## Rozpoznávání CEP požadavků

Při analýze business požadavků hledejte tyto fráze:

| Fráze | Vzor |
|-------|------|
| "A následované B během X času" | **Sekvence** |
| "A pak B pak C v pořadí" | **Sekvence** |
| "Pokud B nenastane během X po A" | **Absence** |
| "Žádná odpověď během X" | **Absence** |
| "Více než N událostí za X času" | **Počet** |
| "Rychlost překračuje N za minutu/hodinu" | **Počet** |
| "Celkem/průměr/součet překračuje X v časovém okně" | **Agregace** |
| "Když součet ... překročí práh" | **Agregace** |

## Příklady z reálného světa

### E-Commerce: vyřízení objednávky

"Objednávka musí být odeslána do 48 hodin od potvrzení platby."

→ Vzor **absence**: po `payment.confirmed` očekávejte `shipment.dispatched` během `48h`, grupováno podle `orderId`.

### Bezpečnost: detekce brute force

"Zamkněte účet po 5 neúspěšných pokusech o přihlášení během 5 minut."

→ Vzor **počet**: počítejte události `auth.login_failed`, práh 5, okno `5m`, grupováno podle `userId`.

### Finance: monitoring transakcí

"Upozorněte, pokud celková částka transakcí překročí $50 000 během 1 hodiny pro stejný účet."

→ Vzor **agregace**: agregujte `transaction.completed` na poli `amount`, funkce `sum`, práh 50000, okno `1h`, grupováno podle `accountId`.

### IoT: vícekroková porucha

"Upozorněte, pokud senzor hlásí vysokou teplotu, pak vysoký tlak, pak vibrace — v tomto pořadí během 10 minut."

→ Vzor **sekvence**: události `sensor.high_temp`, `sensor.high_pressure`, `sensor.vibration`, během `10m`, grupováno podle `sensorId`.

## Cvičení

Pro každý business požadavek identifikujte správný typ CEP vzoru a vysvětlete proč:

1. "Pokud uživatel přidá položky do košíku, ale neuskuteční objednávku do 30 minut, pošlete připomínací email."
2. "Upozorněte bezpečnostní tým, když jedna IP adresa uskuteční více než 100 API požadavků za 1 minutu."
3. "Sledujte platební pipeline: objednávka vytvořena → platba autorizována → platba zachycena, vše během 10 minut."
4. "Upozorněte sklad, když celková hmotnost objednávek čekajících na odeslání překročí 500 kg za poslední 2 hodiny."

<details>
<summary>Řešení</summary>

1. **Absence** — po `cart.item_added` očekávejte `checkout.completed` během `30m`, grupováno podle `userId`. Klíčem je "nenastane během" → absence.

2. **Počet** — počítejte události `api.request`, práh 100, okno `1m`, grupováno podle `ipAddress`. Klíčem je "více než N událostí v čase" → počet.

3. **Sekvence** — události `order.created` → `payment.authorized` → `payment.captured`, během `10m`, grupováno podle `orderId`. Klíčem je "A pak B pak C v pořadí" → sekvence.

4. **Agregace** — agregujte `order.pending_shipment` na poli `weight`, funkce `sum`, práh 500, okno `2h`. Klíčem je "celkem překračuje práh v čase" → agregace.

</details>

## Shrnutí

- Pravidla pro jednu událost nedokáží vyjádřit temporální vztahy mezi událostmi
- CEP poskytuje čtyři typy vzorů: **sekvence**, **absence**, **počet** a **agregace**
- Každý typ vzoru řeší odlišnou kategorii temporální business logiky
- TemporalProcessor koordinuje pattern matching vedle standardního vyhodnocování pravidel
- Instance vzorů jsou izolovány pomocí `groupBy` a následují definované stavové automaty
- Hledejte temporální klíčová slova v požadavcích ("během", "následováno", "nenastane", "rychlost", "celkem překračuje") pro identifikaci CEP příležitostí

---

Další: [Sekvence a absence](./02-sekvence-a-absence.md)
