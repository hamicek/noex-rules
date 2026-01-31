# Command Line Interface

Not every interaction with the rule engine happens through code or HTTP. The `noex-rules` CLI provides a terminal interface for server management, rule operations, validation, testing, import/export, and auditing. It's designed for developers during development and for CI/CD pipelines in production.

## What You'll Learn

- All CLI commands and their options
- Output formats: pretty, JSON, table
- Server management from the terminal
- Rule validation and testing workflows
- Import/export for rule deployment
- CI/CD integration patterns

## Installation

The CLI is included in the `@hamicek/noex-rules` package. After installation, the `noex-rules` command is available:

```bash
npm install @hamicek/noex-rules

npx noex-rules --help
```

## Global Options

Every command supports these flags:

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--format <format>` | `-f` | Output format: `json`, `table`, `pretty` | `pretty` |
| `--quiet` | `-q` | Suppress non-essential output | `false` |
| `--no-color` | | Disable colored output | colors enabled |
| `--config <path>` | `-c` | Path to config file | auto-detected |

The `--format json` flag is essential for CI/CD — it produces machine-readable output that can be parsed by other tools.

## Server Commands

### Start the Server

```bash
noex-rules server start [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--port <port>` | `-p` | Server port | 7226 |
| `--host <host>` | `-H` | Host address | 0.0.0.0 |
| `--no-swagger` | | Disable Swagger docs | enabled |
| `--no-logger` | | Disable request logging | enabled |

```bash
# Start with defaults
noex-rules server start

# Custom port, no logging
noex-rules server start -p 3000 --no-logger

# JSON output (for scripting)
noex-rules server start -f json
```

Output:

```
Server running at http://0.0.0.0:7226
Swagger UI available at http://0.0.0.0:7226/documentation

Press Ctrl+C to stop
```

The server runs until you press Ctrl+C. It handles `SIGINT` and `SIGTERM` for graceful shutdown.

### Check Server Status

```bash
noex-rules server status [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--url <url>` | `-u` | Server URL | from config |

```bash
noex-rules server status
noex-rules server status -u http://localhost:3000
```

Output:

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

## Rule Commands

All rule commands require a running server (they communicate via the REST API).

### List Rules

```bash
noex-rules rule list [options]
```

```bash
noex-rules rule list
noex-rules rule list -u http://localhost:3000
noex-rules rule list -f json
```

Pretty output:

```
order-alert enabled P10 [orders, alerts]
  Order Alert

fraud-check enabled P20 [security]
  Fraud Detection Check

temp-monitor disabled P0
  Temperature Monitor
```

### Get Rule Details

```bash
noex-rules rule get <id> [options]
```

```bash
noex-rules rule get order-alert
```

Output:

```
Rule Details

ID:          order-alert
Name:        Order Alert
Description: Notify when a high-value order is placed
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

### Enable/Disable/Delete

```bash
noex-rules rule enable <id>
noex-rules rule disable <id>
noex-rules rule delete <id>
```

## Validation

Validate rule files without starting a server — syntax checking, schema validation, and reference integrity:

```bash
noex-rules validate <file> [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--strict` | `-s` | Strict validation mode | `false` |

```bash
# Validate a YAML rule file
noex-rules validate rules/order-rules.yaml

# Validate a JSON rule file with strict mode
noex-rules validate rules/fraud-rules.json --strict

# JSON output for CI
noex-rules validate rules/*.yaml -f json
```

Strict mode enforces additional checks like requiring descriptions on all rules and validating that referenced groups exist.

## Testing

Run rule tests against a temporary engine instance:

```bash
noex-rules test <file> [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--dry-run` | `-d` | Run without side effects | `true` |
| `--verbose` | `-v` | Detailed test output | `false` |
| `--rules <path>` | `-r` | Path to rules file to load | — |
| `--timeout <ms>` | `-t` | Test timeout | — |

```bash
# Run tests
noex-rules test tests/order-rules.test.yaml

# Verbose output with rule file
noex-rules test tests/order-rules.test.yaml -v -r rules/orders.yaml
```

## Import and Export

### Export Rules

Export rules from a running server or directly from storage:

```bash
noex-rules export [output] [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--pretty` | `-p` | Pretty-print JSON | `false` |
| `--tags <tags>` | `-t` | Filter by tags (comma-separated) | all |
| `--enabled` | `-e` | Export only enabled rules | all |

```bash
# Export all rules to stdout
noex-rules export

# Export to file, pretty-printed
noex-rules export rules-backup.json --pretty

# Export only enabled order rules
noex-rules export order-rules.json --tags orders --enabled
```

### Import Rules

Import rules into a running server:

```bash
noex-rules import <file> [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--dry-run` | `-d` | Preview what would be imported | `false` |
| `--merge` | `-m` | Merge with existing rules | `false` |
| `--no-validate` | | Skip validation before import | validate |
| `--strict` | `-s` | Strict validation mode | `false` |

```bash
# Dry run — show what would happen
noex-rules import rules.json --dry-run

# Import with merge (don't remove existing rules)
noex-rules import rules.json --merge

# Import without validation (trust the source)
noex-rules import rules.json --no-validate
```

## Statistics

Fetch engine statistics from a running server:

```bash
noex-rules stats [options]
```

```bash
noex-rules stats
noex-rules stats -u http://localhost:3000 -f json
```

## Audit Commands

### List Audit Entries

```bash
noex-rules audit list [options]
```

| Option | Description |
|--------|-------------|
| `--category <category>` | Filter by category |
| `--type <type>` | Filter by event type |
| `--rule-id <ruleId>` | Filter by rule ID |
| `--from <timestamp>` | Start timestamp (Unix or ISO date) |
| `--to <timestamp>` | End timestamp |
| `--limit <limit>` | Maximum entries |

```bash
# Recent rule executions
noex-rules audit list --category rule_execution --limit 20

# Entries for a specific rule
noex-rules audit list --rule-id order-alert --from 2024-01-01

# JSON output
noex-rules audit list -f json --limit 100
```

### Search Audit

```bash
noex-rules audit search <query> [options]
```

```bash
noex-rules audit search "order-alert" --category rule_execution
```

### Export Audit

```bash
noex-rules audit export [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output <file>` | `-o` | Output file path | stdout |
| `--export-format <fmt>` | | `json` or `csv` | `json` |
| `--category <category>` | | Filter by category | all |
| `--from <timestamp>` | | Start timestamp | — |
| `--to <timestamp>` | | End timestamp | — |

```bash
# Export last 24 hours to CSV
noex-rules audit export -o audit.csv --export-format csv --from "$(date -d '24 hours ago' -Iseconds)"

# Export all rule executions as JSON
noex-rules audit export -o executions.json --category rule_execution
```

## Initialize Configuration

Create a configuration file for the CLI:

```bash
noex-rules init [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--force` | Overwrite existing config | `false` |
| `--server-url <url>` | Server URL | `http://localhost:7226` |
| `--storage-adapter <type>` | `memory`, `sqlite`, `file` | `memory` |
| `--storage-path <path>` | Storage file path | — |

```bash
noex-rules init
noex-rules init --server-url http://prod-server:7226 --storage-adapter sqlite
```

## CI/CD Integration

### Validate Before Deploy

```bash
#!/bin/bash
# ci/validate-rules.sh

set -e

echo "Validating rule files..."
noex-rules validate rules/*.yaml --strict -f json

echo "Running rule tests..."
noex-rules test tests/*.test.yaml -r rules/ -f json

echo "All checks passed!"
```

### Deploy Rules

```bash
#!/bin/bash
# ci/deploy-rules.sh

set -e

SERVER_URL="${RULES_SERVER_URL:-http://localhost:7226}"

echo "Validating rules..."
noex-rules validate rules/*.yaml --strict

echo "Importing rules to ${SERVER_URL}..."
noex-rules import rules/production.yaml \
  --merge \
  --strict \
  -u "$SERVER_URL" \
  -f json

echo "Verifying deployment..."
noex-rules stats -u "$SERVER_URL"
```

### Export Backup

```bash
#!/bin/bash
# ci/backup-rules.sh

BACKUP_FILE="backups/rules-$(date +%Y%m%d-%H%M%S).json"

noex-rules export "$BACKUP_FILE" --pretty
echo "Backup saved to $BACKUP_FILE"
```

## Exercise

1. Start a server using the CLI on port 7226
2. In a separate terminal, check the server status
3. Create a rule file `rules.json` with a rule that sets a fact on event
4. Validate the rule file using the CLI
5. Import the rules with `--dry-run` first, then without
6. List the rules and verify the import
7. Export the rules to a backup file

<details>
<summary>Solution</summary>

Start the server:

```bash
noex-rules server start -p 7226
```

Check status (separate terminal):

```bash
noex-rules server status
# Status:  ok
# Version: 1.0.0
```

Create `rules.json`:

```json
[
  {
    "id": "sensor-log",
    "name": "Log Sensor Reading",
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

Validate:

```bash
noex-rules validate rules.json
# Validation passed
```

Dry-run import:

```bash
noex-rules import rules.json --dry-run
# Would import 1 rule:
#   sensor-log — Log Sensor Reading
```

Actual import:

```bash
noex-rules import rules.json
# Imported 1 rule
```

List rules:

```bash
noex-rules rule list
# sensor-log enabled P0
#   Log Sensor Reading
```

Export backup:

```bash
noex-rules export backup.json --pretty
# Exported 1 rule to backup.json
```

</details>

## Summary

- The `noex-rules` CLI provides terminal access for server management, rule operations, and CI/CD integration
- Global flags: `--format` (json/table/pretty), `--quiet`, `--no-color`, `--config`
- `server start` launches the HTTP server; `server status` checks a running server's health
- `rule list/get/enable/disable/delete` manage rules through the REST API
- `validate` checks rule files for syntax and schema errors without starting a server
- `test` runs rule tests against a temporary engine with optional dry-run mode
- `import` and `export` enable rule deployment and backup workflows
- `audit list/search/export` query and export the audit log in JSON or CSV
- `init` creates a CLI configuration file with server URL and storage settings
- Use `--format json` in CI/CD pipelines for machine-readable output
- Combine `validate`, `test`, and `import` in deployment scripts for safe rule delivery

---

Next: [Web UI Overview](../11-web-ui/01-getting-started-ui.md)
