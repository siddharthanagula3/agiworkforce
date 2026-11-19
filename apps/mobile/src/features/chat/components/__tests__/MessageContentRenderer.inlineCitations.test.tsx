import { render, screen } from '@testing-library/react-native';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));

import { colors } from '@/src/ui/theme';
import { renderMarkdownContent } from '../MessageContentRenderer';
import type { CitationSource } from '../CitationChip';

const SOURCES: CitationSource[] = [
  { title: 'Ice in Beta Pictoris', url: 'https://pubmed.ncbi.nlm.nih.gov/43019434/' },
  { title: 'Webb image', url: 'https://science.nasa.gov/missions/webb/' },
];

const CITED_ANSWER =
  'Webb saw ancient ice. ([pubmed.ncbi.nlm.nih.gov](https://pubmed.ncbi.nlm.nih.gov/43019434/))[1]\n\nMore follows.';

function visibleText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((child) => visibleText(child, out));
  else if (node && typeof node === 'object') {
    visibleText((node as { children?: unknown }).children, out);
  }
  return out;
}

function drawn(content: string, streaming: boolean): string {
  const view = render(
    <>
      {renderMarkdownContent(content, colors, {
        streaming,
        highlightCode: !streaming,
        citations: SOURCES,
      })}
    </>,
  );
  const text = visibleText(view.toJSON()).join('');
  view.unmount();
  return text;
}

const MARKER = /\[\d+(?:, \d+)*\]/;

function expectNothingBeforeAMarkerToChange(answer: string): string {
  let settled: string | null = null;
  let text = '';
  for (let end = 1; end <= answer.length; end += 1) {
    text = drawn(answer.slice(0, end), true);
    const marker = MARKER.exec(text);
    if (settled !== null) {
      expect({ end, text }).toEqual({ end, text: expect.stringMatching(MARKER) });
      expect({ end, before: text.slice(0, marker?.index) }).toEqual({ end, before: settled });
    }
    if (settled === null && marker) settled = text.slice(0, marker.index);
  }
  expect(settled).not.toBeNull();
  return text;
}

describe('inline citations in an answer', () => {
  it('draws the stored answer with one numbered marker and no host name', () => {
    render(<>{renderMarkdownContent(CITED_ANSWER, colors, { citations: SOURCES })}</>);

    expect(visibleText(screen.toJSON()).join('')).toBe('Webb saw ancient ice. [1]More follows.');
    expect(screen.getAllByRole('link', { name: /^Citation / })).toHaveLength(1);
  });

  it('never shows the link text or address while the cited link streams in', () => {
    let markerShown = false;
    for (let end = 1; end <= CITED_ANSWER.length; end += 1) {
      const text = drawn(CITED_ANSWER.slice(0, end), true);
      expect({ end, text }).toEqual({ end, text: expect.not.stringMatching(/pubmed|https|[()]/) });
      const withoutMarker = text.replace('[1]', '');
      expect({ end, text: withoutMarker }).toEqual({
        end,
        text: expect.not.stringMatching(/[[\]]/),
      });
      if (markerShown) expect({ end, text }).toEqual({ end, text: expect.stringContaining('[1]') });
      markerShown = markerShown || text.includes('[1]');
    }
    expect(markerShown).toBe(true);
  });

  it('shows a link to a page that is not a source whole once its address closes', () => {
    const answer = 'Read [example.org](https://example.org/guide) now.';
    for (let end = 1; end <= answer.length; end += 1) {
      const text = drawn(answer.slice(0, end), true);
      expect({ end, text }).toEqual({ end, text: expect.not.stringMatching(/[[\]]|https/) });
    }
    render(<>{renderMarkdownContent(answer, colors, { streaming: true, citations: SOURCES })}</>);
    expect(screen.getByRole('link', { name: 'example.org' })).toBeTruthy();
  });

  it('keeps the parenthesis that wraps two citation links steady as they stream in', () => {
    const answer =
      'Ice was seen ([pubmed.ncbi.nlm.nih.gov](https://pubmed.ncbi.nlm.nih.gov/43019434/), [science.nasa.gov](https://science.nasa.gov/missions/webb/)) twice.';

    expect(expectNothingBeforeAMarkerToChange(answer)).toBe('Ice was seen ([1], [2]) twice.');
  });

  it('never shows the outer bracket of a marker written as a link before it closes', () => {
    const answer = 'Ice was seen [[1]](https://pubmed.ncbi.nlm.nih.gov/43019434/)';

    for (let end = 1; end < answer.length; end += 1) {
      const text = drawn(answer.slice(0, end), true);
      expect({ end, text }).toEqual({ end, text: expect.not.stringMatching(/[[\]]|https/) });
    }
  });

  it('keeps what is drawn before the marker steady in the stored shape', () => {
    expect(expectNothingBeforeAMarkerToChange(CITED_ANSWER)).toBe(
      'Webb saw ancient ice. [1]More follows.',
    );
  });
});
