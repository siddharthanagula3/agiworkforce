import {
  parseProjectFileCitations,
  PROJECT_FILE_CITATIONS_HEADER,
  type ProjectFileCitation,
} from '@agiworkforce/types';

export { PROJECT_FILE_CITATIONS_HEADER };

/**
 * A header, not a stream frame: the passages are chosen before the first token,
 * and every stream path this route can take already assembles its headers from
 * `processed`, while each assembles its frames differently.
 */
const MAX_PROJECT_SOURCES_HEADER_CHARS = 6_000;

function encodeHeaderValue(value: unknown): string | null {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  } catch {
    return null;
  }
}

export function toProjectSourcesHeaderValue(
  citations: readonly ProjectFileCitation[] | undefined,
): string | null {
  if (!citations?.length) return null;
  const full = encodeHeaderValue(citations);
  if (full && full.length <= MAX_PROJECT_SOURCES_HEADER_CHARS) return full;
  const lean = encodeHeaderValue(citations.map(({ snippet: _snippet, ...rest }) => rest));
  return lean && lean.length <= MAX_PROJECT_SOURCES_HEADER_CHARS ? lean : null;
}

export function addProjectSourcesHeader(
  headers: Record<string, string>,
  source: { projectSources?: readonly ProjectFileCitation[] | undefined },
): void {
  const value = toProjectSourcesHeaderValue(source.projectSources);
  if (value) headers[PROJECT_FILE_CITATIONS_HEADER] = value;
}

export function readProjectSourcesHeaderValue(value: string | null): ProjectFileCitation[] {
  if (!value) return [];
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return parseProjectFileCitations(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}
