import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeToCloud } from '../http';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('cloud command endpoint', () => {
  it('refuses an unconfigured surface before making a request', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const fetch = vi.spyOn(globalThis, 'fetch');

    await expect(
      routeToCloud('list', undefined, {
        tier: 'cloud',
        featureGroup: 'chat',
        commandName: 'list',
      }),
    ).rejects.toThrow('Cloud API base URL is not configured for this surface.');
    expect(fetch).not.toHaveBeenCalled();
  });
});
