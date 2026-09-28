export const ATTACHMENTS_TRUNCATED_HEADER = 'X-AGI-Attachments-Truncated';

const MAX_HEADER_VALUE_CHARS = 2_000;
const MAX_NAMED_ATTACHMENTS = 10;

function encodeNames(names: readonly string[]): string {
  return encodeURIComponent(JSON.stringify(names));
}

function formatNameList(names: readonly string[]): string {
  if (typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
  }
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function toAttachmentTruncationHeaderValue(
  names: readonly string[] | undefined,
): string | null {
  const kept: string[] = [];
  for (const name of (names ?? []).slice(0, MAX_NAMED_ATTACHMENTS)) {
    if (encodeNames([...kept, name]).length > MAX_HEADER_VALUE_CHARS) break;
    kept.push(name);
  }
  return kept.length > 0 ? encodeNames(kept) : null;
}

export function addAttachmentTruncationHeader(
  headers: Record<string, string>,
  source: { truncatedAttachments?: readonly string[] | undefined },
): void {
  const value = toAttachmentTruncationHeaderValue(source.truncatedAttachments);
  if (value) headers[ATTACHMENTS_TRUNCATED_HEADER] = value;
}

export function readAttachmentTruncationHeader(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .slice(0, MAX_NAMED_ATTACHMENTS);
  } catch {
    return [];
  }
}

export function describeAttachmentTruncation(names: readonly string[] | undefined): string | null {
  if (!names || names.length === 0) return null;
  if (names.length === 1) {
    return `Only part of ${names[0]} was read because it is too long to read in full.`;
  }
  return `Only part of each of these files was read because they are too long to read in full: ${formatNameList(names)}.`;
}
