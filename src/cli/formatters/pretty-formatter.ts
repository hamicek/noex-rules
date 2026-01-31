/**
 * Pretty formátter pro CLI výstup - lidsky čitelný formát.
 */

import type { FormattableData } from '../types.js';
import type { OutputFormatter } from './index.js';
import type { Rule } from '../../types/rule.js';
import type { RuleAction } from '../../types/action.js';
import type { RuleCondition } from '../../types/condition.js';

export class PrettyFormatter implements OutputFormatter {
  constructor(private readonly useColors: boolean = true) {}

  format(data: FormattableData): string {
    switch (data.type) {
      case 'rules':
        return this.formatRules(data.data as Rule[]);
      case 'rule':
        return this.formatRule(data.data as Rule);
      case 'validation':
        return this.formatValidation(data.data as ValidationResult);
      case 'stats':
        return this.formatStats(data.data as StatsData);
      case 'error':
        return this.formatError(data.data);
      case 'message':
        return this.formatMessage(data.data);
      case 'table':
        return this.formatTable(data.data as TableData);
      default:
        return JSON.stringify(data.data, null, 2);
    }
  }

  private formatRules(rules: Rule[]): string {
    if (rules.length === 0) {
      return this.color('No rules found.', 'dim');
    }

    const lines: string[] = [this.color(`Found ${rules.length} rule(s):`, 'cyan'), ''];

    for (const rule of rules) {
      const status = rule.enabled ? this.color('●', 'green') : this.color('○', 'dim');
      const priority = this.color(`[${rule.priority}]`, 'dim');
      lines.push(`${status} ${rule.name} ${priority}`);
      lines.push(`  ${this.color('ID:', 'dim')} ${rule.id}`);
      if (rule.description) {
        lines.push(`  ${this.color('Desc:', 'dim')} ${rule.description}`);
      }
      lines.push(`  ${this.color('Trigger:', 'dim')} ${this.formatTrigger(rule.trigger)}`);
      if (rule.tags.length > 0) {
        lines.push(`  ${this.color('Tags:', 'dim')} ${rule.tags.map((t) => this.color(t, 'blue')).join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  private formatRule(rule: Rule): string {
    const lines: string[] = [];
    const status = rule.enabled ? this.color('● Enabled', 'green') : this.color('○ Disabled', 'dim');

    lines.push(this.color(rule.name, 'bold'));
    lines.push(status);
    lines.push('');
    lines.push(`${this.color('ID:', 'cyan')}          ${rule.id}`);
    lines.push(`${this.color('Version:', 'cyan')}     ${rule.version}`);
    lines.push(`${this.color('Priority:', 'cyan')}    ${rule.priority}`);

    if (rule.description) {
      lines.push(`${this.color('Description:', 'cyan')} ${rule.description}`);
    }

    if (rule.tags.length > 0) {
      lines.push(`${this.color('Tags:', 'cyan')}        ${rule.tags.map((t) => this.color(t, 'blue')).join(', ')}`);
    }

    lines.push('');
    lines.push(this.color('Trigger:', 'cyan'));
    lines.push(`  ${this.formatTrigger(rule.trigger)}`);

    lines.push('');
    lines.push(this.color('Conditions:', 'cyan'));
    if (rule.conditions.length === 0) {
      lines.push(`  ${this.color('(none)', 'dim')}`);
    } else {
      for (const condition of rule.conditions) {
        lines.push(`  • ${this.formatCondition(condition)}`);
      }
    }

    lines.push('');
    lines.push(this.color('Actions:', 'cyan'));
    for (const action of rule.actions) {
      lines.push(`  → ${this.formatAction(action)}`);
    }

    lines.push('');
    lines.push(this.color('Timestamps:', 'dim'));
    lines.push(`  Created: ${new Date(rule.createdAt).toLocaleString()}`);
    lines.push(`  Updated: ${new Date(rule.updatedAt).toLocaleString()}`);

    return lines.join('\n');
  }

  private formatTrigger(trigger: Rule['trigger']): string {
    switch (trigger.type) {
      case 'fact':
        return `${this.color('fact', 'yellow')} pattern: ${this.color(trigger.pattern, 'green')}`;
      case 'event':
        return `${this.color('event', 'yellow')} topic: ${this.color(trigger.topic, 'green')}`;
      case 'timer':
        return `${this.color('timer', 'yellow')} name: ${this.color(trigger.name, 'green')}`;
      case 'temporal':
        return `${this.color('temporal', 'yellow')} ${JSON.stringify(trigger.pattern)}`;
    }
  }

  private formatCondition(condition: RuleCondition): string {
    const sourceStr = this.formatSource(condition.source);
    return `${sourceStr} ${this.color(condition.operator, 'yellow')} ${JSON.stringify(condition.value)}`;
  }

  private formatSource(source: RuleCondition['source']): string {
    switch (source.type) {
      case 'fact':
        return `fact(${this.color(source.pattern, 'green')})`;
      case 'event':
        return `event.${this.color(source.field, 'green')}`;
      case 'context':
        return `ctx.${this.color(source.key, 'green')}`;
      case 'lookup':
        return `lookup(${this.color(source.name, 'green')}${source.field ? '.' + this.color(source.field, 'green') : ''})`;
      case 'baseline':
        return `baseline(${this.color(source.metric, 'green')})`;
    }
  }

  private formatAction(action: RuleAction): string {
    const type = this.color(action.type, 'magenta');
    switch (action.type) {
      case 'set_fact':
        return `${type} ${this.color(action.key, 'green')} = ${JSON.stringify(action.value)}`;
      case 'delete_fact':
        return `${type} ${this.color(action.key, 'green')}`;
      case 'emit_event':
        return `${type} ${this.color(action.topic, 'green')}`;
      case 'set_timer':
        return `${type} ${this.color(action.timer.name, 'green')} (${action.timer.duration})`;
      case 'cancel_timer':
        return `${type} ${this.color(action.name, 'green')}`;
      case 'log':
        return `${type} [${action.level}] "${action.message}"`;
      case 'call_service':
        return `${type} ${action.service}.${action.method}()`;
      default:
        return `${type} ${JSON.stringify(action)}`;
    }
  }

  private formatValidation(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
      lines.push(this.color('✓ Validation passed', 'green'));
      if (result.warnings && result.warnings.length > 0) {
        lines.push('');
        lines.push(this.color(`Warnings (${result.warnings.length}):`, 'yellow'));
        for (const w of result.warnings) {
          lines.push(`  ⚠ ${this.color(w.path, 'dim')}: ${w.message}`);
        }
      }
    } else {
      lines.push(this.color('✗ Validation failed', 'red'));
      if (result.errors && result.errors.length > 0) {
        lines.push('');
        lines.push(this.color(`Errors (${result.errors.length}):`, 'red'));
        for (const e of result.errors) {
          lines.push(`  ✗ ${this.color(e.path, 'dim')}: ${e.message}`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatStats(stats: StatsData): string {
    const lines: string[] = [
      this.color('Engine Statistics', 'bold'),
      '',
      `${this.color('Rules:', 'cyan')}    ${stats.rules}`,
      `${this.color('Facts:', 'cyan')}    ${stats.facts}`,
      `${this.color('Events:', 'cyan')}   ${stats.events}`,
      `${this.color('Timers:', 'cyan')}   ${stats.timers}`,
      `${this.color('Uptime:', 'cyan')}   ${this.formatDuration(stats.uptime)}`
    ];

    return lines.join('\n');
  }

  private formatError(data: unknown): string {
    return this.color('✗ ', 'red') + this.color(String(data), 'red');
  }

  private formatMessage(data: unknown): string {
    return String(data);
  }

  private formatTable(data: TableData): string {
    const lines: string[] = [];
    const columns = data.columns.map((c) => (typeof c === 'string' ? c : c.header));

    // Header
    lines.push(this.color(columns.join('  '), 'cyan'));
    lines.push('-'.repeat(columns.join('  ').length));

    // Rows
    for (const row of data.rows) {
      lines.push(row.join('  '));
    }

    return lines.join('\n');
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  private color(text: string, style: ColorStyle): string {
    if (!this.useColors) {
      return text;
    }
    const codes: Record<ColorStyle, string> = {
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
    return `${codes[style]}${text}\x1b[0m`;
  }
}

type ColorStyle = 'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan';

interface ValidationResult {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
  warnings?: Array<{ path: string; message: string }>;
}

interface StatsData {
  rules: number;
  facts: number;
  events: number;
  timers: number;
  uptime: number;
}

interface TableData {
  columns: Array<string | { header: string }>;
  rows: string[][];
}
