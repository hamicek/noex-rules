# Prikazovy radek

Ne kazda interakce s pravidlovym enginem probiha pres kod nebo HTTP. CLI `noex-rules` poskytuje terminalove rozhrani pro spravu serveru, operace s pravidly, validaci, testovani, import/export a audit. Je navrzeno pro vyvojare behem vyvoje a pro CI/CD pipeline v produkci.

## Co se naucite

- Vsechny CLI prikazy a jejich moznosti
- Vystupni formaty: pretty, JSON, table
- Spravu serveru z terminalu
- Workflow validace a testovani pravidel
- Import/export pro nasazeni pravidel
- Vzory CI/CD integrace

## Instalace

CLI je soucasti balicku `@hamicek/noex-rules`. Po instalaci je prikaz `noex-rules` dostupny:

```bash
npm install @hamicek/noex-rules

npx noex-rules --help
```

## Globalni moznosti

Kazdy prikaz podporuje tyto flagy:

| Flag | Zkratka | Popis | Vychozi |
|------|---------|-------|---------|
| `--format <format>` | `-f` | Vystupni format: `json`, `table`, `pretty` | `pretty` |
| `--quiet` | `-q` | Potlaceni nepodstatneho vystupu | `false` |
| `--no-color` | | Vypnuti barevneho vystupu | barvy povoleny |
| `--config <path>` | `-c` | Cesta ke konfiguracnimu souboru | auto-detekce |

Flag `--format json` je zasadni pro CI/CD — produkuje strojove citelny vystup, ktery mohou parsovat dalsi nastroje.

## Prikazy serveru

### Spusteni serveru

```bash
noex-rules server start [moznosti]
```

| Moznost | Zkratka | Popis | Vychozi |
|---------|---------|-------|---------|
| `--port <port>` | `-p` | Port serveru | 7226 |
| `--host <host>` | `-H` | Adresa hostu | 0.0.0.0 |
| `--no-swagger` | | Vypnout Swagger dokumentaci | povoleno |
| `--no-logger` | | Vypnout logovani requestu | povoleno |

```bash
# Spusteni s vychozimi hodnotami
noex-rules server start

# Vlastni port, bez logovani
noex-rules server start -p 3000 --no-logger

# JSON vystup (pro skriptovani)
noex-rules server start -f json
```

Vystup:

```
Server running at http://0.0.0.0:7226
Swagger UI available at http://0.0.0.0:7226/documentation

Press Ctrl+C to stop
```

Server bezi, dokud nestisknete Ctrl+C. Zvlada `SIGINT` a `SIGTERM` pro elegantni ukonceni.

### Overeni stavu serveru

```bash
noex-rules server status [moznosti]
```

| Moznost | Zkratka | Popis | Vychozi |
|---------|---------|-------|---------|
| `--url <url>` | `-u` | URL serveru | z konfigurace |

```bash
noex-rules server status
noex-rules server status -u http://localhost:3000
```

Vystup:

```
Server Status
URL: http://localhost:7226

Status:  ok
Version: 1.0.0
Uptime:  2h 15m

Engine:
  Name:    noex-rules
  Running: yes
```

## Prikazy pro pravidla

Vsechny prikazy pro pravidla vyzaduji bezici server (komunikuji pres REST API).

### Vypis pravidel

```bash
noex-rules rule list [moznosti]
```

```bash
noex-rules rule list
noex-rules rule list -u http://localhost:3000
noex-rules rule list -f json
```

Pretty vystup:

```
order-alert enabled P10 [orders, alerts]
  Order Alert

fraud-check enabled P20 [security]
  Fraud Detection Check

temp-monitor disabled P0
  Temperature Monitor
```

### Detail pravidla

```bash
noex-rules rule get <id> [moznosti]
```

```bash
noex-rules rule get order-alert
```

Vystup:

```
Rule Details

ID:          order-alert
Name:        Order Alert
Description: Upozorneni pri objednavce vysoke hodnoty
Priority:    10
Enabled:     Yes
Tags:        orders, alerts

Trigger:
  { "type": "event", "topic": "order.created" }

Conditions:
  [{ "source": "event", "field": "total", "operator": "gte", "value": 1000 }]

Actions:
  [{ "type": "emit_event", "topic": "alert.high-value", ... }]
```

### Povoleni/zakazani/smazani

```bash
noex-rules rule enable <id>
noex-rules rule disable <id>
noex-rules rule delete <id>
```

## Validace

Validujte soubory s pravidly bez spousteni serveru — kontrola syntaxe, validace schematu a referenci:

```bash
noex-rules validate <soubor> [moznosti]
```

| Moznost | Zkratka | Popis | Vychozi |
|---------|---------|-------|---------|
| `--strict` | `-s` | Strikni validacni rezim | `false` |

```bash
# Validace YAML souboru s pravidly
noex-rules validate rules/order-rules.yaml

# Validace JSON souboru s pravidly ve striktnim rezimu
noex-rules validate rules/fraud-rules.json --strict

# JSON vystup pro CI
noex-rules validate rules/*.yaml -f json
```

Strikni rezim vynucuje dalsi kontroly jako vyzadovani popisu u vsech pravidel a validaci, ze referencovane skupiny existuji.

## Testovani

Spustte testy pravidel proti docasne instanci enginu:

```bash
noex-rules test <soubor> [moznosti]
```

| Moznost | Zkratka | Popis | Vychozi |
|---------|---------|-------|---------|
| `--dry-run` | `-d` | Spusteni bez vedlejsich efektu | `true` |
| `--verbose` | `-v` | Detailni testovy vystup | `false` |
| `--rules <cesta>` | `-r` | Cesta k souboru s pravidly | — |
| `--timeout <ms>` | `-t` | Timeout testu | — |

```bash
# Spusteni testu
noex-rules test tests/order-rules.test.yaml

# Detailni vystup se souborem pravidel
noex-rules test tests/order-rules.test.yaml -v -r rules/orders.yaml
```

## Import a export

### Export pravidel

Exportujte pravidla z beziciho serveru nebo primo z uloziste:

```bash
noex-rules export [vystup] [moznosti]
```

| Moznost | Zkratka | Popis | Vychozi |
|---------|---------|-------|---------|
| `--pretty` | `-p` | Formatovany JSON | `false` |
| `--tags <tagy>` | `-t` | Filtrovani podle tagu (carkou oddelene) | vsechny |
| `--enabled` | `-e` | Export pouze povolenych pravidel | vsechny |

```bash
# Export vsech pravidel na stdout
noex-rules export

# Export do souboru, formatovany
noex-rules export rules-backup.json --pretty

# Export pouze povolenych objednavkovych pravidel
noex-rules export order-rules.json --tags orders --enabled
```

### Import pravidel

Importujte pravidla do beziciho serveru:

```bash
noex-rules import <soubor> [moznosti]
```

| Moznost | Zkratka | Popis | Vychozi |
|---------|---------|-------|---------|
| `--dry-run` | `-d` | Nahled co by se importovalo | `false` |
| `--merge` | `-m` | Slouceni s existujicimi pravidly | `false` |
| `--no-validate` | | Preskoceni validace pred importem | validovat |
| `--strict` | `-s` | Strikni validacni rezim | `false` |

```bash
# Dry run — ukazat co by se stalo
noex-rules import rules.json --dry-run

# Import se sloucenim (neodstranovat existujici pravidla)
noex-rules import rules.json --merge

# Import bez validace (duverujeme zdroji)
noex-rules import rules.json --no-validate
```

## Statistiky

Nacteni statistik enginu z beziciho serveru:

```bash
noex-rules stats [moznosti]
```

```bash
noex-rules stats
noex-rules stats -u http://localhost:3000 -f json
```

## Prikazy pro audit

### Vypis audit zaznamu

```bash
noex-rules audit list [moznosti]
```

| Moznost | Popis |
|---------|-------|
| `--category <kategorie>` | Filtrovani podle kategorie |
| `--type <typ>` | Filtrovani podle typu eventu |
| `--rule-id <ruleId>` | Filtrovani podle ID pravidla |
| `--from <timestamp>` | Pocatecni timestamp (Unix nebo ISO datum) |
| `--to <timestamp>` | Koncovy timestamp |
| `--limit <limit>` | Maximalni pocet zaznamu |

```bash
# Posledni provadeni pravidel
noex-rules audit list --category rule_execution --limit 20

# Zaznamy pro konkretni pravidlo
noex-rules audit list --rule-id order-alert --from 2024-01-01

# JSON vystup
noex-rules audit list -f json --limit 100
```

### Vyhledavani v auditu

```bash
noex-rules audit search <dotaz> [moznosti]
```

```bash
noex-rules audit search "order-alert" --category rule_execution
```

### Export auditu

```bash
noex-rules audit export [moznosti]
```

| Moznost | Zkratka | Popis | Vychozi |
|---------|---------|-------|---------|
| `--output <soubor>` | `-o` | Cesta k vystupnimu souboru | stdout |
| `--export-format <fmt>` | | `json` nebo `csv` | `json` |
| `--category <kategorie>` | | Filtrovani podle kategorie | vsechny |
| `--from <timestamp>` | | Pocatecni timestamp | — |
| `--to <timestamp>` | | Koncovy timestamp | — |

```bash
# Export poslednich 24 hodin do CSV
noex-rules audit export -o audit.csv --export-format csv --from "$(date -d '24 hours ago' -Iseconds)"

# Export vsech provadeni pravidel jako JSON
noex-rules audit export -o executions.json --category rule_execution
```

## Inicializace konfigurace

Vytvoreni konfiguracniho souboru pro CLI:

```bash
noex-rules init [moznosti]
```

| Moznost | Popis | Vychozi |
|---------|-------|---------|
| `--force` | Prepsani existujici konfigurace | `false` |
| `--server-url <url>` | URL serveru | `http://localhost:7226` |
| `--storage-adapter <typ>` | `memory`, `sqlite`, `file` | `memory` |
| `--storage-path <cesta>` | Cesta k souboru uloziste | — |

```bash
noex-rules init
noex-rules init --server-url http://prod-server:7226 --storage-adapter sqlite
```

## CI/CD integrace

### Validace pred nasazenim

```bash
#!/bin/bash
# ci/validate-rules.sh

set -e

echo "Validace souboru s pravidly..."
noex-rules validate rules/*.yaml --strict -f json

echo "Spousteni testu pravidel..."
noex-rules test tests/*.test.yaml -r rules/ -f json

echo "Vsechny kontroly prosly!"
```

### Nasazeni pravidel

```bash
#!/bin/bash
# ci/deploy-rules.sh

set -e

SERVER_URL="${RULES_SERVER_URL:-http://localhost:7226}"

echo "Validace pravidel..."
noex-rules validate rules/*.yaml --strict

echo "Import pravidel do ${SERVER_URL}..."
noex-rules import rules/production.yaml \
  --merge \
  --strict \
  -u "$SERVER_URL" \
  -f json

echo "Overeni nasazeni..."
noex-rules stats -u "$SERVER_URL"
```

### Export zalohy

```bash
#!/bin/bash
# ci/backup-rules.sh

BACKUP_FILE="backups/rules-$(date +%Y%m%d-%H%M%S).json"

noex-rules export "$BACKUP_FILE" --pretty
echo "Zaloha ulozena do $BACKUP_FILE"
```

## Cviceni

1. Spustte server pomoci CLI na portu 7226
2. V oddelenim terminalu zkontrolujte stav serveru
3. Vytvorte soubor pravidel `rules.json` s pravidlem, ktere nastavi fakt pri eventu
4. Validujte soubor pravidel pomoci CLI
5. Importujte pravidla nejprve s `--dry-run`, pak bez
6. Vypiste pravidla a overte import
7. Exportujte pravidla do zalohovaci souboru

<details>
<summary>Reseni</summary>

Spusteni serveru:

```bash
noex-rules server start -p 7226
```

Overeni stavu (oddeleny terminal):

```bash
noex-rules server status
# Status:  ok
# Version: 1.0.0
```

Vytvoreni `rules.json`:

```json
[
  {
    "id": "sensor-log",
    "name": "Logovani cteni senzoru",
    "trigger": { "type": "event", "topic": "sensor.reading" },
    "conditions": [],
    "actions": [
      {
        "type": "set_fact",
        "key": "sensor:${event.sensorId}:lastReading",
        "value": "${event.temperature}"
      }
    ]
  }
]
```

Validace:

```bash
noex-rules validate rules.json
# Validation passed
```

Dry-run import:

```bash
noex-rules import rules.json --dry-run
# Would import 1 rule:
#   sensor-log — Logovani cteni senzoru
```

Skutecny import:

```bash
noex-rules import rules.json
# Imported 1 rule
```

Vypis pravidel:

```bash
noex-rules rule list
# sensor-log enabled P0
#   Logovani cteni senzoru
```

Export zalohy:

```bash
noex-rules export backup.json --pretty
# Exported 1 rule to backup.json
```

</details>

## Shrnuti

- CLI `noex-rules` poskytuje terminalovy pristup pro spravu serveru, operace s pravidly a CI/CD integraci
- Globalni flagy: `--format` (json/table/pretty), `--quiet`, `--no-color`, `--config`
- `server start` spusti HTTP server; `server status` overi health beziciho serveru
- `rule list/get/enable/disable/delete` spravuji pravidla pres REST API
- `validate` kontroluje soubory s pravidly na syntakticke a schematove chyby bez spousteni serveru
- `test` spusti testy pravidel proti docasnem enginu s volitelnym dry-run rezimem
- `import` a `export` umoznuji workflow nasazeni a zalohovani pravidel
- `audit list/search/export` dotazuji a exportuji audit log v JSON nebo CSV
- `init` vytvori konfiguracni soubor CLI s URL serveru a nastavenim uloziste
- Pouzijte `--format json` v CI/CD pipelines pro strojove citelny vystup
- Kombinujte `validate`, `test` a `import` v nasazovacich skriptech pro bezpecne doruceni pravidel

---

Dalsi: [Prehled weboveho rozhrani](../11-webove-rozhrani/01-zaciname-s-ui.md)
