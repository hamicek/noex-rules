# Vizualni tvorba pravidel

Predchozi kapitola predstavila stranky a navigaci weboveho rozhrani. Tato kapitola se zameruje na hlavni workflow: vizualni tvorbu a upravu pravidel. Stranka Rule Detail nabizi ctyri komplementarni pohledy — strukturovany **formularovy editor**, **YAML editor**, **flow diagram** a **casovou osu historie verzi** — kazdy je vhodny pro jine ulohy. Formularovy editor se selectorem triggeru, builderem podminek a builderem akci je primarnim nastrojem pro sestavovani pravidel bez rucniho psani JSON nebo YAML.

## Co se naucite

- Ctyri zalozky detailu pravidla: Form, YAML, Flow, History
- Jak funguje RuleForm: metadata, selektor triggeru, builder podminek, builder akci
- Validace pomoci Zod a transformace dat z formulare do API formatu
- Jak `ruleToFlow()` prevadi pravidlo na React Flow graf s barevne odlisenymi uzly
- Uprava pravidel pres YAML editor
- Historie verzi s diffy, casovou osou a rollbackem
- Kompletni navod vytvoreni pravidla s vice podminkkami pres UI

## Zalozky detailu pravidla

Po kliknuti na pravidlo na strance Rules nebo po navigaci na `/rules/:ruleId` se otevre stranka Rule Detail se ctyrmi zalozkami:

```
+-------+-------+-------+---------+
| Form  | YAML  | Flow  | History |
+-------+-------+-------+---------+
```

| Zalozka | Ucel | Pouzijte kdyz |
|---------|------|---------------|
| **Form** | Strukturovany editor s typovanymi poli, rozbalovacimi nabidkami, dynamickymi poli | Tvorba pravidel, uprava jednotlivych poli, uceni se modelu pravidel |
| **YAML** | Textovy YAML editor | Hromadne upravu, copy-paste, export definic pravidel |
| **Flow** | Interaktivni flow diagram (pouze pro cteni) | Vizualizace logiky pravidel, prezentace, pochopeni slozitych pravidel |
| **History** | Casova osa verzi s diffy | Auditovani zmen, porovnavani verzi, rollback |

Vychozi zalozka je konfigurovatelna v Nastavenich (Form, YAML nebo Flow).

## Formular pravidla

Zalozka Form je primarni editor pravidel. Je rozdelena do ctyr sekci: Metadata, Trigger, Podminky a Akce.

### Sekce Metadata

```
+---------------------------------------------------+
| METADATA                                          |
| +------------------+  +------------------------+  |
| | ID               |  | Name                   |  |
| | [order-alert   ] |  | [Upozorneni hodnoty  ] |  |
| +------------------+  +------------------------+  |
|                                                   |
| Description                                       |
| [Upozorneni pri prekroceni prahove hodnoty      ] |
|                                                   |
| +----------+ +---------+ +--------+              |
| | Priority | | Group   | | ☑ Povoleno |          |
| | [10    ] | | [Prodej]| |        |              |
| +----------+ +---------+ +--------+              |
|                                                   |
| Tags                                              |
| [orders] [alerts] [_______________]               |
+---------------------------------------------------+
```

Pole:
- **ID** — Unikatni identifikator (povinny, po vytvoreni nemenitelny)
- **Name** — Lidsky citelny nazev (povinny)
- **Description** — Volitelny popis
- **Priority** — Cele cislo, vyssi hodnoty se vyhodnocuji driv
- **Group** — Rozbalovaci nabidka naplnena existujicimi skupinami pravidel pres GraphQL
- **Enabled** — Zaskrtavaci pole
- **Tags** — Chip input: napiste tag a stisknete Enter nebo carku pro pridani, kliknete na X pro odebrani

### Selektor triggeru

Sekce triggeru meni sve vstupni pole podle vybraneho typu triggeru:

| Typ triggeru | Vstupni pole | Placeholder |
|-------------|-------------|-------------|
| `fact` | Pattern | `customer:*:tier` |
| `event` | Topic | `order.created` |
| `timer` | Name | `payment-deadline-*` |
| `temporal` | Pattern | (pro CEP temporalni triggery) |

### Builder podminek

Podminky jsou dynamicke pole — pridejte kolik potrebujete, odebirejte jednotlive:

```
+---------------------------------------------------+
| PODMINKY                                          |
|                                                   |
| +---------+  +--------+  +----+  +-------+  +--+ |
| | Zdroj  |  | Pole   |  | Op |  | Hodnota|  |✕ | |
| | [event] |  | [total]|  |[>=]|  | [1000] |  |  | |
| +---------+  +--------+  +----+  +-------+  +--+ |
|                                                   |
| +---------+  +--------+  +------+  +-----+  +--+ |
| | Zdroj  |  | Klic   |  | Op   |  |Hodn.|  |✕ | |
| | [fact ] |  |[c:*:t] |  |[eq]  |  |"vip"|  |  | |
| +---------+  +--------+  +------+  +-----+  +--+ |
|                                                   |
| [+ Pridat podminku]                               |
+---------------------------------------------------+
```

Kazdy radek podminky ma:

- **Typ zdroje** — `event`, `fact`, `context`, `lookup`, `baseline`
- **Klic zdroje** — Konkretni pole se lisi podle typu zdroje:
  - `event` → `field` (napr. `total`, `customerId`)
  - `fact` → `pattern` (napr. `customer:*:tier`)
  - `context` → `key`
  - `lookup` → `name`
  - `baseline` → `metric`
- **Operator** — Vsechny standardni operatory: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`, `not_contains`, `matches`, `exists`, `not_exists`
- **Hodnota** — Textovy vstup, parsovany jako JSON pokud je to mozne (cisla, booleany, pole, objekty). Unarni operatory (`exists`, `not_exists`) skryvaji pole hodnoty.

### Builder akci

Akce nasleduji stejny vzor dynamickeho pole, s poli menicimi se podle typu akce:

| Typ akce | Pole |
|----------|------|
| `set_fact` | Klic, Hodnota (JSON) |
| `delete_fact` | Klic |
| `emit_event` | Topic, Data (JSON) |
| `set_timer` | Konfigurace casovace (JSON) |
| `cancel_timer` | Nazev casovace |
| `call_service` | Sluzba, Metoda, Argumenty (JSON) |
| `log` | Uroven (`debug`/`info`/`warn`/`error`), Zprava |
| `conditional` | Pocet then akci, pocet else akci |

Alespon jedna akce je vyzadovana — validace formulare to vynucuje.

### Validace

Formular pouziva Zod schemata s React Hook Form pro validaci na urovni poli:

```typescript
const ruleFormSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priority: z.number().int(),
  enabled: z.boolean(),
  tags: z.string().optional(),
  group: z.string().optional(),
  trigger: triggerSchema,
  conditions: z.array(conditionFormSchema),
  actions: z.array(actionFormSchema).min(1, 'At least one action is required'),
});
```

Validacni chyby se zobrazuji inline pod kazdym polem. Tlacitko odeslani je zakazano, dokud formular nema zmeny a vsechny validace neprojdou.

### Transformace dat formulare

Formular pouziva mezireprezentaci (`RuleFormData`), ktera uchova JSON hodnoty jako surove retezce pro pohodli editace. Pri odeslani `formDataToInput()` transformuje tuto reprezentaci na vstupni format API:

1. Retezec tagu je rozdelen podle carek do pole
2. Pole triggeru jsou filtrovana tak, aby obsahovaly pouze pole relevantni pro dany typ (`pattern` pro fakt, `topic` pro event, `name` pro casovac)
3. Hodnoty podminek jsou parsovany z JSON retezcu
4. Unarni operatory zcela odstrani pole hodnoty
5. Pole akci jsou parsovana z JSON retezcu podle typu akce

## Flow vizualizace

Zalozka Flow vykresluje pravidlo jako interaktivni graf pomoci React Flow. Funkce `ruleToFlow()` prevadi pravidlo na uzly a hrany:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ ▶ Event      │     │ ◆ Event:     │     │ ■ Emit Event │
│   Trigger    │────▶│   total      │────▶│   alert.high │
│              │     │   >= 1000    │     │              │
│ order.created│     │              │  ┌─▶│              │
└──────────────┘     └──────────────┘  │  └──────────────┘
                     ┌──────────────┐  │  ┌──────────────┐
                     │ ◆ Fact:      │  │  │ ■ Set Fact   │
                     │   c:*:tier   │──┘  │   order:*:   │
                     │   = "vip"    │────▶│   flagged    │
                     └──────────────┘     └──────────────┘
```

### Typy uzlu a barvy

| Typ uzlu | Ikona | Barva | Popis |
|----------|-------|-------|-------|
| Trigger | ▶ | Modra (`bg-blue-50`, `border-blue-300`) | Trigger pravidla (event, fakt, casovac, temporalni) |
| Podminka | ◆ | Zluta (`bg-amber-50`, `border-amber-300`) | Kazda podminka jako zdroj + operator + hodnota |
| Akce | ■ | Zelena (`bg-emerald-50`, `border-emerald-300`) | Kazda akce s typem a detailem klice |

### Algoritmus rozlozeni

Graf je rozlozen do tri sloupcu:

1. **Trigger** (vlevo) — Vzdy jeden uzel, vertikalne vycentrovany
2. **Podminky** (uprostred) — Naskladane vertikalne, pripojene od triggeru
3. **Akce** (vpravo) — Naskladane vertikalne, pripojene od vsech podminek (nebo primo od triggeru pokud nejsou podminky)

Parametry rozlozeni:
- Sirka uzlu: 220px
- Vyska uzlu: 70px
- Horizontalni mezera: 80px
- Vertikalni mezera: 24px

Nejvetsi sloupec urcuje celkovou vysku a mensi sloupce jsou vertikalne vycentrovany.

### Interakce

- **Pretahovani** uzlu pro preskladani (pozice se neukladaji — rozlozeni se resetuje pri nacteni)
- **Zoom** koleckem mysi nebo ovladacim panelem (+/- tlacitka)
- **Posun** pretazenim pozadi
- **MiniMapa** v pravem dolnim rohu pro orientaci ve slozitych pravidlech
- Uzly **nejsou propojitelne** — flow pohled je pouze pro cteni. Pro upravu struktury pravidla prepnete na zalozku Form nebo YAML.

### Styl hran

Hrany pouzivaji typ `smoothstep` s animovanymi carkami (sirka tahu 2, barva `#94a3b8`), coz poskytuje jasny vizualni tok zleva doprava.

## YAML editor

Zalozka YAML poskytuje textovy editor pro pravidlo:

```yaml
id: high-value-alert
name: Upozorneni na vysokou hodnotu
priority: 10
enabled: true
tags:
  - orders
  - alerts
trigger:
  type: event
  topic: order.created
conditions:
  - source:
      type: event
      field: total
    operator: gte
    value: 1000
actions:
  - type: emit_event
    topic: alert.high-value
    data:
      orderId: "${event.orderId}"
      total: "${event.total}"
```

YAML editor podporuje:
- Editaci s uvedomenim si syntaxe
- Tlacitka odeslani/zruseni (stejna jako na zalozce Form)
- Pri odeslani se YAML parsuje a odesle do stejne mutace `updateRule`

YAML pohled je uzitecny pro copy-paste definic pravidel, hromadnou upravu a porovnani se souborovymi zdroji pravidel.

## Historie verzi

Zalozka History ukazuje casovou osu vsech zmen pravidla:

```
v3 ─── updated ─── 2025-01-15 14:32
v2 ─── enabled ─── 2025-01-15 10:15
v1 ─── registered ─── 2025-01-14 09:00
```

Kazdy zaznam verze obsahuje:
- **Cislo verze**
- **Typ zmeny**: `registered`, `updated`, `enabled`, `disabled`, `unregistered`, `rolled_back`
- **Casove razitko**
- **Popis** (pokud byl uveden)

### Diffy

Vyberte dve verze pro zobrazeni diffu snimku pravidel, ktery zvyrazni, co se mezi verzemi zmenilo.

### Rollback

Kliknete na "Rollback" u jakekoli predchozi verze pro obnoveni pravidla do toho stavu. Toto vytvori novy zaznam verze s `changeType: 'rolled_back'` a zaznamena, ktera verze byla obnovena.

## Vytvoreni pravidla: kompletni navod

Tento navod vytvari pravidlo pres formularovy editor, ktere upozorni na objednavku vysoke hodnoty od VIP zakaznika.

### Krok 1: Navigace na vytvoreni pravidla

Stisknete `g n` nebo kliknete na "New Rule" na strance Rules. Formular pro vytvoreni se otevre s prazdnymi vychozimi hodnotami.

### Krok 2: Vyplneni metadat

- **ID**: `vip-high-value`
- **Name**: `VIP objednavka vysoke hodnoty`
- **Description**: `Upozorneni pri objednavce vysoke hodnoty od VIP zakaznika`
- **Priority**: `20`
- **Enabled**: zaskrtnuto
- **Tags**: napiste `orders` Enter, `vip` Enter, `alerts` Enter

### Krok 3: Konfigurace triggeru

Vyberte typ triggeru **Event** a nastavte topic na `order.created`.

### Krok 4: Pridani podminek

Dvakrat kliknete na "+ Pridat podminku" pro vytvoreni dvou radku podminek:

**Podminka 1** — Kontrola castky objednavky:
- Zdroj: `event`
- Pole: `total`
- Operator: `>=`
- Hodnota: `1000`

**Podminka 2** — Kontrola urovne zakaznika:
- Zdroj: `fact`
- Pattern: `customer:${event.customerId}:tier`
- Operator: `eq`
- Hodnota: `"vip"`

### Krok 5: Pridani akci

**Akce 1** — Emitovani alertoveho eventu:
- Typ: `emit_event`
- Topic: `alert.vip-high-value`
- Data: `{"orderId": "${event.orderId}", "customerId": "${event.customerId}", "total": "${event.total}"}`

**Akce 2** — Zalogovani alertu:
- Typ: `log`
- Uroven: `info`
- Zprava: `VIP objednavka vysoke hodnoty: ${event.orderId} ($${event.total})`

### Krok 6: Odeslani

Kliknete na "Create Rule". Formular validuje vsechna pole, transformuje data a odesle mutaci `createRule` pres GraphQL. Po uspechu jste presmerovani na stranku Rule Detail.

### Krok 7: Overeni ve Flow

Prepnete na zalozku Flow pro vizualni reprezentaci:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ ▶ Event      │     │ ◆ Event:     │     │ ■ Emit Event │
│   Trigger    │────▶│   total      │────▶│   alert.vip- │
│              │     │   >= 1000    │  ┌─▶│   high-value │
│ order.created│     └──────────────┘  │  └──────────────┘
└──────────────┘     ┌──────────────┐  │  ┌──────────────┐
       │             │ ◆ Fact:      │  │  │ ■ Log        │
       └────────────▶│   customer:  │──┘  │   VIP objedn.│
                     │   = "vip"    │────▶│   vysoke...  │
                     └──────────────┘     └──────────────┘
```

### Krok 8: Testovani

Stisknete `g e` pro navigaci na stranku Events. Pripravte predpoklady:

Nejprve zajistete existenci VIP faktu. Prejdete na Facts (`g f`) a vytvorte:
- Klic: `customer:c-42:tier`
- Hodnota: `"vip"`

Pak prejdete na Events (`g e`) a emitujte:
- Topic: `order.created`
- Data: `{"orderId": "o-99", "customerId": "c-42", "total": 1500}`

Sledujte stream eventu — meli byste videt `order.created` nasledovany `alert.vip-high-value`, kdyz se pravidlo spusti.

## Cviceni

1. Otevrete webove rozhrani a vytvorte pravidlo nazvane "Upozorneni na nizky sklad" s temito specifikacemi:
   - Trigger: event `inventory.updated`
   - Podminka 1: event pole `quantity` mensi nez 10
   - Podminka 2: fakt `product:${event.productId}:tracked` se rovna `true`
   - Akce 1: emitujte event `alert.low-stock` s `{ "productId": "${event.productId}", "quantity": "${event.quantity}" }`
   - Akce 2: nastavte fakt `product:${event.productId}:lowStock` na `true`
   - Tagy: `inventory`, `alerts`
   - Priorita: 15
2. Prepnete na zalozku Flow a overte, ze graf ukazuje 1 trigger, 2 podminky a 2 akce
3. Nastavte fakt `product:p-1:tracked` na `true` na strance Facts
4. Emitujte event `inventory.updated` s `{ "productId": "p-1", "quantity": 5 }` ze stranky Events
5. Overte, ze `product:p-1:lowStock` je `true` na strance Facts
6. Zobrazte zalozku Version History — potvrdite verzi 1 s typem zmeny `registered`
7. Upravte pravidlo: zmente prahovou hodnotu mnozstvi z 10 na 20 na zalozce Form
8. Zkontrolujte zalozku History znovu — potvrdite verzi 2 s typem zmeny `updated`

<details>
<summary>Reseni</summary>

Vytvorte pravidlo pres zalozku Form:

**Metadata:**
- ID: `low-stock-alert`
- Name: `Upozorneni na nizky sklad`
- Priority: 15
- Enabled: zaskrtnuto
- Tags: `inventory`, `alerts`

**Trigger:**
- Typ: Event
- Topic: `inventory.updated`

**Podminky:**
- Podminka 1: Zdroj `event`, pole `quantity`, operator `<`, hodnota `10`
- Podminka 2: Zdroj `fact`, pattern `product:${event.productId}:tracked`, operator `eq`, hodnota `true`

**Akce:**
- Akce 1: Typ `emit_event`, topic `alert.low-stock`, data `{"productId": "${event.productId}", "quantity": "${event.quantity}"}`
- Akce 2: Typ `set_fact`, klic `product:${event.productId}:lowStock`, hodnota `true`

Kliknete na "Create Rule".

**Zalozka Flow** ukazuje:
```
[Event Trigger: inventory.updated]
  → [Event: quantity < 10]     → [Emit Event: alert.low-stock]
  → [Fact: product:*:tracked = true] → [Set Fact: product:*:lowStock]
```

**Stranka Facts** (`g f`): Vytvorte `product:p-1:tracked` s hodnotou `true`

**Stranka Events** (`g e`): Emitujte topic `inventory.updated`, data `{"productId": "p-1", "quantity": 5}`

**Stranka Facts**: `product:p-1:lowStock` je nyni `true`

**Zalozka History**: Ukazuje v1 `registered`

**Zalozka Form**: Zmente hodnotu podminky 1 z `10` na `20`, kliknete na "Save Changes"

**Zalozka History**: Nyni ukazuje v2 `updated` a v1 `registered`

</details>

## Shrnuti

- Stranka Rule Detail ma ctyri zalozky: **Form** (strukturovany editor), **YAML** (textovy editor), **Flow** (vizualni diagram), **History** (casova osa verzi)
- Formularovy editor organizuje tvorbu pravidel do Metadat, Triggeru, Podminek a Akci se Zod validaci
- Selektor triggeru dynamicky meni vstupni pole (pattern/topic/name) podle typu triggeru
- Builder podminek podporuje vsechny typy zdroju (`event`, `fact`, `context`, `lookup`, `baseline`) a operatory, s automatickym skrytim pole hodnoty pro unarni operatory
- Builder akci prizpusobuje sva pole kazdemu typu akce (`set_fact`, `emit_event`, `set_timer`, `call_service`, `log` atd.)
- `formDataToInput()` transformuje mezilehlou formularovou reprezentaci (surove JSON retezce) na vstupni format API, parsuje hodnoty a filtruje nerelevantni pole
- Flow pohled pouziva `ruleToFlow()` pro vytvoreni trisloupacoveho React Flow grafu: Trigger → Podminky → Akce s barevne odlisenymi, pretahovatelnymi uzly
- Hrany pouzivaji animovane `smoothstep` propojeni s MiniMapou a ovladacim panelem pro zoom
- YAML editor poskytuje textovou alternativu pro hromadnou upravu a export
- Historie verzi ukazuje casovou osu zmen s diffy a moznosti rollbacku
- Rollback vytvari novy zaznam verze s `changeType: 'rolled_back'` misto prepisu historie

---

Dalsi: [Pravidlovy system pro e-shop](../12-projekty/01-eshop.md)
