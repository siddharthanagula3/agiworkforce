import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { getAPIKeys, loggerError } = vi.hoisted(() => ({
  getAPIKeys: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@shared/lib/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../services/user-preferences', () => ({
  default: { getAPIKeys: (...args: unknown[]) => getAPIKeys(...args) },
}));

import { useAPIKeys } from '../use-settings-queries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The service catches its own rejection and returns `{ error: string }`, so the
 * hook rebuilds it with `new Error(error)` and the DOMException's `AbortError`
 * name is gone before the catch reads it. The name check therefore never
 * matched, and switching settings sections logged
 * `[SettingsQuery] API keys error: "signal is aborted without reason"` at error
 * level every time. Reading the signal instead cannot be defeated by a layer in
 * between reshaping the error.
 */
describe('useAPIKeys cancellation', () => {
  it('does not log a caller abort as an error, even with the name stripped', async () => {
    getAPIKeys.mockImplementation(async (signal: AbortSignal) => {
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
      // Exactly what the service does: the abort is caught and flattened to a
      // string, which the hook then turns back into a plain Error.
      return { data: null, error: 'signal is aborted without reason' };
    });

    const { unmount } = renderHook(() => useAPIKeys(), { wrapper });
    unmount();

    await waitFor(() => expect(getAPIKeys).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(loggerError).not.toHaveBeenCalled();
  });

  it('still logs a real failure', async () => {
    getAPIKeys.mockResolvedValue({ data: null, error: 'upstream exploded' });

    const { result } = renderHook(() => useAPIKeys(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(loggerError).toHaveBeenCalledWith(
      '[SettingsQuery] API keys error:',
      'upstream exploded',
    );
  });
});
