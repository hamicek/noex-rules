import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder, Ref } from '../types.js';
import { isRef } from '../helpers/ref.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Fluent builder pro call_service akci.
 */
class CallServiceFluentBuilder implements ActionBuilder {
  private readonly serviceName: string;
  private methodName: string = '';
  private methodArgs: unknown[] = [];

  constructor(service: string) {
    this.serviceName = service;
  }

  /**
   * Nastaví metodu, která se má zavolat.
   *
   * @param name - Název metody
   */
  method(name: string): CallServiceFluentBuilder {
    requireNonEmptyString(name, 'callService().method() name');
    this.methodName = name;
    return this;
  }

  /**
   * Nastaví argumenty pro volání metody.
   *
   * @param args - Argumenty (podporuje ref())
   */
  args(...args: unknown[]): CallServiceFluentBuilder {
    this.methodArgs = args;
    return this;
  }

  build(): RuleAction {
    if (!this.methodName) {
      throw new Error(
        `callService("${this.serviceName}") requires method name. Use .method(name) to set it.`
      );
    }

    const normalizedArgs = this.methodArgs.map((arg) =>
      isRef(arg) ? { ref: (arg as Ref).ref } : arg
    );

    return {
      type: 'call_service',
      service: this.serviceName,
      method: this.methodName,
      args: normalizedArgs,
    };
  }
}

/**
 * Builder pro call_service akci s přímým zadáním.
 */
class CallServiceBuilder implements ActionBuilder {
  constructor(
    private readonly serviceName: string,
    private readonly methodName: string,
    private readonly methodArgs: unknown[]
  ) {}

  build(): RuleAction {
    const normalizedArgs = this.methodArgs.map((arg) =>
      isRef(arg) ? { ref: (arg as Ref).ref } : arg
    );

    return {
      type: 'call_service',
      service: this.serviceName,
      method: this.methodName,
      args: normalizedArgs,
    };
  }
}

/**
 * Vytvoří akci pro volání externí služby.
 *
 * Podporuje dva způsoby použití:
 *
 * 1. S fluent API:
 * @example
 * callService('paymentService')
 *   .method('processPayment')
 *   .args(ref('event.orderId'), 100)
 *
 * 2. S přímým zadáním:
 * @example
 * callService('paymentService', 'processPayment', [ref('event.orderId'), 100])
 *
 * @param service - Název služby
 * @param method - Volitelně název metody (pro přímé zadání)
 * @param args - Volitelně argumenty metody (pro přímé zadání)
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
