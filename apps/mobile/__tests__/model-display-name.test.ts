import {
  getDisplayName,
  getManagedDisplayName,
  getModelListForCloudAccess,
  getShortDisplayName,
} from '@/src/features/model-picker/service';

const WIRE_ID = /^[a-z0-9]+[a-z0-9._-]*$/;

describe('model display names', () => {
  it('agrees with getShortDisplayName for every selectable cloud model', () => {
    const models = getModelListForCloudAccess(true);
    expect(models.length).toBeGreaterThan(0);

    const disagreements = models
      .map((model) => ({
        id: model.id,
        long: getDisplayName(model.id),
        short: getShortDisplayName(model.id),
      }))
      .filter((entry) => entry.long !== entry.short);

    expect(disagreements).toEqual([]);
  });

  it('never renders a bare wire id as a model label', () => {
    const leaked = getModelListForCloudAccess(true)
      .map((model) => ({ id: model.id, label: getDisplayName(model.id) }))
      // A label identical to the id, in wire form, means the lookup missed.
      .filter((entry) => entry.label === entry.id && WIRE_ID.test(entry.id));

    expect(leaked).toEqual([]);
  });

  it('still falls back to the id for a model no registry knows', () => {
    expect(getDisplayName('not-a-real-model-id')).toBe('not-a-real-model-id');
  });

  it('does not expose an unknown historical Managed Cloud id', () => {
    expect(getManagedDisplayName('fixture-retired-managed-model')).toBe('Unavailable model');
  });
});
