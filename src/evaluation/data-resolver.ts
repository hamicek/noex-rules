import type { DataRequirement } from '../types/lookup.js';
import type { InterpolationContext } from '../utils/interpolation.js';
import { resolve } from '../utils/interpolation.js';
import { LookupCache } from './lookup-cache.js';

/**
 * Chyba při resoluci lookupu.
 */
export class DataResolutionError extends Error {
  public readonly lookupName: string;
  public readonly service: string;
  public readonly method: string;
  public override readonly cause: Error;

  constructor(lookupName: string, service: string, method: string, cause: Error) {
    super(`Lookup "${lookupName}" failed: ${cause.message}`, { cause });
    this.name = 'DataResolutionError';
    this.lookupName = lookupName;
    this.service = service;
    this.method = method;
    this.cause = cause;
  }
}

/**
 * Výsledek resoluce všech datových požadavků.
 */
export interface DataResolutionResult {
  lookups: Map<string, unknown>;
  errors: DataResolutionError[];
  skipped: boolean;
}

/**
 * Resolvuje datové požadavky voláním externích služeb.
 * Podporuje cache, paralelní exekuci a konfigurovatelné chování při chybách.
 */
export class DataResolver {
  constructor(
    private readonly services: Map<string, unknown>,
    private readonly cache: LookupCache
  ) {}

  /**
   * Resolvuje všechny datové požadavky paralelně.
   *
   * Pokud lookup s `onError: 'fail'` selže, vyhodí `DataResolutionError`.
   * Pokud lookup s `onError: 'skip'` (výchozí) selže, pravidlo se přeskočí
   * (`skipped: true`) a chyba se zaznamená do `errors`.
   */
  async resolveAll(
    requirements: DataRequirement[],
    ctx: InterpolationContext
  ): Promise<DataResolutionResult> {
    if (requirements.length === 0) {
      return { lookups: new Map(), errors: [], skipped: false };
    }

    const settlements = await Promise.allSettled(
      requirements.map(req => this.resolveOne(req, ctx))
    );

    const lookups = new Map<string, unknown>();
    const errors: DataResolutionError[] = [];

    for (let i = 0; i < requirements.length; i++) {
      const req = requirements[i]!;
      const settlement = settlements[i]!;

      if (settlement.status === 'fulfilled') {
        lookups.set(req.name, settlement.value);
        continue;
      }

      const cause = settlement.reason instanceof Error
        ? settlement.reason
        : new Error(String(settlement.reason));

      const error = new DataResolutionError(req.name, req.service, req.method, cause);
      const strategy = req.onError ?? 'skip';

      if (strategy === 'fail') {
        throw error;
      }

      errors.push(error);
    }

    return {
      lookups,
      errors,
      skipped: errors.length > 0,
    };
  }

  private async resolveOne(
    req: DataRequirement,
    ctx: InterpolationContext
  ): Promise<unknown> {
    const resolvedArgs = req.args.map(arg => resolve(arg, ctx));

    if (req.cache) {
      const cacheKey = LookupCache.buildKey(req.service, req.method, resolvedArgs);
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    const service = this.services.get(req.service);
    if (!service) {
      throw new Error(`Service "${req.service}" is not registered`);
    }

    const method = (service as Record<string, unknown>)[req.method];
    if (typeof method !== 'function') {
      throw new Error(`Method "${req.method}" not found on service "${req.service}"`);
    }

    const result = await (method as Function).apply(service, resolvedArgs);

    if (req.cache) {
      const ttlMs = LookupCache.parseTtl(req.cache.ttl);
      const cacheKey = LookupCache.buildKey(req.service, req.method, resolvedArgs);
      this.cache.set(cacheKey, result, ttlMs);
    }

    return result;
  }
}
