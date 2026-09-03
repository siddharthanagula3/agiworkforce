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

describe('inline citation markers', () => {
  const sources = [
    { url: 'https://www.anthropic.com/news/one', title: 'Anthropic ships a model' },
    { url: 'https://blog.google/technology/two', title: 'Google announces a feature' },
    { url: 'https://x.ai/news/three', title: 'x.ai releases an update' },
  ];

  it('renders an isolated marker as one pill carrying the site name and a new-tab link', () => {
    render(<MarkdownContent content="A release landed [1]." citations={sources} />);
    const link = screen.getByRole('link', { name: 'Source 1: Anthropic ships a model' });
    expect(link.getAttribute('href')).toBe('https://www.anthropic.com/news/one');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('anthropic.com');
  });

  it('groups adjacent markers into one pill naming the first source plus a count', () => {
    render(
      <MarkdownContent content="Three shipped the same week [1][2][3]." citations={sources} />,
    );
    expect(screen.queryByRole('link', { name: /^Source 1:/ })).toBeNull();
    const link = screen.getByRole('link', {
      name: 'Sources 1, 2, 3: anthropic.com, blog.google, x.ai',
    });
    expect(link.getAttribute('href')).toBe('https://www.anthropic.com/news/one');
    expect(link.textContent).toContain('anthropic.com');
    expect(link.textContent).toContain('+2');
  });

  it('leaves an out-of-range marker as plain text', () => {
    render(<MarkdownContent content="Unverified claim [9]." citations={sources} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Unverified claim \[9\]\./)).not.toBeNull();
  });
});

describe('parentheses around a citation', () => {
  const sources = [
    { url: 'https://www.anthropic.com/news/one', title: 'Anthropic ships a model' },
    { url: 'https://blog.google/technology/two', title: 'Google announces a feature' },
  ];

  it('swallows parentheses that directly wrap a marker', () => {
    const { container } = render(
      <MarkdownContent content="Released today ([1])." citations={sources} />,
    );
    expect(container.textContent).toBe('Released today anthropic.com.');
  });

  it('swallows parentheses with inner whitespace around a marker', () => {
    const { container } = render(
      <MarkdownContent content="Released today ( [1] )." citations={sources} />,
    );
    expect(container.textContent).toBe('Released today anthropic.com.');
  });

  it('swallows parentheses around a grouped run of markers', () => {
    const { container } = render(
      <MarkdownContent content="Shipped the same week ([1][2])." citations={sources} />,
    );
    expect(container.textContent).toBe('Shipped the same week anthropic.com+1.');
  });

  it('swallows parentheses around a plain link matched by domain', () => {
    const { container } = render(
      <MarkdownContent
        content="It shipped an update ([blog.google](https://blog.google))."
        citations={sources}
      />,
    );
    expect(container.textContent).toBe('It shipped an update blog.google.');
  });

  it('keeps a trailing character other than the closing paren', () => {
    const { container } = render(
      <MarkdownContent content="Confirmed here ([1]), reportedly." citations={sources} />,
    );
    expect(container.textContent).toBe('Confirmed here anthropic.com, reportedly.');
  });

  it('leaves parentheses alone when they do not touch the citation', () => {
    const { container } = render(
      <MarkdownContent content="(See details) claim [1]." citations={sources} />,
    );
    expect(container.textContent).toBe('(See details) claim anthropic.com.');
  });
});
