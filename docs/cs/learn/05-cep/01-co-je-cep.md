# Co je CEP?

Vse, co jste dosud postavili, reaguje na jednu udalost nebo jednu zmenu faktu. To je silne, ale realna business logika casto zavisi na **vztazich mezi udalostmi v case**. Zaplatil zakaznik do 15 minut od vytvoreni objednavky? Doslo k peti neuspesnym pokus o prihlaseni za posledni minutu? Prekrocila prumerna teplota senzoru bezpecnostni prah za posledni hodinu? Complex Event Processing (CEP) vam umozni vyjadrit tyto temporalni vzory jako deklarativni pravidla, bez psani imperativnich polling smycek nebo manualni spravy stavu.

## Co se naucite

- Proc pravidla pro jednu udalost nedokazi zachytit temporalni business logiku
- Ctyri typy CEP vzoru a kdy pouzit ktery
- Jak TemporalProcessor zapada do architektury enginu
- Jak rozpoznat CEP pozadavky v realnych problemech

## Limity pravidel pro jednu udalost

Uvazme scenar timeoutu platby. Po vytvoreni objednavky ma zakaznik 15 minut na zaplaceni. Pokud platba neprijde, objednavka se ma zrusit.

S pravidly pro jednu udalost byste potrebovali neco jako:

```typescript
// Pravidlo 1: Pri vytvoreni objednavky spustit casovac
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

// Pravidlo 2: Pri prijmu platby zrusit casovac
engine.registerRule(
  Rule.create('cancel-payment-timer')
    .when(onEvent('payment.received'))
    .then(cancelTimer('payment-timeout:${event.orderId}'))
    .build()
);

// Pravidlo 3: Pri timeoutu zrusit objednavku
engine.registerRule(
  Rule.create('cancel-unpaid-order')
    .when(onEvent('order.payment_timeout'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .build()
);
```

Tri pravidla, manualni sprava casovace a business zamer — "pokud platba nenasladuje objednavku do 15 minut" — je roztrousen pres vsechna. S CEP je stejna logika jedina deklarace:

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

Jedno pravidlo. Jeden zamer. Engine se postara o casovac, zruseni a grupovani.

## Ctyri typy vzoru

CEP v noex-rules poskytuje ctyri temporalni typy vzoru. Kazdy detekuje jiny druh vztahu mezi udalostmi v case:

```text
  ┌─────────────────────────────────────────────────────────────────────┐
  │                      Typy CEP vzoru                                │
  ├─────────────┬───────────────────────────────────────────────────────┤
  │  SEKVENCE   │  Udalosti prijdou v urcitem poradi                  │
  │             │  "A se stalo, pak B, behem 5 minut"                 │
  ├─────────────┼───────────────────────────────────────────────────────┤
  │  ABSENCE    │  Ocekavana udalost nikdy neprisla                   │
  │             │  "A se stalo, ale B nenasledovalo do 15 min"        │
  ├─────────────┼───────────────────────────────────────────────────────┤
  │  POCET      │  Prilis mnoho (nebo malo) udalosti v casovem okne   │
  │             │  "5+ neuspesnych prihlaseni behem 1 minuty"         │
  ├─────────────┼───────────────────────────────────────────────────────┤
  │  AGREGACE   │  Numericka agregace prekroci prah                   │
  │             │  "Soucet objednavek prekrocil $10 000 za 1 hodinu"  │
  └─────────────┴───────────────────────────────────────────────────────┘
```

### Sekvence

Detekuje udalosti prichazejici v urcitem poradi v casovem okne. Pouzijte ji pro vicekrokove workflow, kde potrebujete potvrdit, ze kazdy krok probehl ve spravnem poradi.

**Priklady**: tok objednavka → platba → odeslani, registrace uzivatele → overeni emailu → prvni prihlaseni.

### Absence

Detekuje, ze ocekavana udalost **neprisla** v casovem okne po spousteci udalosti. Pouzijte ji pro detekci timeoutu a monitoring SLA.

**Priklady**: objednavka vytvorena, ale zadna platba do 15 minut; tikety podpory otevreny, ale zadna odpoved do 1 hodiny.

### Pocet

Detekuje, kdyz pocet odpovidajicich udalosti v casovem okne prekroci prah. Pouzijte ho pro frekvencne zalozene alertovani a omezeni rychlosti.

**Priklady**: 5+ neuspesnych prihlaseni za 5 minut (brute force), 100+ API chyb za 1 minutu (detekce vypadku).

### Agregace

Detekuje, kdyz numericka agregace (soucet, prumer, min, max) hodnot poli udalosti prekroci prah v casovem okne. Pouzijte ji pro monitoring na zaklade hodnot.

**Priklady**: celkove trzby > $10 000 za 1 hodinu, prumerna doba odezvy > 500ms za 5 minut.

## Jak CEP zapada do architektury

TemporalProcessor je dedikavona komponenta, ktera funguje vedle standardniho vyhodnocovani pravidel enginu:

```text
  Udalost prichazi
       │
       ▼
  ┌─────────────┐
  │ RuleEngine  │
  │             │
  │  ┌──────────────────────────────┐
  │  │ Standardni vyhodnoceni       │──── event/fact triggery → podminky → akce
  │  └──────────────────────────────┘
  │             │
  │  ┌──────────────────────────────┐
  │  │ TemporalProcessor            │──── CEP pattern matching
  │  │                              │
  │  │  SequenceMatcher             │──── sleduje usporadane retezce udalosti
  │  │  AbsenceMatcher              │──── sleduje chybejici udalosti + timeouty
  │  │  CountMatcher                │──── sleduje frekvencni okna udalosti
  │  │  AggregateMatcher            │──── sleduje okna numericke agregace
  │  └──────────────────────────────┘
  │             │
  │  ┌──────────────────────────────┐
  │  │ TimerManager                 │──── spravuje timeout callbacky
  │  └──────────────────────────────┘
  │             │
  │  ┌──────────────────────────────┐
  │  │ EventStore                   │──── historie udalosti pro casove dotazy
  │  └──────────────────────────────┘
  └─────────────┘
       │
       ▼
  Shoda vzoru → vyhodnoceni podminek pravidla → provedeni akci
```

**Klicove komponenty**:

| Komponenta | Role |
|------------|------|
| `TemporalProcessor` | Koordinuje vsechny ctyri matchery, registruje pravidla, smeruje udalosti |
| `SequenceMatcher` | Spravuje instance sekvenci, sleduje matchnute udalosti v poradi |
| `AbsenceMatcher` | Spravuje instance absenci, spousti se pri timeoutu |
| `CountMatcher` | Spravuje okna poctu (klouzava a pevna) |
| `AggregateMatcher` | Spravuje okna agregace, pocita sum/avg/min/max |
| `TimerManager` | Vytvari a rusi casovace pro deadliny sekvenci/absenci |
| `EventStore` | Uklada nedavne udalosti pro casove dotazy poctu/agregace |

Kdyz je CEP pravidlo registrovano, jeho temporalni trigger je naparsovan a predan prislusnemu matcheru. Jak udalosti protekaji enginem, TemporalProcessor kontroluje kazdou vuci vsem aktivnim vzorum. Kdyz vzor matchne, engine vyhodnoti podminky pravidla a — pokud projdou — provede jeho akce.

## Zivotni cyklus vzoru

Kazdy CEP vzor udrzuje **instance** — jednu na unikatni skupinu (definovanou `groupBy`). Kazda instance prochazi stavovym automatem:

```text
  Sekvence:   pending ──→ matching ──→ completed
                                  └──→ expired

  Absence:    pending ──→ waiting  ──→ completed  (timeout, udalost neprisla)
                                  └──→ cancelled  (ocekavana udalost prisla)

  Pocet:      active ──→ triggered
                    └──→ expired

  Agregace:   active ──→ triggered
                    └──→ expired
```

Instance jsou automaticky uklizeny po dokonceni nebo expiraci. Pole `groupBy` zajistuje, ze kazda logicka skupina (napr. kazde `orderId`) ma vlastni nezavislou instanci.

## Rozpoznavani CEP pozadavku

Pri analyze business pozadavku hledejte tyto fraze:

| Fraze | Vzor |
|-------|------|
| "A nasledovane B behem X casu" | **Sekvence** |
| "A pak B pak C v poradi" | **Sekvence** |
| "Pokud B nenastane behem X po A" | **Absence** |
| "Zadna odpoved behem X" | **Absence** |
| "Vice nez N udalosti za X casu" | **Pocet** |
| "Rychlost prekracuje N za minutu/hodinu" | **Pocet** |
| "Celkem/prumer/soucet prekracuje X v casovem okne" | **Agregace** |
| "Kdyz soucet ... prekroci prah" | **Agregace** |

## Priklady z realneho sveta

### E-Commerce: vyrizeni objednavky

"Objednavka musi byt odeslana do 48 hodin od potvrzeni platby."

→ Vzor **absence**: po `payment.confirmed` ocekavejte `shipment.dispatched` behem `48h`, grupovano podle `orderId`.

### Bezpecnost: detekce brute force

"Zamknete ucet po 5 neuspesnych pokusech o prihlaseni behem 5 minut."

→ Vzor **pocet**: pocitejte udalosti `auth.login_failed`, prah 5, okno `5m`, grupovano podle `userId`.

### Finance: monitoring transakci

"Upozornete, pokud celkova castka transakci prekroci $50 000 behem 1 hodiny pro stejny ucet."

→ Vzor **agregace**: agregujte `transaction.completed` na poli `amount`, funkce `sum`, prah 50000, okno `1h`, grupovano podle `accountId`.

### IoT: vicekrokova porucha

"Upozornete, pokud senzor hlasi vysokou teplotu, pak vysoky tlak, pak vibrace — v tomto poradi behem 10 minut."

→ Vzor **sekvence**: udalosti `sensor.high_temp`, `sensor.high_pressure`, `sensor.vibration`, behem `10m`, grupovano podle `sensorId`.

## Cviceni

Pro kazdy business pozadavek identifikujte spravny typ CEP vzoru a vysvetlete proc:

1. "Pokud uzivatel prida polozky do kosiku, ale neuskutecni objednavku do 30 minut, poslete pripominaci email."
2. "Upozornete bezpecnostni tym, kdyz jedna IP adresa uskutecni vice nez 100 API pozadavku za 1 minutu."
3. "Sledujte platebni pipeline: objednavka vytvorena → platba autorizovana → platba zachycena, vse behem 10 minut."
4. "Upozornete sklad, kdyz celkova hmotnost objednavek cekajicich na odeslani prekroci 500 kg za posledni 2 hodiny."

<details>
<summary>Reseni</summary>

1. **Absence** — po `cart.item_added` ocekavejte `checkout.completed` behem `30m`, grupovano podle `userId`. Klicem je "nenastane behem" → absence.

2. **Pocet** — pocitejte udalosti `api.request`, prah 100, okno `1m`, grupovano podle `ipAddress`. Klicem je "vice nez N udalosti v case" → pocet.

3. **Sekvence** — udalosti `order.created` → `payment.authorized` → `payment.captured`, behem `10m`, grupovano podle `orderId`. Klicem je "A pak B pak C v poradi" → sekvence.

4. **Agregace** — agregujte `order.pending_shipment` na poli `weight`, funkce `sum`, prah 500, okno `2h`. Klicem je "celkem prekracuje prah v case" → agregace.

</details>

## Shrnuti

- Pravidla pro jednu udalost nedokazi vyjadrit temporalni vztahy mezi udalostmi
- CEP poskytuje ctyri typy vzoru: **sekvence**, **absence**, **pocet** a **agregace**
- Kazdy typ vzoru resi odlisnou kategorii temporalni business logiky
- TemporalProcessor koordinuje pattern matching vedle standardniho vyhodnocovani pravidel
- Instance vzoru jsou izolovany pomoci `groupBy` a nasleduji definovane stavove automaty
- Hledejte temporalni klicova slova v pozadavcich ("behem", "nasledovano", "nenastane", "rychlost", "celkem prekracuje") pro identifikaci CEP prilezitosti

---

Dalsi: [Sekvence a absence](./02-sekvence-a-absence.md)
