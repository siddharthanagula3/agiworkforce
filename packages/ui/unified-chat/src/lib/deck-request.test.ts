import { describe, expect, it } from 'vitest';
import { MAX_INLINE_DOCUMENT_CHARS, artifactReplyFormat } from './artifact-edit-request';
import { REWRITE_SLIDE_INSTRUCTION, buildSlideEditRequest } from './deck-request';

const SLIDE = '## Revenue\n\n- Up 12% on last year';

describe('buildSlideEditRequest', () => {
  it('scopes the turn to one slide and keeps the rest of the deck as it is', () => {
    const prompt = buildSlideEditRequest({
      title: 'Quarterly review',
      slideIndex: 1,
      slideCount: 4,
      slide: SLIDE,
      instruction: '  Add the margin  ',
    });

    expect(prompt).toBe(
      [
        'Edit the presentation "Quarterly review". Change only slide 2 of 4 as described and keep every other slide exactly as it is, including the title and the slide order.',
        '',
        'Slide 2 now reads:',
        '```markdown',
        SLIDE,
        '```',
        '',
        'Requested change: Add the margin',
        '',
        artifactReplyFormat('presentation'),
      ].join('\n'),
    );
  });

  it('includes the edited deck only while it fits inline', () => {
    const deck = `<!-- deck -->\n${SLIDE}`;
    const withDeck = buildSlideEditRequest({
      title: 'Deck',
      slideIndex: 0,
      slideCount: 1,
      slide: SLIDE,
      instruction: REWRITE_SLIDE_INSTRUCTION,
      currentDeck: deck,
    });
    expect(withDeck).toContain(
      'The presentation was edited since you last wrote it. Start from this current version:\n```markdown\n<!-- deck -->',
    );
    expect(withDeck).toContain(`Requested change: ${REWRITE_SLIDE_INSTRUCTION}`);

    const tooLong = buildSlideEditRequest({
      title: 'Deck',
      slideIndex: 0,
      slideCount: 1,
      slide: SLIDE,
      instruction: 'Shorter',
      currentDeck: 'x'.repeat(MAX_INLINE_DOCUMENT_CHARS + 1),
    });
    expect(tooLong).not.toContain('was edited since you last wrote it');
  });

  it('keeps a fence inside the slide from closing the quoted block', () => {
    const prompt = buildSlideEditRequest({
      title: 'Deck',
      slideIndex: 0,
      slideCount: 1,
      slide: 'Before\n```js\ncode\n```',
      instruction: 'Tidy',
    });
    expect(prompt).toContain('Before\n``js\ncode\n``');
  });
});
