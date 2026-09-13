import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useDesktopHost } from '../lib/host';
import { deepLinkDestination, conversationDeepLink } from '../lib/deep-links';
import { notifyJobComplete } from '../lib/notify';

function installHost(overrides: Partial<HostBridge> = {}): HostBridge {
  const host: HostBridge = {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    invokeRuntime: async () => ({
      ok: false as const,
      error: { code: 'unsupported-platform' as const, message: 'no runtime in this test host' },
    }),
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    openExternal: async () => undefined,
    notify: async () => undefined,
    ...overrides,
  };
  window.agiHost = host;
  return host;
}

afterEach(() => {
  delete window.agiHost;
  vi.unstubAllGlobals();
});

describe('useDesktopHost', () => {
  it('returns null in a browser, where no shell injected a bridge', () => {
    const { result } = renderHook(() => useDesktopHost());
    expect(result.current).toBeNull();
  });

  it('returns the bridge the desktop shell injected', () => {
    const host = installHost();
    const { result } = renderHook(() => useDesktopHost());
    expect(result.current).toBe(host);
  });
});

describe('deepLinkDestination', () => {
  it('routes a conversation link to the conversation', () => {
    expect(deepLinkDestination(conversationDeepLink('abc-123'))).toBe('/chat/abc-123');
  });

  it('routes a project link to the project', () => {
    expect(deepLinkDestination('agiworkforce-cloud://project/p1')).toBe('/chat/projects/p1');
  });

  it('routes a settings link to the section it names', () => {
    expect(deepLinkDestination('agiworkforce-cloud://settings/billing')).toBe(
      '/chat?settings=billing',
    );
  });

  it('drops a settings link naming a section this build cannot render', () => {
    expect(deepLinkDestination('agiworkforce-cloud://settings/developer')).toBeNull();
  });

  it('drops a link that is not ours and one with no target', () => {
    expect(deepLinkDestination('https://agiworkforce.com/chat/abc')).toBeNull();
    expect(deepLinkDestination('agiworkforce-cloud://chat/')).toBeNull();
  });
});

describe('notifyJobComplete', () => {
  it('stays silent in a browser', async () => {
    await expect(notifyJobComplete({ title: 'Done' })).resolves.toBeUndefined();
  });

  it('stays silent while the page is visible', async () => {
    const notify = vi.fn(async () => undefined);
    installHost({ notify });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);

    await notifyJobComplete({ title: 'Done', conversationId: 'abc' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies with a click target when the page is hidden', async () => {
    const notify = vi.fn(async () => undefined);
    installHost({ notify });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    await notifyJobComplete({
      title: 'Research ready',
      body: 'Two sources',
      conversationId: 'abc',
    });
    expect(notify).toHaveBeenCalledWith({
      title: 'Research ready',
      body: 'Two sources',
      deepLink: 'agiworkforce-cloud://chat/abc',
    });
  });
});
