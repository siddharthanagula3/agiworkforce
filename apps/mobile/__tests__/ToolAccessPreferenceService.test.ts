import { managedCloudPreferencesNamespacePath } from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';
import { CAPABILITIES_NAMESPACE } from '@/src/features/settings/capabilities/artifactVisualPreferencesService';
import {
  fetchToolAccessPreference,
  parseToolAccessMode,
} from '@/src/features/settings/capabilities/toolAccessPreferenceService';

const ACCOUNT = { ownerId: 'user_tool_access', epoch: 2 };

describe('fetchToolAccessPreference', () => {
  let getMock: jest.SpyInstance;

  beforeEach(() => {
    getMock = jest.spyOn(api, 'get');
  });

  afterEach(() => {
    getMock.mockRestore();
  });

  it('reads the capabilities namespace for the signed-in account', async () => {
    getMock.mockResolvedValue({ settings: {} });

    await fetchToolAccessPreference(ACCOUNT);

    expect(getMock).toHaveBeenCalledWith(
      managedCloudPreferencesNamespacePath(CAPABILITIES_NAMESPACE),
      { accountEpoch: ACCOUNT },
    );
  });

  it('is unavailable until the server lists it', async () => {
    getMock.mockResolvedValue({ settings: { toolAccess: 'always' } });
    await expect(fetchToolAccessPreference(ACCOUNT)).resolves.toEqual({
      mode: 'always',
      available: false,
    });

    getMock.mockResolvedValue({ settings: {}, availableSwitches: 'toolAccess' });
    await expect(fetchToolAccessPreference(ACCOUNT)).resolves.toMatchObject({
      available: false,
    });

    getMock.mockResolvedValue({ settings: {}, availableSwitches: ['artifacts'] });
    await expect(fetchToolAccessPreference(ACCOUNT)).resolves.toMatchObject({
      available: false,
    });
  });

  it('is available once the server lists it', async () => {
    getMock.mockResolvedValue({
      settings: { toolAccess: 'on_demand' },
      availableSwitches: ['artifacts', 'toolAccess'],
    });

    await expect(fetchToolAccessPreference(ACCOUNT)).resolves.toEqual({
      mode: 'on_demand',
      available: true,
    });
  });

  it('reads Auto when nothing, or something unknown, is stored', async () => {
    getMock.mockResolvedValue({ availableSwitches: ['toolAccess'] });
    await expect(fetchToolAccessPreference(ACCOUNT)).resolves.toMatchObject({ mode: 'auto' });

    getMock.mockResolvedValue({ settings: { toolAccess: 'everything' } });
    await expect(fetchToolAccessPreference(ACCOUNT)).resolves.toMatchObject({ mode: 'auto' });

    getMock.mockResolvedValue({ settings: ['always'] });
    await expect(fetchToolAccessPreference(ACCOUNT)).resolves.toMatchObject({ mode: 'auto' });
  });

  it('passes a failed read to the caller', async () => {
    getMock.mockRejectedValue(new Error('offline'));
    await expect(fetchToolAccessPreference(ACCOUNT)).rejects.toThrow('offline');
  });
});

describe('parseToolAccessMode', () => {
  it('keeps the three known modes and nothing else', () => {
    expect(parseToolAccessMode('auto')).toBe('auto');
    expect(parseToolAccessMode('on_demand')).toBe('on_demand');
    expect(parseToolAccessMode('always')).toBe('always');
    expect(parseToolAccessMode('ALWAYS')).toBe('auto');
    expect(parseToolAccessMode(undefined)).toBe('auto');
  });
});
