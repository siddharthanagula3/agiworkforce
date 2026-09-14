import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Tooltip from '@radix-ui/react-tooltip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CitationChip } from './CitationChip';

beforeEach(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const CITATION = {
  url: 'https://frame.work/laptop13',
  title: 'Framework Laptop 13',
  snippet: 'The  mainboard   is user replaceable and ships with the new chassis.',
  publishedDate: '2026-03-04T00:00:00.000Z',
};

function renderChip(citation: typeof CITATION) {
  return render(
    <Tooltip.Provider delayDuration={0}>
      <CitationChip items={[{ index: 1, citation }]} />
    </Tooltip.Provider>,
  );
}

describe('CitationChip hover card', () => {
  it('shows the snippet and the published date beside the site', async () => {
    renderChip(CITATION);

    await userEvent.hover(screen.getByRole('link', { name: /^Source 1:/ }));

    const snippets = await screen.findAllByText(/mainboard is user replaceable/);
    expect(snippets.length).toBeGreaterThan(0);
    expect(screen.getAllByText('frame.work').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mar \d+, 2026/).length).toBeGreaterThan(0);
  });

  it('renders an unparseable published date as the backend reported it', async () => {
    renderChip({ ...CITATION, publishedDate: '3 days ago' });

    await userEvent.hover(screen.getByRole('link', { name: /^Source 1:/ }));

    expect((await screen.findAllByText('3 days ago')).length).toBeGreaterThan(0);
  });

  it('omits both rows when the citation carries neither', async () => {
    render(
      <Tooltip.Provider delayDuration={0}>
        <CitationChip
          items={[{ index: 1, citation: { url: CITATION.url, title: CITATION.title } }]}
        />
      </Tooltip.Provider>,
    );

    await userEvent.hover(screen.getByRole('link', { name: /^Source 1:/ }));

    await screen.findAllByText('frame.work');
    expect(document.querySelector('[data-citation-snippet]')).toBeNull();
    expect(screen.queryByText(/, 20\d\d/)).toBeNull();
  });
});
