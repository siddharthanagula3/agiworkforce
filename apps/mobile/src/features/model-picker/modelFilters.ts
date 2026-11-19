import { getModelMetadataById } from '@agiworkforce/types';
import type { ModelDef } from './service';

export type ModelFilterId = 'instant' | 'economy' | 'images' | 'files';

export interface ModelFilter {
  id: ModelFilterId;
  label: string;
  matches: (model: ModelDef) => boolean;
}

export const MODEL_FILTERS: readonly ModelFilter[] = [
  {
    id: 'instant',
    label: 'Instant',
    matches: (model) => getModelMetadataById(model.id)?.speed === 'very-fast',
  },
  {
    id: 'economy',
    label: 'Economy',
    matches: (model) => model.tier === 'economy',
  },
  {
    id: 'images',
    label: 'Images',
    matches: (model) => model.supportsVision,
  },
  {
    id: 'files',
    label: 'Files',
    matches: (model) => {
      const metadata = getModelMetadataById(model.id);
      return (
        metadata?.documentInput !== undefined || (metadata?.inputModalities ?? []).includes('pdf')
      );
    },
  },
];

export function matchesModelFilters(model: ModelDef, active: readonly ModelFilterId[]): boolean {
  return MODEL_FILTERS.every((filter) => !active.includes(filter.id) || filter.matches(model));
}
