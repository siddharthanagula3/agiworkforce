import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HelpArticleBody } from '@/features/support/components/HelpArticleBody';
import { getSupportCorpus } from '@/lib/support/agent/corpus';
import { getHelpArticle } from '@/lib/support/help-articles';

const DELIMITER_ROW = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m;

describe('help article body', () => {
  it('renders the keyboard shortcuts list as one accessible table', () => {
    const article = getHelpArticle('keyboard-shortcuts');
    expect(article).not.toBeNull();
    const { container } = render(<HelpArticleBody sections={article?.sections ?? []} />);

    expect(container.querySelectorAll('table')).toHaveLength(1);
    const headers = Array.from(container.querySelectorAll('th')).map((th) => ({
      text: th.textContent,
      scope: th.getAttribute('scope'),
    }));
    expect(headers).toEqual([
      { text: 'Shortcut', scope: 'col' },
      { text: 'What it does', scope: 'col' },
    ]);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8);
    expect(container.textContent).not.toContain('| --');

    const region = container.querySelector('table')?.parentElement;
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.className).toContain('overflow-x-auto');
  });

  it('sizes list text like paragraph text', () => {
    const { container } = render(
      <HelpArticleBody
        sections={[{ id: 's', heading: null, text: '- one\n- two\n\n1. first\n2. second' }]}
      />,
    );
    for (const list of Array.from(container.querySelectorAll('ul, ol'))) {
      expect(list.className).toContain('agi-ds-prose');
    }
  });

  it('renders a table for every corpus chunk that contains a GFM delimiter row', () => {
    const corpus = getSupportCorpus();
    expect(corpus.available).toBe(true);
    if (!corpus.available) return;
    const chunks = corpus.chunks.filter(
      (chunk) => chunk.origin === 'markdown' && DELIMITER_ROW.test(chunk.text),
    );
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const { container, unmount } = render(<HelpArticleBody sections={[chunk]} />);
      expect(container.querySelector('table'), chunk.id).not.toBeNull();
      unmount();
    }
  });

  it('keeps raw HTML and images out of article bodies', () => {
    const { container } = render(
      <HelpArticleBody
        sections={[{ id: 's', heading: null, text: '<script>x</script>\n\n![a](/b.png)' }]}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
