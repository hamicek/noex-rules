# CLI

Rozhraní příkazové řádky pro správu pravidel, validaci souborů, spouštění testů a interakci s běžícím serverem.

## Instalace

CLI je dostupné jako příkaz `noex-rules` po instalaci balíčku:

```bash
npm install -g @hamicek/noex-rules
# nebo
npx noex-rules <command>
```

---

## Globální volby

Tyto volby jsou dostupné pro všechny příkazy:

| Volba | Alias | Typ | Výchozí | Popis |
|-------|-------|-----|---------|-------|
| `--format` | `-f` | `string` | `pretty` | Formát výstupu: `json`, `table`, `pretty` |
| `--quiet` | `-q` | `boolean` | `false` | Potlačit nepodstatný výstup |
| `--no-color` | — | `boolean` | `false` | Zakázat barevný výstup |
| `--config` | `-c` | `string` | — | Cesta ke konfiguračnímu souboru |

**Příklad:**

```bash
noex-rules rule list --format json --quiet
noex-rules validate rules.json -f table
```

---

## Formáty výstupu

| Formát | Popis |
|--------|-------|
| `pretty` | Čitelný barevný výstup (výchozí) |
| `table` | Tabulkový formát pro seznamy |
| `json` | Strojově čitelný JSON výstup |

---

## Exit kódy

| Kód | Konstanta | Popis |
|-----|-----------|-------|
| 0 | `Success` | Příkaz úspěšně dokončen |
| 1 | `GeneralError` | Neočekávaná chyba |
| 2 | `InvalidArguments` | Neplatné argumenty příkazové řádky |
| 3 | `ValidationError` | Validace pravidel selhala |
| 4 | `FileNotFound` | Soubor nenalezen |
| 5 | `ConnectionError` | Nepodařilo se připojit k serveru |
| 6 | `TestFailed` | Testové scénáře selhaly |

---

## Konfigurační soubor

CLI čte konfiguraci z `.noex-rules.json` nebo vlastní cesty přes `--config`.

```typescript
interface CliConfig {
  server: {
    url: string;           // výchozí: "http://localhost:7226"
  };
  storage: {
    adapter: 'memory' | 'sqlite' | 'file';
    path?: string;
  };
  output: {
    format: 'json' | 'table' | 'pretty';
    colors: boolean;       // výchozí: true
  };
}
```

**Příklad `.noex-rules.json`:**

```json
{
  "server": {
    "url": "http://localhost:7226"
  },
  "storage": {
    "adapter": "sqlite",
    "path": "./rules.db"
  },
  "output": {
    "format": "pretty",
    "colors": true
  }
}
```

---

## Příkazy

### version

Zobrazí verzi CLI.

```bash
noex-rules version
```

**Výstup:**

```
noex-rules v1.0.0
```

---

### init

Inicializuje konfigurační soubor v aktuálním adresáři.

```bash
noex-rules init [options]
```

**Volby:**

| Volba | Typ | Popis |
|-------|-----|-------|
| `--force` | `boolean` | Přepsat existující konfigurační soubor |
| `--server-url <url>` | `string` | URL serveru |
| `--storage-adapter <adapter>` | `string` | Storage adapter: `memory`, `sqlite`, `file` |
| `--storage-path <path>` | `string` | Cesta k souboru úložiště |

**Příklad:**

```bash
noex-rules init --server-url http://localhost:8080 --storage-adapter sqlite
```

---

### validate

Validuje pravidla z JSON souboru.

```bash
noex-rules validate <file> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| file | ano | Cesta k JSON souboru s pravidly |

**Volby:**

| Volba | Alias | Typ | Výchozí | Popis |
|-------|-------|-----|---------|-------|
| `--strict` | `-s` | `boolean` | `false` | Považovat varování za chyby |

**Příklad:**

```bash
noex-rules validate ./rules.json
noex-rules validate ./rules.json --strict
```

**Výstup (pretty):**

```
File: /path/to/rules.json
Rules: 5

✓ All rules are valid
```

**Výstup s chybami:**

```
File: /path/to/rules.json
Rules: 5

✗ 2 error(s), 1 warning(s)

Errors:
  ✗ rules[0].trigger.topic: Required field missing
  ✗ rules[2].actions[0].type: Invalid action type 'invalid'

Warnings:
  ⚠ rules[1].priority: Priority is negative, rule will have low precedence
```

---

### import

Importuje pravidla z JSON nebo YAML souboru na server.

```bash
noex-rules import <file> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| file | ano | Cesta k souboru s pravidly (JSON nebo YAML) |

**Volby:**

| Volba | Alias | Typ | Výchozí | Popis |
|-------|-------|-----|---------|-------|
| `--dry-run` | `-d` | `boolean` | `false` | Zobrazit co by bylo importováno |
| `--merge` | `-m` | `boolean` | `false` | Sloučit s existujícími pravidly |
| `--no-validate` | — | `boolean` | `false` | Přeskočit validaci |
| `--strict` | `-s` | `boolean` | `false` | Přísný validační režim |

**Příklad:**

```bash
noex-rules import ./rules.json
noex-rules import ./rules.yaml --dry-run
noex-rules import ./rules.json --merge --strict
```

---

### export

Exportuje pravidla ze serveru do souboru nebo na stdout.

```bash
noex-rules export [output] [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| output | ne | Cesta výstupního souboru (stdout pokud vynecháno) |

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--pretty` | `-p` | `boolean` | Formátovat JSON výstup |
| `--tags <tags>` | `-t` | `string` | Filtrovat podle tagů (čárkou oddělené) |
| `--enabled` | `-e` | `boolean` | Exportovat pouze povolená pravidla |

**Příklad:**

```bash
noex-rules export ./backup.json --pretty
noex-rules export --tags payment,order
noex-rules export --enabled -f json > active-rules.json
```

---

### test

Spouští testové scénáře proti pravidlům.

```bash
noex-rules test <file> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| file | ano | Cesta k souboru s testovými scénáři |

**Volby:**

| Volba | Alias | Typ | Výchozí | Popis |
|-------|-------|-----|---------|-------|
| `--dry-run` | `-d` | `boolean` | `true` | Spustit testy bez vedlejších efektů |
| `--verbose` | `-v` | `boolean` | `false` | Zobrazit detailní výstup testů |
| `--rules <path>` | `-r` | `string` | — | Cesta k souboru s pravidly |
| `--timeout <ms>` | `-t` | `number` | — | Timeout testu v milisekundách |

**Příklad:**

```bash
noex-rules test ./tests/scenarios.json --verbose
noex-rules test ./tests/scenarios.json --rules ./rules.json --timeout 5000
```

**Formát testovacího souboru:**

```json
{
  "scenarios": [
    {
      "name": "User welcome email",
      "given": {
        "facts": { "user:123:status": "new" }
      },
      "when": {
        "event": { "topic": "user.created", "data": { "userId": "123" } }
      },
      "then": {
        "events": [{ "topic": "email.send" }],
        "facts": { "user:123:welcomed": true }
      }
    }
  ]
}
```

---

### server start

Spustí REST API server.

```bash
noex-rules server start [options]
```

**Volby:**

| Volba | Alias | Typ | Výchozí | Popis |
|-------|-------|-----|---------|-------|
| `--port` | `-p` | `number` | `7226` | Port serveru |
| `--host` | `-H` | `string` | `0.0.0.0` | Host serveru |
| `--no-swagger` | — | `boolean` | `false` | Zakázat Swagger dokumentaci |
| `--no-logger` | — | `boolean` | `false` | Zakázat logování požadavků |

**Příklad:**

```bash
noex-rules server start
noex-rules server start --port 8080 --host 127.0.0.1
noex-rules server start --no-swagger --no-logger
```

**Výstup:**

```
Rule Engine Server started
  URL: http://0.0.0.0:7226
  Swagger: http://0.0.0.0:7226/documentation
```

---

### server status

Kontroluje stav běžícího serveru.

```bash
noex-rules server status [options]
```

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--url` | `-u` | `string` | URL serveru (z konfigurace pokud vynecháno) |

**Příklad:**

```bash
noex-rules server status
noex-rules server status --url http://localhost:8080
```

**Výstup:**

```
Server Status: ok
  Version: 1.0.0
  Uptime: 3h 42m 15s
  Rules: 42
  Facts: 128
  Timers: 5
```

---

### rule list

Vypíše všechna pravidla na serveru.

```bash
noex-rules rule list [options]
```

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--url` | `-u` | `string` | URL serveru |

**Příklad:**

```bash
noex-rules rule list
noex-rules rule list --format table
```

**Výstup (table):**

```
ID              NAME                 ENABLED  PRIORITY  TAGS
user-welcome    User Welcome Email   true     10        user, email
order-process   Order Processing     true     5         order
session-timeout Session Timeout      false    0         session
```

---

### rule get

Získá detail konkrétního pravidla.

```bash
noex-rules rule get <id> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| id | ano | ID pravidla |

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--url` | `-u` | `string` | URL serveru |

**Příklad:**

```bash
noex-rules rule get user-welcome
noex-rules rule get user-welcome --format json
```

---

### rule enable

Povolí zakázané pravidlo.

```bash
noex-rules rule enable <id> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| id | ano | ID pravidla |

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--url` | `-u` | `string` | URL serveru |

**Příklad:**

```bash
noex-rules rule enable session-timeout
```

---

### rule disable

Zakáže pravidlo.

```bash
noex-rules rule disable <id> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| id | ano | ID pravidla |

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--url` | `-u` | `string` | URL serveru |

**Příklad:**

```bash
noex-rules rule disable user-welcome
```

---

### rule delete

Smaže pravidlo ze serveru.

```bash
noex-rules rule delete <id> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| id | ano | ID pravidla |

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--url` | `-u` | `string` | URL serveru |

**Příklad:**

```bash
noex-rules rule delete old-rule
```

---

### stats

Zobrazí statistiky enginu.

```bash
noex-rules stats [options]
```

**Volby:**

| Volba | Alias | Typ | Popis |
|-------|-------|-----|-------|
| `--url` | `-u` | `string` | URL serveru |

**Příklad:**

```bash
noex-rules stats
noex-rules stats --format json
```

**Výstup:**

```
Engine Statistics
  Rules: 42 (38 enabled, 4 disabled)
  Facts: 128
  Timers: 5
  Events processed: 15,234
  Rule executions: 8,456
  Uptime: 3h 42m 15s
```

---

### audit list

Vypíše záznamy audit logu.

```bash
noex-rules audit list [options]
```

**Volby:**

| Volba | Typ | Popis |
|-------|-----|-------|
| `--url` | `string` | URL serveru |
| `--category` | `string` | Filtr podle kategorie |
| `--type` | `string` | Filtr podle typu události |
| `--rule-id` | `string` | Filtr podle ID pravidla |
| `--from` | `string` | Od timestampu nebo ISO data |
| `--to` | `string` | Do timestampu nebo ISO data |
| `--limit` | `number` | Max počet záznamů |

**Příklad:**

```bash
noex-rules audit list --limit 50
noex-rules audit list --category rule --from 2024-01-01
noex-rules audit list --rule-id user-welcome --type execution
```

---

### audit search

Vyhledává záznamy audit logu s dotazovacím řetězcem.

```bash
noex-rules audit search <query> [options]
```

**Argumenty:**

| Název | Povinný | Popis |
|-------|---------|-------|
| query | ano | Vyhledávací dotaz |

**Volby:**

Stejné jako `audit list`.

**Příklad:**

```bash
noex-rules audit search "user-welcome"
noex-rules audit search "error" --from 2024-01-01 --limit 100
```

---

### audit export

Exportuje záznamy audit logu do souboru.

```bash
noex-rules audit export [options]
```

**Volby:**

| Volba | Alias | Typ | Výchozí | Popis |
|-------|-------|-----|---------|-------|
| `--url` | `-u` | `string` | — | URL serveru |
| `--output` | `-o` | `string` | — | Cesta výstupního souboru (stdout pokud vynecháno) |
| `--export-format` | — | `string` | `json` | Formát exportu: `json` nebo `csv` |
| `--category` | — | `string` | — | Filtr podle kategorie |
| `--type` | — | `string` | — | Filtr podle typu události |
| `--rule-id` | — | `string` | — | Filtr podle ID pravidla |
| `--from` | — | `string` | — | Od timestampu nebo ISO data |
| `--to` | — | `string` | — | Do timestampu nebo ISO data |

**Příklad:**

```bash
noex-rules audit export -o audit.json
noex-rules audit export --export-format csv -o audit.csv
noex-rules audit export --category rule --from 2024-01-01 > audit.json
```

---

## Typy

### OutputFormat

```typescript
type OutputFormat = 'json' | 'table' | 'pretty';
```

### ExitCode

```typescript
const ExitCode = {
  Success: 0,
  GeneralError: 1,
  InvalidArguments: 2,
  ValidationError: 3,
  FileNotFound: 4,
  ConnectionError: 5,
  TestFailed: 6
} as const;
```

### GlobalOptions

```typescript
interface GlobalOptions {
  format: OutputFormat;
  quiet: boolean;
  noColor: boolean;
  config: string | undefined;
}
```

### CliConfig

```typescript
interface CliConfig {
  server: {
    url: string;
  };
  storage: {
    adapter: 'memory' | 'sqlite' | 'file';
    path?: string;
  };
  output: {
    format: OutputFormat;
    colors: boolean;
  };
}
```

---

## Třídy chyb

### CliError

Základní třída pro CLI chyby.

```typescript
class CliError extends Error {
  readonly exitCode: ExitCode;
  readonly cause: Error | undefined;
}
```

### InvalidArgumentsError

Vyhozena při neplatných argumentech příkazové řádky.

```typescript
class InvalidArgumentsError extends CliError {
  // exitCode: ExitCode.InvalidArguments (2)
}
```

### FileNotFoundError

Vyhozena když soubor nelze nalézt.

```typescript
class FileNotFoundError extends CliError {
  readonly filePath: string;
  // exitCode: ExitCode.FileNotFound (4)
}
```

### ValidationError

Vyhozena když validace pravidel selže.

```typescript
class ValidationError extends CliError {
  readonly errors: ValidationIssue[];
  // exitCode: ExitCode.ValidationError (3)
}
```

### ConnectionError

Vyhozena když připojení k serveru selže.

```typescript
class ConnectionError extends CliError {
  readonly url: string;
  // exitCode: ExitCode.ConnectionError (5)
}
```

### TestFailedError

Vyhozena když testové scénáře selžou.

```typescript
class TestFailedError extends CliError {
  readonly failures: TestFailure[];
  // exitCode: ExitCode.TestFailed (6)
}
```

---

## Viz také

- [REST API](./25-rest-api.md) — REST API endpointy
- [RuleEngineServer](./28-server.md) — Konfigurace serveru
- [Validation](./17-validation.md) — Validace pravidel
- [YAML Loader](./14-dsl-yaml.md) — Formát YAML pravidel
