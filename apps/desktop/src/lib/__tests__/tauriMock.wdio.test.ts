import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalTauriInternals = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__');

describe('tauri-mock isolated WDIO transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_WDIO_E2E', '1');
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['__wdio_mocks__'];
    if (originalTauriInternals) {
      Object.defineProperty(window, '__TAURI_INTERNALS__', originalTauriInternals);
    } else {
      delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    }
    vi.unstubAllEnvs();
  });

  it('uses the browser.tauri.mock registry before the immutable native invoke primitive', async () => {
    const core = await import('@tauri-apps/api/core');
    const nativeInvoke = vi.mocked(core.invoke);
    nativeInvoke.mockResolvedValue('real-backend-value');
    const commandMock = vi.fn().mockResolvedValue({ status: 200, body: 'approved' });
    (window as unknown as { __wdio_mocks__?: Record<string, unknown> }).__wdio_mocks__ = {
      account_start_device_authorization: commandMock,
    };

    const { invoke } = await vi.importActual<typeof import('../tauri-mock')>('../tauri-mock');
    const args = { apiBaseUrl: 'https://agiworkforce.com' };

    await expect(invoke('account_start_device_authorization', args)).resolves.toEqual({
      status: 200,
      body: 'approved',
    });
    expect(commandMock).toHaveBeenCalledWith(args);
    expect(nativeInvoke).not.toHaveBeenCalled();
  });

  it('preserves the real native path for commands without a registered mock', async () => {
    const core = await import('@tauri-apps/api/core');
    const nativeInvoke = vi.mocked(core.invoke);
    nativeInvoke.mockResolvedValue('native-result');
    (window as unknown as { __wdio_mocks__?: Record<string, unknown> }).__wdio_mocks__ = {};

    const { invoke } = await vi.importActual<typeof import('../tauri-mock')>('../tauri-mock');
    await expect(invoke('startup_get_recovery_state')).resolves.toBe('native-result');
    expect(nativeInvoke).toHaveBeenCalledWith('startup_get_recovery_state', undefined);
  });
});
