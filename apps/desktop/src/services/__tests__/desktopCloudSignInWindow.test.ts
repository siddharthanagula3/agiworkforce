import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const windowHarness = vi.hoisted(() => ({
  created: [] as Array<{
    label: string;
    options: Record<string, unknown>;
    close: ReturnType<typeof vi.fn>;
    setFocus: ReturnType<typeof vi.fn>;
    closeHandler?: () => void;
    destroyedHandler?: () => void;
  }>,
  existing: null as {
    close: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => {
  class WebviewWindow {
    static getByLabel = vi.fn(async () => windowHarness.existing);

    label: string;
    options: Record<string, unknown>;
    close = vi.fn(async () => undefined);
    setFocus = vi.fn(async () => undefined);
    closeHandler?: () => void;
    destroyedHandler?: () => void;

    constructor(label: string, options: Record<string, unknown>) {
      this.label = label;
      this.options = options;
      windowHarness.created.push(this);
    }

    async once(event: string, callback: (event: { payload?: unknown }) => void) {
      if (event === 'tauri://created') {
        queueMicrotask(() => callback({}));
      } else if (event === 'tauri://destroyed') {
        this.destroyedHandler = () => callback({});
      }
      return vi.fn();
    }

    async onCloseRequested(callback: () => void) {
      this.closeHandler = callback;
      return vi.fn();
    }
  }

  return { WebviewWindow };
});

vi.mock('../../api/config', () => ({
  WEB_APP_URL: 'https://agiworkforce.com',
}));

import { openDesktopCloudSignInWindow } from '../desktopCloudSignInWindow';

describe('Desktop Cloud in-app sign-in window', () => {
  beforeEach(() => {
    windowHarness.created.length = 0;
    windowHarness.existing = null;
  });

  it('opens the trusted device approval URL in an owned Desktop window', async () => {
    const onUserClosed = vi.fn();
    const session = await openDesktopCloudSignInWindow(
      'https://agiworkforce.com/auth/device?user_code=ABCD-1234',
      { onUserClosed },
    );

    expect(windowHarness.created).toHaveLength(1);
    expect(windowHarness.created[0]?.label).toBe('cloud-sign-in');
    expect(windowHarness.created[0]?.options).toMatchObject({
      url: 'https://agiworkforce.com/auth/device?user_code=ABCD-1234&surface=desktop',
      title: 'Sign in to AGI Cloud',
      parent: 'main',
      center: true,
      focus: true,
      width: 520,
      height: 720,
    });

    windowHarness.created[0]?.closeHandler?.();
    expect(onUserClosed).toHaveBeenCalledOnce();

    await session.close();
    expect(windowHarness.created[0]?.close).toHaveBeenCalledOnce();
  });

  it('does not treat the app closing a successful auth window as cancellation', async () => {
    const onUserClosed = vi.fn();
    const session = await openDesktopCloudSignInWindow(
      'https://agiworkforce.com/auth/device?user_code=ABCD-1234',
      { onUserClosed },
    );

    await session.close();
    windowHarness.created[0]?.closeHandler?.();

    expect(onUserClosed).not.toHaveBeenCalled();
  });

  it('cancels pending authorization when the window is destroyed directly', async () => {
    const onUserClosed = vi.fn();
    await openDesktopCloudSignInWindow('https://agiworkforce.com/auth/device?user_code=ABCD-1234', {
      onUserClosed,
    });

    windowHarness.created[0]?.destroyedHandler?.();

    expect(onUserClosed).toHaveBeenCalledOnce();
  });

  it('rejects an authorization URL outside the configured AGI Cloud origin', async () => {
    await expect(
      openDesktopCloudSignInWindow('https://example.com/auth/device?user_code=ABCD-1234', {
        onUserClosed: vi.fn(),
      }),
    ).rejects.toThrow('untrusted');

    expect(windowHarness.created).toHaveLength(0);
  });

  it('closes a stale sign-in window before creating a fresh authorization session', async () => {
    const close = vi.fn(async () => undefined);
    windowHarness.existing = { close };

    await openDesktopCloudSignInWindow('https://agiworkforce.com/auth/device?user_code=ABCD-1234', {
      onUserClosed: vi.fn(),
    });

    expect(close).toHaveBeenCalledOnce();
    expect(windowHarness.created).toHaveLength(1);
  });

  it('grants the main webview permission to create the owned sign-in window', () => {
    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as { permissions?: unknown[] };

    expect(capability.permissions).toContain('core:webview:allow-create-webview-window');
  });
});
