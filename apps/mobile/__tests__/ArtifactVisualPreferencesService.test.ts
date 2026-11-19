import { managedCloudPreferencesNamespacePath } from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';
import {
  CAPABILITIES_NAMESPACE,
  fetchArtifactVisualPreferences,
} from '@/src/features/settings/capabilities/artifactVisualPreferencesService';

jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const getMock = api.get as jest.Mock;
const ACCOUNT = { ownerId: 'user_artifact_visuals', epoch: 3 };

describe('fetchArtifactVisualPreferences', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('reads the capabilities namespace for the signed-in account', async () => {
    getMock.mockResolvedValue({ settings: {} });

    await fetchArtifactVisualPreferences(ACCOUNT);

    expect(getMock).toHaveBeenCalledWith(
      managedCloudPreferencesNamespacePath(CAPABILITIES_NAMESPACE),
      { accountEpoch: ACCOUNT },
    );
  });

  it('offers no switch when the server does not list any', async () => {
    getMock.mockResolvedValue({ settings: { artifacts: false, inlineVisualizations: false } });

    const read = await fetchArtifactVisualPreferences(ACCOUNT);

    expect(read.available).toEqual([]);
  });

  it('offers no switch when the server lists them in the wrong shape', async () => {
    getMock.mockResolvedValue({ settings: {}, availableSwitches: 'artifacts' });

    const read = await fetchArtifactVisualPreferences(ACCOUNT);

    expect(read.available).toEqual([]);
  });

  it('offers only the known switches the server lists', async () => {
    getMock.mockResolvedValue({ settings: {}, availableSwitches: ['artifacts', 'bogus'] });

    const read = await fetchArtifactVisualPreferences(ACCOUNT);

    expect(read.available).toEqual(['artifacts']);
  });

  it('does not take availability from the stored settings', async () => {
    getMock.mockResolvedValue({
      settings: { availableSwitches: ['artifacts', 'inlineVisualizations'] },
    });

    const read = await fetchArtifactVisualPreferences(ACCOUNT);

    expect(read.available).toEqual([]);
  });

  it('reports a switch the account turned off', async () => {
    getMock.mockResolvedValue({
      settings: { artifacts: false },
      availableSwitches: ['artifacts', 'inlineVisualizations'],
    });

    const read = await fetchArtifactVisualPreferences(ACCOUNT);

    expect(read.values).toEqual({ artifacts: false, inlineVisualizations: true });
    expect(read.available).toEqual(['artifacts', 'inlineVisualizations']);
  });

  it('treats both switches as on when the stored settings are not an object', async () => {
    getMock.mockResolvedValue({ settings: ['artifacts'], availableSwitches: ['artifacts'] });

    const read = await fetchArtifactVisualPreferences(ACCOUNT);

    expect(read.values).toEqual({ artifacts: true, inlineVisualizations: true });
  });

  it('passes a failed read to the caller', async () => {
    getMock.mockRejectedValue(new Error('offline'));

    await expect(fetchArtifactVisualPreferences(ACCOUNT)).rejects.toThrow('offline');
  });
});
