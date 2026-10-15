import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const NATIVE_ONLY = 'Agent execution requires the AGI Workforce desktop application';

const shippedShellWithoutTauri = {
  isTauri: false,
  isElectronHost: false,
  isTestEnvironment: false,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: false,
  isCloudWeb: true,
};

const desktopUiPreview = {
  isTauri: false,
  isElectronHost: false,
  isTestEnvironment: false,
  isDesktopUiDevLocal: true,
  supportsLocalAppMode: true,
  isCloudWeb: false,
};

async function loadStoreIn(runtime: typeof shippedShellWithoutTauri) {
  vi.resetModules();
  vi.doMock('../../lib/runtimeEnvironment', () => runtime);
  vi.doMock('../../lib/tauri-mock', () => vi.importActual('../../lib/tauri-mock'));

  const { useAgentTaskStore } = await import('../agentTaskStore');
  const { useAppModeStore } = await import('../appModeStore');
  const { useChatModelStore } = await import('@agiworkforce/unified-chat');
  const { toast } = await import('sonner');
  const { invoke: hostInvoke } = await import('@tauri-apps/api/core');

  useAppModeStore.setState({ mode: 'local' });
  useChatModelStore.getState().setModels([
    {
      id: 'fixture-local-model',
      name: 'Fixture local model',
      provider: 'ollama',
      tier: 'standard',
      supportsThinking: false,
      supportsVision: false,
      supportsTools: false,
      contextWindow: 4096,
      isLocal: true,
      isByok: false,
    },
  ]);
  useChatModelStore.getState().selectModel('fixture-local-model');

  return { store: useAgentTaskStore, toast, hostInvoke: vi.mocked(hostInvoke) };
}

const LOAD_TIMEOUT_MS = 60_000;

describe('agentTaskStore outside the native desktop runtime', () => {
  afterAll(() => {
    vi.doUnmock('../../lib/runtimeEnvironment');
    vi.doUnmock('../../lib/tauri-mock');
    vi.resetModules();
  });

  describe.each([
    ['the shipped shell without Tauri', shippedShellWithoutTauri],
    ['the desktop UI preview', desktopUiPreview],
  ])('in %s', (_name, runtime) => {
    let loaded: Awaited<ReturnType<typeof loadStoreIn>>;

    beforeAll(async () => {
      loaded = await loadStoreIn(runtime);
    }, LOAD_TIMEOUT_MS);

    beforeEach(() => {
      loaded.store.setState({ tasks: [], loading: false });
      vi.mocked(loaded.toast.error).mockClear();
      loaded.hostInvoke.mockClear();
    });

    it('does not fabricate a swarm result', async () => {
      const { store, toast, hostInvoke } = loaded;

      await expect(store.getState().submitGoalSwarm('Analyze all files')).rejects.toThrow(
        NATIVE_ONLY,
      );

      expect(store.getState().tasks).toEqual([]);
      expect(toast.error).toHaveBeenCalledWith(`Failed to start the swarm: ${NATIVE_ONLY}`);
      expect(hostInvoke).not.toHaveBeenCalled();
    });

    it('does not fabricate an automatic goal id', async () => {
      const { store, toast, hostInvoke } = loaded;

      await expect(store.getState().submitGoalAuto('Prepare a release')).rejects.toThrow(
        NATIVE_ONLY,
      );

      expect(store.getState().tasks).toEqual([]);
      expect(toast.error).toHaveBeenCalledWith(`Auto goal submission failed: ${NATIVE_ONLY}`);
      expect(hostInvoke).not.toHaveBeenCalled();
    });

    it('does not fabricate a sequential or a parallel goal id', async () => {
      const { store, toast, hostInvoke } = loaded;

      await expect(store.getState().submitGoal('Inspect the repository')).rejects.toThrow(
        NATIVE_ONLY,
      );
      await expect(
        store.getState().submitGoal('Inspect the repository', { parallel: true }),
      ).rejects.toThrow(NATIVE_ONLY);

      expect(store.getState().tasks).toEqual([]);
      expect(toast.error).toHaveBeenCalledWith(`Failed to submit goal: ${NATIVE_ONLY}`);
      expect(hostInvoke).not.toHaveBeenCalled();
    });
  });
});
