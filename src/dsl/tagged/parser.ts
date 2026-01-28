/**
 * Parser pro rule template syntax.
 *
 * Podporuje line-oriented formát:
 *
 * ```
 * id: order-notification
 * name: Send Order Notification
 * priority: 100
 * tags: orders, notifications
 *
 * WHEN event order.created
 * IF event.amount >= 100
 * AND event.status == "confirmed"
 * THEN emit notification.send { orderId: event.orderId }
 * THEN log info "Large order received"
 * ```
 */

import type { RuleInput, RuleTrigger } from '../../types/rule.js';
import type { RuleCondition } from '../../types/condition.js';
import type { RuleAction } from '../../types/action.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Chyba parsování rule template s informací o řádku.
 */
export class ParseError extends Error {
  readonly line: number;
  readonly source: string;

  constructor(message: string, line: number, source: string) {
    super(`Line ${line}: ${message}\n  ${source}`);
    this.name = 'ParseError';
    this.line = line;
    this.source = source;
  }
}

// ---------------------------------------------------------------------------
// Operator mapping
// ---------------------------------------------------------------------------

const OPERATOR_MAP: Readonly<Record<string, RuleCondition['operator']>> = {
  '==': 'eq',
  '!=': 'neq',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  in: 'in',
  not_in: 'not_in',
  contains: 'contains',
  not_contains: 'not_contains',
  matches: 'matches',
  exists: 'exists',
  not_exists: 'not_exists',
};

const UNARY_OPERATORS: ReadonlySet<string> = new Set(['exists', 'not_exists']);

// ---------------------------------------------------------------------------
// Tokenizer helpers
// ---------------------------------------------------------------------------

/**
 * Rozdělí výraz na tokeny podle mezer, respektuje uvozovky a závorky.
 */
function tokenizeExpression(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let bracketDepth = 0;

  for (const ch of input) {
    if (inQuote !== null) {
      current += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
      continue;
    }

    if (ch === '[') {
      bracketDepth++;
      current += ch;
      continue;
    }

    if (ch === ']') {
      bracketDepth--;
      current += ch;
      continue;
    }

    if (ch === ' ' && bracketDepth === 0) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

/**
 * Rozdělí string podle čárek, respektuje uvozovky a vnořené závorky.
 */
function splitByComma(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let depth = 0;

  for (const ch of input) {
    if (inQuote !== null) {
      current += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
      continue;
    }

    if (ch === '{' || ch === '[') {
      depth++;
      current += ch;
      continue;
    }

    if (ch === '}' || ch === ']') {
      depth--;
      current += ch;
      continue;
    }

    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim().length > 0) parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

const REF_PATTERN = /^(event|fact|context)\.\w/;

function isRefLike(value: string): boolean {
  return REF_PATTERN.test(value);
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;

  const num = Number(raw);
  if (raw.length > 0 && !Number.isNaN(num)) return num;

  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (inner.length === 0) return [];
    return splitByComma(inner).map(s => parseValue(s.trim()));
  }

  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
    return raw.slice(1, raw.lastIndexOf('/'));
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Condition source parsing
// ---------------------------------------------------------------------------

function parseConditionSource(
  raw: string,
  lineNum: number,
  rawLine: string,
): RuleCondition['source'] {
  const dotIndex = raw.indexOf('.');
  if (dotIndex === -1) {
    throw new ParseError(
      `Invalid source "${raw}". Expected event.<field>, fact.<pattern>, or context.<key>`,
      lineNum,
      rawLine,
    );
  }

  const prefix = raw.slice(0, dotIndex);
  const rest = raw.slice(dotIndex + 1);

  switch (prefix) {
    case 'event':
      return { type: 'event', field: rest };
    case 'fact':
      return { type: 'fact', pattern: rest };
    case 'context':
      return { type: 'context', key: rest };
    default:
      throw new ParseError(
        `Unknown source type "${prefix}". Expected event, fact, or context`,
        lineNum,
        rawLine,
      );
  }
}

// ---------------------------------------------------------------------------
// Trigger parsing
// ---------------------------------------------------------------------------

function parseTrigger(
  rest: string,
  lineNum: number,
  rawLine: string,
): RuleTrigger {
  const spaceIndex = rest.indexOf(' ');
  if (spaceIndex === -1) {
    throw new ParseError(
      'Invalid WHEN clause. Expected: WHEN event|fact|timer <target>',
      lineNum,
      rawLine,
    );
  }

  const triggerType = rest.slice(0, spaceIndex);
  const target = rest.slice(spaceIndex + 1).trim();

  if (!target) {
    throw new ParseError(
      `WHEN ${triggerType}: missing target value`,
      lineNum,
      rawLine,
    );
  }

  switch (triggerType) {
    case 'event':
      return { type: 'event', topic: target };
    case 'fact':
      return { type: 'fact', pattern: target };
    case 'timer':
      return { type: 'timer', name: target };
    default:
      throw new ParseError(
        `Unknown trigger type "${triggerType}". Expected: event, fact, or timer`,
        lineNum,
        rawLine,
      );
  }
}

// ---------------------------------------------------------------------------
// Condition parsing
// ---------------------------------------------------------------------------

function parseCondition(
  rest: string,
  lineNum: number,
  rawLine: string,
): RuleCondition {
  const tokens = tokenizeExpression(rest);

  if (tokens.length < 2) {
    throw new ParseError(
      'Invalid condition. Expected: <source>.<field> <operator> [value]',
      lineNum,
      rawLine,
    );
  }

  const source = parseConditionSource(tokens[0]!, lineNum, rawLine);
  const opRaw = tokens[1]!;
  const op = OPERATOR_MAP[opRaw] as RuleCondition['operator'] | undefined;

  if (!op) {
    throw new ParseError(
      `Unknown operator "${opRaw}". Expected: ==, !=, >, >=, <, <=, in, not_in, contains, not_contains, matches, exists, not_exists`,
      lineNum,
      rawLine,
    );
  }

  if (UNARY_OPERATORS.has(op)) {
    return { source, operator: op, value: true };
  }

  if (tokens.length < 3) {
    throw new ParseError(
      `Operator "${opRaw}" requires a value`,
      lineNum,
      rawLine,
    );
  }

  const valueRaw = tokens.slice(2).join(' ');
  return { source, operator: op, value: parseValue(valueRaw) };
}

// ---------------------------------------------------------------------------
// Action parsing
// ---------------------------------------------------------------------------

function parseAction(
  rest: string,
  lineNum: number,
  rawLine: string,
): RuleAction {
  const spaceIndex = rest.indexOf(' ');
  const actionType = spaceIndex === -1 ? rest : rest.slice(0, spaceIndex);
  const args = spaceIndex === -1 ? '' : rest.slice(spaceIndex + 1).trim();

  switch (actionType) {
    case 'emit':
      return parseEmitAction(args, lineNum, rawLine);
    case 'setFact':
      return parseSetFactAction(args, lineNum, rawLine);
    case 'deleteFact':
      return parseDeleteFactAction(args, lineNum, rawLine);
    case 'log':
      return parseLogAction(args, lineNum, rawLine);
    case 'cancelTimer':
      return parseCancelTimerAction(args, lineNum, rawLine);
    default:
      throw new ParseError(
        `Unknown action "${actionType}". Expected: emit, setFact, deleteFact, log, cancelTimer`,
        lineNum,
        rawLine,
      );
  }
}

function parseEmitAction(
  args: string,
  lineNum: number,
  rawLine: string,
): RuleAction {
  if (!args) {
    throw new ParseError('emit requires a topic', lineNum, rawLine);
  }

  const braceIndex = args.indexOf('{');
  if (braceIndex !== -1) {
    const topic = args.slice(0, braceIndex).trim();
    if (!topic) {
      throw new ParseError('emit requires a topic before data object', lineNum, rawLine);
    }
    const dataStr = args.slice(braceIndex).trim();
    return {
      type: 'emit_event',
      topic,
      data: parseInlineObject(dataStr, lineNum, rawLine),
    };
  }

  return { type: 'emit_event', topic: args, data: {} };
}

function parseInlineObject(
  raw: string,
  lineNum: number,
  rawLine: string,
): Record<string, unknown> {
  if (!raw.startsWith('{') || !raw.endsWith('}')) {
    throw new ParseError(`Invalid object syntax: ${raw}`, lineNum, rawLine);
  }

  const inner = raw.slice(1, -1).trim();
  if (inner.length === 0) return {};

  const result: Record<string, unknown> = {};
  const pairs = splitByComma(inner);

  for (const pair of pairs) {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) {
      throw new ParseError(`Invalid key-value pair: "${pair.trim()}"`, lineNum, rawLine);
    }
    const key = pair.slice(0, colonIndex).trim();
    const valueRaw = pair.slice(colonIndex + 1).trim();
    result[key] = isRefLike(valueRaw) ? { ref: valueRaw } : parseValue(valueRaw);
  }

  return result;
}

function parseSetFactAction(
  args: string,
  lineNum: number,
  rawLine: string,
): RuleAction {
  if (!args) {
    throw new ParseError('setFact requires key and value', lineNum, rawLine);
  }

  const spaceIndex = args.indexOf(' ');
  if (spaceIndex === -1) {
    throw new ParseError(
      'setFact requires a value. Expected: setFact <key> <value>',
      lineNum,
      rawLine,
    );
  }

  const key = args.slice(0, spaceIndex);
  const valueRaw = args.slice(spaceIndex + 1).trim();

  return {
    type: 'set_fact',
    key,
    value: isRefLike(valueRaw) ? { ref: valueRaw } : parseValue(valueRaw),
  };
}

function parseDeleteFactAction(
  args: string,
  lineNum: number,
  rawLine: string,
): RuleAction {
  if (!args) {
    throw new ParseError('deleteFact requires a key', lineNum, rawLine);
  }
  return { type: 'delete_fact', key: args };
}

function parseLogAction(
  args: string,
  lineNum: number,
  rawLine: string,
): RuleAction {
  if (!args) {
    throw new ParseError('log requires level and message', lineNum, rawLine);
  }

  const spaceIndex = args.indexOf(' ');
  if (spaceIndex === -1) {
    throw new ParseError(
      'log requires a message. Expected: log <level> <message>',
      lineNum,
      rawLine,
    );
  }

  const level = args.slice(0, spaceIndex);
  const VALID_LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);
  if (!VALID_LEVELS.has(level)) {
    throw new ParseError(
      `Invalid log level "${level}". Expected: debug, info, warn, error`,
      lineNum,
      rawLine,
    );
  }

  let message = args.slice(spaceIndex + 1).trim();
  if (
    (message.startsWith('"') && message.endsWith('"')) ||
    (message.startsWith("'") && message.endsWith("'"))
  ) {
    message = message.slice(1, -1);
  }

  return {
    type: 'log',
    level: level as 'debug' | 'info' | 'warn' | 'error',
    message,
  };
}

function parseCancelTimerAction(
  args: string,
  lineNum: number,
  rawLine: string,
): RuleAction {
  if (!args) {
    throw new ParseError('cancelTimer requires a timer name', lineNum, rawLine);
  }
  return { type: 'cancel_timer', name: args };
}

// ---------------------------------------------------------------------------
// Property handling
// ---------------------------------------------------------------------------

const PROPERTY_KEYS: ReadonlySet<string> = new Set([
  'id', 'name', 'description', 'priority', 'enabled', 'tags',
]);

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parsuje rule template string a vrací RuleInput objekt.
 *
 * Syntax je line-oriented — každý řádek je buď property (key: value),
 * trigger (WHEN), podmínka (IF/AND), nebo akce (THEN).
 * Prázdné řádky a komentáře (# nebo //) jsou ignorovány.
 *
 * @throws {ParseError} Při syntaktické chybě (obsahuje číslo řádku)
 * @throws {Error} Při chybějícím id, triggeru nebo akci
 */
export function parseRuleTemplate(input: string): RuleInput {
  const lines = input.split('\n');

  let id: string | undefined;
  let name: string | undefined;
  let description: string | undefined;
  let priority: number | undefined;
  let enabled: boolean | undefined;
  const tags: string[] = [];
  let trigger: RuleTrigger | undefined;
  const conditions: RuleCondition[] = [];
  const actions: RuleAction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i]!.trim();

    if (raw === '' || raw.startsWith('#') || raw.startsWith('//')) continue;

    // WHEN clause
    if (raw.startsWith('WHEN ')) {
      trigger = parseTrigger(raw.slice(5).trim(), lineNum, raw);
      continue;
    }

    // IF / AND clause
    if (raw.startsWith('IF ') || raw.startsWith('AND ')) {
      const offset = raw.startsWith('IF ') ? 3 : 4;
      conditions.push(parseCondition(raw.slice(offset).trim(), lineNum, raw));
      continue;
    }

    // THEN clause
    if (raw.startsWith('THEN ')) {
      actions.push(parseAction(raw.slice(5).trim(), lineNum, raw));
      continue;
    }

    // Property: key: value
    const colonIndex = raw.indexOf(':');
    if (colonIndex !== -1) {
      const key = raw.slice(0, colonIndex).trim().toLowerCase();

      if (!PROPERTY_KEYS.has(key)) {
        throw new ParseError(`Unknown property "${key}"`, lineNum, raw);
      }

      const value = raw.slice(colonIndex + 1).trim();

      switch (key) {
        case 'id':
          id = value;
          break;
        case 'name':
          name = value;
          break;
        case 'description':
          description = value;
          break;
        case 'priority': {
          const n = Number(value);
          if (!Number.isFinite(n)) {
            throw new ParseError(`Invalid priority "${value}". Must be a number`, lineNum, raw);
          }
          priority = n;
          break;
        }
        case 'enabled':
          if (value === 'true') enabled = true;
          else if (value === 'false') enabled = false;
          else {
            throw new ParseError(
              `Invalid enabled value "${value}". Expected true or false`,
              lineNum,
              raw,
            );
          }
          break;
        case 'tags':
          tags.push(...value.split(',').map(s => s.trim()).filter(Boolean));
          break;
      }
      continue;
    }

    throw new ParseError('Unrecognized syntax', lineNum, raw);
  }

  // Validace
  if (!id) {
    throw new Error('Rule template: "id" property is required');
  }
  if (!trigger) {
    throw new Error(`Rule "${id}": WHEN clause is required`);
  }
  if (actions.length === 0) {
    throw new Error(`Rule "${id}": at least one THEN clause is required`);
  }

  const rule: RuleInput = {
    id,
    name: name ?? id,
    priority: priority ?? 0,
    enabled: enabled ?? true,
    tags,
    trigger,
    conditions,
    actions,
  };

  if (description) {
    rule.description = description;
  }

  return rule;
}
