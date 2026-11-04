import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryStore } from '@agiworkforce/unified-chat';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { useExplicitMemoryCommands } from './use-explicit-memory-commands';

type UiModule = typeof import('@agiworkforce/ui');
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  toast: vi.fn(),
  csrf: vi.fn(),
}));
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<UiModule>()),
  useConfirmAction: () => ({ confirm: mocks.confirm, dialog: null }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(mocks.toast, { success: mocks.success, error: mocks.error }) }));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: mocks.csrf }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockImplementation(async (headers: HeadersInit) => headers);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function owner() {
  let current = true;
  const authority = createRequestAuthority({
    userId: 'owner-a', sessionId: 'session-a', isCurrent: () => current,
    getToken: async () => 'owner-a-token',
  });
  return { authority, changeSession: () => { current = false; } };
}

const scope = { conversationId: null, projectId: null };
const confirmation = {
  command: { kind: 'forget', subject: 'old address' },
  status: 'confirmation_required', requiresConfirmation: true,
  memories: [{ id: 'memory-a', content: 'An old address' }],
};

describe('explicit memory send authority', () => {
  it('keeps a truthful receipt without hydrating or uploading legacy local memories', async () => {
    const hydrate = vi.spyOn(useMemoryStore.getState(), 'hydrateFromServer');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      command: { kind: 'remember', subject: 'a preference' }, status: 'stored',
    }))));
    const { result } = renderHook(() => useExplicitMemoryCommands());
    const { authority } = owner();
    await act(async () => {
      await expect(result.current.runExplicitMemoryCommand('remember a preference', scope, authority))
        .resolves.toEqual({ kind: 'remember', status: 'stored' });
    });
    expect(mocks.success).toHaveBeenCalledWith('Saved to memory.');
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('does not confirm an old session memory deletion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(confirmation)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useExplicitMemoryCommands());
    const original = owner();
    await act(async () => {
      await result.current.runExplicitMemoryCommand('forget my old address', scope, original.authority);
    });
    const request = mocks.confirm.mock.calls[0]![0] as { onConfirm: () => Promise<void> };
    original.changeSession();
    await act(async () => { await request.onConfirm(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('retires an earlier dialog without allowing its callback to send the replacement command', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(confirmation)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useExplicitMemoryCommands());
    const original = owner();
    await act(async () => {
      await result.current.runExplicitMemoryCommand('forget the old address', scope, original.authority);
    });
    const first = mocks.confirm.mock.calls[0]![0] as { onConfirm: () => Promise<void> };
    await act(async () => {
      await result.current.runExplicitMemoryCommand('forget the old phone', scope, original.authority);
      await first.onConfirm();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
