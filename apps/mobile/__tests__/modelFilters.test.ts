import { getModelMetadataById } from '@agiworkforce/types';
import {
  MODEL_FILTERS,
  matchesModelFilters,
  type ModelFilterId,
} from '@/src/features/model-picker/modelFilters';
import { getModelListForCloudAccess } from '@/src/features/model-picker/service';

const cloudModels = getModelListForCloudAccess(true, 'max').filter(
  (model) => model.surface === 'cloud_managed',
);

function idsMatching(active: ModelFilterId[]): string[] {
  return cloudModels.filter((model) => matchesModelFilters(model, active)).map((model) => model.id);
}

describe('model picker filters', () => {
  it('offers Instant, Economy, Images and Files, in that order', () => {
    expect(MODEL_FILTERS.map((filter) => filter.label)).toEqual([
      'Instant',
      'Economy',
      'Images',
      'Files',
    ]);
  });

  it('lets every model through while no filter is on', () => {
    expect(idsMatching([])).toEqual(cloudModels.map((model) => model.id));
  });

  it('reads each filter from what the catalogue records about the model', () => {
    expect(idsMatching(['instant'])).toEqual(
      cloudModels
        .filter((model) => getModelMetadataById(model.id)?.speed === 'very-fast')
        .map((model) => model.id),
    );
    expect(idsMatching(['economy'])).toEqual(
      cloudModels.filter((model) => model.tier === 'economy').map((model) => model.id),
    );
    expect(idsMatching(['images'])).toEqual(
      cloudModels.filter((model) => model.supportsVision).map((model) => model.id),
    );
    expect(idsMatching(['files'])).toEqual(
      cloudModels
        .filter((model) => {
          const metadata = getModelMetadataById(model.id);
          return Boolean(metadata?.documentInput) || metadata?.inputModalities?.includes('pdf');
        })
        .map((model) => model.id),
    );
  });

  it('finds at least one model for each filter in the current catalogue', () => {
    for (const filter of MODEL_FILTERS) {
      expect(idsMatching([filter.id]).length).toBeGreaterThan(0);
    }
  });

  it('requires every active filter to match', () => {
    const instant = new Set(idsMatching(['instant']));
    const images = new Set(idsMatching(['images']));

    expect(idsMatching(['instant', 'images'])).toEqual(
      cloudModels.map((model) => model.id).filter((id) => instant.has(id) && images.has(id)),
    );
  });
});
