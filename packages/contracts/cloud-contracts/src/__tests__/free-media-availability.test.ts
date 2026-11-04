import { describe, expect, it } from 'vitest';
import { freeMediaAvailability, type FreeQuotaCatalogue, type FreeQuotaModel } from '../free-quota';

const media = (status: FreeQuotaModel['status']): FreeQuotaModel => ({
  key: 'fixture', displayName: 'Fixture', providerModelId: null, category: 'image',
  limit: 10, unit: 'images', consumedApproximate: 0, expiresOn: null, status,
});
const catalogue = (models: FreeQuotaModel[]): Pick<FreeQuotaCatalogue, 'models'> => ({ models });

describe('media offer availability', () => {
  it('keeps missing and temporarily unavailable inventory unknown', () => {
    expect(freeMediaAvailability(null, 'image')).toBe('unknown');
    expect(freeMediaAvailability(catalogue([media('unavailable')]), 'image')).toBe('unknown');
  });
  it('offers only ready inventory and distinguishes exhausted inventory', () => {
    expect(freeMediaAvailability(catalogue([media('ready')]), 'image')).toBe('offered');
    expect(freeMediaAvailability(catalogue([media('exhausted')]), 'image')).toBe('not_offered');
    expect(freeMediaAvailability(catalogue([]), 'image')).toBe('not_offered');
  });
  it('honors an explicit account-level unknown over ready provider inventory', () => {
    expect(freeMediaAvailability({ models: [media('ready')], mediaAvailability: { image: 'unknown', video: 'not_offered' } }, 'image')).toBe('unknown');
  });
});
