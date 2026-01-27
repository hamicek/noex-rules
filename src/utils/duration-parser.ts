const MULTIPLIERS: Record<string, number> = {
  'ms': 1,
  's': 1000,
  'm': 60 * 1000,
  'h': 60 * 60 * 1000,
  'd': 24 * 60 * 60 * 1000,
  'w': 7 * 24 * 60 * 60 * 1000,
  'y': 365 * 24 * 60 * 60 * 1000
};

/**
 * Parsuje duration string na milisekundy.
 * Podporované formáty: "15m", "24h", "7d", "1w", "1y" nebo číslo v ms.
 */
export function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') return duration;

  const match = duration.match(/^(\d+)(ms|s|m|h|d|w|y)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);

  const [, value, unit] = match;
  const num = parseInt(value!, 10);
  const multiplier = MULTIPLIERS[unit!];

  if (multiplier === undefined) {
    throw new Error(`Unknown duration unit: ${unit}`);
  }

  return num * multiplier;
}

/**
 * Formátuje milisekundy na čitelný string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60 * 1000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60 * 1000) return `${Math.round(ms / (60 * 1000))}m`;
  if (ms < 24 * 60 * 60 * 1000) return `${Math.round(ms / (60 * 60 * 1000))}h`;
  return `${Math.round(ms / (24 * 60 * 60 * 1000))}d`;
}
