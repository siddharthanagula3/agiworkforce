import { beforeEach, describe, expect, it, vi } from 'vitest';

const openMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-shell', () => ({ open: openMock }));
vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: false,
  isElectronHost: true,
}));

import { openExternalUrl, openPricingPage } from '../navigation';

describe('Electron external navigation', () => {
  beforeEach(() => openMock.mockReset().mockResolvedValue(undefined));

  it('opens hosted account and billing pages through the OS browser bridge', async () => {
    await openExternalUrl('https://agiworkforce.com/user');
    await openPricingPage('upgrade_required');

    expect(openMock).toHaveBeenNthCalledWith(1, 'https://agiworkforce.com/user');
    expect(openMock).toHaveBeenNthCalledWith(
      2,
      'https://www.agiworkforce.com/billing?reason=upgrade_required',
    );
  });
});
