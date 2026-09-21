import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useChatUIStore } from '@agiworkforce/unified-chat';
import { useUIStore } from '@shared/stores/layout-store';

const runtime = vi.hoisted(() => ({
  readShellLayout: vi.fn(),
  writeShellLayout: vi.fn(),
}));

vi.mock('../lib/runtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/runtime-client')>()),
  readShellLayout: (...args: unknown[]) => runtime.readShellLayout(...args),
  writeShellLayout: (...args: unknown[]) => runtime.writeShellLayout(...args),
}));

import { useShellLayout } from '../hooks/use-shell-layout';

function fakeHost(): HostBridge {
  return { platform: 'electron-darwin', appVersion: '1.2.0' } as unknown as HostBridge;
}

function Harness({ host }: { host: HostBridge | null }) {
  useShellLayout(host);
  return null;
}

async function settle() {
  await vi.waitFor(() => expect(runtime.readShellLayout).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime.readShellLayout.mockResolvedValue({ secondaryPanelWidth: null, sidebarCollapsed: null });
  runtime.writeShellLayout.mockResolvedValue({
    secondaryPanelWidth: null,
    sidebarCollapsed: null,
  });
  useUIStore.getState().setSidebarCollapsed(false);
  useChatUIStore.getState().setArtifactPanelWidth(400);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('layout inside the desktop shell', () => {
  it('opens on what the shell last recorded', async () => {
    runtime.readShellLayout.mockResolvedValue({
      secondaryPanelWidth: 520,
      sidebarCollapsed: true,
    });

    render(<Harness host={fakeHost()} />);
    await settle();

    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    expect(useChatUIStore.getState().artifactPanelWidth).toBe(520);
  });

  it('leaves the page default alone where the shell has been told nothing', async () => {
    render(<Harness host={fakeHost()} />);
    await settle();

    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    expect(useChatUIStore.getState().artifactPanelWidth).toBe(400);
  });

  it('writes nothing back while adopting what it just read', async () => {
    runtime.readShellLayout.mockResolvedValue({
      secondaryPanelWidth: 520,
      sidebarCollapsed: true,
    });

    render(<Harness host={fakeHost()} />);
    await settle();

    expect(runtime.writeShellLayout).not.toHaveBeenCalled();
  });

  it('sends a collapse to the shell', async () => {
    render(<Harness host={fakeHost()} />);
    await settle();

    useUIStore.getState().setSidebarCollapsed(true);

    expect(runtime.writeShellLayout).toHaveBeenCalledWith({ sidebarCollapsed: true });
  });

  it('sends a panel resize to the shell', async () => {
    render(<Harness host={fakeHost()} />);
    await settle();

    useChatUIStore.getState().setArtifactPanelWidth(640);

    expect(runtime.writeShellLayout).toHaveBeenCalledWith({ secondaryPanelWidth: 640 });
  });

  it('says nothing for a set that changes neither value', async () => {
    render(<Harness host={fakeHost()} />);
    await settle();

    useUIStore.getState().setSidebarCollapsed(false);
    useChatUIStore.getState().setArtifactPanelWidth(400);

    expect(runtime.writeShellLayout).not.toHaveBeenCalled();
  });

  it('stops writing once the host is gone', async () => {
    const { unmount } = render(<Harness host={fakeHost()} />);
    await settle();
    unmount();

    useUIStore.getState().setSidebarCollapsed(true);

    expect(runtime.writeShellLayout).not.toHaveBeenCalled();
  });

  it('keeps the page usable when the shell cannot be read', async () => {
    runtime.readShellLayout.mockRejectedValue(new Error('no bridge'));

    render(<Harness host={fakeHost()} />);
    await settle();

    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    useUIStore.getState().setSidebarCollapsed(true);
    expect(runtime.writeShellLayout).toHaveBeenCalledWith({ sidebarCollapsed: true });
  });

  it('touches the shell for nothing outside it', () => {
    render(<Harness host={null} />);

    expect(runtime.readShellLayout).not.toHaveBeenCalled();
    useUIStore.getState().setSidebarCollapsed(true);
    expect(runtime.writeShellLayout).not.toHaveBeenCalled();
  });
});
