import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../lib/tauri-mock', () => ({
  invoke: vi.fn(),
}));

import { useScreenCapture } from '../hooks/useScreenCapture';
import { invoke } from '../lib/tauri-mock';

const invokeMock = vi.mocked(invoke);

describe('useScreenCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures a window using the native window capture command', async () => {
    invokeMock.mockResolvedValueOnce({
      id: 'window-1',
      path: '/tmp/window.png',
      capture_type: 'window',
      metadata: { width: 1200, height: 800, window_title: 'App Window' },
      created_at: 1700001234,
    });

    const { result } = renderHook(() => useScreenCapture());

    await act(async () => {
      const capture = await result.current.captureWindow('12345', 42);
      expect(capture.captureType).toBe('window');
      expect(capture.metadata.windowTitle).toBe('App Window');
    });

    expect(invokeMock).toHaveBeenCalledWith('capture_screen_window', {
      hwnd: '12345',
      conversation_id: 42,
    });
  });

  it('returns a bounded timeout error instead of hanging on full-screen capture', async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation(() => new Promise(() => undefined));

    const { result } = renderHook(() => useScreenCapture());

    let capturedError: Error | null = null;
    await act(async () => {
      const capturePromise = result.current.captureFullScreen().catch((err: unknown) => {
        capturedError = err instanceof Error ? err : new Error(String(err));
        return null;
      });
      await vi.advanceTimersByTimeAsync(30001);
      await capturePromise;
    });

    expect(capturedError).not.toBeNull();
    if (capturedError) {
      expect(capturedError.message).toBe('capture_screen_full timed out after 30000ms');
    }
    expect(result.current.error ?? '').toContain('timed out');
    expect(result.current.isCapturing).toBe(false);

    vi.useRealTimers();
  });
});
