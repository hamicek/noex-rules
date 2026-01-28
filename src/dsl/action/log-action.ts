import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';
import { DslValidationError } from '../helpers/errors.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const VALID_LOG_LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);

/** @internal */
class LogBuilder implements ActionBuilder {
  constructor(
    private readonly level: LogLevel,
    private readonly message: string
  ) {}

  /** @returns A `RuleAction` of type `'log'`. */
  build(): RuleAction {
    return {
      type: 'log',
      level: this.level,
      message: this.message,
    };
  }
}

/**
 * Creates a logging action.
 *
 * The message supports `${}` interpolation that is resolved at runtime.
 *
 * @param level   - Log level: `'debug'`, `'info'`, `'warn'`, or `'error'`.
 * @param message - Message to log (supports `${}` interpolation).
 * @returns An {@link ActionBuilder} for use with {@link RuleBuilder.then}.
 * @throws {DslValidationError} If `level` is invalid or `message` is not a string.
 *
 * @example
 * ```typescript
 * log('info', 'Processing order ${event.orderId}')
 * log('error', 'Payment failed for customer ${fact.customerId}')
 * log('debug', 'Rule triggered at ${context.timestamp}')
 * ```
 */
export function log(level: LogLevel, message: string): ActionBuilder {
  requireNonEmptyString(level, 'log() level');
  if (!VALID_LOG_LEVELS.has(level)) {
    throw new DslValidationError(`log() level must be one of: debug, info, warn, error — got "${level}"`);
  }
  if (typeof message !== 'string') {
    throw new DslValidationError('log() message must be a string');
  }
  return new LogBuilder(level, message);
}

/** Shorthand for `log('debug', message)`. */
log.debug = (message: string): ActionBuilder => log('debug', message);
/** Shorthand for `log('info', message)`. */
log.info = (message: string): ActionBuilder => log('info', message);
/** Shorthand for `log('warn', message)`. */
log.warn = (message: string): ActionBuilder => log('warn', message);
/** Shorthand for `log('error', message)`. */
log.error = (message: string): ActionBuilder => log('error', message);
