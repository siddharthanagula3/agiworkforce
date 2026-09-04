export const MAX_IMPORT_TEXT_CHARS = 200_000;
export const MAX_IMPORT_ITEMS = 500;
export const MAX_IMPORT_ITEM_CHARS = 10_000;
export const MAX_IMPORT_SOURCE_NAME_CHARS = 60;

export const IMPORT_SOURCE_PREFIX = 'imported:';

export class ImportTextTooLargeError extends Error {
  constructor(readonly maxChars: number) {
    super(`Pasted memory text exceeds ${maxChars} characters`);
    this.name = 'ImportTextTooLargeError';
  }
}

export type ImportedTextFormat = 'json' | 'text';

export interface ParsedImportResult {
  items: string[];
  format: ImportedTextFormat;
  totalCandidates: number;
  itemsTruncated: boolean;
}

export interface ImportPreviewItem {
  content: string;
  normalizedKey: string;
  duplicate: boolean;
}

export function normalizeMemoryKey(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function clamp(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 1))}…` : value;
}

export function clampImportItemLength(value: string): string {
  return clamp(value, MAX_IMPORT_ITEM_CHARS);
}

const BULLET_PREFIX_RE = /^\s*(?:[-*•‣–]|\u2014|\d+[.)])\s+/u;

function splitTextCandidates(raw: string): string[] {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.replace(BULLET_PREFIX_RE, '').trim())
    .filter((line) => line.length > 0);
}

function jsonEntryToCandidate(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    if (typeof record['text'] === 'string') return record['text'];
    if (typeof record['content'] === 'string') return record['content'];
  }
  return null;
}

function tryParseJsonCandidates(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const candidates: string[] = [];
  for (const entry of parsed) {
    const candidate = jsonEntryToCandidate(entry);
    if (candidate !== null) candidates.push(candidate);
  }
  return candidates;
}

export function parseImportedMemoryText(raw: string): ParsedImportResult {
  if (raw.length > MAX_IMPORT_TEXT_CHARS) {
    throw new ImportTextTooLargeError(MAX_IMPORT_TEXT_CHARS);
  }

  const jsonCandidates = tryParseJsonCandidates(raw);
  const format: ImportedTextFormat = jsonCandidates !== null ? 'json' : 'text';
  const rawCandidates = jsonCandidates ?? splitTextCandidates(raw);

  const seen = new Set<string>();
  const items: string[] = [];
  for (const candidate of rawCandidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const normalizedKey = normalizeMemoryKey(trimmed);
    if (!normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    items.push(clampImportItemLength(trimmed));
  }

  const totalCandidates = items.length;
  const itemsTruncated = items.length > MAX_IMPORT_ITEMS;
  return {
    items: itemsTruncated ? items.slice(0, MAX_IMPORT_ITEMS) : items,
    format,
    totalCandidates,
    itemsTruncated,
  };
}

export function buildImportPreview(
  items: readonly string[],
  existingNormalizedKeys: ReadonlySet<string>,
): ImportPreviewItem[] {
  return items.map((content) => {
    const normalizedKey = normalizeMemoryKey(content);
    return { content, normalizedKey, duplicate: existingNormalizedKeys.has(normalizedKey) };
  });
}

export function normalizeImportSourceName(raw: string): string {
  const trimmed = raw.trim().slice(0, MAX_IMPORT_SOURCE_NAME_CHARS);
  return trimmed.length > 0 ? trimmed : 'Other';
}

export function importSourceValue(sourceName: string): string {
  const slug = normalizeImportSourceName(sourceName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return `${IMPORT_SOURCE_PREFIX}${slug || 'other'}`;
}

export function isImportedSource(source: string | null | undefined): boolean {
  return typeof source === 'string' && source.startsWith(IMPORT_SOURCE_PREFIX);
}

const KNOWN_IMPORT_SOURCE_LABELS: Readonly<Record<string, string>> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  copilot: 'Copilot',
  other: 'another assistant',
};

export function importSourceDisplayName(source: string | null | undefined): string | null {
  if (!isImportedSource(source)) return null;
  const slug = source!.slice(IMPORT_SOURCE_PREFIX.length);
  const known = KNOWN_IMPORT_SOURCE_LABELS[slug];
  if (known) return known;
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}
