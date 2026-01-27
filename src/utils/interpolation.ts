import { getNestedValue } from './pattern-matcher.js';

/**
 * Kontext pro interpolaci a resolvování referencí.
 */
export interface InterpolationContext {
  trigger: {
    type: string;
    data: Record<string, unknown>;
  };
  facts: {
    get(key: string): { value: unknown } | undefined;
  };
  matchedEvents?: Array<{ data: Record<string, unknown> }>;
  variables: Map<string, unknown>;
}

/**
 * Interpoluje string template: "order:${event.data.orderId}:status"
 */
export function interpolate(template: string, ctx: InterpolationContext): string {
  // Fast path - no interpolation needed for static strings
  if (!template.includes('${')) {
    return template;
  }

  return template.replace(/\$\{([^}]+)\}/g, (_, ref: string) => {
    const value = resolveRef(ref, ctx);
    return String(value ?? '');
  });
}

/**
 * Resolvuje referenci: { ref: "event.data.orderId" } → actual value
 */
export function resolve(value: unknown, ctx: InterpolationContext): unknown {
  if (value && typeof value === 'object' && 'ref' in value) {
    return resolveRef((value as { ref: string }).ref, ctx);
  }
  return value;
}

/**
 * Resolvuje referenční string na hodnotu.
 */
export function resolveRef(ref: string, ctx: InterpolationContext): unknown {
  const [source, ...pathParts] = ref.split('.');

  let root: unknown;
  let path = pathParts;

  switch (source) {
    case 'event':
    case 'trigger':
      root = ctx.trigger.data;
      break;

    case 'fact': {
      // Interpolate the fact key to support dynamic references like fact.order:${event.orderId}:paymentId
      const factKey = interpolate(path.join('.'), ctx);
      root = ctx.facts.get(factKey)?.value;
      return root;
    }

    case 'var': {
      const varName = path[0];
      if (varName === undefined) return undefined;
      root = ctx.variables.get(varName);
      path = path.slice(1);
      break;
    }

    case 'matched': {
      const indexStr = path[0];
      if (indexStr === undefined) return undefined;
      const index = parseInt(indexStr, 10);
      root = ctx.matchedEvents?.[index]?.data;
      path = path.slice(1);
      break;
    }

    default:
      throw new Error(`Unknown reference source: ${source}`);
  }

  if (path.length === 0) return root;
  return getNestedValue(root, path.join('.'));
}

/**
 * Resolvuje objekt s možnými referencemi.
 */
export function resolveObject(
  obj: Record<string, unknown>,
  ctx: InterpolationContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolve(value, ctx);
  }
  return result;
}
