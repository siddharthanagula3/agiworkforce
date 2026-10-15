const mockDigest = jest.fn(async (_algorithm: string, data: string) => `digest(${data})`);

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: (algorithm: string, data: string) => mockDigest(algorithm, data),
}));
jest.mock('@/lib/deviceId', () => ({ getDeviceId: jest.fn(async () => 'install-1') }));

import { companionInstallationId } from '../installationId';

describe('the id a phone pairs with', () => {
  it('is stable for the install and never the raw device id', async () => {
    const first = await companionInstallationId();
    const second = await companionInstallationId();

    expect(first).toBe(second);
    expect(first).not.toBe('install-1');
    expect(mockDigest).toHaveBeenCalledWith('SHA-256', 'agi-remote-control:install-1');
  });
});
