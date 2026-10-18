import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke,
}));

import { nativeAppModeReported, startNativeAppModeSync } from '../nativeAppMode';
import { useAppModeStore } from '../../stores/appModeStore';

type TauriMockModule = typeof import('../tauri-mock');

function reportedModes(): string[] {
  return invoke.mock.calls
    .filter(([command]) => command === 'account_set_app_mode')
    .map(([, args]) => (args as { mode: string }).mode);
}

describe('the native app mode follows the renderer', () => {
  beforeEach(async () => {
    await nativeAppModeReported();
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it('reports nothing until the sync is started, then reports the current mode once', async () => {
    useAppModeStore.setState({ mode: 'cloud' });
    await nativeAppModeReported();
    expect(reportedModes()).toEqual([]);

    startNativeAppModeSync();
    startNativeAppModeSync();
    await nativeAppModeReported();

    expect(reportedModes()).toEqual(['cloud']);
  });

  it('reports every later mode change, in order', async () => {
    startNativeAppModeSync();
    await nativeAppModeReported();
    invoke.mockClear();

    useAppModeStore.getState().setMode('local');
    useAppModeStore.getState().setMode('cloud');
    useAppModeStore.getState().setMode('local');
    await nativeAppModeReported();

    expect(reportedModes()).toEqual(['local', 'cloud', 'local']);
  });

  it('does not send the next report until the one in flight settles', async () => {
    startNativeAppModeSync();
    await nativeAppModeReported();
    useAppModeStore.setState({ mode: 'local' });
    await nativeAppModeReported();
    invoke.mockClear();
    let release: () => void = () => {};
    invoke.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));

    useAppModeStore.setState({ mode: 'cloud' });
    useAppModeStore.setState({ mode: 'local' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reportedModes()).toEqual(['cloud']);

    release();
    await nativeAppModeReported();
    expect(reportedModes()).toEqual(['cloud', 'local']);
  });

  it('retries a rejected report once and never rejects', async () => {
    startNativeAppModeSync();
    await nativeAppModeReported();
    useAppModeStore.setState({ mode: 'cloud' });
    await nativeAppModeReported();
    invoke.mockClear();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    invoke.mockRejectedValueOnce(new Error('ipc closed')).mockResolvedValueOnce(undefined);

    useAppModeStore.setState({ mode: 'local' });
    await expect(nativeAppModeReported()).resolves.toBeUndefined();
    expect(reportedModes()).toEqual(['local', 'local']);
    expect(consoleError).not.toHaveBeenCalled();

    invoke.mockRejectedValue(new Error('ipc closed'));
    useAppModeStore.setState({ mode: 'cloud' });
    await expect(nativeAppModeReported()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
