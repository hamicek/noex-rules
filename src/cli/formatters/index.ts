/**
 * Formatter factory pro CLI výstup.
 */

import type { OutputFormat, FormattableData } from '../types.js';
import { JsonFormatter } from './json-formatter.js';
import { TableFormatter } from './table-formatter.js';
import { PrettyFormatter } from './pretty-formatter.js';

/** Interface pro formátter */
export interface OutputFormatter {
  format(data: FormattableData): string;
}

/** Vytvoří instanci formátteru podle typu */
export function createFormatter(format: OutputFormat, useColors: boolean = true): OutputFormatter {
  switch (format) {
    case 'json':
      return new JsonFormatter(true);
    case 'table':
      return new TableFormatter(useColors);
    case 'pretty':
      return new PrettyFormatter(useColors);
    default:
      return new PrettyFormatter(useColors);
  }
}

export { JsonFormatter } from './json-formatter.js';
export { TableFormatter } from './table-formatter.js';
export { PrettyFormatter } from './pretty-formatter.js';
