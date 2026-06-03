import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchTierFromBridge } from '../integrations/tierResolver';
import { getDesktopBridge } from '../features/desktop-bridge';

vi.mock('../features/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(),
}));

describe('fetchTierFromBridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(getDesktopBridge).mockReset();
  });

  it('does not probe unsupported desktop bridge HTTP billing routes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getDesktopBridge).mockReturnValue({
      isConnected: true,
      baseUrl: 'http://127.0.0.1:8787',
    } as ReturnType<typeof getDesktopBridge>);

    await expect(fetchTierFromBridge()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
