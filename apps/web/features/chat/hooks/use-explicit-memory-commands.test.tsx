import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryStore } from '@agiworkforce/unified-chat';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { useExplicitMemoryCommands } from './use-explicit-memory-commands';
import {
  createCloudMemoryFixture,
  getCloudMemoryFixtureSession,
} from '@/features/memory/__tests__/cloud-memory-fixture';
import { cloudMemoryScopeKey } from '@/features/memory/cloud-memory-controller';
import {
  admitWorkspace,
  failWorkspaceRead,
  retryWorkspaceRead,
  workspaceQueryKey,
} from '@/features/workspaces/lib/workspace-admission';

type UiModule = typeof import('@agiworkforce/ui');
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<UiModule>()),
  useConfirmAction: () => ({ confirm: mocks.confirm, dialog: null }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(mocks.toast, { success: mocks.success, error: mocks.error }),
}));
vi.mock('@/lib/identity/useSessionSnapshot', () => ({
  useSessionSnapshot: () => getCloudMemoryFixtureSession,
  useReadonlyIdentityLifetime: () => () => {
    const session = getCloudMemoryFixtureSession();
    return { isCurrent: () => session?.isCurrent() === true };
  },
}));

let fixture: ReturnType<typeof createCloudMemoryFixture>;

beforeEach(() => {
  vi.clearAllMocks();
  fixture = createCloudMemoryFixture();
});
afterEach(() => {
  fixture.retire();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function owner() {
  const authority = createRequestAuthority(fixture.session);
  return { authority, changeSession: fixture.retire };
}

const scope = { conversationId: null, projectId: null };
const confirmation = {
  command: { kind: 'forget', subject: 'old address' },
  status: 'confirmation_required',
  requiresConfirmation: true,
  memories: [{ id: 'memory-a', content: 'An old address' }],
};

describe('explicit memory send authority', () => {
  it('keeps a truthful receipt without hydrating or uploading legacy local memories', async () => {
    const hydrate = vi.spyOn(useMemoryStore.getState(), 'hydrateFromServer');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input) =>
          new Response(
            JSON.stringify(
              String(input).startsWith('/api/memory?')
                ? { memories: [], hasMore: false }
                : {
                    command: { kind: 'remember', subject: 'a preference' },
                    status: 'stored',
                  },
            ),
          ),
      ),
    );
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const { authority } = owner();
    await act(async () => {
      await expect(
        result.current.runExplicitMemoryCommand('remember a preference', scope, authority),
      ).resolves.toEqual({ kind: 'remember', status: 'stored' });
    });
    expect(mocks.success).toHaveBeenCalledWith('Saved to memory.');
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('does not confirm an old session memory deletion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(confirmation)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const original = owner();
    await act(async () => {
      await result.current.runExplicitMemoryCommand(
        'forget my old address',
        scope,
        original.authority,
      );
    });
    const request = mocks.confirm.mock.calls[0]![0] as { onConfirm: () => Promise<void> };
    original.changeSession();
    await act(async () => {
      await request.onConfirm();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('retires an earlier dialog without allowing its callback to send the replacement command', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(confirmation)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const original = owner();
    await act(async () => {
      await result.current.runExplicitMemoryCommand(
        'forget the old address',
        scope,
        original.authority,
      );
    });
    const first = mocks.confirm.mock.calls[0]![0] as { onConfirm: () => Promise<void> };
    await act(async () => {
      await result.current.runExplicitMemoryCommand(
        'forget the old phone',
        scope,
        original.authority,
      );
      await first.onConfirm();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a blocked memory command without dispatch and never revives an unavailable callback', async () => {
    failWorkspaceRead(fixture.owner, fixture.owner.epoch);
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            command: { kind: 'remember', subject: 'a preference' },
            status: 'refused',
          }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const unavailable = result.current.runExplicitMemoryCommand;
    const authority = createRequestAuthority(fixture.session);
    await act(async () => {
      await expect(unavailable('remember a preference', scope, authority)).resolves.toEqual({
        kind: 'remember',
        status: 'failed',
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('not sent to memory'));
    await act(async () => {
      retryWorkspaceRead(fixture.owner);
      fixture.queryClient.setQueryData(workspaceQueryKey(fixture.owner), fixture.data);
      admitWorkspace(fixture.owner, fixture.owner.epoch, cloudMemoryScopeKey(fixture.data));
    });
    await act(async () => {
      await expect(
        unavailable('remember another preference', scope, authority),
      ).resolves.toBeNull();
      await expect(
        result.current.runExplicitMemoryCommand('remember a preference', scope, authority),
      ).resolves.toEqual({ kind: 'remember', status: 'refused' });
    });
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch a confirmation after the original turn authority retires', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(confirmation)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const authority = createRequestAuthority(fixture.session);
    await act(async () => {
      await result.current.runExplicitMemoryCommand('forget my old address', scope, authority);
    });
    const request = mocks.confirm.mock.calls[0]![0] as { onConfirm: () => Promise<void> };
    authority.retire();
    await act(async () => {
      await request.onConfirm();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not dispatch a confirmation after workspace admission retires', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(confirmation)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useExplicitMemoryCommands(), { wrapper: fixture.wrapper });
    const authority = createRequestAuthority(fixture.session);
    await act(async () => {
      await result.current.runExplicitMemoryCommand('forget my old address', scope, authority);
    });
    const request = mocks.confirm.mock.calls[0]![0] as { onConfirm: () => Promise<void> };
    await act(async () => {
      failWorkspaceRead(fixture.owner, fixture.owner.epoch);
    });
    await act(async () => {
      await request.onConfirm();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
