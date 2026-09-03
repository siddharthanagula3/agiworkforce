import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Tooltip from '@radix-ui/react-tooltip';

import { CitationChip } from '../CitationChip';
import type { CitationItem } from '../CitationChip';

beforeEach(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function renderChip(items: CitationItem[]) {
  return render(
    <Tooltip.Provider delayDuration={0}>
      <CitationChip items={items} />
    </Tooltip.Provider>,
  );
}

const anthropic: CitationItem = {
  index: 1,
  citation: { url: 'https://www.anthropic.com/news/one', title: 'Anthropic ships a model' },
};

const googleBlog: CitationItem = {
  index: 2,
  citation: { url: 'https://blog.google/technology/two', title: 'Google announces a feature' },
};

const xai: CitationItem = {
  index: 3,
  citation: { url: 'https://x.ai/news/three', title: 'x.ai releases an update' },
};

describe('CitationChip: single source', () => {
  it('shows the favicon and the registrable host, and names the source for screen readers', () => {
    renderChip([anthropic]);
    const link = screen.getByRole('link', { name: 'Source 1: Anthropic ships a model' });
    expect(link.getAttribute('href')).toBe('https://www.anthropic.com/news/one');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('anthropic.com');
    expect(screen.queryByText('+1')).toBeNull();
  });

  it('honours a curated site name over the registrable host', () => {
    renderChip([
      { index: 1, citation: { url: 'https://www.anthropic.com/news/one', siteName: 'Anthropic' } },
    ]);
    const link = screen.getByRole('link');
    expect(link.textContent).toContain('Anthropic');
    expect(link.textContent).not.toContain('anthropic.com');
  });

  it('falls back to a host icon when the favicon image fails to load', () => {
    renderChip([anthropic]);
    const img = screen.getByRole('link').querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(screen.getByRole('link').querySelector('img')).toBeNull();
    expect(screen.getByRole('link').querySelector('svg')).not.toBeNull();
  });

  it('meets the 24px minimum target height', () => {
    renderChip([anthropic]);
    expect(screen.getByRole('link').className).toContain('h-6');
  });

  it('shows the title and host in a hover tooltip', async () => {
    renderChip([anthropic]);
    const link = screen.getByRole('link');
    fireEvent.focus(link);
    const tooltip = within(await screen.findByRole('tooltip'));
    expect(tooltip.getByText('Anthropic ships a model')).not.toBeNull();
    expect(tooltip.getByText('anthropic.com')).not.toBeNull();
  });
});

describe('CitationChip: grouped sources', () => {
  it('shows the first site plus a count, and names every source for screen readers', () => {
    renderChip([anthropic, googleBlog, xai]);
    const link = screen.getByRole('link', {
      name: 'Sources 1, 2, 3: anthropic.com, blog.google, x.ai',
    });
    expect(link.textContent).toContain('anthropic.com');
    expect(link.textContent).toContain('+2');
  });

  it('opens the first source in a new tab on click', () => {
    renderChip([anthropic, googleBlog]);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://www.anthropic.com/news/one');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('lists every grouped source in the hover tooltip', async () => {
    renderChip([anthropic, googleBlog]);
    fireEvent.focus(screen.getByRole('link'));
    const tooltip = within(await screen.findByRole('tooltip'));
    expect(tooltip.getByText('Anthropic ships a model')).not.toBeNull();
    expect(tooltip.getByText('Google announces a feature')).not.toBeNull();
    expect(tooltip.getByText('anthropic.com')).not.toBeNull();
    expect(tooltip.getByText('blog.google')).not.toBeNull();
  });
});
