import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_TITLE_MAX_CHARS,
  SAVE_ANSWER_AS_DOCUMENT_LABEL,
  documentTitleFromAnswer,
  normalizeArtifactTitle,
} from '../answer-document';

describe('documentTitleFromAnswer', () => {
  it('titles the document from its heading or first words', () => {
    expect(documentTitleFromAnswer('Intro\n\n## Trip **plan** for May\n\ntext')).toBe(
      'Trip plan for May',
    );
    expect(documentTitleFromAnswer('one two three four five six seven eight nine ten')).toBe(
      'one two three four five six seven eight…',
    );
    expect(documentTitleFromAnswer('See https://example.com/page for [notes](x)')).toBe(
      'See for notesx',
    );
    expect(documentTitleFromAnswer('   ')).toBe('Saved answer');
  });

  it('reads a heading after a long run of spaces', () => {
    expect(documentTitleFromAnswer(`#${' '.repeat(100_000)}\nPlan for May`)).toBe('Plan for May');
    expect(documentTitleFromAnswer(`Intro\n#${'  '.repeat(100_000)}`)).toBe('Saved answer');
  });

  it('labels the action and bounds a title the way the artifact store stores it', () => {
    expect(SAVE_ANSWER_AS_DOCUMENT_LABEL).toBe('Save as document');
    expect(normalizeArtifactTitle('  a \n b  ')).toBe('a b');
    expect(normalizeArtifactTitle('x'.repeat(ARTIFACT_TITLE_MAX_CHARS + 20))).toHaveLength(
      ARTIFACT_TITLE_MAX_CHARS,
    );
  });
});
