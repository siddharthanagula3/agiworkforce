import 'server-only';

import type { ChatLargeFilePolicy } from '@/lib/chat-attachment-policy';
import {
  extractOfficeDocumentText,
  officeDocumentKind,
  OfficeDocumentUnreadableError,
  type OfficeDocumentFailureReason,
} from '@/lib/server/office-document-text';
import { PreparationRefusedError, type PreparationFailureReason } from './progress-store';
import { MAX_OUTLINE_TITLE_CHARS, type PreparedOutlineAnchor } from './derived-keys';
import { sliceWholeCodePoints } from './text-stream';

const MAX_OUTLINE_ANCHORS = 100;
const HEADING = /^(#{1,6}) (.+)$/;

const REFUSAL_BY_OFFICE_REASON: Readonly<
  Record<OfficeDocumentFailureReason, PreparationFailureReason>
> = {
  corrupt: 'unreadable',
  encrypted: 'encrypted',
  archive_bomb: 'archive_bomb',
  macro_present: 'macro_present',
};

export interface PreparedOfficeText {
  text: string;
  outline: PreparedOutlineAnchor[];
  truncated: boolean;
  slidesOmitted: number;
}

function outlineOf(text: string): PreparedOutlineAnchor[] {
  const anchors: PreparedOutlineAnchor[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      const title = sliceWholeCodePoints(heading[2]!.trim(), MAX_OUTLINE_TITLE_CHARS).trimEnd();
      anchors.push({ title, level: heading[1]!.length - 1, char: offset });
      if (anchors.length >= MAX_OUTLINE_ANCHORS) break;
    }
    offset += line.length + 1;
  }
  return anchors;
}

/**
 * A DOCX or PPTX read within the archive budget, sized from its text parts
 * only: a declared total over the budget is refused before anything inflates,
 * and media members are neither counted nor inflated.
 */
export async function prepareOfficeText(input: {
  data: Uint8Array;
  fileName: string;
  mimeType: string;
  policy: ChatLargeFilePolicy;
}): Promise<PreparedOfficeText> {
  const kind = officeDocumentKind(input.fileName, input.mimeType);
  if (kind !== 'docx' && kind !== 'pptx') throw new PreparationRefusedError('unreadable');
  const maxChars = input.policy.preparation.maxTextChars;
  const coverage = { slidesOmitted: 0 };
  let text: string;
  try {
    text = await extractOfficeDocumentText(
      Buffer.from(input.data.buffer, input.data.byteOffset, input.data.byteLength),
      input.fileName,
      kind,
      { sizing: 'text-parts', maxSlides: input.policy.kinds.office.maxSlides, maxChars, coverage },
    );
  } catch (error) {
    if (error instanceof OfficeDocumentUnreadableError) {
      throw new PreparationRefusedError(REFUSAL_BY_OFFICE_REASON[error.reason]);
    }
    if (error instanceof RangeError) throw new PreparationRefusedError('unreadable');
    throw error;
  }
  const truncated = text.length > maxChars;
  const bounded = truncated ? sliceWholeCodePoints(text, maxChars) : text;
  return {
    text: bounded,
    outline: outlineOf(bounded),
    truncated,
    slidesOmitted: coverage.slidesOmitted,
  };
}
