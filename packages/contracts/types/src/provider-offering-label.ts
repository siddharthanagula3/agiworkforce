import {
  DEVELOPER_LABELS,
  getProviderOffering,
  getProviderOfferings,
  modelsCatalog,
  type ProviderOffering,
} from './model-catalog';

const VERSION_SUFFIX = /^(.+?)-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4}|latest|preview)$/;
const FULL_STAMP = /^(\d{4})-?(\d{2})-?(\d{2})$/;
const SHORT_STAMP = /^(\d{2})(\d{2})$/;
const RELEASE_CHANNEL = /^[a-z]+$/i;
const LEAD = /^([a-z]+)-?([a-z]?)(\d+(?:\.\d+)*)(?=-|$)/i;
const PARAMETER_COUNT = /^a?\d+(\.\d+)?[bkmt]$/i;
const GENERATION_MARK = /^[a-z]?\d+(\.\d+)*$/i;
const MODE_ACRONYM = /^[a-z]+\d[a-z]+$/i;
const VOWELLESS_ACRONYM = /^[b-df-hj-np-tv-z]{2,4}$/i;
const FAMILY_PREFIX = /^[a-z]+/i;
const GENERATION = /\d+(?:\.\d+)*/;
const NAME_WORD_SEPARATORS = /[\s:()/,-]+/;
const STAMP_LOCALE = 'en-US';
const STAMP_CENTURY = 2000;
const LEAP_YEAR = 2000;
const FULL_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };

export interface ProviderOfferingLabel {
  name: string;
  version: string | null;
  displayName: string;
  family: string;
  line: string;
  generation: readonly number[];
}

interface LeadSpelling {
  word: string;
  joiner: string;
  mark: string;
}

let registryNames: ReadonlyMap<string, string> | null = null;
let wordCasing: ReadonlyMap<string, string> | null = null;
let leadSpellings: ReadonlyMap<string, LeadSpelling> | null = null;
const labels = new Map<string, ProviderOfferingLabel>();

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
    wordCasing = new Map([...forms].map(([key, counts]) => [key, mostFrequent(counts)]));
  }
  return wordCasing.get(word.toLowerCase()) ?? null;
}

function mostFrequent<T>(counts: ReadonlyMap<T, number>): T {
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

function spellingIn(name: string, lead: RegExpExecArray): LeadSpelling | null {
  const [, word = '', mark = '', generation = ''] = lead;
  const markAt = name.indexOf(generation) - mark.length;
  const markSpelled = name.slice(markAt, markAt + mark.length);
  if (markAt <= 0 || markSpelled.toLowerCase() !== mark.toLowerCase()) return null;
  const prefix = name.slice(0, markAt);
  const spelled = prefix.replace(/[\s-]+$/, '');
  if (spelled.toLowerCase() !== word.toLowerCase()) return null;
  return { word: spelled, joiner: prefix.slice(spelled.length), mark: markSpelled };
}

function leadSpellingFor(word: string): LeadSpelling | null {
  if (!leadSpellings) {
    const votes = new Map<string, Map<string, number>>();
    const spellings = new Map<string, LeadSpelling>();
    for (const offering of Object.values(getProviderOfferings())) {
      const id = offering.providerModelId;
      const name = id ? registryNameFor(id) : null;
      const lead = id ? LEAD.exec(id) : null;
      const spelling = name && lead ? spellingIn(name, lead) : null;
      if (!spelling || !lead) continue;
      const key = JSON.stringify(spelling);
      const family = lead[1]!.toLowerCase();
      const counts = votes.get(family) ?? new Map<string, number>();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      votes.set(family, counts);
      spellings.set(key, spelling);
    }
    leadSpellings = new Map(
      [...votes].map(([family, counts]) => [family, spellings.get(mostFrequent(counts))!]),
    );
  }
  return leadSpellings.get(word.toLowerCase()) ?? null;
}

function humanizeWord(word: string): string {
  const known = casingFor(word);
  if (known) return known;
  if (PARAMETER_COUNT.test(word) || VOWELLESS_ACRONYM.test(word) || MODE_ACRONYM.test(word)) {
    return word.toUpperCase();
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function humanize(providerModelId: string): string {
  const lead = LEAD.exec(providerModelId);
  const spelling = lead ? leadSpellingFor(lead[1]!) : null;
  if (!lead || !spelling) {
    return providerModelId.split('-').filter(Boolean).map(humanizeWord).join(' ');
  }
  const [head, , mark = '', generation = ''] = lead;
  const markSpelled =
    spelling.mark.toLowerCase() === mark.toLowerCase() ? spelling.mark : mark.toUpperCase();
  return [
    `${spelling.word}${spelling.joiner}${markSpelled}${generation}`,
    ...providerModelId.slice(head.length).split('-').filter(Boolean).map(humanizeWord),
  ].join(' ');
}

function lineOf(baseId: string): string {
  const lead = LEAD.exec(baseId);
  const word = lead?.[1];
  const rest = (lead ? baseId.slice(lead[0].length) : baseId).split('-').filter(Boolean);
  return [
    ...(word ? [leadSpellingFor(word)?.word ?? humanizeWord(word)] : []),
    ...rest
      .filter((part) => !GENERATION_MARK.test(part) && !PARAMETER_COUNT.test(part))
      .map(humanizeWord),
  ].join(' ');
}

function calendarDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function stampDate(stamp: string): string | null {
  const full = FULL_STAMP.exec(stamp)?.slice(1).map(Number);
  const short = SHORT_STAMP.exec(stamp)?.slice(1).map(Number);
  const readings: Array<[Date | null, Intl.DateTimeFormatOptions]> = full
    ? [[calendarDate(full[0]!, full[1]!, full[2]!), FULL_DATE]]
    : short
      ? [
          [calendarDate(LEAP_YEAR, short[0]!, short[1]!), MONTH_DAY],
          [calendarDate(STAMP_CENTURY + short[0]!, short[1]!, 1), MONTH_YEAR],
        ]
      : [];
  const [date, options] = readings.find(([reading]) => reading) ?? [];
  return date
    ? new Intl.DateTimeFormat(STAMP_LOCALE, { ...options, timeZone: 'UTC' }).format(date)
    : null;
}

function versionLabel(marker: string): string | null {
  const date = stampDate(marker);
  if (date) return `Snapshot ${date}`;
  return RELEASE_CHANNEL.test(marker) ? humanizeWord(marker) : null;
}

function generationOf(id: string): number[] {
  return (GENERATION.exec(id)?.[0] ?? '').split('.').filter(Boolean).map(Number);
}

function label(
  name: string,
  version: string | null,
  baseId: string,
  line = lineOf(baseId),
): ProviderOfferingLabel {
  return {
    name,
    version,
    displayName: version ? `${name} (${version})` : name,
    family: (FAMILY_PREFIX.exec(baseId)?.[0] ?? baseId).toLowerCase(),
    line,
    generation: generationOf(baseId),
  };
}

function resolveLabel(offering: ProviderOffering): ProviderOfferingLabel {
  const id = offering.providerModelId;
  if (!id) return label(offering.displayName, null, offering.displayName, offering.displayName);
  if (offering.displayName !== id) return label(offering.displayName, null, id);
  const exact = registryNameFor(id);
  if (exact) return label(exact, null, id);
  const variant = VERSION_SUFFIX.exec(id);
  const base = variant?.[1];
  const version = variant?.[2] ? versionLabel(variant[2]) : null;
  if (!base || !version) return label(humanize(id), null, id);
  return label(registryNameFor(base) ?? humanize(base), version, base);
}

export function providerOfferingLabel(key: string): ProviderOfferingLabel | null {
  const offering = getProviderOffering(key);
  if (!offering) return null;
  const known = labels.get(key);
  if (known) return known;
  const resolved = resolveLabel(offering);
  labels.set(key, resolved);
  return resolved;
}

export function providerOfferingDisplayName(key: string): string | null {
  return providerOfferingLabel(key)?.displayName ?? null;
}
