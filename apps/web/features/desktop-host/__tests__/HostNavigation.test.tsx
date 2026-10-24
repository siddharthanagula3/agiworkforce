import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge, HostNavigationState } from '@agiworkforce/local-runtime-contract';
import { DesktopTitleStrip } from '../components/DesktopTitleStrip';

type UiModule = typeof import('@agiworkforce/ui');

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<UiModule>()),
  confirmNavigation: (proceed: () => void) => proceed(),
}));

interface FakeNavigation {
  read: ReturnType<typeof vi.fn>;
  go: ReturnType<typeof vi.fn>;
  onChange: ReturnType<typeof vi.fn>;
  emit: (state: HostNavigationState) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function fakeNavigation(initial: HostNavigationState): FakeNavigation {
  let listener: ((state: HostNavigationState) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  return {
    read: vi.fn(async () => initial),
    go: vi.fn(async () => undefined),
    onChange: vi.fn((callback: (state: HostNavigationState) => void) => {
      listener = callback;
      return unsubscribe;
    }),
    emit: (state) => listener?.(state),
    unsubscribe,
  };
}

function installHost(platform: string, navigation?: FakeNavigation) {
  Object.defineProperty(window, 'agiHost', {
    configurable: true,
    value: { platform, ...(navigation ? { navigation } : {}) } as unknown as HostBridge,
  });
}

beforeEach(() => {
  push.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
  document.documentElement.removeAttribute('data-host-navigation');
});

describe('desktop history controls', () => {
  it('draws nothing in a browser', () => {
    render(<DesktopTitleStrip />);

    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.documentElement).not.toHaveAttribute('data-host-navigation');
  });

  it('draws nothing in a shell that exposes no window history', () => {
    installHost('electron-darwin');
    render(<DesktopTitleStrip />);

    expect(document.querySelector('[data-app-header]')).not.toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.documentElement).not.toHaveAttribute('data-host-navigation');
  });

  it('draws nothing where the shell keeps its native title bar', () => {
    installHost('electron-win32', fakeNavigation({ canGoBack: true, canGoForward: true }));
    render(<DesktopTitleStrip />);

    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('enables each arrow from the window history and dims the unavailable one', async () => {
    installHost('electron-darwin', fakeNavigation({ canGoBack: true, canGoForward: false }));
    render(<DesktopTitleStrip />);

    const back = await screen.findByRole('button', { name: /^Back/ });
    const forward = screen.getByRole('button', { name: /^Forward/ });
    await waitFor(() => expect(back).toBeEnabled());
    expect(forward).toBeDisabled();
    expect(forward.className).toContain('disabled:opacity-40');
  });

  it('labels the arrows with the chords the menu uses', async () => {
    installHost('electron-darwin', fakeNavigation({ canGoBack: true, canGoForward: true }));
    render(<DesktopTitleStrip />);

    expect(await screen.findByRole('button', { name: 'Back (⌘[)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forward (⌘])' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New chat (⌘N)' })).toBeInTheDocument();
  });

  it('follows the shell as it navigates and lets go of it on unmount', async () => {
    const navigation = fakeNavigation({ canGoBack: false, canGoForward: false });
    installHost('electron-darwin', navigation);
    const { unmount } = render(<DesktopTitleStrip />);

    const forward = await screen.findByRole('button', { name: /^Forward/ });
    expect(forward).toBeDisabled();

    act(() => navigation.emit({ canGoBack: true, canGoForward: true }));
    expect(screen.getByRole('button', { name: /^Back/ })).toBeEnabled();
    expect(forward).toBeEnabled();

    unmount();
    expect(navigation.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('asks the shell to step in the direction pressed', async () => {
    const navigation = fakeNavigation({ canGoBack: true, canGoForward: true });
    installHost('electron-darwin', navigation);
    render(<DesktopTitleStrip />);

    const back = await screen.findByRole('button', { name: /^Back/ });
    await waitFor(() => expect(back).toBeEnabled());
    fireEvent.click(back);
    fireEvent.click(screen.getByRole('button', { name: /^Forward/ }));

    expect(navigation.go.mock.calls).toEqual([['back'], ['forward']]);
  });

  it('never asks the shell to step where there is no history', async () => {
    const navigation = fakeNavigation({ canGoBack: false, canGoForward: false });
    installHost('electron-darwin', navigation);
    render(<DesktopTitleStrip />);

    fireEvent.click(await screen.findByRole('button', { name: /^Back/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Forward/ }));

    expect(navigation.go).not.toHaveBeenCalled();
  });

  it('opens a new chat through the page router', async () => {
    installHost('electron-darwin', fakeNavigation({ canGoBack: false, canGoForward: false }));
    render(<DesktopTitleStrip />);

    fireEvent.click(await screen.findByRole('button', { name: /^New chat/ }));

    expect(push).toHaveBeenCalledWith('/chat');
  });

  it('moves the strip inset clear of the controls only while they are drawn', async () => {
    installHost('electron-darwin', fakeNavigation({ canGoBack: false, canGoForward: false }));
    const { unmount } = render(<DesktopTitleStrip />);

    await screen.findByRole('toolbar', { name: 'Window history' });
    expect(document.documentElement).toHaveAttribute('data-host-navigation');

    unmount();
    expect(document.documentElement).not.toHaveAttribute('data-host-navigation');
  });
});
