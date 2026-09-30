import { describe, expect, it } from 'vitest';
import { listRetiredModels } from '@agiworkforce/model-registry';

import {
  getModelMetadataById,
  getRetiredModelMetadataById,
  isCurrentModel,
  listChatModels,
  modelDisplayNameById,
} from '../model-catalog';

const preserved = listRetiredModels().filter((record) => record.metadataPreserved);
const bare = listRetiredModels().filter((record) => !record.metadataPreserved);

describe('retired model metadata', () => {
  it('uses the catalogued retirement date as the picker cutoff', () => {
    const model = listChatModels()[0]!;
    const dated = { ...model, deprecation_date: '2026-09-27' };
    expect(isCurrentModel(dated, Date.parse('2026-09-26T23:59:59Z'))).toBe(true);
    expect(isCurrentModel(dated, Date.parse('2026-09-27T00:00:00Z'))).toBe(false);
    expect(isCurrentModel({ ...model, deprecated: true }, 0)).toBe(false);
  });

  it('has something to read: the registry preserves at least one retirement', () => {
    expect(preserved.length).toBeGreaterThan(0);
  });

  it('answers for an id the live catalogue has dropped', () => {
    const record = preserved[0]!;
    expect(getModelMetadataById(record.id)).toBeNull();

    const retired = getRetiredModelMetadataById(record.id);
    expect(retired?.id).toBe(record.id);
    expect(retired?.name).toBe(record.displayName);
    expect(retired?.metadataPreserved).toBe(true);
  });

  it('says a retirement kept no snapshot rather than inventing one', () => {
    if (bare.length === 0) return;
    const retired = getRetiredModelMetadataById(bare[0]!.id);
    expect(retired?.metadataPreserved).toBe(false);
    expect(retired?.name).toBe(bare[0]!.id);
    expect(retired?.provider).toBeUndefined();
  });

  it('returns null for a live model and for an id nothing knows', () => {
    expect(getRetiredModelMetadataById('not-a-model-id')).toBeNull();
    expect(getRetiredModelMetadataById(null)).toBeNull();
    expect(getRetiredModelMetadataById('  ')).toBeNull();
  });

  it('names a stored row from the live catalogue first, then the retirement record', () => {
    const record = preserved[0]!;
    expect(modelDisplayNameById(record.id)).toBe(record.displayName);
    expect(modelDisplayNameById('not-a-model-id')).toBe('not-a-model-id');
    expect(modelDisplayNameById(null)).toBeNull();
  });
});
