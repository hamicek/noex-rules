import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatUptime,
  formatNumber,
  formatMs,
  formatRelativeTime,
  formatCountdown,
  formatDuration,
  formatJson,
} from '../lib/formatters';

describe('formatUptime', () => {
  it('formats seconds into minutes', () => {
    expect(formatUptime(120)).toBe('2m');
  });

  it('formats seconds into hours and minutes', () => {
    expect(formatUptime(3720)).toBe('1h 2m');
  });

  it('formats seconds into days, hours and minutes', () => {
    expect(formatUptime(90061)).toBe('1d 1h 1m');
  });

  it('shows 0m for zero seconds', () => {
    expect(formatUptime(0)).toBe('0m');
  });

  it('omits zero components', () => {
    expect(formatUptime(86400)).toBe('1d');
    expect(formatUptime(3600)).toBe('1h');
  });
});

describe('formatNumber', () => {
  it('returns plain number below 1000', () => {
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands', () => {
    expect(formatNumber(1500)).toBe('1.5k');
    expect(formatNumber(10000)).toBe('10.0k');
  });

  it('formats millions', () => {
    expect(formatNumber(1500000)).toBe('1.5M');
    expect(formatNumber(2000000)).toBe('2.0M');
  });
});

describe('formatMs', () => {
  it('formats sub-millisecond as microseconds', () => {
    expect(formatMs(0.5)).toBe('500µs');
    expect(formatMs(0.001)).toBe('1µs');
  });

  it('formats milliseconds', () => {
    expect(formatMs(1.5)).toBe('1.5ms');
    expect(formatMs(999)).toBe('999.0ms');
  });

  it('formats seconds', () => {
    expect(formatMs(1500)).toBe('1.50s');
    expect(formatMs(10000)).toBe('10.00s');
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for recent timestamps', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('just now');
  });

  it('formats minutes ago', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5m ago');
  });

  it('formats hours ago', () => {
    expect(formatRelativeTime(Date.now() - 3 * 3_600_000)).toBe('3h ago');
  });

  it('formats days ago', () => {
    expect(formatRelativeTime(Date.now() - 2 * 86_400_000)).toBe('2d ago');
  });
});

describe('formatCountdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "expired" for past timestamps', () => {
    expect(formatCountdown(Date.now() - 1_000)).toBe('expired');
  });

  it('formats seconds remaining', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const target = Date.now() + 45_000;
    expect(formatCountdown(target)).toBe('45s');
    vi.useRealTimers();
  });

  it('formats minutes and seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const target = Date.now() + 5 * 60_000 + 30_000;
    expect(formatCountdown(target)).toBe('5m 30s');
    vi.useRealTimers();
  });

  it('formats hours and minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const target = Date.now() + 2 * 3_600_000 + 15 * 60_000;
    expect(formatCountdown(target)).toBe('2h 15m');
    vi.useRealTimers();
  });

  it('formats days and hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const target = Date.now() + 3 * 86_400_000 + 5 * 3_600_000;
    expect(formatCountdown(target)).toBe('3d 5h');
    vi.useRealTimers();
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(5_000)).toBe('5s');
    expect(formatDuration(30_000)).toBe('30s');
  });

  it('formats minutes', () => {
    expect(formatDuration(300_000)).toBe('5m');
    expect(formatDuration(60_000)).toBe('1m');
  });

  it('formats hours', () => {
    expect(formatDuration(7_200_000)).toBe('2.0h');
    expect(formatDuration(5_400_000)).toBe('1.5h');
  });

  it('formats days', () => {
    expect(formatDuration(172_800_000)).toBe('2.0d');
  });
});

describe('formatJson', () => {
  it('formats null and undefined', () => {
    expect(formatJson(null)).toBe('null');
    expect(formatJson(undefined)).toBe('undefined');
  });

  it('formats strings with quotes', () => {
    expect(formatJson('hello')).toBe('"hello"');
  });

  it('formats numbers', () => {
    expect(formatJson(42)).toBe('42');
    expect(formatJson(3.14)).toBe('3.14');
  });

  it('formats booleans', () => {
    expect(formatJson(true)).toBe('true');
    expect(formatJson(false)).toBe('false');
  });

  it('formats objects as JSON', () => {
    expect(formatJson({ a: 1 })).toBe('{"a":1}');
  });

  it('formats arrays as JSON', () => {
    expect(formatJson([1, 2])).toBe('[1,2]');
  });
});
