import { withoutArtifactMarker } from '@agiworkforce/artifacts';
import { normalizeArtifactTitle } from '@agiworkforce/unified-chat/answer-document';
import {
  FLASHCARDS_BLOCK,
  QUIZ_BLOCK,
  hasStudyBlocks,
  parseFlashcards,
  parseQuiz,
  studySegments,
} from '@agiworkforce/unified-chat/study-set';

const DOCUMENT_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['markdown', 'md']);
const DOCUMENT_ARTIFACT_LANGUAGES: ReadonlySet<string> = new Set(['markdown', 'md', '']);
const UNLABELLED_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['', 'text', 'plaintext']);

function studyBlockDocument(language: string, body: string): string | null {
  if (language !== QUIZ_BLOCK && language !== FLASHCARDS_BLOCK) return null;
  return `~~~${language}\n${body.replace(/\n+$/, '')}\n~~~`;
}

function studyDocument(body: string): string | null {
  const document = withoutArtifactMarker(body);
  return hasStudyBlocks(document) ? document : null;
}

/**
 * The study document a fenced block in an answer holds: a bare quiz or
 * flashcards fence, or a Markdown document that contains one. Null for any
 * other fence, which keeps its usual rendering.
 */
export function studyFenceContent(language: string, body: string): string | null {
  const fence = language.trim().toLowerCase();
  const block = studyBlockDocument(fence, body);
  if (block !== null) return block;
  if (DOCUMENT_FENCE_LANGUAGES.has(fence)) return studyDocument(body);
  if (UNLABELLED_FENCE_LANGUAGES.has(fence) && withoutArtifactMarker(body) !== body) {
    return studyDocument(body);
  }
  return null;
}

export function studyArtifactContent(language: string | undefined, content: string): string | null {
  const fence = language?.trim().toLowerCase() ?? '';
  const block = studyBlockDocument(fence, content);
  if (block !== null) return block;
  return DOCUMENT_ARTIFACT_LANGUAGES.has(fence) ? studyDocument(content) : null;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** A one-line summary of a study document that never reveals an answer. */
export function studySummary(document: string): string {
  const parts = studySegments(document).flatMap((segment) => {
    if (segment.kind === 'quiz') {
      const quiz = parseQuiz(segment.source);
      return quiz ? [`Quiz, ${countLabel(quiz.questions.length, 'question')}`] : [];
    }
    if (segment.kind === 'flashcards') {
      const set = parseFlashcards(segment.source);
      return set ? [`Flashcards, ${countLabel(set.cards.length, 'card')}`] : [];
    }
    return [];
  });
  return parts.join(' · ');
}

export function studyArtifactTitle(language: string | undefined, content: string): string | null {
  const document = studyArtifactContent(language, content);
  return document === null ? null : normalizeArtifactTitle(studyTitle(document)) || null;
}

export function studyTitle(document: string): string {
  for (const segment of studySegments(document)) {
    if (segment.kind === 'quiz') {
      const title = parseQuiz(segment.source)?.title;
      if (title) return title;
    } else if (segment.kind === 'flashcards') {
      const title = parseFlashcards(segment.source)?.title;
      if (title) return title;
    }
  }
  return '';
}
