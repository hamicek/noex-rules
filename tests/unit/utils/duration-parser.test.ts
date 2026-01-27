import { describe, it, expect } from 'vitest';
import { parseDuration, formatDuration } from '../../../src/utils/duration-parser';

describe('parseDuration', () => {
  describe('numeric input passthrough', () => {
    it('returns number directly when given a number', () => {
      expect(parseDuration(1000)).toBe(1000);
      expect(parseDuration(0)).toBe(0);
      expect(parseDuration(123456789)).toBe(123456789);
    });
  });

  describe('milliseconds unit', () => {
    it('parses ms correctly', () => {
      expect(parseDuration('100ms')).toBe(100);
      expect(parseDuration('1ms')).toBe(1);
      expect(parseDuration('0ms')).toBe(0);
    });
  });

  describe('seconds unit', () => {
    it('parses seconds to milliseconds', () => {
      expect(parseDuration('1s')).toBe(1000);
      expect(parseDuration('30s')).toBe(30000);
      expect(parseDuration('60s')).toBe(60000);
    });
  });

  describe('minutes unit', () => {
    it('parses minutes to milliseconds', () => {
      expect(parseDuration('1m')).toBe(60 * 1000);
      expect(parseDuration('15m')).toBe(15 * 60 * 1000);
      expect(parseDuration('60m')).toBe(60 * 60 * 1000);
    });
  });

  describe('hours unit', () => {
    it('parses hours to milliseconds', () => {
      expect(parseDuration('1h')).toBe(60 * 60 * 1000);
      expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
      expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('days unit', () => {
    it('parses days to milliseconds', () => {
      expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDuration('30d')).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe('weeks unit', () => {
    it('parses weeks to milliseconds', () => {
      expect(parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDuration('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('years unit', () => {
    it('parses years to milliseconds', () => {
      expect(parseDuration('1y')).toBe(365 * 24 * 60 * 60 * 1000);
      expect(parseDuration('2y')).toBe(2 * 365 * 24 * 60 * 60 * 1000);
    });
  });

  describe('invalid input handling', () => {
    it('throws on empty string', () => {
      expect(() => parseDuration('')).toThrow('Invalid duration');
    });

    it('throws on invalid format', () => {
      expect(() => parseDuration('abc')).toThrow('Invalid duration');
      expect(() => parseDuration('15')).toThrow('Invalid duration');
      expect(() => parseDuration('15x')).toThrow('Invalid duration');
    });

    it('throws on negative values', () => {
      expect(() => parseDuration('-5m')).toThrow('Invalid duration');
    });

    it('throws on decimal values', () => {
      expect(() => parseDuration('1.5h')).toThrow('Invalid duration');
    });

    it('throws on combined formats', () => {
      expect(() => parseDuration('1h30m')).toThrow('Invalid duration');
    });

    it('throws on whitespace', () => {
      expect(() => parseDuration(' 5m')).toThrow('Invalid duration');
      expect(() => parseDuration('5m ')).toThrow('Invalid duration');
      expect(() => parseDuration('5 m')).toThrow('Invalid duration');
    });
  });
});

describe('formatDuration', () => {
  describe('milliseconds range', () => {
    it('formats values under 1 second as milliseconds', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(1)).toBe('1ms');
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });
  });

  describe('seconds range', () => {
    it('formats values from 1s to under 1m as seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(30000)).toBe('30s');
      expect(formatDuration(59999)).toBe('60s');
    });
  });

  describe('minutes range', () => {
    it('formats values from 1m to under 1h as minutes', () => {
      expect(formatDuration(60 * 1000)).toBe('1m');
      expect(formatDuration(15 * 60 * 1000)).toBe('15m');
      expect(formatDuration(59 * 60 * 1000)).toBe('59m');
    });
  });

  describe('hours range', () => {
    it('formats values from 1h to under 1d as hours', () => {
      expect(formatDuration(60 * 60 * 1000)).toBe('1h');
      expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2h');
      expect(formatDuration(23 * 60 * 60 * 1000)).toBe('23h');
    });
  });

  describe('days range', () => {
    it('formats values 1d and above as days', () => {
      expect(formatDuration(24 * 60 * 60 * 1000)).toBe('1d');
      expect(formatDuration(7 * 24 * 60 * 60 * 1000)).toBe('7d');
      expect(formatDuration(30 * 24 * 60 * 60 * 1000)).toBe('30d');
      expect(formatDuration(365 * 24 * 60 * 60 * 1000)).toBe('365d');
    });
  });

  describe('rounding behavior', () => {
    it('rounds to nearest unit', () => {
      expect(formatDuration(1500)).toBe('2s');
      expect(formatDuration(1499)).toBe('1s');
      expect(formatDuration(90 * 1000)).toBe('2m');
    });
  });
});

describe('parseDuration and formatDuration roundtrip', () => {
  it('formats parsed durations correctly for exact values', () => {
    expect(formatDuration(parseDuration('500ms'))).toBe('500ms');
    expect(formatDuration(parseDuration('30s'))).toBe('30s');
    expect(formatDuration(parseDuration('15m'))).toBe('15m');
    expect(formatDuration(parseDuration('2h'))).toBe('2h');
    expect(formatDuration(parseDuration('7d'))).toBe('7d');
  });
});
