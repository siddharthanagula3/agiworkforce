import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarkdownContent } from '../markdown/MarkdownContent';

afterEach(cleanup);

describe('where a rendered link takes the reader', () => {
  it('sends an external link to a new tab', () => {
    render(<MarkdownContent content="See [the study](https://example.com/paper)." />);
    const link = screen.getByRole('link', { name: 'the study' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('keeps a same-document fragment on the page', () => {
    // A citation marker reaching its source in the list below it. Opening that
    // in a new tab lands the reader on a blank page instead.
    render(<MarkdownContent content="Canopy fell 12% [&#91;2&#93;](#research-source-2)." />);
    const link = screen.getByRole('link', { name: '[2]' });
    expect(link.getAttribute('href')).toBe('#research-source-2');
    expect(link.getAttribute('target')).toBeNull();
  });
});
