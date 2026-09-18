import {
  parseProjectFileCitations,
  PROJECT_FILE_CITATIONS_HEADER,
  type ProjectFileCitation,
} from '@agiworkforce/types';
import type { PastChatCitationView } from '@/features/chat/components/messages/CitationPastChats';

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
  source: {
    projectSources?: readonly ProjectFileCitation[] | undefined;
    pastChatSources?: readonly PastChatCitationView[] | undefined;
  },
): void {
  const value = toProjectSourcesHeaderValue(source.projectSources);
  if (value) headers[PROJECT_FILE_CITATIONS_HEADER] = value;
  const pastChats = toPastChatSourcesHeaderValue(source.pastChatSources);
  if (pastChats) headers[PAST_CHAT_CITATIONS_HEADER] = pastChats;
}

export const PAST_CHAT_CITATIONS_HEADER = 'x-agi-past-chat-citations';

export function toPastChatSourcesHeaderValue(
  citations: readonly PastChatCitationView[] | undefined,
): string | null {
  if (!citations?.length) return null;
  const encoded = encodeHeaderValue(citations);
  return encoded && encoded.length <= MAX_PROJECT_SOURCES_HEADER_CHARS ? encoded : null;
}

function isPastChatCitation(value: unknown): value is PastChatCitationView {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['id'] === 'string' &&
    typeof row['conversationId'] === 'string' &&
    typeof row['messageId'] === 'string' &&
    typeof row['title'] === 'string' &&
    typeof row['createdAt'] === 'string'
  );
}

export function readPastChatSourcesHeaderValue(value: string | null): PastChatCitationView[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeHeaderBytes(value)));
    return Array.isArray(parsed) ? parsed.filter(isPastChatCitation) : [];
  } catch {
    return [];
  }
}

function decodeHeaderBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function readProjectSourcesHeaderValue(value: string | null): ProjectFileCitation[] {
  if (!value) return [];
  try {
    return parseProjectFileCitations(
      JSON.parse(new TextDecoder().decode(decodeHeaderBytes(value))),
    );
  } catch {
    return [];
  }
}
