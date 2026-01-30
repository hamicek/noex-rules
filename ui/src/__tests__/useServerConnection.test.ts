// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockUseHealth } = vi.hoisted(() => ({
  mockUseHealth: vi.fn(),
}));

vi.mock('../hooks/useEngineStats', () => ({
  useHealth: mockUseHealth,
}));

import { useServerConnection } from '../hooks/useServerConnection';

describe('useServerConnection', () => {
  beforeEach(() => {
    mockUseHealth.mockReset();
  });

  it('returns "connecting" when health is loading', () => {
    mockUseHealth.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const { result } = renderHook(() => useServerConnection());
    expect(result.current.status).toBe('connecting');
  });

  it('returns "disconnected" when health check errors', () => {
    const error = new Error('Network error');
    mockUseHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error,
    });
    const { result } = renderHook(() => useServerConnection());
    expect(result.current.status).toBe('disconnected');
    expect(result.current.error).toBe(error);
  });

  it('returns "disconnected" when data is undefined and not loading', () => {
    mockUseHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });
    const { result } = renderHook(() => useServerConnection());
    expect(result.current.status).toBe('disconnected');
  });

  it('returns "connected" when health data is present', () => {
    const healthData = {
      status: 'ok',
      timestamp: Date.now(),
      uptime: 3600,
      version: '1.0.0',
      engine: { name: 'test', running: true },
    };
    mockUseHealth.mockReturnValue({
      data: healthData,
      isLoading: false,
      isError: false,
      error: null,
    });
    const { result } = renderHook(() => useServerConnection());
    expect(result.current.status).toBe('connected');
    expect(result.current.health).toBe(healthData);
  });

  it('exposes all health query fields', () => {
    const healthData = {
      status: 'ok',
      timestamp: 123,
      uptime: 100,
      version: '2.0.0',
      engine: { name: 'prod', running: true },
    };
    mockUseHealth.mockReturnValue({
      data: healthData,
      isLoading: false,
      isError: false,
      error: null,
    });
    const { result } = renderHook(() => useServerConnection());
    expect(result.current.health).toEqual(healthData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('returns "connected" even for degraded status', () => {
    mockUseHealth.mockReturnValue({
      data: {
        status: 'degraded',
        timestamp: Date.now(),
        uptime: 60,
        version: '1.0.0',
        engine: { name: 'test', running: true },
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    const { result } = renderHook(() => useServerConnection());
    expect(result.current.status).toBe('connected');
  });
});
