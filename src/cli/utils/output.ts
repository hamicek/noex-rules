/**
 * Výstupní utility pro CLI.
 */

import type { OutputFormat, FormattableData } from '../types.js';
import { createFormatter } from '../formatters/index.js';

/** Globální nastavení výstupu */
let outputOptions = {
  quiet: false,
  noColor: false,
  format: 'pretty' as OutputFormat
};

/** Nastaví globální options */
export function setOutputOptions(options: Partial<typeof outputOptions>): void {
  outputOptions = { ...outputOptions, ...options };
}

/** Získá aktuální options */
export function getOutputOptions(): typeof outputOptions {
  return { ...outputOptions };
}

/** Detekce podpory barev */
function supportsColor(): boolean {
  if (outputOptions.noColor) {
    return false;
  }

  if (process.env['NO_COLOR'] !== undefined) {
    return false;
  }

  if (process.env['FORCE_COLOR'] !== undefined) {
    return true;
  }

  if (!process.stdout.isTTY) {
    return false;
  }

  return true;
}

/** ANSI kódy pro barvy */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
} as const;

type ColorName = keyof typeof colors;

/** Aplikuje barvu na text */
export function colorize(text: string, color: ColorName): string {
  if (!supportsColor()) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}

/** Formátuje úspěch */
export function success(message: string): string {
  return colorize('✓', 'green') + ' ' + message;
}

/** Formátuje chybu */
export function error(message: string): string {
  return colorize('✗', 'red') + ' ' + colorize(message, 'red');
}

/** Formátuje varování */
export function warning(message: string): string {
  return colorize('⚠', 'yellow') + ' ' + colorize(message, 'yellow');
}

/** Formátuje info */
export function info(message: string): string {
  return colorize('ℹ', 'blue') + ' ' + message;
}

/** Vypíše na stdout */
export function print(message: string): void {
  if (!outputOptions.quiet) {
    console.log(message);
  }
}

/** Vypíše na stderr */
export function printError(message: string): void {
  console.error(message);
}

/** Vypíše formátovaná data */
export function printData(data: FormattableData): void {
  if (outputOptions.quiet && data.type !== 'error') {
    return;
  }

  const formatter = createFormatter(outputOptions.format, supportsColor());
  const output = formatter.format(data);

  if (data.type === 'error') {
    printError(output);
  } else {
    print(output);
  }
}

/** Vytvoří jednoduchý progress indikátor */
export function createProgress(total: number): {
  tick: (message?: string) => void;
  done: () => void;
} {
  let current = 0;

  return {
    tick(message?: string) {
      current++;
      if (!outputOptions.quiet && process.stdout.isTTY) {
        const percent = Math.round((current / total) * 100);
        const text = message ? ` ${message}` : '';
        process.stdout.write(`\r${colorize(`[${percent}%]`, 'cyan')}${text}`);
      }
    },
    done() {
      if (!outputOptions.quiet && process.stdout.isTTY) {
        process.stdout.write('\n');
      }
    }
  };
}
