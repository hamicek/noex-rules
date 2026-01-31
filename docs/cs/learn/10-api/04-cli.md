# Příkazový řádek

Ne každá interakce s pravidlovým enginem probíhá přes kód nebo HTTP. CLI `noex-rules` poskytuje terminálové rozhraní pro správu serveru, operace s pravidly, validaci, testování, import/export a audit. Je navrženo pro vývojáře během vývoje a pro CI/CD pipeline v produkci.

## Co se naučíte

- Všechny CLI příkazy a jejich možnosti
- Výstupní formáty: pretty, JSON, table
- Správu serveru z terminálu
- Workflow validace a testování pravidel
- Import/export pro nasazení pravidel
- Vzory CI/CD integrace

## Instalace

CLI je součástí balíčku `@hamicek/noex-rules`. Po instalaci je příkaz `noex-rules` dostupný:

```bash
npm install @hamicek/noex-rules

npx noex-rules --help
```

## Globální možnosti

Každý příkaz podporuje tyto flagy:

| Flag | Zkratka | Popis | Výchozí |
|------|---------|-------|---------|
| `--format <format>` | `-f` | Výstupní formát: `json`, `table`, `pretty` | `pretty` |
| `--quiet` | `-q` | Potlačení nepodstatného výstupu | `false` |
| `--no-color` | | Vypnutí barevného výstupu | barvy povoleny |
| `--config <path>` | `-c` | Cesta ke konfiguračnímu souboru | auto-detekce |

Flag `--format json` je zásadní pro CI/CD — produkuje strojově čitelný výstup, který mohou parsovat další nástroje.

## Příkazy serveru

### Spuštění serveru

```bash
noex-rules server start [možnosti]
```

| Možnost | Zkratka | Popis | Výchozí |
|---------|---------|-------|---------|
| `--port <port>` | `-p` | Port serveru | 7226 |
| `--host <host>` | `-H` | Adresa hostu | 0.0.0.0 |
| `--no-swagger` | | Vypnout Swagger dokumentaci | povoleno |
| `--no-logger` | | Vypnout logování requestů | povoleno |

```bash
# Spuštění s výchozími hodnotami
noex-rules server start

# Vlastní port, bez logování
noex-rules server start -p 3000 --no-logger

# JSON výstup (pro skriptování)
noex-rules server start -f json
```

Výstup:

```
Server running at http://0.0.0.0:7226
Swagger UI available at http://0.0.0.0:7226/documentation

Press Ctrl+C to stop
```

Server běží, dokud nestisknete Ctrl+C. Zvládá `SIGINT` a `SIGTERM` pro elegantní ukončení.

### Ověření stavu serveru

```bash
noex-rules server status [možnosti]
```

| Možnost | Zkratka | Popis | Výchozí |
|---------|---------|-------|---------|
| `--url <url>` | `-u` | URL serveru | z konfigurace |

```bash
noex-rules server status
noex-rules server status -u http://localhost:3000
```

Výstup:

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

## Příkazy pro pravidla

Všechny příkazy pro pravidla vyžadují běžící server (komunikují přes REST API).

### Výpis pravidel

```bash
noex-rules rule list [možnosti]
```

```bash
noex-rules rule list
noex-rules rule list -u http://localhost:3000
noex-rules rule list -f json
```

Pretty výstup:

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
noex-rules rule get <id> [možnosti]
```

```bash
noex-rules rule get order-alert
```

Výstup:

```
Rule Details

ID:          order-alert
Name:        Order Alert
Description: Upozornění při objednávce vysoké hodnoty
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

### Povolení/zakázání/smazání

```bash
noex-rules rule enable <id>
noex-rules rule disable <id>
noex-rules rule delete <id>
```

## Validace

Validujte soubory s pravidly bez spouštění serveru — kontrola syntaxe, validace schématu a referencí:

```bash
noex-rules validate <soubor> [možnosti]
```

| Možnost | Zkratka | Popis | Výchozí |
|---------|---------|-------|---------|
| `--strict` | `-s` | Striktní validační režim | `false` |

```bash
# Validace YAML souboru s pravidly
noex-rules validate rules/order-rules.yaml

# Validace JSON souboru s pravidly ve striktním režimu
noex-rules validate rules/fraud-rules.json --strict

# JSON výstup pro CI
noex-rules validate rules/*.yaml -f json
```

Striktní režim vynucuje další kontroly jako vyžadování popisu u všech pravidel a validaci, že referencované skupiny existují.

## Testování

Spusťte testy pravidel proti dočasné instanci enginu:

```bash
noex-rules test <soubor> [možnosti]
```

| Možnost | Zkratka | Popis | Výchozí |
|---------|---------|-------|---------|
| `--dry-run` | `-d` | Spuštění bez vedlejších efektů | `true` |
| `--verbose` | `-v` | Detailní testový výstup | `false` |
| `--rules <cesta>` | `-r` | Cesta k souboru s pravidly | — |
| `--timeout <ms>` | `-t` | Timeout testu | — |

```bash
# Spuštění testů
noex-rules test tests/order-rules.test.yaml

# Detailní výstup se souborem pravidel
noex-rules test tests/order-rules.test.yaml -v -r rules/orders.yaml
```

## Import a export

### Export pravidel

Exportujte pravidla z běžícího serveru nebo přímo z úložiště:

```bash
noex-rules export [výstup] [možnosti]
```

| Možnost | Zkratka | Popis | Výchozí |
|---------|---------|-------|---------|
| `--pretty` | `-p` | Formátovaný JSON | `false` |
| `--tags <tagy>` | `-t` | Filtrování podle tagů (čárkou oddělené) | všechny |
| `--enabled` | `-e` | Export pouze povolených pravidel | všechny |

```bash
# Export všech pravidel na stdout
noex-rules export

# Export do souboru, formátovaný
noex-rules export rules-backup.json --pretty

# Export pouze povolených objednávkových pravidel
noex-rules export order-rules.json --tags orders --enabled
```

### Import pravidel

Importujte pravidla do běžícího serveru:

```bash
noex-rules import <soubor> [možnosti]
```

| Možnost | Zkratka | Popis | Výchozí |
|---------|---------|-------|---------|
| `--dry-run` | `-d` | Náhled co by se importovalo | `false` |
| `--merge` | `-m` | Sloučení s existujícími pravidly | `false` |
| `--no-validate` | | Přeskočení validace před importem | validovat |
| `--strict` | `-s` | Striktní validační režim | `false` |

```bash
# Dry run — ukázat co by se stalo
noex-rules import rules.json --dry-run

# Import se sloučením (neodstraňovat existující pravidla)
noex-rules import rules.json --merge

# Import bez validace (důvěřujeme zdroji)
noex-rules import rules.json --no-validate
```

## Statistiky

Načtení statistik enginu z běžícího serveru:

```bash
noex-rules stats [možnosti]
```

```bash
noex-rules stats
noex-rules stats -u http://localhost:3000 -f json
```

## Příkazy pro audit

### Výpis audit záznamů

```bash
noex-rules audit list [možnosti]
```

| Možnost | Popis |
|---------|-------|
| `--category <kategorie>` | Filtrování podle kategorie |
| `--type <typ>` | Filtrování podle typu eventu |
| `--rule-id <ruleId>` | Filtrování podle ID pravidla |
| `--from <timestamp>` | Počáteční timestamp (Unix nebo ISO datum) |
| `--to <timestamp>` | Koncový timestamp |
| `--limit <limit>` | Maximální počet záznamů |

```bash
# Poslední provádění pravidel
noex-rules audit list --category rule_execution --limit 20

# Záznamy pro konkrétní pravidlo
noex-rules audit list --rule-id order-alert --from 2024-01-01

# JSON výstup
noex-rules audit list -f json --limit 100
```

### Vyhledávání v auditu

```bash
noex-rules audit search <dotaz> [možnosti]
```

```bash
noex-rules audit search "order-alert" --category rule_execution
```

### Export auditu

```bash
noex-rules audit export [možnosti]
```

| Možnost | Zkratka | Popis | Výchozí |
|---------|---------|-------|---------|
| `--output <soubor>` | `-o` | Cesta k výstupnímu souboru | stdout |
| `--export-format <fmt>` | | `json` nebo `csv` | `json` |
| `--category <kategorie>` | | Filtrování podle kategorie | všechny |
| `--from <timestamp>` | | Počáteční timestamp | — |
| `--to <timestamp>` | | Koncový timestamp | — |

```bash
# Export posledních 24 hodin do CSV
noex-rules audit export -o audit.csv --export-format csv --from "$(date -d '24 hours ago' -Iseconds)"

# Export všech provádění pravidel jako JSON
noex-rules audit export -o executions.json --category rule_execution
```

## Inicializace konfigurace

Vytvoření konfiguračního souboru pro CLI:

```bash
noex-rules init [možnosti]
```

| Možnost | Popis | Výchozí |
|---------|-------|---------|
| `--force` | Přepsání existující konfigurace | `false` |
| `--server-url <url>` | URL serveru | `http://localhost:7226` |
| `--storage-adapter <typ>` | `memory`, `sqlite`, `file` | `memory` |
| `--storage-path <cesta>` | Cesta k souboru úložiště | — |

```bash
noex-rules init
noex-rules init --server-url http://prod-server:7226 --storage-adapter sqlite
```

## CI/CD integrace

### Validace před nasazením

```bash
#!/bin/bash
# ci/validate-rules.sh

set -e

echo "Validace souborů s pravidly..."
noex-rules validate rules/*.yaml --strict -f json

echo "Spouštění testů pravidel..."
noex-rules test tests/*.test.yaml -r rules/ -f json

echo "Všechny kontroly prošly!"
```

### Nasazení pravidel

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

echo "Ověření nasazení..."
noex-rules stats -u "$SERVER_URL"
```

### Export zálohy

```bash
#!/bin/bash
# ci/backup-rules.sh

BACKUP_FILE="backups/rules-$(date +%Y%m%d-%H%M%S).json"

noex-rules export "$BACKUP_FILE" --pretty
echo "Záloha uložena do $BACKUP_FILE"
```

## Cvičení

1. Spusťte server pomocí CLI na portu 7226
2. V odděleném terminálu zkontrolujte stav serveru
3. Vytvořte soubor pravidel `rules.json` s pravidlem, které nastaví fakt při eventu
4. Validujte soubor pravidel pomocí CLI
5. Importujte pravidla nejprve s `--dry-run`, pak bez
6. Vypište pravidla a ověřte import
7. Exportujte pravidla do zálohovacího souboru

<details>
<summary>Řešení</summary>

Spuštění serveru:

```bash
noex-rules server start -p 7226
```

Ověření stavu (oddělený terminál):

```bash
noex-rules server status
# Status:  ok
# Version: 1.0.0
```

Vytvoření `rules.json`:

```json
[
  {
    "id": "sensor-log",
    "name": "Logování čtení senzorů",
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
#   sensor-log — Logování čtení senzorů
```

Skutečný import:

```bash
noex-rules import rules.json
# Imported 1 rule
```

Výpis pravidel:

```bash
noex-rules rule list
# sensor-log enabled P0
#   Logování čtení senzorů
```

Export zálohy:

```bash
noex-rules export backup.json --pretty
# Exported 1 rule to backup.json
```

</details>

## Shrnutí

- CLI `noex-rules` poskytuje terminálový přístup pro správu serveru, operace s pravidly a CI/CD integraci
- Globální flagy: `--format` (json/table/pretty), `--quiet`, `--no-color`, `--config`
- `server start` spustí HTTP server; `server status` ověří health běžícího serveru
- `rule list/get/enable/disable/delete` spravují pravidla přes REST API
- `validate` kontroluje soubory s pravidly na syntaktické a schématové chyby bez spouštění serveru
- `test` spustí testy pravidel proti dočasném enginu s volitelným dry-run režimem
- `import` a `export` umožňují workflow nasazení a zálohování pravidel
- `audit list/search/export` dotazují a exportují audit log v JSON nebo CSV
- `init` vytvoří konfigurační soubor CLI s URL serveru a nastavením úložiště
- Použijte `--format json` v CI/CD pipelines pro strojově čitelný výstup
- Kombinujte `validate`, `test` a `import` v nasazovacích skriptech pro bezpečné doručení pravidel

---

Další: [Přehled webového rozhraní](../11-webove-rozhrani/01-zaciname-s-ui.md)
