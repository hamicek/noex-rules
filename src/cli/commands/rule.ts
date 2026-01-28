/**
 * Příkazy pro správu pravidel přes API.
 * Podporuje: list, get, enable, disable, delete
 */

import type { GlobalOptions, CliConfig } from '../types.js';
import { createServerClient, type RuleResponse } from '../services/server-client.js';
import { printData, print, colorize, success, warning } from '../utils/output.js';

/** Společné options pro rule příkazy */
export interface RuleCommandOptions extends GlobalOptions {
  /** URL serveru (přepíše konfiguraci) */
  url: string | undefined;
}

/** Formátuje pravidlo pro pretty výstup */
function formatRuleSummary(rule: RuleResponse): string {
  const status = rule.enabled
    ? colorize('enabled', 'green')
    : colorize('disabled', 'yellow');
  const priority = colorize(`P${rule.priority}`, 'cyan');
  const tags = rule.tags.length > 0
    ? colorize(`[${rule.tags.join(', ')}]`, 'dim')
    : '';

  return `${colorize(rule.id, 'bold')} ${status} ${priority} ${tags}\n  ${rule.name}${rule.description ? '\n  ' + colorize(rule.description, 'dim') : ''}`;
}

/** Formátuje detail pravidla pro pretty výstup */
function formatRuleDetail(rule: RuleResponse): string {
  const lines: string[] = [];

  lines.push(colorize('Rule Details', 'bold'));
  lines.push('');
  lines.push(`${colorize('ID:', 'cyan')}          ${rule.id}`);
  lines.push(`${colorize('Name:', 'cyan')}        ${rule.name}`);

  if (rule.description) {
    lines.push(`${colorize('Description:', 'cyan')} ${rule.description}`);
  }

  lines.push(`${colorize('Priority:', 'cyan')}    ${rule.priority}`);
  lines.push(`${colorize('Enabled:', 'cyan')}     ${rule.enabled ? colorize('Yes', 'green') : colorize('No', 'yellow')}`);

  if (rule.tags.length > 0) {
    lines.push(`${colorize('Tags:', 'cyan')}        ${rule.tags.join(', ')}`);
  }

  lines.push('');
  lines.push(colorize('Trigger:', 'cyan'));
  lines.push(formatJson(rule.trigger, 2));

  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    lines.push('');
    lines.push(colorize('Conditions:', 'cyan'));
    lines.push(formatJson(rule.conditions, 2));
  }

  lines.push('');
  lines.push(colorize('Actions:', 'cyan'));
  lines.push(formatJson(rule.actions, 2));

  return lines.join('\n');
}

/** Formátuje JSON s odsazením */
function formatJson(data: unknown, indent: number): string {
  const json = JSON.stringify(data, null, 2);
  const prefix = ' '.repeat(indent);
  return json.split('\n').map(line => prefix + line).join('\n');
}

/**
 * Příkaz rule list - seznam všech pravidel.
 */
export async function ruleListCommand(options: RuleCommandOptions, config: CliConfig): Promise<void> {
  const serverUrl = options.url ?? config.server.url;

  const client = createServerClient({
    baseUrl: serverUrl
  });

  const rules = await client.getRules();

  if (options.format === 'json') {
    printData({
      type: 'rules',
      data: {
        rules,
        count: rules.length,
        serverUrl
      }
    });
  } else {
    if (rules.length === 0) {
      print(warning('No rules found.'));
      return;
    }

    print(colorize(`Rules (${rules.length})`, 'bold'));
    print(colorize(`Server: ${serverUrl}`, 'dim'));
    print('');

    for (const rule of rules) {
      print(formatRuleSummary(rule));
      print('');
    }
  }
}

/**
 * Příkaz rule get - detail pravidla.
 */
export async function ruleGetCommand(
  id: string,
  options: RuleCommandOptions,
  config: CliConfig
): Promise<void> {
  const serverUrl = options.url ?? config.server.url;

  const client = createServerClient({
    baseUrl: serverUrl
  });

  const rule = await client.getRule(id);

  if (options.format === 'json') {
    printData({
      type: 'rule',
      data: {
        rule,
        serverUrl
      }
    });
  } else {
    print(formatRuleDetail(rule));
  }
}

/**
 * Příkaz rule enable - povolení pravidla.
 */
export async function ruleEnableCommand(
  id: string,
  options: RuleCommandOptions,
  config: CliConfig
): Promise<void> {
  const serverUrl = options.url ?? config.server.url;

  const client = createServerClient({
    baseUrl: serverUrl
  });

  const rule = await client.enableRule(id);

  if (options.format === 'json') {
    printData({
      type: 'rule',
      data: {
        rule,
        action: 'enabled',
        serverUrl
      }
    });
  } else {
    print(success(`Rule '${rule.id}' has been enabled.`));
  }
}

/**
 * Příkaz rule disable - zakázání pravidla.
 */
export async function ruleDisableCommand(
  id: string,
  options: RuleCommandOptions,
  config: CliConfig
): Promise<void> {
  const serverUrl = options.url ?? config.server.url;

  const client = createServerClient({
    baseUrl: serverUrl
  });

  const rule = await client.disableRule(id);

  if (options.format === 'json') {
    printData({
      type: 'rule',
      data: {
        rule,
        action: 'disabled',
        serverUrl
      }
    });
  } else {
    print(success(`Rule '${rule.id}' has been disabled.`));
  }
}

/**
 * Příkaz rule delete - smazání pravidla.
 */
export async function ruleDeleteCommand(
  id: string,
  options: RuleCommandOptions,
  config: CliConfig
): Promise<void> {
  const serverUrl = options.url ?? config.server.url;

  const client = createServerClient({
    baseUrl: serverUrl
  });

  await client.deleteRule(id);

  if (options.format === 'json') {
    printData({
      type: 'message',
      data: {
        message: `Rule '${id}' has been deleted.`,
        action: 'deleted',
        ruleId: id,
        serverUrl
      }
    });
  } else {
    print(success(`Rule '${id}' has been deleted.`));
  }
}
