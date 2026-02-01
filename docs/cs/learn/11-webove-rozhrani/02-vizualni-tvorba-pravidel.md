# Vizuální tvorba pravidel

Předchozí kapitola představila stránky a navigaci webového rozhraní. Tato kapitola se zaměřuje na hlavní workflow: vizuální tvorbu a úpravu pravidel. Stránka Rule Detail nabízí čtyři komplementární pohledy — strukturovaný **formulářový editor**, **YAML editor**, **flow diagram** a **časovou osu historie verzí** — každý je vhodný pro jiné úlohy. Formulářový editor se selectorem triggeru, builderem podmínek a builderem akcí je primárním nástrojem pro sestavování pravidel bez ručního psaní JSON nebo YAML.

## Co se naučíte

- Čtyři záložky detailu pravidla: Form, YAML, Flow, History
- Jak funguje RuleForm: metadata, selektor triggeru, builder podmínek, builder akcí
- Validace pomocí Zod a transformace dat z formuláře do API formátu
- Jak `ruleToFlow()` převádí pravidlo na React Flow graf s barevně odlišenými uzly
- Úprava pravidel přes YAML editor
- Historie verzí s diffy, časovou osou a rollbackem
- Kompletní návod vytvoření pravidla s více podmínkami přes UI

## Záložky detailu pravidla

Po kliknutí na pravidlo na stránce Rules nebo po navigaci na `/rules/:ruleId` se otevře stránka Rule Detail se čtyřmi záložkami:

```
+-------+-------+-------+---------+
| Form  | YAML  | Flow  | History |
+-------+-------+-------+---------+
```

| Záložka | Účel | Použijte když |
|---------|------|---------------|
| **Form** | Strukturovaný editor s typovanými poli, rozbalovacími nabídkami, dynamickými poli | Tvorba pravidel, úprava jednotlivých polí, učení se modelu pravidel |
| **YAML** | Textový YAML editor | Hromadnou úpravu, copy-paste, export definic pravidel |
| **Flow** | Interaktivní flow diagram (pouze pro čtení) | Vizualizace logiky pravidel, prezentace, pochopení složitých pravidel |
| **History** | Časová osa verzí s diffy | Auditování změn, porovnávání verzí, rollback |

Výchozí záložka je konfigurovatelná v Nastavení (Form, YAML nebo Flow).

## Formulář pravidla

Záložka Form je primární editor pravidel. Je rozdělena do čtyř sekcí: Metadata, Trigger, Podmínky a Akce.

### Sekce Metadata

```
+---------------------------------------------------+
| METADATA                                          |
| +------------------+  +------------------------+  |
| | ID               |  | Name                   |  |
| | [order-alert   ] |  | [Upozornění hodnoty  ] |  |
| +------------------+  +------------------------+  |
|                                                   |
| Description                                       |
| [Upozornění při překročení prahové hodnoty      ] |
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
- **ID** — Unikátní identifikátor (povinný, po vytvoření neměnitelný)
- **Name** — Lidsky čitelný název (povinný)
- **Description** — Volitelný popis
- **Priority** — Celé číslo, vyšší hodnoty se vyhodnocují dřív
- **Group** — Rozbalovací nabídka naplněná existujícími skupinami pravidel přes GraphQL
- **Enabled** — Zaškrtávací pole
- **Tags** — Chip input: napište tag a stiskněte Enter nebo čárku pro přidání, klikněte na X pro odebrání

### Selektor triggeru

Sekce triggeru mění své vstupní pole podle vybraného typu triggeru:

| Typ triggeru | Vstupní pole | Placeholder |
|-------------|-------------|-------------|
| `fact` | Pattern | `customer:*:tier` |
| `event` | Topic | `order.created` |
| `timer` | Name | `payment-deadline-*` |
| `temporal` | Pattern | (pro CEP temporální triggery) |

### Builder podmínek

Podmínky jsou dynamické pole — přidejte kolik potřebujete, odebírejte jednotlivě:

```
+---------------------------------------------------+
| PODMÍNKY                                          |
|                                                   |
| +---------+  +--------+  +----+  +-------+  +--+ |
| | Zdroj  |  | Pole   |  | Op |  | Hodnota|  |✕ | |
| | [event] |  | [total]|  |[>=]|  | [1000] |  |  | |
| +---------+  +--------+  +----+  +-------+  +--+ |
|                                                   |
| +---------+  +--------+  +------+  +-----+  +--+ |
| | Zdroj  |  | Klíč   |  | Op   |  |Hodn.|  |✕ | |
| | [fact ] |  |[c:*:t] |  |[eq]  |  |"vip"|  |  | |
| +---------+  +--------+  +------+  +-----+  +--+ |
|                                                   |
| [+ Přidat podmínku]                               |
+---------------------------------------------------+
```

Každý řádek podmínky má:

- **Typ zdroje** — `event`, `fact`, `context`, `lookup`, `baseline`
- **Klíč zdroje** — Konkrétní pole se liší podle typu zdroje:
  - `event` → `field` (např. `total`, `customerId`)
  - `fact` → `pattern` (např. `customer:*:tier`)
  - `context` → `key`
  - `lookup` → `name`
  - `baseline` → `metric`
- **Operátor** — Všechny standardní operátory: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`, `not_contains`, `matches`, `exists`, `not_exists`
- **Hodnota** — Textový vstup, parsovaný jako JSON pokud je to možné (čísla, booleany, pole, objekty). Unární operátory (`exists`, `not_exists`) skrývají pole hodnoty.

### Builder akcí

Akce následují stejný vzor dynamického pole, s poli měnícími se podle typu akce:

| Typ akce | Pole |
|----------|------|
| `set_fact` | Klíč, Hodnota (JSON) |
| `delete_fact` | Klíč |
| `emit_event` | Topic, Data (JSON) |
| `set_timer` | Konfigurace časovače (JSON) |
| `cancel_timer` | Název časovače |
| `call_service` | Služba, Metoda, Argumenty (JSON) |
| `log` | Úroveň (`debug`/`info`/`warn`/`error`), Zpráva |
| `conditional` | Počet then akcí, počet else akcí |

Alespoň jedna akce je vyžadována — validace formuláře to vynucuje.

### Validace

Formulář používá Zod schémata s React Hook Form pro validaci na úrovni polí:

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

Validační chyby se zobrazují inline pod každým polem. Tlačítko odeslání je zakázáno, dokud formulář nemá změny a všechny validace neprojdou.

### Transformace dat formuláře

Formulář používá mezireprezentaci (`RuleFormData`), která uchovává JSON hodnoty jako surové řetězce pro pohodlí editace. Při odeslání `formDataToInput()` transformuje tuto reprezentaci na vstupní formát API:

1. Řetězec tagů je rozdělen podle čárek do pole
2. Pole triggeru jsou filtrována tak, aby obsahovaly pouze pole relevantní pro daný typ (`pattern` pro fakt, `topic` pro event, `name` pro časovač)
3. Hodnoty podmínek jsou parsovány z JSON řetězců
4. Unární operátory zcela odstraní pole hodnoty
5. Pole akcí jsou parsována z JSON řetězců podle typu akce

## Flow vizualizace

Záložka Flow vykresluje pravidlo jako interaktivní graf pomocí React Flow. Funkce `ruleToFlow()` převádí pravidlo na uzly a hrany:

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

### Typy uzlů a barvy

| Typ uzlu | Ikona | Barva | Popis |
|----------|-------|-------|-------|
| Trigger | ▶ | Modrá (`bg-blue-50`, `border-blue-300`) | Trigger pravidla (event, fakt, časovač, temporální) |
| Podmínka | ◆ | Žlutá (`bg-amber-50`, `border-amber-300`) | Každá podmínka jako zdroj + operátor + hodnota |
| Akce | ■ | Zelená (`bg-emerald-50`, `border-emerald-300`) | Každá akce s typem a detailem klíče |

### Algoritmus rozložení

Graf je rozložen do tří sloupců:

1. **Trigger** (vlevo) — Vždy jeden uzel, vertikálně vycentrovaný
2. **Podmínky** (uprostřed) — Naskládané vertikálně, připojené od triggeru
3. **Akce** (vpravo) — Naskládané vertikálně, připojené od všech podmínek (nebo přímo od triggeru pokud nejsou podmínky)

Parametry rozložení:
- Šířka uzlu: 220px
- Výška uzlu: 70px
- Horizontální mezera: 80px
- Vertikální mezera: 24px

Největší sloupec určuje celkovou výšku a menší sloupce jsou vertikálně vycentrovány.

### Interakce

- **Přetahování** uzlů pro přeskládání (pozice se neukládají — rozložení se resetuje při načtení)
- **Zoom** kolečkem myši nebo ovládacím panelem (+/- tlačítka)
- **Posun** přetažením pozadí
- **MiniMapa** v pravém dolním rohu pro orientaci ve složitých pravidlech
- Uzly **nejsou propojitelné** — flow pohled je pouze pro čtení. Pro úpravu struktury pravidla přepněte na záložku Form nebo YAML.

### Styl hran

Hrany používají typ `smoothstep` s animovanými čárkami (šířka tahu 2, barva `#94a3b8`), což poskytuje jasný vizuální tok zleva doprava.

## YAML editor

Záložka YAML poskytuje textový editor pro pravidlo:

```yaml
id: high-value-alert
name: Upozornění na vysokou hodnotu
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
- Editaci s uvědoměním si syntaxe
- Tlačítka odeslání/zrušení (stejná jako na záložce Form)
- Při odeslání se YAML parsuje a odešle do stejné mutace `updateRule`

YAML pohled je užitečný pro copy-paste definic pravidel, hromadnou úpravu a porovnání se souborovými zdroji pravidel.

## Historie verzí

Záložka History ukazuje časovou osu všech změn pravidla:

```
v3 ─── updated ─── 2025-01-15 14:32
v2 ─── enabled ─── 2025-01-15 10:15
v1 ─── registered ─── 2025-01-14 09:00
```

Každý záznam verze obsahuje:
- **Číslo verze**
- **Typ změny**: `registered`, `updated`, `enabled`, `disabled`, `unregistered`, `rolled_back`
- **Časové razítko**
- **Popis** (pokud byl uveden)

### Diffy

Vyberte dvě verze pro zobrazení diffu snímků pravidel, který zvýrazní, co se mezi verzemi změnilo.

### Rollback

Klikněte na "Rollback" u jakékoliv předchozí verze pro obnovení pravidla do toho stavu. Toto vytvoří nový záznam verze s `changeType: 'rolled_back'` a zaznamená, která verze byla obnovena.

## Vytvoření pravidla: kompletní návod

Tento návod vytváří pravidlo přes formulářový editor, které upozorní na objednávku vysoké hodnoty od VIP zákazníka.

### Krok 1: Navigace na vytvoření pravidla

Stiskněte `g n` nebo klikněte na "New Rule" na stránce Rules. Formulář pro vytvoření se otevře s prázdnými výchozími hodnotami.

### Krok 2: Vyplnění metadat

- **ID**: `vip-high-value`
- **Name**: `VIP objednávka vysoké hodnoty`
- **Description**: `Upozornění při objednávce vysoké hodnoty od VIP zákazníka`
- **Priority**: `20`
- **Enabled**: zaškrtnuto
- **Tags**: napište `orders` Enter, `vip` Enter, `alerts` Enter

### Krok 3: Konfigurace triggeru

Vyberte typ triggeru **Event** a nastavte topic na `order.created`.

### Krok 4: Přidání podmínek

Dvakrát klikněte na "+ Přidat podmínku" pro vytvoření dvou řádků podmínek:

**Podmínka 1** — Kontrola částky objednávky:
- Zdroj: `event`
- Pole: `total`
- Operátor: `>=`
- Hodnota: `1000`

**Podmínka 2** — Kontrola úrovně zákazníka:
- Zdroj: `fact`
- Pattern: `customer:${event.customerId}:tier`
- Operátor: `eq`
- Hodnota: `"vip"`

### Krok 5: Přidání akcí

**Akce 1** — Emitování alertového eventu:
- Typ: `emit_event`
- Topic: `alert.vip-high-value`
- Data: `{"orderId": "${event.orderId}", "customerId": "${event.customerId}", "total": "${event.total}"}`

**Akce 2** — Zalogování alertu:
- Typ: `log`
- Úroveň: `info`
- Zpráva: `VIP objednávka vysoké hodnoty: ${event.orderId} ($${event.total})`

### Krok 6: Odeslání

Klikněte na "Create Rule". Formulář validuje všechna pole, transformuje data a odešle mutaci `createRule` přes GraphQL. Po úspěchu jste přesměrováni na stránku Rule Detail.

### Krok 7: Ověření ve Flow

Přepněte na záložku Flow pro vizuální reprezentaci:

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

### Krok 8: Testování

Stiskněte `g e` pro navigaci na stránku Events. Připravte předpoklady:

Nejprve zajistěte existenci VIP faktu. Přejděte na Facts (`g f`) a vytvořte:
- Klíč: `customer:c-42:tier`
- Hodnota: `"vip"`

Pak přejděte na Events (`g e`) a emitujte:
- Topic: `order.created`
- Data: `{"orderId": "o-99", "customerId": "c-42", "total": 1500}`

Sledujte stream eventů — měli byste vidět `order.created` následovaný `alert.vip-high-value`, když se pravidlo spustí.

## Cvičení

1. Otevřete webové rozhraní a vytvořte pravidlo nazvané "Upozornění na nízký sklad" s těmito specifikacemi:
   - Trigger: event `inventory.updated`
   - Podmínka 1: event pole `quantity` menší než 10
   - Podmínka 2: fakt `product:${event.productId}:tracked` se rovná `true`
   - Akce 1: emitujte event `alert.low-stock` s `{ "productId": "${event.productId}", "quantity": "${event.quantity}" }`
   - Akce 2: nastavte fakt `product:${event.productId}:lowStock` na `true`
   - Tagy: `inventory`, `alerts`
   - Priorita: 15
2. Přepněte na záložku Flow a ověřte, že graf ukazuje 1 trigger, 2 podmínky a 2 akce
3. Nastavte fakt `product:p-1:tracked` na `true` na stránce Facts
4. Emitujte event `inventory.updated` s `{ "productId": "p-1", "quantity": 5 }` ze stránky Events
5. Ověřte, že `product:p-1:lowStock` je `true` na stránce Facts
6. Zobrazte záložku Version History — potvrďte verzi 1 s typem změny `registered`
7. Upravte pravidlo: změňte prahovou hodnotu množství z 10 na 20 na záložce Form
8. Zkontrolujte záložku History znovu — potvrďte verzi 2 s typem změny `updated`

<details>
<summary>Řešení</summary>

Vytvořte pravidlo přes záložku Form:

**Metadata:**
- ID: `low-stock-alert`
- Name: `Upozornění na nízký sklad`
- Priority: 15
- Enabled: zaškrtnuto
- Tags: `inventory`, `alerts`

**Trigger:**
- Typ: Event
- Topic: `inventory.updated`

**Podmínky:**
- Podmínka 1: Zdroj `event`, pole `quantity`, operátor `<`, hodnota `10`
- Podmínka 2: Zdroj `fact`, pattern `product:${event.productId}:tracked`, operátor `eq`, hodnota `true`

**Akce:**
- Akce 1: Typ `emit_event`, topic `alert.low-stock`, data `{"productId": "${event.productId}", "quantity": "${event.quantity}"}`
- Akce 2: Typ `set_fact`, klíč `product:${event.productId}:lowStock`, hodnota `true`

Klikněte na "Create Rule".

**Záložka Flow** ukazuje:
```
[Event Trigger: inventory.updated]
  → [Event: quantity < 10]     → [Emit Event: alert.low-stock]
  → [Fact: product:*:tracked = true] → [Set Fact: product:*:lowStock]
```

**Stránka Facts** (`g f`): Vytvořte `product:p-1:tracked` s hodnotou `true`

**Stránka Events** (`g e`): Emitujte topic `inventory.updated`, data `{"productId": "p-1", "quantity": 5}`

**Stránka Facts**: `product:p-1:lowStock` je nyní `true`

**Záložka History**: Ukazuje v1 `registered`

**Záložka Form**: Změňte hodnotu podmínky 1 z `10` na `20`, klikněte na "Save Changes"

**Záložka History**: Nyní ukazuje v2 `updated` a v1 `registered`

</details>

## Shrnutí

- Stránka Rule Detail má čtyři záložky: **Form** (strukturovaný editor), **YAML** (textový editor), **Flow** (vizuální diagram), **History** (časová osa verzí)
- Formulářový editor organizuje tvorbu pravidel do Metadat, Triggeru, Podmínek a Akcí se Zod validací
- Selektor triggeru dynamicky mění vstupní pole (pattern/topic/name) podle typu triggeru
- Builder podmínek podporuje všechny typy zdrojů (`event`, `fact`, `context`, `lookup`, `baseline`) a operátory, s automatickým skrytím pole hodnoty pro unární operátory
- Builder akcí přizpůsobuje svá pole každému typu akce (`set_fact`, `emit_event`, `set_timer`, `call_service`, `log` atd.)
- `formDataToInput()` transformuje mezilehlou formulářovou reprezentaci (surové JSON řetězce) na vstupní formát API, parsuje hodnoty a filtruje nerelevantní pole
- Flow pohled používá `ruleToFlow()` pro vytvoření třísloupcového React Flow grafu: Trigger → Podmínky → Akce s barevně odlišenými, přetahovatelnými uzly
- Hrany používají animované `smoothstep` propojení s MiniMapou a ovládacím panelem pro zoom
- YAML editor poskytuje textovou alternativu pro hromadnou úpravu a export
- Historie verzí ukazuje časovou osu změn s diffy a možností rollbacku
- Rollback vytváří nový záznam verze s `changeType: 'rolled_back'` místo přepisu historie

---

Další: [Pravidlový systém pro e-shop](../12-projekty/01-eshop.md)
