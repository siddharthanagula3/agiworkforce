import { DEVELOPER_LABELS, getProviderOffering, modelsCatalog } from './model-catalog';

const VERSION_SUFFIX = /^(.+?)-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4}|latest|preview)$/;
const SNAPSHOT_STAMP = /^[\d-]+$/;
const PARAMETER_COUNT = /^a?\d+(\.\d+)?[bkmt]$/i;
const VOWELLESS_ACRONYM = /^[b-df-hj-np-tv-z]{2,4}$/i;
const FAMILY_PREFIX = /^[a-z]+/i;
const GENERATION = /\d+(?:\.\d+)*/;
const NAME_WORD_SEPARATORS = /[\s:()/,-]+/;

export interface ProviderOfferingLabel {
  name: string;
  version: string | null;
  displayName: string;
  family: string;
  generation: readonly number[];
}

let registryNames: ReadonlyMap<string, string> | null = null;
let wordCasing: ReadonlyMap<string, string> | null = null;

function registryNameFor(providerModelId: string): string | null {
  if (!registryNames) {
    const names = new Map<string, string>();
    for (const [id, model] of Object.entries(modelsCatalog.models)) {
      names.set(id, model.name);
      if (model.apiModelId) names.set(model.apiModelId, model.name);
    }
    registryNames = names;
  }
  return registryNames.get(providerModelId) ?? null;
}

function casingFor(word: string): string | null {
  if (!wordCasing) {
    const forms = new Map<string, Map<string, number>>();
    const names = [
      ...Object.values(modelsCatalog.models).map((model) => model.name),
      ...Object.values(DEVELOPER_LABELS),
    ];
    for (const name of names) {
      for (const form of name.split(NAME_WORD_SEPARATORS)) {
        if (!form || form === form.toLowerCase()) continue;
        const counts = forms.get(form.toLowerCase()) ?? new Map<string, number>();
        counts.set(form, (counts.get(form) ?? 0) + 1);
        forms.set(form.toLowerCase(), counts);
      }
    }
    wordCasing = new Map(
      [...forms].map(([key, counts]) => [
        key,
        [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0],
      ]),
    );
  }
  return wordCasing.get(word.toLowerCase()) ?? null;
}

function humanizeWord(word: string): string {
  const known = casingFor(word);
  if (known) return known;
  if (PARAMETER_COUNT.test(word) || VOWELLESS_ACRONYM.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function humanize(providerModelId: string): string {
  return providerModelId.split('-').filter(Boolean).map(humanizeWord).join(' ');
}

function versionLabel(marker: string): string {
  return SNAPSHOT_STAMP.test(marker) ? `Snapshot ${marker}` : humanizeWord(marker);
}

function generationOf(id: string): number[] {
  return (GENERATION.exec(id)?.[0] ?? '').split('.').filter(Boolean).map(Number);
}

function label(name: string, version: string | null, baseId: string): ProviderOfferingLabel {
  return {
    name,
    version,
    displayName: version ? `${name} (${version})` : name,
    family: (FAMILY_PREFIX.exec(baseId)?.[0] ?? baseId).toLowerCase(),
    generation: generationOf(baseId),
  };
}

export function providerOfferingLabel(key: string): ProviderOfferingLabel | null {
  const offering = getProviderOffering(key);
  if (!offering) return null;
  const id = offering.providerModelId;
  if (!id) return label(offering.displayName, null, offering.displayName);
  if (offering.displayName !== id) return label(offering.displayName, null, id);
  const exact = registryNameFor(id);
  if (exact) return label(exact, null, id);
  const variant = VERSION_SUFFIX.exec(id);
  const base = variant?.[1];
  const marker = variant?.[2];
  if (!base || !marker) return label(humanize(id), null, id);
  return label(registryNameFor(base) ?? humanize(base), versionLabel(marker), base);
}

export function providerOfferingDisplayName(key: string): string | null {
  return providerOfferingLabel(key)?.displayName ?? null;
}

export function providerOfferingFamilyName(family: string): string {
  return humanizeWord(family);
}
