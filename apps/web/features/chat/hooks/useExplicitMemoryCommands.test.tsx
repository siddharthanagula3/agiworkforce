import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: async (headers: HeadersInit) => headers }));
vi.mock('@agiworkforce/unified-chat', () => ({
  useMemoryStore: (select: (state: { hydrateFromServer: () => void }) => unknown) =>
    select({ hydrateFromServer: vi.fn() }),
}));

import { useExplicitMemoryCommands } from './use-explicit-memory-commands';

const scope = { conversationId: null, projectId: null };

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe('explicit memory commands', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('renders a receipt for a refused command that carries no message', async () => {
    respond(200, { command: { kind: 'remember', subject: 'x' }, status: 'refused' });
    const { result } = renderHook(() => useExplicitMemoryCommands());
    const report = await result.current.runExplicitMemoryCommand('Remember x', scope);

    expect(report).toEqual({ kind: 'remember', status: 'refused' });
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Not saved'));
  });

  it('never claims nothing changed when the transport outcome is unknown', async () => {
    respond(500, {});
    const { result } = renderHook(() => useExplicitMemoryCommands());
    const report = await result.current.runExplicitMemoryCommand('Remember x', scope);

    expect(report).toEqual({ kind: 'remember', status: 'failed' });
    const message = String(mocks.toast.error.mock.calls[0]![0]);
    expect(message).toContain('unknown');
    expect(message).not.toMatch(/nothing was changed/i);
  });
});
