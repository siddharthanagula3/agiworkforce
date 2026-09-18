import {
  PROJECT_FILE_CITATIONS_METADATA_KEY,
  WEB_SEARCH_CITATION_DELTA_KEY,
  dedupeProjectFileCitations,
  formatProjectFileAnchor,
  parseProjectFileCitations,
  type ProjectFileCitation,
} from '@agiworkforce/types';

export const MAX_WEB_CITATIONS = 8;
const MAX_CITATION_TITLE_CHARS = 120;

export interface ChatCitationChip {
  kind: 'web' | 'project';
  /** What the chip reads: a site host or a file name. */
  label: string;
  /** The position inside the source, when the source has one. */
  detail: string | null;
  href: string | null;
  title: string;
}

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

// Only http(s) survives: a citation is rendered as a link a click will follow,
// so a javascript: or vscode: URL a model produced must never reach the webview.
function safeUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export function webCitationChips(value: unknown): ChatCitationChip[] {
  if (!Array.isArray(value)) return [];
  const byHref = new Map<string, ChatCitationChip>();
  for (const entry of value) {
    if (byHref.size >= MAX_WEB_CITATIONS) break;
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const url = safeUrl(record['url']);
    if (!url || byHref.has(url.href)) continue;
    const title =
      typeof record['title'] === 'string' ? clip(record['title'], MAX_CITATION_TITLE_CHARS) : '';
    byHref.set(url.href, {
      kind: 'web',
      label: url.hostname.replace(/^www\./, ''),
      detail: null,
      href: url.href,
      title: title || url.href,
    });
  }
  return [...byHref.values()];
}

export function projectCitationChips(value: unknown): ChatCitationChip[] {
  return dedupeProjectFileCitations(parseProjectFileCitations(value)).map(
    (citation: ProjectFileCitation) => ({
      kind: 'project' as const,
      label: citation.fileName,
      detail: formatProjectFileAnchor(citation.anchor),
      href: null,
      title: citation.snippet ?? citation.fileName,
    }),
  );
}

/**
 * The sources under one assistant answer, in the order a reader meets them:
 * the project files the answer was grounded in, then the pages it searched.
 */
export function citationChips(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return [];
  return [
    ...projectCitationChips(metadata[PROJECT_FILE_CITATIONS_METADATA_KEY]),
    ...webCitationChips(metadata[WEB_SEARCH_CITATION_DELTA_KEY]),
  ];
}

export function citationChipKey(chip: ChatCitationChip): string {
  return `${chip.kind}:${chip.href ?? chip.label}#${chip.detail ?? ''}`;
}
