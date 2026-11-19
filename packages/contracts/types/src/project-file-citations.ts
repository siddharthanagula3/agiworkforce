/**
 * @file Where in a project file an answer came from.
 *
 * A web citation is addressed by URL. A project-file citation is addressed by
 * file plus a position inside it: a page for a paginated document, a heading
 * trail for one with headings. Every field except `fileName` is optional, so a
 * surface that has not been taught to read anchors keeps parsing the list.
 */

export interface ProjectFileAnchor {
  /** 1-based page in the source document, for a paginated file. */
  page?: number;
  /** Heading trail above the passage, outermost segment first. */
  headingPath?: string[];
}

export interface ProjectFileCitation {
  fileName: string;
  fileId?: string;
  projectId?: string;
  /** The retrieved passage, clipped for display. */
  snippet?: string;
  anchor?: ProjectFileAnchor;
}

export const PROJECT_FILE_CITATIONS_METADATA_KEY = 'projectSources';
export const PROJECT_FILE_CITATIONS_HEADER = 'X-AGI-Project-Sources';

export const MAX_PROJECT_FILE_CITATIONS = 8;
export const MAX_PROJECT_FILE_CITATION_SNIPPET_CHARS = 160;
export const MAX_PROJECT_FILE_HEADING_SEGMENTS = 3;
export const MAX_PROJECT_FILE_HEADING_CHARS = 60;
export const MAX_PROJECT_FILE_NAME_CHARS = 200;

const HEADING_SEPARATOR = ' › ';

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

function parseAnchor(value: unknown): ProjectFileAnchor | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const page = Number(record['page']);
  if (Number.isFinite(page) && page > 0) return { page: Math.trunc(page) };
  const raw = record['headingPath'];
  if (!Array.isArray(raw)) return undefined;
  const headingPath = raw
    .flatMap((entry) => {
      const segment = clip(entry, MAX_PROJECT_FILE_HEADING_CHARS);
      return segment ? [segment] : [];
    })
    .slice(-MAX_PROJECT_FILE_HEADING_SEGMENTS);
  return headingPath.length > 0 ? { headingPath } : undefined;
}

/** Read an untrusted project-source list into the bounded shape a chip renders. */
export function parseProjectFileCitations(value: unknown): ProjectFileCitation[] {
  if (!Array.isArray(value)) return [];
  const citations: ProjectFileCitation[] = [];
  for (const entry of value) {
    if (citations.length >= MAX_PROJECT_FILE_CITATIONS) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const fileName = clip(record['fileName'], MAX_PROJECT_FILE_NAME_CHARS);
    if (!fileName) continue;
    const fileId = typeof record['fileId'] === 'string' ? record['fileId'] : undefined;
    const projectId = typeof record['projectId'] === 'string' ? record['projectId'] : undefined;
    const snippet = clip(record['snippet'], MAX_PROJECT_FILE_CITATION_SNIPPET_CHARS);
    const anchor = parseAnchor(record['anchor']);
    citations.push({
      fileName,
      ...(fileId ? { fileId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(snippet ? { snippet } : {}),
      ...(anchor ? { anchor } : {}),
    });
  }
  return citations;
}

/** How an anchor reads beside a file name: "p. 12", or "Pricing › Refunds". */
export function formatProjectFileAnchor(
  anchor: ProjectFileAnchor | null | undefined,
): string | null {
  if (!anchor) return null;
  if (typeof anchor.page === 'number' && anchor.page > 0) return `p. ${anchor.page}`;
  const path = anchor.headingPath?.filter((segment) => segment.trim().length > 0) ?? [];
  return path.length > 0 ? path.join(HEADING_SEPARATOR) : null;
}

/**
 * Two citations point at the same place when they name the same file and the
 * same anchor, which is what keeps three passages off one page from rendering
 * as three identical chips.
 */
export function projectFileCitationKey(citation: ProjectFileCitation): string {
  const location = formatProjectFileAnchor(citation.anchor) ?? '';
  return `${citation.fileId ?? citation.fileName}#${location}`;
}

export function dedupeProjectFileCitations(
  citations: readonly ProjectFileCitation[],
): ProjectFileCitation[] {
  const byKey = new Map<string, ProjectFileCitation>();
  for (const citation of citations) {
    const key = projectFileCitationKey(citation);
    if (!byKey.has(key)) byKey.set(key, citation);
    if (byKey.size >= MAX_PROJECT_FILE_CITATIONS) break;
  }
  return [...byKey.values()];
}

export const PROJECT_FILE_CITATION_FILE_PARAM = 'knowledgeFile';
export const PROJECT_FILE_CITATION_PAGE_PARAM = 'page';

export interface ProjectFileCitationTarget {
  projectId: string;
  fileId: string;
  page?: number;
}

export function projectFileCitationTarget(
  citation: ProjectFileCitation,
): ProjectFileCitationTarget | undefined {
  if (!citation.projectId || !citation.fileId) return undefined;
  const page = citation.anchor?.page;
  return {
    projectId: citation.projectId,
    fileId: citation.fileId,
    ...(typeof page === 'number' ? { page } : {}),
  };
}

export function projectFileCitationHref(citation: ProjectFileCitation): string | undefined {
  const target = projectFileCitationTarget(citation);
  if (!target) return undefined;
  const params = new URLSearchParams({
    [PROJECT_FILE_CITATION_FILE_PARAM]: target.fileId,
    ...(target.page !== undefined
      ? { [PROJECT_FILE_CITATION_PAGE_PARAM]: String(target.page) }
      : {}),
  });
  return `/chat/projects/${encodeURIComponent(target.projectId)}?${params.toString()}`;
}

// The passage the answer named leads, so the chip a reader wants is first even
// when one long file contributed a run of adjacent pages.
export function orderProjectFileCitationsByAnswer(
  citations: readonly ProjectFileCitation[],
  answerText: string,
): readonly ProjectFileCitation[] {
  if (!answerText) return citations;
  const named = (citation: ProjectFileCitation): boolean => {
    const location = formatProjectFileAnchor(citation.anchor);
    return Boolean(location && answerText.includes(location));
  };
  const cited = citations.filter(named);
  return cited.length === 0 || cited.length === citations.length
    ? citations
    : [...cited, ...citations.filter((citation) => !named(citation))];
}
