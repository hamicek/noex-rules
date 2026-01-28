import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder } from '../types.js';
import { normalizeRefArgs } from '../helpers/ref.js';
import { requireNonEmptyString } from '../helpers/validators.js';
import { DslValidationError } from '../helpers/errors.js';

/** @internal Fluent builder returned by `callService(service)`. */
class CallServiceFluentBuilder implements ActionBuilder {
  private readonly serviceName: string;
  private methodName: string = '';
  private methodArgs: unknown[] = [];

  constructor(service: string) {
    this.serviceName = service;
  }

  /**
   * Sets the method to invoke on the service.
   *
   * @param name - Method name.
   * @returns `this` for chaining.
   */
  method(name: string): CallServiceFluentBuilder {
    requireNonEmptyString(name, 'callService().method() name');
    this.methodName = name;
    return this;
  }

  /**
   * Sets the arguments for the method call.
   *
   * @param args - Method arguments (values may be {@link ref}).
   * @returns `this` for chaining.
   */
  args(...args: unknown[]): CallServiceFluentBuilder {
    this.methodArgs = args;
    return this;
  }

  /**
   * Builds the service call action.
   *
   * @returns A `RuleAction` of type `'call_service'`.
   * @throws {DslValidationError} If the method name has not been set.
   */
  build(): RuleAction {
    if (!this.methodName) {
      throw new DslValidationError(
        `callService("${this.serviceName}") requires method name. Use .method(name) to set it.`
      );
    }

    return {
      type: 'call_service',
      service: this.serviceName,
      method: this.methodName,
      args: normalizeRefArgs(this.methodArgs),
    };
  }
}

/** @internal */
class CallServiceBuilder implements ActionBuilder {
  constructor(
    private readonly serviceName: string,
    private readonly methodName: string,
    private readonly methodArgs: unknown[]
  ) {}

  build(): RuleAction {
    return {
      type: 'call_service',
      service: this.serviceName,
      method: this.methodName,
      args: normalizeRefArgs(this.methodArgs),
    };
  }
}

/**
 * Creates an action that invokes a method on an external service.
 *
 * Supports two usage styles:
 *
 * **1. Fluent API:**
 * @example
 * ```typescript
 * callService('paymentService')
 *   .method('processPayment')
 *   .args(ref('event.orderId'), 100)
 * ```
 *
 * **2. Direct call:**
 * @example
 * ```typescript
 * callService('paymentService', 'processPayment', [ref('event.orderId'), 100])
 * ```
 *
 * @param service - Service name.
 * @param method  - Method name (required in direct form).
 * @param args    - Method arguments (direct form only).
 * @returns A `CallServiceFluentBuilder` (fluent) or an {@link ActionBuilder}
 *          (direct).
 */
export function callService(service: string): CallServiceFluentBuilder;
export function callService(
  service: string,
  method: string,
  args?: unknown[]
): ActionBuilder;
export function callService(
  service: string,
  method?: string,
  args?: unknown[]
): ActionBuilder | CallServiceFluentBuilder {
  requireNonEmptyString(service, 'callService() service');
  if (method !== undefined) {
    requireNonEmptyString(method, 'callService() method');
    return new CallServiceBuilder(service, method, args ?? []);
  }
  return new CallServiceFluentBuilder(service);
}
