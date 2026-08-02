import { describe, expect, it, vi } from 'vitest';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { CloudRuntime } from '../CloudRuntime';
import {
  createDesktopChatRuntime,
  disposeActiveDesktopChatRuntime,
  registerActiveDesktopChatRuntime,
} from '../desktopChatRuntime';
import { TauriRuntime } from '../TauriRuntime';
import { WebRuntime } from '../WebRuntime';

function runtimeStub(platform: 'desktop' | 'web'): ChatRuntime {
  return {
    sendMessage: vi.fn(async () => undefined),
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conversation-id'),
    deleteConversation: vi.fn(async () => undefined),
    renameConversation: vi.fn(async () => undefined),
    getPlatform: () => platform,
  };
}

function runtimeFactories() {
  const localRuntime = runtimeStub('desktop');
  const managedRuntime = runtimeStub('desktop');
  const webRuntime = runtimeStub('web');

  return {
    localRuntime,
    managedRuntime,
    webRuntime,
    factories: {
      local: vi.fn(() => localRuntime),
      managed: vi.fn(() => managedRuntime),
      web: vi.fn(() => webRuntime),
    },
  };
}

describe('desktop chat runtime composition root', () => {
  it('does not dispose the same runtime during a Strict Mode effect replay', async () => {
    await disposeActiveDesktopChatRuntime();
    const runtime = runtimeStub('desktop');
    runtime.dispose = vi.fn(async () => undefined);

    const cleanup = registerActiveDesktopChatRuntime(runtime);
    cleanup();
    registerActiveDesktopChatRuntime(runtime);
    await Promise.resolve();

    expect(runtime.dispose).not.toHaveBeenCalled();
    await disposeActiveDesktopChatRuntime();
  });

  it('disposes the mounted runtime before replacing or clearing it', async () => {
    await disposeActiveDesktopChatRuntime();
    const first = runtimeStub('desktop');
    const second = runtimeStub('desktop');
    first.dispose = vi.fn(async () => undefined);
    second.dispose = vi.fn(async () => undefined);

    registerActiveDesktopChatRuntime(first);
    registerActiveDesktopChatRuntime(second);
    expect(first.dispose).toHaveBeenCalledOnce();

    await disposeActiveDesktopChatRuntime();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('maps the production factories to the concrete runtime implementations', () => {
    const local = createDesktopChatRuntime({ isTauriHost: true, appMode: 'local' });
    const cloud = createDesktopChatRuntime({ isTauriHost: true, appMode: 'cloud' });
    const web = createDesktopChatRuntime({ isTauriHost: false, appMode: 'cloud' });

    expect(local).toBeInstanceOf(TauriRuntime);
    expect(cloud).toBeInstanceOf(CloudRuntime);
    expect(web).toBeInstanceOf(WebRuntime);
    expect(local.supportsResearch).not.toBe(true);
    expect(cloud.supportsResearch).toBe(false);
    expect(web.supportsResearch).toBe(true);
    expect(local.supportsManagedWebSearch).not.toBe(true);
    expect(cloud.supportsManagedWebSearch).toBe(true);
    expect(web.supportsManagedWebSearch).toBe(true);
  });

  it('projects the account research entitlement into the managed runtime', () => {
    const denied = createDesktopChatRuntime({
      isTauriHost: true,
      appMode: 'cloud',
      managedAccountId: 'account-free',
      managedResearchEnabled: false,
    });
    const admitted = createDesktopChatRuntime({
      isTauriHost: true,
      appMode: 'cloud',
      managedAccountId: 'account-max',
      managedResearchEnabled: true,
    });

    expect(denied.supportsResearch).toBe(false);
    expect(admitted.supportsResearch).toBe(true);
  });

  it('keeps the Local workspace, including BYOK conversations, on the Tauri runtime', () => {
    const { factories, localRuntime } = runtimeFactories();

    const selected = createDesktopChatRuntime({ isTauriHost: true, appMode: 'local' }, factories);

    expect(selected).toBe(localRuntime);
    expect(factories.local).toHaveBeenCalledOnce();
    expect(factories.managed).not.toHaveBeenCalled();
    expect(factories.web).not.toHaveBeenCalled();
  });

  it('selects managed Cloud only after the existing mode gate has admitted cloud', () => {
    const { factories, managedRuntime } = runtimeFactories();

    const selected = createDesktopChatRuntime(
      { isTauriHost: true, appMode: 'cloud', managedAccountId: 'account-a' },
      factories,
    );

    expect(selected).toBe(managedRuntime);
    expect(factories.managed).toHaveBeenCalledOnce();
    expect(factories.managed).toHaveBeenCalledWith('account-a', undefined);
    expect(factories.local).not.toHaveBeenCalled();
    expect(factories.web).not.toHaveBeenCalled();
  });

  it('keeps the embedded non-Tauri build on WebRuntime regardless of desktop mode state', () => {
    const { factories, webRuntime } = runtimeFactories();

    const selected = createDesktopChatRuntime({ isTauriHost: false, appMode: 'cloud' }, factories);

    expect(selected).toBe(webRuntime);
    expect(factories.web).toHaveBeenCalledOnce();
    expect(factories.local).not.toHaveBeenCalled();
    expect(factories.managed).not.toHaveBeenCalled();
  });

  it('fails closed to the Local runtime for an unreadable desktop mode value', () => {
    const { factories, localRuntime } = runtimeFactories();

    const selected = createDesktopChatRuntime(
      { isTauriHost: true, appMode: 'corrupt' as 'local' },
      factories,
    );

    expect(selected).toBe(localRuntime);
    expect(factories.local).toHaveBeenCalledOnce();
    expect(factories.managed).not.toHaveBeenCalled();
    expect(factories.web).not.toHaveBeenCalled();
  });
});
