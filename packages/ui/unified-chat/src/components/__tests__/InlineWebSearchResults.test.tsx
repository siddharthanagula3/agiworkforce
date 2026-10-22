import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { WebSearchCard, type WebSearchCardProps } from '../WebSearchCard';

afterEach(() => {
  cleanup();
});

function makeResults(count: number): WebSearchCardProps['results'] {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://example${i}.com/page`,
    title: `Result ${i + 1} Title`,
    domain: `example${i}.com`,
    faviconUrl: i % 2 === 0 ? `https://example${i}.com/favicon.ico` : undefined,
  }));
}

describe('WebSearchCard', () => {
  it('renders the query in the header', () => {
    render(
      <WebSearchCard query="software engineer resume" resultCount={10} results={makeResults(3)} />,
    );
    expect(screen.queryByText('software engineer resume')).not.toBeNull();
  });

  it('renders the result count badge', () => {
    render(<WebSearchCard query="test" resultCount={10} results={makeResults(3)} />);
    expect(screen.queryByText('10 results')).not.toBeNull();
  });

  it('uses singular "result" when resultCount is 1', () => {
    render(<WebSearchCard query="test" resultCount={1} results={makeResults(1)} />);
    expect(screen.queryByText('1 result')).not.toBeNull();
  });

  it('shows results panel by default (defaultOpen=true)', () => {
    render(<WebSearchCard query="test" resultCount={3} results={makeResults(3)} />);
    expect(screen.queryByText('Result 1 Title')).not.toBeNull();
  });

  it('hides results panel when defaultOpen=false', () => {
    render(
      <WebSearchCard query="test" resultCount={3} results={makeResults(3)} defaultOpen={false} />,
    );
    expect(screen.queryByText('Result 1 Title')).toBeNull();
  });

  it('toggles results panel open on header click', () => {
    render(
      <WebSearchCard query="test" resultCount={3} results={makeResults(3)} defaultOpen={false} />,
    );
    const header = screen.getByRole('button', { name: /Web search: test/i });
    expect(screen.queryByText('Result 1 Title')).toBeNull();

    fireEvent.click(header);
    expect(screen.queryByText('Result 1 Title')).not.toBeNull();

    fireEvent.click(header);
    expect(screen.queryByText('Result 1 Title')).toBeNull();
  });

  it('aria-expanded is false when closed, true when open', () => {
    render(
      <WebSearchCard query="q" resultCount={1} results={makeResults(1)} defaultOpen={false} />,
    );
    const btn = screen.getByRole('button', { name: /Web search: q/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders title and domain for each visible result', () => {
    render(<WebSearchCard query="test" resultCount={3} results={makeResults(3)} />);
    for (let i = 1; i <= 3; i++) {
      expect(screen.queryByText(`Result ${i} Title`)).not.toBeNull();
    }
    expect(screen.queryByText('example0.com')).not.toBeNull();
  });

  it('renders favicon img when faviconUrl is provided', () => {
    render(
      <WebSearchCard
        query="test"
        resultCount={1}
        results={[
          {
            url: 'https://ex.com',
            title: 'Ex',
            domain: 'ex.com',
            faviconUrl: 'https://ex.com/fav.ico',
          },
        ]}
      />,
    );
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0]?.getAttribute('src')).toBe('https://ex.com/fav.ico');
  });

  it('does not render img for results without faviconUrl', () => {
    render(
      <WebSearchCard
        query="test"
        resultCount={1}
        results={[{ url: 'https://ex.com', title: 'Ex', domain: 'ex.com' }]}
      />,
    );
    expect(document.querySelectorAll('img').length).toBe(0);
  });

  it('renders "Show more" button when results exceed showMoreThreshold', () => {
    render(
      <WebSearchCard query="test" resultCount={6} results={makeResults(6)} showMoreThreshold={4} />,
    );
    expect(screen.queryByText(/Show more/)).not.toBeNull();
  });

  it('does not render "Show more" when results <= showMoreThreshold', () => {
    render(
      <WebSearchCard query="test" resultCount={4} results={makeResults(4)} showMoreThreshold={4} />,
    );
    expect(screen.queryByText(/Show more/)).toBeNull();
  });

  it('clicking "Show more" reveals all results', () => {
    render(
      <WebSearchCard query="test" resultCount={6} results={makeResults(6)} showMoreThreshold={4} />,
    );
    expect(screen.queryByText('Result 5 Title')).toBeNull();
    const showMore = screen.getByText(/Show more/);
    fireEvent.click(showMore);
    expect(screen.queryByText('Result 5 Title')).not.toBeNull();
    expect(screen.queryByText('Result 6 Title')).not.toBeNull();
  });

  it('shows the host line and a two-line snippet under each title', () => {
    render(
      <WebSearchCard
        query="test"
        resultCount={1}
        results={[
          {
            url: 'https://www.target.com/guide',
            title: 'Target guide',
            snippet: 'What the page says about the topic.',
          },
        ]}
      />,
    );
    expect(screen.getByText('target.com').className).toContain('truncate');
    expect(screen.getByText('What the page says about the topic.').className).toContain(
      'line-clamp-2',
    );
  });

  it('falls back to the host when a result has no title', () => {
    render(
      <WebSearchCard
        query="test"
        resultCount={1}
        results={[{ url: 'https://untitled.example/page', title: '' }]}
      />,
    );
    expect(screen.getAllByText('untitled.example').length).toBeGreaterThan(0);
  });

  it('opens an in-app source view on row click instead of leaving the app', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <WebSearchCard
        query="test"
        resultCount={1}
        results={[
          {
            url: 'https://target.com/a/b',
            title: 'Target',
            domain: 'target.com',
            snippet: 'Snippet text.',
          },
        ]}
      />,
    );
    const row = screen.getByText('Target').closest('button') as HTMLButtonElement;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);

    expect(openSpy).not.toHaveBeenCalled();
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const view = screen.getByRole('region', { name: 'Target' });
    expect(row.getAttribute('aria-controls')).toBe(view.id);
    expect(view.textContent).toContain('https://target.com/a/b');
    const link = screen.getByRole('link', { name: /Open in new tab/ });
    expect(link.getAttribute('href')).toBe('https://target.com/a/b');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');

    fireEvent.click(row);
    expect(screen.queryByRole('region', { name: 'Target' })).toBeNull();
    openSpy.mockRestore();
  });

  it('keeps one source view open at a time', () => {
    render(<WebSearchCard query="test" resultCount={2} results={makeResults(2)} />);
    fireEvent.click(screen.getByText('Result 1 Title').closest('button') as Element);
    fireEvent.click(screen.getByText('Result 2 Title').closest('button') as Element);
    expect(screen.queryByRole('region', { name: 'Result 1 Title' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Result 2 Title' })).not.toBeNull();
  });

  it('default showMoreThreshold is 4', () => {
    render(<WebSearchCard query="test" resultCount={5} results={makeResults(5)} />);
    expect(screen.queryByText('Result 5 Title')).toBeNull();
    expect(screen.queryByText(/Show more/)).not.toBeNull();
  });
});
