import {
  PAST_CHAT_CITATIONS_HEADER,
  PROJECT_FILE_CITATIONS_HEADER,
  parsePastChatCitations,
  parseProjectFileCitations,
} from '@agiworkforce/types';
import type { PastChatCitation, ProjectFileCitation } from '@agiworkforce/types';

export {
  PAST_CHAT_CITATIONS_HEADER,
  PAST_CHAT_CITATIONS_METADATA_KEY,
  PAST_CHAT_HIGHLIGHT_PARAM,
  parsePastChatCitations,
  pastChatCitationDate,
  pastChatCitationsFromMetadata,
} from '@agiworkforce/types';
export type { PastChatCitation } from '@agiworkforce/types';

function decodeBase64Json(value: string): unknown {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function readPastChatCitationsHeader(headers: Pick<Headers, 'get'>): PastChatCitation[] {
  const value = headers.get(PAST_CHAT_CITATIONS_HEADER);
  if (!value) return [];
  try {
    return parsePastChatCitations(decodeBase64Json(value));
  } catch {
    return [];
  }
}

export function readProjectFileCitationsHeader(
  headers: Pick<Headers, 'get'>,
): ProjectFileCitation[] {
  const value = headers.get(PROJECT_FILE_CITATIONS_HEADER);
  if (!value) return [];
  try {
    return parseProjectFileCitations(decodeBase64Json(value));
  } catch {
    return [];
  }
}
