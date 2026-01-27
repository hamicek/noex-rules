/**
 * Kontroluje, zda topic matchuje pattern.
 * Podporuje wildcardy: "order.*" matchuje "order.created", "order.updated"
 */
export function matchesTopic(topic: string, pattern: string): boolean {
  // Přesná shoda
  if (pattern === topic) return true;

  // Wildcard na konci: "order.*"
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return topic.startsWith(prefix + '.');
  }

  // Wildcard uprostřed: "order.*.status" - TODO: podpora více wildcardů
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '$');
    return regex.test(topic);
  }

  return false;
}

/**
 * Kontroluje, zda key matchuje pattern pro fakty.
 * Podporuje wildcardy: "customer:*:age" matchuje "customer:123:age"
 */
export function matchesFactPattern(key: string, pattern: string): boolean {
  if (pattern === key) return true;

  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/:/g, ':').replace(/\*/g, '[^:]+') + '$');
    return regex.test(key);
  }

  return false;
}

/**
 * Kontroluje, zda data matchují filtr.
 */
export function matchesFilter(data: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filter)) {
    const dataValue = getNestedValue(data, key);
    if (dataValue !== value) return false;
  }
  return true;
}

/**
 * Získá vnořenou hodnotu z objektu pomocí tečkové notace.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
