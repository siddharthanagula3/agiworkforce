import { describe, expect, it } from 'vitest';
import { insertCitationMarkers } from '@agiworkforce/unified-chat';

import { citationSpansFromAnchors } from './citation-anchors';

const ANSWER =
  'The latest LTS line is Node.js 24. It moves to maintenance on October 20, 2026.\n\n' +
  '| Line | Status |\n| --- | --- |\n| 24 | LTS |';

describe('citationSpansFromAnchors', () => {
  it('places each citation at the end of the sentence it arrived in', () => {
    const second = ANSWER.indexOf('It moves');
    const spans = citationSpansFromAnchors(ANSWER, [
      { offset: 0, marker: 1 },
      { offset: second, marker: 2 },
      { offset: second + 3, marker: 1 },
    ]);
    expect(insertCitationMarkers(ANSWER, spans, 2).split('\n')[0]).toBe(
      'The latest LTS line is Node.js 24.[1] It moves to maintenance on October 20, 2026.[1][2]',
    );
  });

  it('leaves table rows without a marker', () => {
    const row = ANSWER.indexOf('| 24 |');
    expect(citationSpansFromAnchors(ANSWER, [{ offset: row, marker: 1 }])).toEqual([]);
  });
});
