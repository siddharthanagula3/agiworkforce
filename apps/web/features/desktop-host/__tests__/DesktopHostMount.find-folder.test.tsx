import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@agiworkforce/ui';
import {
  DesktopRuntimeError,
  type HostBridge,
  type HostCommand,
} from '@agiworkforce/local-runtime-contract';
import { NEW_CHAT_PATH } from '@/features/chat/lib/new-chat-entry';
import { onAppCommand } from '@shared/lib/app-commands';
import { useUIStore } from '@shared/stores/layout-store';
import { DesktopHostMount } from '../components/DesktopHostMount';
import { useOpenedFolderStore } from '../lib/open-granted-folder';

const { pickWorkspaceRoot, push, historyGo } = vi.hoisted(() => ({
  pickWorkspaceRoot: vi.fn(),
  push: vi.fn(),
  historyGo: vi.fn(async () => undefined),
}));

const historyState = { canGoBack: false, canGoForward: false };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/chat',
}));

vi.mock('@/lib/identity/client', () => ({
  useCurrentUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

vi.mock('../components/DesktopChatRunner', () => ({
  DesktopChatRunner: () => null,
}));

vi.mock('../lib/runtime-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/runtime-client')>();
  return {
    ...actual,
    pickWorkspaceRoot,
    readShellLayout: async () => ({ sidebarCollapsed: null, secondaryPanelWidth: null }),
    writeShellLayout: async () => ({ sidebarCollapsed: null, secondaryPanelWidth: null }),
    reportDesktopAccount: async () => false,
  };
});

let deliver: ((command: HostCommand) => void) | null = null;

function installHost(): void {
  deliver = null;
  const host = {
    platform: 'electron-darwin',
    shell: 'electron',
    appVersion: '1.2.0',
    onHostCommand: (callback: (command: HostCommand) => void) => {
      deliver = callback;
      return () => {
        deliver = null;
      };
    },
    onRuntimeEvent: () => () => undefined,
    onDeepLink: () => () => undefined,
    checkForUpdate: async () => ({ available: false }),
    invokeRuntime: async () => ({
      ok: false,
      error: { code: 'cancelled', message: 'unused in this test' },
    }),
    readPreferences: async () => ({ preferences: {} }),
    openExternal: async () => undefined,
    navigation: {
      read: async () => ({
        canGoBack: historyState.canGoBack,
        canGoForward: historyState.canGoForward,
      }),
      go: historyGo,
      onChange: () => () => undefined,
    },
  } as unknown as HostBridge;
  Object.defineProperty(window, 'agiHost', { value: host, configurable: true, writable: true });
}

function PublicSidebar() {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  return (
    <Sidebar
      sessions={[]}
      collapsed={collapsed}
      onNewChat={() => undefined}
      onOpenSearch={() => undefined}
      onToggleCollapse={() => setSidebarCollapsed(!collapsed)}
    />
  );
}

function setViewport(outer: number, inner: number): void {
  Object.defineProperty(window, 'outerWidth', { value: outer, configurable: true, writable: true });
  Object.defineProperty(window, 'innerWidth', { value: inner, configurable: true, writable: true });
}

function publishedZoom(): string {
  return document.documentElement.style.getPropertyValue('--agi-window-zoom');
}

beforeEach(() => {
  pickWorkspaceRoot.mockReset();
  push.mockReset();
  historyGo.mockClear();
  historyState.canGoBack = false;
  historyState.canGoForward = false;
  useOpenedFolderStore.getState().reset();
  useUIStore.getState().setSidebarCollapsed(false);
  setViewport(1280, 1280);
  document.documentElement.style.removeProperty('--agi-window-zoom');
  installHost();
});

describe('the public window mount', () => {
  it('opens a new chat from the public window without sending a draft', () => {
    render(<DesktopHostMount />);

    fireEvent.click(screen.getByRole('button', { name: /New chat/ }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(NEW_CHAT_PATH);
  });

  it('opens Find on the page the public window loads', async () => {
    render(<DesktopHostMount />);

    await act(async () => {
      deliver?.('find');
    });

    expect(await screen.findByRole('textbox', { name: 'Find' })).toBeTruthy();
  });

  it('shows the folder File > Open Folder grants on the page the public window loads', async () => {
    pickWorkspaceRoot.mockResolvedValue({ id: 'root-1', name: 'Notes', path: '/work/notes' });
    render(<DesktopHostMount />);

    await act(async () => {
      deliver?.('open-folder');
    });

    expect(await screen.findByText('Folder open: Notes')).toBeTruthy();
    expect(pickWorkspaceRoot).toHaveBeenCalledWith('folder');
  });

  it('leaves the window unchanged when Open Folder is cancelled', async () => {
    pickWorkspaceRoot.mockRejectedValue(
      new DesktopRuntimeError({ code: 'cancelled', message: 'No folder was chosen.' }),
    );
    render(<DesktopHostMount />);

    await act(async () => {
      deliver?.('open-folder');
    });

    await waitFor(() => expect(pickWorkspaceRoot).toHaveBeenCalledWith('folder'));
    expect(screen.queryByText(/Folder open/)).toBeNull();
    expect(screen.queryByText('No folder was chosen.')).toBeNull();
  });

  it('hides and restores the sidebar when Toggle Sidebar reaches the public window', async () => {
    render(
      <>
        <DesktopHostMount />
        <PublicSidebar />
      </>,
    );

    expect(document.querySelector('[data-sidebar-region="rail"]')).toBeNull();

    await act(async () => {
      deliver?.('toggle-sidebar');
    });

    expect(document.querySelector('[data-sidebar-region="rail"]')).toBeTruthy();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    await act(async () => {
      deliver?.('toggle-sidebar');
    });

    expect(document.querySelector('[data-sidebar-region="rail"]')).toBeNull();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('forwards Search from the public window to the page', async () => {
    const opened = vi.fn();
    const stop = onAppCommand('open-search', opened);
    render(<DesktopHostMount />);

    await act(async () => {
      deliver?.('open-search');
    });

    expect(opened).toHaveBeenCalledTimes(1);
    stop();
  });

  it('follows Zoom In and Zoom Out on the page the public window loads', () => {
    render(<DesktopHostMount />);

    expect(publishedZoom()).toBe('1');

    setViewport(1280, 1066);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(Number(publishedZoom())).toBeCloseTo(1.2, 2);

    setViewport(1280, 1536);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(Number(publishedZoom())).toBeCloseTo(0.833, 2);
  });

  it('steps Back and Forward on the page the public window loads', async () => {
    historyState.canGoBack = true;
    historyState.canGoForward = true;
    render(<DesktopHostMount />);

    const back = await screen.findByRole('button', { name: /^Back/ });
    const forward = screen.getByRole('button', { name: /^Forward/ });
    await waitFor(() => expect(back).toBeEnabled());
    expect(forward).toBeEnabled();

    fireEvent.click(back);
    fireEvent.click(forward);

    expect(historyGo.mock.calls).toEqual([['back'], ['forward']]);
  });
});
