import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { isSelectable } from './model-presentation';

export const COMPARE_ANSWERS_PATH = '/models/compare';
export const COMPARE_MODEL_PARAM = 'model';
export const COMPARE_ANSWER_MINIMUM = 2;
export const COMPARE_ANSWER_LIMIT = 3;

export function compareAnswersHref(modelIds: readonly string[]): string {
  const params = new URLSearchParams();
  for (const modelId of modelIds) params.append(COMPARE_MODEL_PARAM, modelId);
  const query = params.toString();
  return query ? `${COMPARE_ANSWERS_PATH}?${query}` : COMPARE_ANSWERS_PATH;
}

export function answerableEntries(
  entries: readonly ModelCatalogueEntry[],
): readonly ModelCatalogueEntry[] {
  return entries.filter(isSelectable);
}

export function initialCompareModelIds(
  entries: readonly ModelCatalogueEntry[],
  requested: readonly string[],
  preferred: readonly string[],
): string[] {
  const answerable = answerableEntries(entries);
  const byId = new Map(answerable.map((entry) => [entry.id, entry]));
  const chosen: ModelCatalogueEntry[] = [];
  const add = (entry: ModelCatalogueEntry | undefined, limit: number) => {
    if (entry && chosen.length < limit && !chosen.includes(entry)) chosen.push(entry);
  };

  for (const modelId of requested) add(byId.get(modelId), COMPARE_ANSWER_LIMIT);
  for (const modelId of preferred) add(byId.get(modelId), COMPARE_ANSWER_MINIMUM);

  const fallback = [
    ...answerable.filter((entry) => !entry.isRouter),
    ...answerable.filter((entry) => entry.isRouter),
  ];
  for (const entry of fallback) {
    if (!chosen.some((picked) => picked.developer === entry.developer)) {
      add(entry, COMPARE_ANSWER_MINIMUM);
    }
  }
  for (const entry of fallback) add(entry, COMPARE_ANSWER_MINIMUM);

  return chosen.map((entry) => entry.id);
}
