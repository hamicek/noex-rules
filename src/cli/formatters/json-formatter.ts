/**
 * JSON formátter pro CLI výstup.
 */

import type { FormattableData } from '../types.js';
import type { OutputFormatter } from './index.js';

export class JsonFormatter implements OutputFormatter {
  constructor(private readonly pretty: boolean = false) {}

  format(data: FormattableData): string {
    const output = this.toOutputObject(data);
    return this.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  }

  private toOutputObject(data: FormattableData): unknown {
    switch (data.type) {
      case 'error':
        return {
          success: false,
          error: data.data,
          ...(data.meta && { meta: data.meta })
        };

      case 'message':
        return {
          success: true,
          message: data.data,
          ...(data.meta && { meta: data.meta })
        };

      case 'validation':
        return {
          success: true,
          validation: data.data,
          ...(data.meta && { meta: data.meta })
        };

      case 'rules':
      case 'rule':
      case 'stats':
      case 'table':
        return {
          success: true,
          data: data.data,
          ...(data.meta && { meta: data.meta })
        };

      default:
        return {
          success: true,
          data: data.data,
          ...(data.meta && { meta: data.meta })
        };
    }
  }
}
