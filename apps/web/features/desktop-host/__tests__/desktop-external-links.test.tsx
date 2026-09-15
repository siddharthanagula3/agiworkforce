import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useDesktopExternalLinks } from '../hooks/use-desktop-external-links';

function fakeHost(): HostBridge & { openExternal: ReturnType<typeof vi.fn> } {
  return {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    invokeRuntime: vi.fn(),
    onDeepLink: vi.fn(() => () => undefined),
    onVoiceHotkey: vi.fn(() => () => undefined),
    onRuntimeEvent: vi.fn(() => () => undefined),
    openExternal: vi.fn(async () => undefined),
    notify: vi.fn(async () => undefined),
    checkForUpdate: vi.fn(),
    openUpdateInstaller: vi.fn(async () => undefined),
  } as unknown as HostBridge & { openExternal: ReturnType<typeof vi.fn> };
}

function Harness({ host }: { host: HostBridge | null }) {
  useDesktopExternalLinks(host);
  return (
    <>
      <a href="/pricing">Pricing</a>
      <a href="/chat/abc">A conversation</a>
      <a href="/login">Sign in</a>
      <a href="/terms" target="_blank" rel="noreferrer">
        Terms in a new window
      </a>
      <a href="/brand-assets.zip" download>
        Brand assets
      </a>
      <a href="#main-content">Skip to content</a>
      <a href="https://status.example.com/">Status</a>
    </>
  );
}

/**
 * Reads whether the hook cancelled the click, then cancels it either way.
 *
 * The hook listens on `document` in capture phase; this listener is registered
 * afterwards on the same target and phase, so it sees the hook's decision and
 * still runs before jsdom would try to follow the link and log an unimplemented
 * navigation over every assertion.
 */
function clickLink(container: HTMLElement, text: string, init: MouseEventInit = {}): boolean {
  const anchor = [...container.querySelectorAll('a')].find((a) => a.textContent === text);
  if (!anchor) throw new Error(`no link labelled ${text}`);

  let cancelledByHook = false;
  const observe = (event: Event) => {
    cancelledByHook = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener('click', observe, true);
  try {
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
    );
  } finally {
    document.removeEventListener('click', observe, true);
  }
  return cancelledByHook;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('desktop external links', () => {
  it('sends a marketing link to the browser instead of the app window', () => {
    const host = fakeHost();
    const { container } = render(<Harness host={host} />);

    expect(clickLink(container, 'Pricing')).toBe(true);
    expect(host.openExternal).toHaveBeenCalledWith(`${window.location.origin}/pricing`);
  });

  it('leaves the product and the sign-in flow in the window', () => {
    const host = fakeHost();
    const { container } = render(<Harness host={host} />);

    for (const label of ['A conversation', 'Sign in']) {
      expect(clickLink(container, label), label).toBe(false);
    }
    expect(host.openExternal).not.toHaveBeenCalled();
  });

  it('leaves a modifier click, a new window, a download and an anchor alone', () => {
    const host = fakeHost();
    const { container } = render(<Harness host={host} />);

    clickLink(container, 'Pricing', { metaKey: true });
    clickLink(container, 'Pricing', { ctrlKey: true });
    clickLink(container, 'Pricing', { shiftKey: true });
    clickLink(container, 'Pricing', { button: 1 });
    clickLink(container, 'Terms in a new window');
    clickLink(container, 'Brand assets');
    clickLink(container, 'Skip to content');

    expect(host.openExternal).not.toHaveBeenCalled();
  });

  it('leaves a cross-origin link to the shell navigation policy', () => {
    const host = fakeHost();
    const { container } = render(<Harness host={host} />);

    expect(clickLink(container, 'Status')).toBe(false);
    expect(host.openExternal).not.toHaveBeenCalled();
  });

  it('does nothing at all in a browser', () => {
    const { container } = render(<Harness host={null} />);

    expect(clickLink(container, 'Pricing')).toBe(false);
  });

  it('stops listening when it unmounts', () => {
    const host = fakeHost();
    const view = render(<Harness host={host} />);
    const anchor = document.createElement('a');
    anchor.href = '/pricing';
    document.body.append(anchor);
    view.unmount();

    const observe = (event: Event) => event.preventDefault();
    document.addEventListener('click', observe, true);
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    document.removeEventListener('click', observe, true);

    expect(host.openExternal).not.toHaveBeenCalled();
    anchor.remove();
  });
});
