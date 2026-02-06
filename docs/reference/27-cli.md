# CLI

Command-line interface for managing rules, validating files, running tests, and interacting with a running server.

## Installation

The CLI is available as the `noex-rules` command after installing the package:

```bash
npm install -g @hamicek/noex-rules
# or
npx noex-rules <command>
```

---

## Global Options

These options are available for all commands:

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--format` | `-f` | `string` | `pretty` | Output format: `json`, `table`, `pretty` |
| `--quiet` | `-q` | `boolean` | `false` | Suppress non-essential output |
| `--no-color` | — | `boolean` | `false` | Disable colored output |
| `--config` | `-c` | `string` | — | Path to config file |

**Example:**

```bash
noex-rules rule list --format json --quiet
noex-rules validate rules.json -f table
```

---

## Output Formats

| Format | Description |
|--------|-------------|
| `pretty` | Human-readable colored output (default) |
| `table` | Tabular format for lists |
| `json` | Machine-readable JSON output |

---

## Exit Codes

| Code | Constant | Description |
|------|----------|-------------|
| 0 | `Success` | Command completed successfully |
| 1 | `GeneralError` | Unexpected error |
| 2 | `InvalidArguments` | Invalid command-line arguments |
| 3 | `ValidationError` | Rule validation failed |
| 4 | `FileNotFound` | File not found |
| 5 | `ConnectionError` | Failed to connect to server |
| 6 | `TestFailed` | Test scenarios failed |

---

## Configuration File

The CLI reads configuration from `.noex-rules.json` or a custom path via `--config`.

```typescript
interface CliConfig {
  server: {
    url: string;           // default: "http://localhost:7226"
  };
  storage: {
    adapter: 'memory' | 'sqlite' | 'file';
    path?: string;
  };
  output: {
    format: 'json' | 'table' | 'pretty';
    colors: boolean;       // default: true
  };
}
```

**Example `.noex-rules.json`:**

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

## Commands

### version

Displays the CLI version.

```bash
noex-rules version
```

**Output:**

```
noex-rules v1.0.0
```

---

### init

Initializes a configuration file in the current directory.

```bash
noex-rules init [options]
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--force` | `boolean` | Overwrite existing configuration file |
| `--server-url <url>` | `string` | Server URL |
| `--storage-adapter <adapter>` | `string` | Storage adapter: `memory`, `sqlite`, `file` |
| `--storage-path <path>` | `string` | Storage file path |

**Example:**

```bash
noex-rules init --server-url http://localhost:8080 --storage-adapter sqlite
```

---

### validate

Validates rules from a JSON file.

```bash
noex-rules validate <file> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| file | yes | Path to JSON file with rules |

**Options:**

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--strict` | `-s` | `boolean` | `false` | Treat warnings as errors |

**Example:**

```bash
noex-rules validate ./rules.json
noex-rules validate ./rules.json --strict
```

**Output (pretty):**

```
File: /path/to/rules.json
Rules: 5

✓ All rules are valid
```

**Output with errors:**

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

Imports rules from a JSON or YAML file to the server.

```bash
noex-rules import <file> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| file | yes | Path to rules file (JSON or YAML) |

**Options:**

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--dry-run` | `-d` | `boolean` | `false` | Show what would be imported |
| `--merge` | `-m` | `boolean` | `false` | Merge with existing rules |
| `--no-validate` | — | `boolean` | `false` | Skip validation |
| `--strict` | `-s` | `boolean` | `false` | Strict validation mode |

**Example:**

```bash
noex-rules import ./rules.json
noex-rules import ./rules.yaml --dry-run
noex-rules import ./rules.json --merge --strict
```

---

### export

Exports rules from the server to a file or stdout.

```bash
noex-rules export [output] [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| output | no | Output file path (stdout if omitted) |

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--pretty` | `-p` | `boolean` | Pretty print JSON output |
| `--tags <tags>` | `-t` | `string` | Filter by tags (comma-separated) |
| `--enabled` | `-e` | `boolean` | Export only enabled rules |

**Example:**

```bash
noex-rules export ./backup.json --pretty
noex-rules export --tags payment,order
noex-rules export --enabled -f json > active-rules.json
```

---

### test

Runs test scenarios against rules.

```bash
noex-rules test <file> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| file | yes | Path to test scenarios file |

**Options:**

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--dry-run` | `-d` | `boolean` | `true` | Run tests without side effects |
| `--verbose` | `-v` | `boolean` | `false` | Show detailed test output |
| `--rules <path>` | `-r` | `string` | — | Path to rules file |
| `--timeout <ms>` | `-t` | `number` | — | Test timeout in milliseconds |

**Example:**

```bash
noex-rules test ./tests/scenarios.json --verbose
noex-rules test ./tests/scenarios.json --rules ./rules.json --timeout 5000
```

**Test File Format:**

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

Starts the REST API server.

```bash
noex-rules server start [options]
```

**Options:**

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--port` | `-p` | `number` | `7226` | Server port |
| `--host` | `-H` | `string` | `0.0.0.0` | Server host |
| `--no-swagger` | — | `boolean` | `false` | Disable Swagger documentation |
| `--no-logger` | — | `boolean` | `false` | Disable request logging |

**Example:**

```bash
noex-rules server start
noex-rules server start --port 8080 --host 127.0.0.1
noex-rules server start --no-swagger --no-logger
```

**Output:**

```
Rule Engine Server started
  URL: http://0.0.0.0:7226
  Swagger: http://0.0.0.0:7226/documentation
```

---

### server status

Checks the status of a running server.

```bash
noex-rules server status [options]
```

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--url` | `-u` | `string` | Server URL (from config if omitted) |

**Example:**

```bash
noex-rules server status
noex-rules server status --url http://localhost:8080
```

**Output:**

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

Lists all rules on the server.

```bash
noex-rules rule list [options]
```

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--url` | `-u` | `string` | Server URL |

**Example:**

```bash
noex-rules rule list
noex-rules rule list --format table
```

**Output (table):**

```
ID              NAME                 ENABLED  PRIORITY  TAGS
user-welcome    User Welcome Email   true     10        user, email
order-process   Order Processing     true     5         order
session-timeout Session Timeout      false    0         session
```

---

### rule get

Gets details of a specific rule.

```bash
noex-rules rule get <id> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| id | yes | Rule ID |

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--url` | `-u` | `string` | Server URL |

**Example:**

```bash
noex-rules rule get user-welcome
noex-rules rule get user-welcome --format json
```

---

### rule enable

Enables a disabled rule.

```bash
noex-rules rule enable <id> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| id | yes | Rule ID |

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--url` | `-u` | `string` | Server URL |

**Example:**

```bash
noex-rules rule enable session-timeout
```

---

### rule disable

Disables a rule.

```bash
noex-rules rule disable <id> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| id | yes | Rule ID |

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--url` | `-u` | `string` | Server URL |

**Example:**

```bash
noex-rules rule disable user-welcome
```

---

### rule delete

Deletes a rule from the server.

```bash
noex-rules rule delete <id> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| id | yes | Rule ID |

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--url` | `-u` | `string` | Server URL |

**Example:**

```bash
noex-rules rule delete old-rule
```

---

### stats

Shows engine statistics.

```bash
noex-rules stats [options]
```

**Options:**

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--url` | `-u` | `string` | Server URL |

**Example:**

```bash
noex-rules stats
noex-rules stats --format json
```

**Output:**

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

Lists audit log entries.

```bash
noex-rules audit list [options]
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--url` | `string` | Server URL |
| `--category` | `string` | Filter by category |
| `--type` | `string` | Filter by event type |
| `--rule-id` | `string` | Filter by rule ID |
| `--from` | `string` | From timestamp or ISO date |
| `--to` | `string` | To timestamp or ISO date |
| `--limit` | `number` | Max entries to return |

**Example:**

```bash
noex-rules audit list --limit 50
noex-rules audit list --category rule --from 2024-01-01
noex-rules audit list --rule-id user-welcome --type execution
```

---

### audit search

Searches audit log entries with a query string.

```bash
noex-rules audit search <query> [options]
```

**Arguments:**

| Name | Required | Description |
|------|----------|-------------|
| query | yes | Search query string |

**Options:**

Same as `audit list`.

**Example:**

```bash
noex-rules audit search "user-welcome"
noex-rules audit search "error" --from 2024-01-01 --limit 100
```

---

### audit export

Exports audit log entries to a file.

```bash
noex-rules audit export [options]
```

**Options:**

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--url` | `-u` | `string` | — | Server URL |
| `--output` | `-o` | `string` | — | Output file path (stdout if omitted) |
| `--export-format` | — | `string` | `json` | Export format: `json` or `csv` |
| `--category` | — | `string` | — | Filter by category |
| `--type` | — | `string` | — | Filter by event type |
| `--rule-id` | — | `string` | — | Filter by rule ID |
| `--from` | — | `string` | — | From timestamp or ISO date |
| `--to` | — | `string` | — | To timestamp or ISO date |

**Example:**

```bash
noex-rules audit export -o audit.json
noex-rules audit export --export-format csv -o audit.csv
noex-rules audit export --category rule --from 2024-01-01 > audit.json
```

---

## Types

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

## Error Classes

### CliError

Base class for CLI errors.

```typescript
class CliError extends Error {
  readonly exitCode: ExitCode;
  readonly cause: Error | undefined;
}
```

### InvalidArgumentsError

Thrown when command-line arguments are invalid.

```typescript
class InvalidArgumentsError extends CliError {
  // exitCode: ExitCode.InvalidArguments (2)
}
```

### FileNotFoundError

Thrown when a file cannot be found.

```typescript
class FileNotFoundError extends CliError {
  readonly filePath: string;
  // exitCode: ExitCode.FileNotFound (4)
}
```

### ValidationError

Thrown when rule validation fails.

```typescript
class ValidationError extends CliError {
  readonly errors: ValidationIssue[];
  // exitCode: ExitCode.ValidationError (3)
}
```

### ConnectionError

Thrown when server connection fails.

```typescript
class ConnectionError extends CliError {
  readonly url: string;
  // exitCode: ExitCode.ConnectionError (5)
}
```

### TestFailedError

Thrown when test scenarios fail.

```typescript
class TestFailedError extends CliError {
  readonly failures: TestFailure[];
  // exitCode: ExitCode.TestFailed (6)
}
```

---

## See Also

- [REST API](./25-rest-api.md) — REST API endpoints
- [RuleEngineServer](./28-server.md) — Server configuration
- [Validation](./17-validation.md) — Rule validation
- [YAML Loader](./14-dsl-yaml.md) — YAML rule format
