import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder } from '../types.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Builder pro log akci.
 */
class LogBuilder implements ActionBuilder {
  constructor(
    private readonly level: LogLevel,
    private readonly message: string
  ) {}

  build(): RuleAction {
    return {
      type: 'log',
      level: this.level,
      message: this.message,
    };
  }
}

/**
 * Vytvoří akci pro logování.
 *
 * Zpráva podporuje interpolaci pomocí ${} syntaxe.
 *
 * @example
 * log('info', 'Processing order ${event.orderId}')
 * log('error', 'Payment failed for customer ${fact.customerId}')
 * log('debug', 'Rule triggered at ${context.timestamp}')
 *
 * @param level - Úroveň logu: 'debug', 'info', 'warn', 'error'
 * @param message - Zpráva k zalogování (podporuje ${} interpolaci)
 */
export function log(level: LogLevel, message: string): ActionBuilder {
  return new LogBuilder(level, message);
}

/**
 * Helper funkce pro jednotlivé log úrovně.
 */
log.debug = (message: string): ActionBuilder => log('debug', message);
log.info = (message: string): ActionBuilder => log('info', message);
log.warn = (message: string): ActionBuilder => log('warn', message);
log.error = (message: string): ActionBuilder => log('error', message);
