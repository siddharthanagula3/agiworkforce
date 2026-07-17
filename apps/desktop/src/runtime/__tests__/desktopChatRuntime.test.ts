import { describe, expect, it, vi } from 'vitest';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { CloudRuntime } from '../CloudRuntime';
import { createDesktopChatRuntime } from '../desktopChatRuntime';
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
  it('maps the production factories to the concrete runtime implementations', () => {
    const local = createDesktopChatRuntime({ isTauriHost: true, appMode: 'local' });
    const cloud = createDesktopChatRuntime({ isTauriHost: true, appMode: 'cloud' });
    const web = createDesktopChatRuntime({ isTauriHost: false, appMode: 'cloud' });

    expect(local).toBeInstanceOf(TauriRuntime);
    expect(cloud).toBeInstanceOf(CloudRuntime);
    expect(web).toBeInstanceOf(WebRuntime);
    expect(local.supportsResearch).not.toBe(true);
    expect(cloud.supportsResearch).toBe(true);
    expect(web.supportsResearch).toBe(true);
  });

  it('keeps the Local workspace, including BYOK conversations, on the Tauri runtime', () => {
    const { factories, localRuntime } = runtimeFactories();

    const selected = createDesktopChatRuntime(
      { isTauriHost: true, appMode: 'local' },
      factories,
    );

    expect(selected).toBe(localRuntime);
    expect(factories.local).toHaveBeenCalledOnce();
    expect(factories.managed).not.toHaveBeenCalled();
    expect(factories.web).not.toHaveBeenCalled();
  });

  it('selects managed Cloud only after the existing mode gate has admitted cloud', () => {
    const { factories, managedRuntime } = runtimeFactories();

    const selected = createDesktopChatRuntime(
      { isTauriHost: true, appMode: 'cloud' },
      factories,
    );

    expect(selected).toBe(managedRuntime);
    expect(factories.managed).toHaveBeenCalledOnce();
    expect(factories.local).not.toHaveBeenCalled();
    expect(factories.web).not.toHaveBeenCalled();
  });

  it('keeps the embedded non-Tauri build on WebRuntime regardless of desktop mode state', () => {
    const { factories, webRuntime } = runtimeFactories();

    const selected = createDesktopChatRuntime(
      { isTauriHost: false, appMode: 'cloud' },
      factories,
    );

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
