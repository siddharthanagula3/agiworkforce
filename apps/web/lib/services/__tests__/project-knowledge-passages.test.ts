import { describe, expect, it, vi } from 'vitest';

import { formatProjectSystemPrompt, loadProjectContext } from '../project-context-service';
import {
  PASSAGE_OVERLAP_CHARS,
  PASSAGE_WINDOW_CHARS,
  selectKnowledgePassages,
  windowDocument,
} from '../project-knowledge-passages';

/**
 * Ranking and selection used to disagree. `scoreKnowledgeFile` scored the whole
 * document, so a term anywhere in it raised the file's rank; selection then
 * sent `content.slice(0, limit)`. A question about the back half of a long file
 * retrieved exactly the right file and answered from the wrong part of it.
 *
 * The test that stood here asserted that behaviour: a sentinel at the end of a
 * 20,000 character document must NOT reach the prompt. It was a correct
 * description of a defect, so it is replaced rather than adjusted.
 */
const FILLER_SENTENCE =
  'The quarterly planning cadence continues as described in the previous section, with no change to the review schedule. ';

function documentWithAnswerAt(position: 'start' | 'middle' | 'end', answer: string): string {
  const filler = FILLER_SENTENCE.repeat(180);
  if (position === 'start') return `${answer}\n\n${filler}`;
  if (position === 'end') return `${filler}\n\n${answer}`;
  const half = Math.floor(filler.length / 2);
  return `${filler.slice(0, half)}\n\n${answer}\n\n${filler.slice(half)}`;
}

function stubDb(extractedText: string) {
  return vi
    .fn()
    .mockResolvedValueOnce([
      { id: 'proj-1', name: 'Launch Plan', description: null, instructions: null },
    ])
    .mockResolvedValueOnce([
      { file_name: 'handbook.md', summary: 'Company handbook', extracted_text: extractedText },
    ])
    .mockResolvedValueOnce([]);
}

async function promptFor(document: string, query: string): Promise<string> {
  const context = await loadProjectContext(
    { query: stubDb(document) },
    { projectId: 'proj-1', userId: 'user-1', currentUserQuery: query },
  );
  const prompt = formatProjectSystemPrompt(context!);
  expect(prompt).not.toBeNull();
  return prompt!;
}

describe('windowDocument', () => {
  it('covers the whole document', () => {
    const content = FILLER_SENTENCE.repeat(60);
    const windows = windowDocument(content);

    expect(windows[0]?.start).toBe(0);
    expect(windows.at(-1)?.end).toBe(content.length);
  });

  it('overlaps consecutive windows so a straddling sentence matches one of them', () => {
    const windows = windowDocument(FILLER_SENTENCE.repeat(60));

    expect(windows.length).toBeGreaterThan(1);
    for (let index = 1; index < windows.length; index += 1) {
      const previous = windows[index - 1]!;
      const current = windows[index]!;
      expect(current.start).toBeLessThan(previous.end);
      expect(previous.end - current.start).toBeLessThanOrEqual(PASSAGE_OVERLAP_CHARS + 300);
    }
  });

  it('returns one window for a document shorter than the window size', () => {
    expect(windowDocument('A short note.')).toEqual([
      { start: 0, end: 13, text: 'A short note.' },
    ]);
  });

  it('returns nothing for an empty document', () => {
    expect(windowDocument('')).toEqual([]);
  });
});

describe('selectKnowledgePassages', () => {
  it('sends a document whole when it fits, rather than selecting away context it had room for', () => {
    const selection = selectKnowledgePassages({
      content: 'Refunds are issued within 14 days.',
      query: 'refund window',
      budgetChars: 16_000,
    });

    expect(selection.strategy).toBe('whole');
    expect(selection.passages).toHaveLength(1);
  });

  it('falls back to the head when there is no query to rank against', () => {
    const content = FILLER_SENTENCE.repeat(400);
    const selection = selectKnowledgePassages({ content, query: '', budgetChars: 2_000 });

    expect(selection.strategy).toBe('head');
    expect(selection.passages[0]?.start).toBe(0);
  });

  it('falls back to the head when the document matches nothing in the query', () => {
    const content = FILLER_SENTENCE.repeat(400);
    const selection = selectKnowledgePassages({
      content,
      query: 'zzzyxwvu unrelated terminology',
      budgetChars: 2_000,
    });

    expect(selection.strategy).toBe('head');
  });

  it('stays inside the budget it was given', () => {
    const content = documentWithAnswerAt('end', 'The evacuation muster point is the north car park.');
    const selection = selectKnowledgePassages({
      content,
      query: 'evacuation muster point',
      budgetChars: PASSAGE_WINDOW_CHARS * 2,
    });

    const spent = selection.passages.reduce((total, passage) => total + passage.text.length, 0);
    expect(spent).toBeLessThanOrEqual(PASSAGE_WINDOW_CHARS * 2);
  });

  it('returns passages in document order, however they scored', () => {
    const content = documentWithAnswerAt('end', 'The evacuation muster point is the north car park.');
    const selection = selectKnowledgePassages({
      content,
      query: 'evacuation muster point car park',
      budgetChars: 8_000,
    });

    const starts = selection.passages.map((passage) => passage.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe('a project answer can reach any part of a long file', () => {
  it.each(['start', 'middle', 'end'] as const)(
    'includes the passage when the answer is at the %s',
    async (position) => {
      const answer = 'The evacuation muster point is the north car park.';
      const prompt = await promptFor(
        documentWithAnswerAt(position, answer),
        'where is the evacuation muster point?',
      );

      expect(prompt).toContain(answer);
    },
  );

  it('says the rest of the file was not included, and where each passage came from', async () => {
    const answer = 'The evacuation muster point is the north car park.';
    const prompt = await promptFor(
      documentWithAnswerAt('end', answer),
      'where is the evacuation muster point?',
    );

    expect(prompt).toContain('selected as the passages most relevant to this request');
    expect(prompt).toContain('fromCharacter');
    expect(prompt).toContain('the rest of the file is not included');
  });

  it('adds no excerpt marker when the whole file fits', async () => {
    const prompt = await promptFor('Pro costs $20 per month.', 'what does Pro cost?');

    expect(prompt).toContain('Pro costs $20 per month.');
    expect(prompt).not.toContain('excerptOf');
  });
});
