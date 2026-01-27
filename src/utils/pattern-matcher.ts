/**
 * Globální cache pro zkompilované regulární výrazy.
 * Klíč: `${separator}:${pattern}`
 */
const regexCache = new Map<string, RegExp>();

/**
 * Získá nebo vytvoří zkompilovaný regex pro daný pattern.
 */
function getOrCreateRegex(pattern: string, separator: string): RegExp {
  const cacheKey = `${separator}:${pattern}`;
  let regex = regexCache.get(cacheKey);
  if (!regex) {
    const escapedSeparator = separator === '.' ? '\\.' : separator;
    const regexPattern = '^' + pattern.replace(new RegExp(escapedSeparator, 'g'), escapedSeparator).replace(/\*/g, `[^${separator}]+`) + '$';
    regex = new RegExp(regexPattern);
    regexCache.set(cacheKey, regex);
  }
  return regex;
}

/**
 * Vymaže cache regulárních výrazů. Užitečné pro testy.
 */
export function clearPatternCache(): void {
  regexCache.clear();
}

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

  // Wildcard uprostřed nebo na začátku - použij cached regex
  if (pattern.includes('*')) {
    const regex = getOrCreateRegex(pattern, '.');
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

  // Fast path: trailing wildcard "customer:*"
  if (pattern.endsWith(':*') && !pattern.slice(0, -2).includes('*')) {
    const prefix = pattern.slice(0, -1);
    return key.startsWith(prefix) && key.indexOf(':', prefix.length) === -1;
  }

  if (pattern.includes('*')) {
    const regex = getOrCreateRegex(pattern, ':');
    return regex.test(key);
  }

  return false;
}

/**
 * Kontroluje, zda timer name matchuje pattern.
 * Podporuje wildcardy: "payment-timeout:*" matchuje "payment-timeout:order123"
 */
export function matchesTimerPattern(name: string, pattern: string): boolean {
  if (pattern === name) return true;

  // Fast path: trailing wildcard "payment-timeout:*"
  if (pattern.endsWith(':*') && !pattern.slice(0, -2).includes('*')) {
    const prefix = pattern.slice(0, -1);
    return name.startsWith(prefix) && name.indexOf(':', prefix.length) === -1;
  }

  if (pattern.includes('*')) {
    const regex = getOrCreateRegex(pattern, ':');
    return regex.test(name);
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
