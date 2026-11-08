import { describe, expect, it } from 'vitest';
import { applyPageFindSelection, pageFindOccurrences, stepPageFind } from '../lib/page-find';

describe('page find', () => {
  it('counts only the text outside the find bar and steps through it', () => {
    document.body.innerHTML =
      '<p id="page">alpha beta alpha</p><div id="bar"><button>Next</button></div>';
    const skip = document.getElementById('bar');
    const page = document.getElementById('page');

    expect(pageFindOccurrences(document.body, skip, 'alpha')).toHaveLength(2);
    expect(pageFindOccurrences(document.body, skip, 'ALPHA')).toHaveLength(2);
    expect(pageFindOccurrences(document.body, skip, 'Next')).toHaveLength(0);
    expect(pageFindOccurrences(document.body, skip, '   ')).toHaveLength(0);

    const matches = pageFindOccurrences(document.body, skip, 'alpha');
    applyPageFindSelection(matches[1]);
    expect(document.getSelection()?.toString()).toBe('alpha');
    expect(page?.textContent).toContain('alpha beta alpha');

    expect(stepPageFind(0, 0, 1)).toBe(-1);
    expect(stepPageFind(2, -1, 1)).toBe(0);
    expect(stepPageFind(2, -1, -1)).toBe(1);
    expect(stepPageFind(2, 0, 1)).toBe(1);
    expect(stepPageFind(2, 1, 1)).toBe(0);
    expect(stepPageFind(2, 0, -1)).toBe(1);
  });
});
