import { describe, it, expect } from 'vitest';
import {
  formatUptime,
  formatNumber,
  formatMs,
  formatRelativeTime,
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
