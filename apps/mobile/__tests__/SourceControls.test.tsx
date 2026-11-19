import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockOpenBrowserAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

const mockLinkingOpenURL = jest.fn();
jest.mock('expo-linking', () => ({
  openURL: (...args: unknown[]) => mockLinkingOpenURL(...args),
}));

import { CollapsibleSources } from '../src/features/chat/components/CollapsibleSources';
import { CitationChip, previewCitation } from '../src/features/chat/components/CitationChip';
import { WebSearchResultCard } from '../src/features/chat/components/WebSearchResultCard';
import { WebSearchToolCard } from '../src/features/chat/components/WebSearchToolCard';

const GROUNDED = {
  url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123',
  title: 'anthropic.com',
};
const TRACKED = {
  url: 'https://news.example.com/story?id=7&utm_source=chat&utm_medium=answer&fbclid=xyz',
  title: 'Tracked story',
};

let alert: jest.SpyInstance;

beforeEach(() => {
  mockOpenBrowserAsync.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockLinkingOpenURL.mockReset().mockResolvedValue(undefined);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => alert.mockRestore());

function totalHeight(style: { minHeight?: number }, hitSlop: { top?: number; bottom?: number }) {
  return (style.minHeight ?? 0) + (hitSlop.top ?? 0) + (hitSlop.bottom ?? 0);
}

describe('the Sources sheet', () => {
  it('names the publisher of a grounded result, not the routing host', () => {
    const screen = render(<CollapsibleSources sources={[GROUNDED]} />);
    fireEvent.press(screen.getByLabelText('View 1 source'));

    expect(screen.getAllByText('anthropic.com').length).toBeGreaterThan(0);
    expect(screen.queryByText('vertexaisearch.cloud.google.com')).toBeNull();
    expect(screen.getByLabelText('Source 1: anthropic.com')).toBeTruthy();
  });

  it('opens a source without its tracking parameters', async () => {
    const screen = render(<CollapsibleSources sources={[TRACKED]} />);
    fireEvent.press(screen.getByLabelText('View 1 source'));
    fireEvent.press(screen.getByLabelText('Source 1: Tracked story'));

    await waitFor(() => expect(mockOpenBrowserAsync).toHaveBeenCalled());
    expect(mockOpenBrowserAsync.mock.calls[0]?.[0]).toBe('https://news.example.com/story?id=7');
  });

  it('says so when a source cannot be opened', async () => {
    mockOpenBrowserAsync.mockRejectedValueOnce(new Error('No browser'));
    mockLinkingOpenURL.mockRejectedValueOnce(new Error('No handler'));
    const screen = render(<CollapsibleSources sources={[TRACKED]} />);
    fireEvent.press(screen.getByLabelText('View 1 source'));
    fireEvent.press(screen.getByLabelText('Source 1: Tracked story'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Could not open source',
        'Check your connection and try again.',
      ),
    );
  });

  it('does not present a source it cannot open as a link', () => {
    const screen = render(
      <CollapsibleSources sources={[{ url: 'ftp://files.example.com/a', title: 'Archive' }]} />,
    );
    fireEvent.press(screen.getByLabelText('View 1 source'));

    expect(screen.getByLabelText('Source 1: Archive').props.accessibilityRole).toBe('text');
  });

  it('splits the pages the answer cited from the rest and names the search', () => {
    const screen = render(
      <CollapsibleSources
        sources={[
          { url: 'https://a.example.com/', title: 'Cited one', publishedDate: '2026-11-02' },
          { url: 'https://b.example.com/', title: 'Searched only' },
        ]}
        citedCount={1}
        query="tulip care"
      />,
    );
    fireEvent.press(screen.getByLabelText('View 2 sources'));

    expect(screen.getByText('Citations')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
    expect(screen.getByText('tulip care')).toBeTruthy();
    expect(screen.getByLabelText('Source 2: Searched only')).toBeTruthy();
    expect(screen.getByText(/^a\.example\.com · /)).toBeTruthy();
  });

  it('never shows a provider token as the snippet of a source', () => {
    const screen = render(
      <CollapsibleSources
        sources={[
          {
            url: 'https://a.example.com/',
            title: 'Opaque',
            snippet:
              'EsQBCioIDBgCIiQ4YzMyNDBjOS1hZDFkLTRiNzItYjJkNy1mODI1MDQwMzkxZDhmEgwxQmFzZTY0VG9rZW5Zd0h4NzNhU1pRcEVhdjkwSnZRb0x3UnhHbk5mSzVhWjhQcTdMYzJYdw',
          },
          { url: 'https://b.example.com/', title: 'Readable', snippet: 'A readable summary.' },
        ]}
      />,
    );
    fireEvent.press(screen.getByLabelText('View 2 sources'));

    expect(
      screen.queryByText(
        'EsQBCioIDBgCIiQ4YzMyNDBjOS1hZDFkLTRiNzItYjJkNy1mODI1MDQwMzkxZDhmEgwxQmFzZTY0VG9rZW5Zd0h4NzNhU1pRcEVhdjkwSnZRb0x3UnhHbk5mSzVhWjhQcTdMYzJYdw',
      ),
    ).toBeNull();
    expect(screen.getByText('A readable summary.')).toBeTruthy();
  });

  it('labels the list as partial while the turn waits for an approval', () => {
    const screen = render(
      <CollapsibleSources sources={[{ url: 'https://a.example.com/', title: 'A' }]} partial />,
    );
    expect(screen.getByText('Sources so far')).toBeTruthy();
    expect(screen.getByLabelText('View 1 source so far')).toBeTruthy();
  });

  it.each([
    ['stopped', { finishReason: 'stopped' }],
    ['cancelled', { finishReason: 'cancelled' }],
    ['failed', { streamError: { message: 'The connection dropped.' } }],
  ])('labels the list collected before a %s turn as sources so far', (_name, metadata) => {
    const screen = render(
      <CollapsibleSources
        sources={[{ url: 'https://a.example.com/', title: 'A' }]}
        metadata={metadata}
      />,
    );
    expect(screen.getByText('Sources so far')).toBeTruthy();
    expect(screen.getByLabelText('View 1 source so far')).toBeTruthy();
  });

  it('keeps the plain label for a turn that finished', () => {
    const screen = render(
      <CollapsibleSources
        sources={[{ url: 'https://a.example.com/', title: 'A' }]}
        metadata={{ finishReason: 'stop' }}
      />,
    );
    expect(screen.getByText('Sources')).toBeTruthy();
    expect(screen.queryByText('Sources so far')).toBeNull();
  });
});

describe('a citation preview', () => {
  it('shows the publisher, published and retrieved dates and a short snippet', () => {
    const snippet = 'word '.repeat(80);
    previewCitation({
      ...GROUNDED,
      snippet,
      publishedDate: '2026-11-02T12:00:00.000Z',
      retrievedAt: '2026-11-14T12:00:00.000Z',
    });

    const [title, message] = alert.mock.calls[0] as [string, string];
    expect(title).toBe('anthropic.com');
    const [site, preview] = message.split('\n\n');
    expect(site).toMatch(/^anthropic\.com · Published .+ · Retrieved .+$/);
    expect(preview!.length).toBeLessThanOrEqual(181);
    expect(preview!.endsWith('…')).toBe(true);
  });

  it('leaves a provider token out of the preview', () => {
    previewCitation({
      ...TRACKED,
      snippet:
        'EsQBCioIDBgCIiQ4YzMyNDBjOS1hZDFkLTRiNzItYjJkNy1mODI1MDQwMzkxZDhmEgwxQmFzZTY0VG9rZW5Zd0h4NzNhU1pRcEVhdjkwSnZRb0x3UnhHbk5mSzVhWjhQcTdMYzJYdw',
    });
    const [, message] = alert.mock.calls[0] as [string, string];
    expect(message).not.toContain('\n\n');
  });

  it('opens the page without its tracking parameters', async () => {
    previewCitation(TRACKED);
    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Open page')?.onPress?.();

    await waitFor(() => expect(mockOpenBrowserAsync).toHaveBeenCalled());
    expect(mockOpenBrowserAsync.mock.calls[0]?.[0]).toBe('https://news.example.com/story?id=7');
  });

  it('gives the chip a 44 point tap area and no link role when it cannot open', () => {
    const screen = render(<CitationChip index={1} title="A" url="https://a.example.com/" />);
    const chip = screen.getByLabelText('Citation 1: A');
    const style = Object.assign({}, ...[chip.props.style].flat());
    expect(totalHeight(style, chip.props.hitSlop ?? {})).toBeGreaterThanOrEqual(44);

    const blocked = render(<CitationChip index={2} title="B" url="javascript:alert(1)" />);
    expect(blocked.getByLabelText('Citation 2: B').props.accessibilityRole).toBe('text');
  });
});

describe('search result rows and chips', () => {
  it('name the publisher of a grounded result', () => {
    const card = render(<WebSearchResultCard result={GROUNDED} />);
    expect(card.getByLabelText('anthropic.com, web page on anthropic.com')).toBeTruthy();
    expect(card.queryByText('vertexaisearch.cloud.google.com')).toBeNull();
  });

  it('do not present a result they cannot open as a link', () => {
    const card = render(
      <WebSearchResultCard result={{ url: 'ftp://files.example.com/a', title: 'Archive' }} />,
    );
    const row = card.getByLabelText('Archive, web page on files.example.com');
    expect(row.props.accessibilityRole).toBe('text');
  });

  it('give each source chip under a search a 44 point tap area', () => {
    const screen = render(
      <WebSearchToolCard
        showSources
        tool={{
          id: 'search',
          name: 'web_search',
          status: 'succeeded',
          searchResults: [GROUNDED],
        }}
      />,
    );
    const chip = screen.getByLabelText('Open source anthropic.com, anthropic.com');
    const style = Object.assign({}, ...[chip.props.style].flat());
    expect(totalHeight(style, chip.props.hitSlop)).toBeGreaterThanOrEqual(44);
  });
});
