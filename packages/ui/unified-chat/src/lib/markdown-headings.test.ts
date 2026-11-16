import { describe, expect, it } from 'vitest';
import { extractMarkdownHeadings, slugifyHeading } from './markdown-headings';

describe('markdown headings', () => {
  it('reads levels one to four in order, skipping fenced lines and deeper levels', () => {
    const markdown = [
      '# Title',
      '```python',
      '# not a heading',
      '```',
      '~~~',
      '## also not a heading',
      '~~~',
      '#### Fourth **level**',
      '##### Fifth level',
    ].join('\n');
    expect(extractMarkdownHeadings(markdown)).toEqual([
      { id: 'title', text: 'Title', level: 1 },
      { id: 'fourth-level', text: 'Fourth level', level: 4 },
    ]);
  });

  it('suffixes repeated ids and numbers a heading with no slug', () => {
    expect(extractMarkdownHeadings('## Notes\n## Notes\n## ???').map((h) => h.id)).toEqual([
      'notes',
      'notes-1',
      'section-3',
    ]);
    expect(slugifyHeading('  Q3: Revenue & Costs ')).toBe('q3-revenue-costs');
  });
});
