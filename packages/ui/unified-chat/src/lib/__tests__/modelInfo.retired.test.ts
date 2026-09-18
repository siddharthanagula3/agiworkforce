import { describe, expect, it } from 'vitest';
import { listRetiredModels } from '@agiworkforce/model-registry';
import { getModelMetadataById } from '@agiworkforce/types';

import { getManagedModelPresentationLabel } from '../modelInfo';

const preserved = listRetiredModels().filter((record) => record.metadataPreserved);
const bare = listRetiredModels().filter((record) => !record.metadataPreserved);

describe('a turn answered by a model that has since been retired', () => {
  it('names the model the retirement record preserved', () => {
    const record = preserved[0];
    expect(record).toBeDefined();
    expect(getModelMetadataById(record!.id)).toBeNull();

    expect(getManagedModelPresentationLabel(record!.id)).toBe(record!.displayName);
  });

  it('still says unavailable when the retirement kept no name', () => {
    if (bare.length === 0) return;
    expect(getManagedModelPresentationLabel(bare[0]!.id)).toBe('Unavailable model');
  });

  it('keeps the free-pool disclosure on a retired model', () => {
    const record = preserved[0]!;
    expect(getManagedModelPresentationLabel(record.id, { freePool: true })).toBe(
      `${record.displayName} · via free pool`,
    );
  });
});
