import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const onOpenUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-deep-link', () => ({ onOpenUrl: onOpenUrlMock }));
vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: false,
  isElectronHost: true,
}));

import { useDeepLink } from '../useDeepLink';

describe('Electron Cloud deep links', () => {
  it('subscribes to the Electron preload callback for bundled social sign-in', async () => {
    const unlisten = vi.fn();
    onOpenUrlMock.mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useDeepLink());
    await waitFor(() => expect(onOpenUrlMock).toHaveBeenCalledOnce());

    unmount();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
