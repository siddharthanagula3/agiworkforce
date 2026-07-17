import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApiPromptCompletion } from '../useApiPromptCompletion';

const mockAddCsrfHeaders = vi.fn();

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (...args: unknown[]) => mockAddCsrfHeaders(...args),
}));

describe('useApiPromptCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddCsrfHeaders.mockResolvedValue({
      'Content-Type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          suggestion: 'finish the thought',
          model: 'claude-haiku-4-5',
          latency_ms: 25,
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds CSRF headers to prompt completion requests', async () => {
    renderHook(() =>
      useApiPromptCompletion('write a useful prompt', {
        context: 'editor context',
      }),
    );

    await waitFor(
      () => {
        expect(fetch).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 },
    );

    expect(mockAddCsrfHeaders).toHaveBeenCalledWith({ 'Content-Type': 'application/json' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/completion',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'test-csrf-token',
        },
      }),
    );
  });
});
