import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopRuntimeError } from '@agiworkforce/local-runtime-contract';

/**
 * `isElectronDesktop` is resolved when the module first loads, so every case
 * here installs its own `window.agiHost` and then imports fresh. Sharing one
 * import would let the first case decide the answer for all of them.
 */
async function loadWith(bridge: unknown) {
  vi.resetModules();
  if (bridge === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = { agiHost: bridge };
  }
  return {
    runtime: await import('../electronRuntime'),
    command: await import('../command'),
    contract: await import('@agiworkforce/local-runtime-contract'),
  };
}

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VITEST', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
});

describe('isElectronDesktop', () => {
  it('is false with no window at all', async () => {
    const { runtime } = await loadWith(undefined);
    expect(runtime.isElectronDesktop).toBe(false);
  });

  it('is false when the host bridge has no runtime method', async () => {
    const { runtime } = await loadWith({ platform: 'electron-darwin' });
    expect(runtime.isElectronDesktop).toBe(false);
  });

  it('is true once the bridge exposes invokeRuntime', async () => {
    const { runtime } = await loadWith({ invokeRuntime: vi.fn() });
    expect(runtime.isElectronDesktop).toBe(true);
  });
});

describe('desktopRuntimeHandles', () => {
  it('claims workspace and filesystem commands', async () => {
    const { runtime } = await loadWith({ invokeRuntime: vi.fn() });
    expect(runtime.desktopRuntimeHandles('file_read_text')).toBe(true);
    expect(runtime.desktopRuntimeHandles('workspace_pick_root')).toBe(true);
  });

  it('leaves cloud commands alone', async () => {
    const { runtime } = await loadWith({ invokeRuntime: vi.fn() });
    expect(runtime.desktopRuntimeHandles('chat_send_message')).toBe(false);
    expect(runtime.desktopRuntimeHandles('billing_get_credits')).toBe(false);
  });

  it('claims nothing when there is no local runtime', async () => {
    const { runtime } = await loadWith({});
    expect(runtime.desktopRuntimeHandles('file_read_text')).toBe(false);
  });
});

describe('invokeDesktopRuntime', () => {
  it('unwraps a successful envelope', async () => {
    const invokeRuntime = vi.fn().mockResolvedValue({ ok: true, value: { text: 'hello' } });
    const { runtime } = await loadWith({ invokeRuntime });

    await expect(runtime.invokeDesktopRuntime('file_read_text', { path: 'a.ts' })).resolves.toEqual(
      {
        text: 'hello',
      },
    );
    expect(invokeRuntime).toHaveBeenCalledWith('file_read_text', { path: 'a.ts' });
  });

  it('rethrows a refusal as an error carrying the capability to request', async () => {
    const invokeRuntime = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: 'permission-denied',
        message: 'not granted',
        capability: 'filesystem.read',
        scope: { kind: 'workspace', target: '/work/a' },
      },
    });
    const { runtime, contract } = await loadWith({ invokeRuntime });

    const failure = await runtime
      .invokeDesktopRuntime('file_list', { rootId: 'r' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(contract.DesktopRuntimeError);
    const typed = failure as DesktopRuntimeError;
    expect(typed.code).toBe('permission-denied');
    expect(typed.capability).toBe('filesystem.read');
    expect(typed.toPermissionRequest('because')).toEqual({
      capability: 'filesystem.read',
      scope: { kind: 'workspace', target: '/work/a' },
      reason: 'because',
    });
  });

  it('rejects an unreadable response rather than returning undefined', async () => {
    const { runtime } = await loadWith({ invokeRuntime: vi.fn().mockResolvedValue('nonsense') });
    await expect(runtime.invokeDesktopRuntime('file_list')).rejects.toThrow(/unreadable/);
  });

  it('rejects when no bridge is present', async () => {
    const { runtime } = await loadWith({});
    await expect(runtime.invokeDesktopRuntime('file_list')).rejects.toThrow(/not available/);
  });
});

describe('command routing', () => {
  it('sends a filesystem command to the local runtime instead of the cloud', async () => {
    const invokeRuntime = vi.fn().mockResolvedValue({ ok: true, value: ['a.ts'] });
    const { command } = await loadWith({ invokeRuntime });

    await expect(command.command('file_list', { rootId: 'r' })).resolves.toEqual(['a.ts']);
    expect(invokeRuntime).toHaveBeenCalledWith('file_list', { rootId: 'r' });
  });

  it('routes the same command through commandWithWarning', async () => {
    const invokeRuntime = vi.fn().mockResolvedValue({ ok: true, value: ['a.ts'] });
    const { command } = await loadWith({ invokeRuntime });

    await expect(command.commandWithWarning('file_glob', { pattern: '*' })).resolves.toEqual({
      data: ['a.ts'],
    });
  });

  it('does not divert a cloud command to the local runtime', async () => {
    const invokeRuntime = vi.fn();
    const { command } = await loadWith({ invokeRuntime });

    await command.command('chat_send_message', { text: 'hi' }).catch(() => undefined);
    expect(invokeRuntime).not.toHaveBeenCalled();
  });
});
