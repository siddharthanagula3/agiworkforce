import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privacyMode: 'local' as 'local' | 'managed',
  rollbackArtifact: vi.fn(),
  pinArtifact: vi.fn(),
  getArtifact: vi.fn(),
  archiveArtifact: vi.fn(),
  unarchiveArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  publish: vi.fn(),
  status: 'complete' as 'complete' | 'archived',
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/stores/appModeStore', async (importOriginal) => {
  const actual = await importOriginal<AppmodestoreModule>();
  return {
    ...actual,
    selectPrivacyMode: (state: { privacyMode: string }) => state.privacyMode,
    useAppModeStore: Object.assign(
      (selector: (state: unknown) => unknown) => selector({ privacyMode: mocks.privacyMode }),
      actual.useAppModeStore,
    ),
  };
});
vi.mock('@/stores/artifactStore', () => {
  const state = () => ({
    artifacts: new Map<string, unknown>(),
    summaries: [{ id: 'art-1', pinned: true, status: mocks.status }],
    rollbackArtifact: mocks.rollbackArtifact,
    pinArtifact: mocks.pinArtifact,
    getArtifact: mocks.getArtifact,
    archiveArtifact: mocks.archiveArtifact,
    unarchiveArtifact: mocks.unarchiveArtifact,
    deleteArtifact: mocks.deleteArtifact,
  });
  const useArtifactStore = (selector: (s: unknown) => unknown) => selector(state());
  useArtifactStore.getState = state;
  return { useArtifactStore };
});
vi.mock('../publishAdapter', () => ({ makeDesktopPublishCallback: () => mocks.publish }));
vi.mock('../openArtifactInChat', async (importOriginal) => ({
  ...(await importOriginal<OpenartifactinchatModule>()),
  nativeArtifactToChat: (native: { id: string }) => ({
    id: native.id,
    type: 'markdown',
    content: '',
  }),
}));

import { useChatArtifactStore, useChatUIStore } from '@agiworkforce/unified-chat';
import { useDesktopArtifactActions } from '../useDesktopArtifactActions';

type AppmodestoreModule = typeof import('@/stores/appModeStore');
type OpenartifactinchatModule = typeof import('../openArtifactInChat');

function labels(actions: ReadonlyArray<{ label: string }>) {
  return actions.map((action) => action.label);
}

describe('useDesktopArtifactActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privacyMode = 'local';
    mocks.status = 'complete';
    useChatArtifactStore.getState().closeArtifact();
  });

  it('offers restore for an older version, and pin state from the gallery', () => {
    act(() =>
      useChatArtifactStore
        .getState()
        .openArtifact({ id: 'art-1::v2', type: 'markdown', title: 'Notes', content: '' }),
    );
    const { result } = renderHook(() => useDesktopArtifactActions());

    expect(labels(result.current)).toEqual([
      'Restore version 2',
      'Unpin from gallery',
      'Save a copy to the artifacts folder',
      'Archive',
      'Delete',
    ]);
    const remove = result.current.find((action) => action.id === 'delete')!;
    expect(remove.destructive).toBe(true);
    expect(remove.confirm?.description).toMatch(/permanently removed/);
  });

  it('restores a version on the stored row and closes the panel after a delete', async () => {
    mocks.rollbackArtifact.mockResolvedValue({ id: 'art-1' });
    mocks.deleteArtifact.mockResolvedValue(true);
    act(() => {
      useChatArtifactStore
        .getState()
        .openArtifact({ id: 'art-1::v2', type: 'markdown', content: '' });
      useChatUIStore.getState().openArtifactPanel();
    });
    const { result } = renderHook(() => useDesktopArtifactActions());
    const artifact = useChatArtifactStore.getState().activeArtifact!;

    await act(() => result.current.find((a) => a.id === 'restore-version')!.onSelect(artifact));
    expect(mocks.rollbackArtifact).toHaveBeenCalledWith('art-1', 2);

    await act(() => result.current.find((a) => a.id === 'delete')!.onSelect(artifact));
    expect(mocks.deleteArtifact).toHaveBeenCalledWith('art-1');
    expect(useChatUIStore.getState().activeRightPanel).toBeNull();
  });

  it('offers Unarchive instead of Archive for an archived artifact and keeps it open', async () => {
    mocks.status = 'archived';
    mocks.unarchiveArtifact.mockResolvedValue(true);
    act(() => {
      useChatArtifactStore
        .getState()
        .openArtifact({ id: 'art-1', type: 'markdown', title: 'Notes', content: '' });
      useChatUIStore.getState().openArtifactPanel();
    });
    const { result } = renderHook(() => useDesktopArtifactActions());

    expect(labels(result.current)).toEqual([
      'Unpin from gallery',
      'Save a copy to the artifacts folder',
      'Unarchive',
      'Delete',
    ]);

    const artifact = useChatArtifactStore.getState().activeArtifact!;
    await act(() => result.current.find((a) => a.id === 'unarchive')!.onSelect(artifact));
    expect(mocks.unarchiveArtifact).toHaveBeenCalledWith('art-1');
    expect(mocks.archiveArtifact).not.toHaveBeenCalled();
    expect(useChatUIStore.getState().activeRightPanel).toBe('artifact');
  });

  it('archives a stored artifact and closes the panel', async () => {
    mocks.archiveArtifact.mockResolvedValue(true);
    act(() => {
      useChatArtifactStore.getState().openArtifact({ id: 'art-1', type: 'markdown', content: '' });
      useChatUIStore.getState().openArtifactPanel();
    });
    const { result } = renderHook(() => useDesktopArtifactActions());
    const artifact = useChatArtifactStore.getState().activeArtifact!;

    await act(() => result.current.find((a) => a.id === 'archive')!.onSelect(artifact));
    expect(mocks.archiveArtifact).toHaveBeenCalledWith('art-1');
    expect(useChatUIStore.getState().activeRightPanel).toBeNull();
  });

  it('offers nothing for Managed Cloud artifacts, which are not stored here', () => {
    mocks.privacyMode = 'managed';
    act(() =>
      useChatArtifactStore.getState().openArtifact({ id: 'art-1', type: 'markdown', content: '' }),
    );
    const { result } = renderHook(() => useDesktopArtifactActions());

    expect(result.current).toEqual([]);
  });
});
