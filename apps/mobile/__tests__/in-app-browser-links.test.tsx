import { Alert, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockOpenBrowserAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

const mockLinkingOpenURL = jest.fn();
jest.mock('expo-linking', () => ({
  openURL: (...args: unknown[]) => mockLinkingOpenURL(...args),
}));

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

import {
  isInAppBrowsableUrl,
  openInAppBrowser,
  openUntrustedUrlInAppBrowser,
} from '../lib/safeOpenURL';
import { CollapsibleSources } from '../src/features/chat/components/CollapsibleSources';
import { CitationChip } from '../src/features/chat/components/CitationChip';
import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
import { WebSearchResultCard } from '../src/features/chat/components/WebSearchResultCard';
import { lightColors } from '../src/ui/theme';

beforeEach(() => {
  mockOpenBrowserAsync.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockLinkingOpenURL.mockReset().mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('openInAppBrowser, first-party URLs', () => {
  it('presents an allowlisted URL as a page sheet and never backgrounds the app', async () => {
    const ok = await openInAppBrowser('https://agiworkforce.com/help');

    expect(ok).toBe(true);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://agiworkforce.com/help',
      expect.objectContaining({ presentationStyle: 'pageSheet', dismissButtonStyle: 'close' }),
    );
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });

  it.each([
    ['off-allowlist host', 'https://attacker.example/billing-clone'],
    ['intent laundering', 'intent://attacker.example#Intent;scheme=https;end'],
    ['javascript payload', 'javascript:alert(1)'],
    ['local file', 'file:///etc/passwd'],
    ['plain http', 'http://agiworkforce.com/help'],
  ])('refuses %s and opens nothing at all', async (_label, url) => {
    const ok = await openInAppBrowser(url);

    expect(ok).toBe(false);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });

  it('falls back to the system browser when the in-app container is unavailable', async () => {
    mockOpenBrowserAsync.mockRejectedValueOnce(new Error('No Custom Tabs provider'));

    const ok = await openInAppBrowser('https://agiworkforce.com/privacy');

    expect(ok).toBe(true);
    expect(mockLinkingOpenURL).toHaveBeenCalledWith('https://agiworkforce.com/privacy');
  });

  it('reports failure when neither container can open the URL', async () => {
    mockOpenBrowserAsync.mockRejectedValueOnce(new Error('No Custom Tabs provider'));
    mockLinkingOpenURL.mockRejectedValueOnce(new Error('no handler'));

    await expect(openInAppBrowser('https://agiworkforce.com/terms')).resolves.toBe(false);
  });
});

describe('openUntrustedUrlInAppBrowser, assistant links and citations', () => {
  it('opens an arbitrary https host in the sheet (the model may cite any site)', async () => {
    const ok = await openUntrustedUrlInAppBrowser('https://docs.example.com/page');

    expect(ok).toBe(true);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://docs.example.com/page',
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['file', 'file:///etc/passwd'],
    ['intent', 'intent://attacker.example#Intent;scheme=https;end'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['mailto', 'mailto:support@example.com'],
    ['tel', 'tel:+15551234567'],
    ['not a url', 'just some text'],
    ['empty', ''],
  ])('refuses a %s URL', async (_label, url) => {
    const ok = await openUntrustedUrlInAppBrowser(url);

    expect(ok).toBe(false);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });

  it('refuses non-string input', async () => {
    await expect(openUntrustedUrlInAppBrowser(undefined)).resolves.toBe(false);
    await expect(openUntrustedUrlInAppBrowser({ url: 'https://x.example' })).resolves.toBe(false);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  it('classifies http and https as in-app browsable and nothing else', () => {
    expect(isInAppBrowsableUrl('http://docs.example.com')).toBe(true);
    expect(isInAppBrowsableUrl('https://docs.example.com')).toBe(true);
    expect(isInAppBrowsableUrl('mailto:a@example.com')).toBe(false);
    expect(isInAppBrowsableUrl(42)).toBe(false);
  });
});

describe('assistant markdown links route through the in-app browser', () => {
  it('opens a cited page in the sheet instead of Safari', () => {
    const screen = render(
      <View>{renderMarkdownContent('[Source](https://docs.example.com)', lightColors)}</View>,
    );

    fireEvent.press(screen.getByText('Source'));

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://docs.example.com',
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });
});

describe('CollapsibleSources citations route through the in-app browser', () => {
  it('opens a tapped source in the sheet', () => {
    const screen = render(
      <CollapsibleSources
        sources={[{ url: 'https://example.com/article', title: 'An article' }]}
      />,
    );

    fireEvent.press(screen.getByLabelText('Source 1: An article'));

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });

  it('ignores a citation whose URL is not http(s)', () => {
    const screen = render(
      <CollapsibleSources sources={[{ url: 'javascript:alert(1)', title: 'Bad' }]} />,
    );

    fireEvent.press(screen.getByLabelText('Source 1: Bad'));

    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });
});

describe('inline search and citation links route through the in-app browser', () => {
  it('keeps an inline web-search result inside the app', () => {
    const screen = render(
      <WebSearchResultCard
        result={{
          url: 'https://example.com/search-result',
          title: 'Search result',
          snippet: 'A useful source',
        }}
      />,
    );

    fireEvent.press(screen.getByLabelText('Search result, example.com'));

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://example.com/search-result',
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });

  it('keeps an inline citation inside the app', () => {
    const screen = render(
      <CitationChip index={2} title="Citation title" url="https://docs.example.com/citation" />,
    );

    fireEvent.press(screen.getByLabelText('Citation 2: Citation title'));

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://docs.example.com/citation',
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
    expect(mockLinkingOpenURL).not.toHaveBeenCalled();
  });

  it('reports when an inline citation cannot be opened', async () => {
    mockOpenBrowserAsync.mockRejectedValueOnce(new Error('No browser'));
    mockLinkingOpenURL.mockRejectedValueOnce(new Error('No handler'));
    const screen = render(
      <CitationChip index={1} title="Offline source" url="https://example.com/offline" />,
    );

    fireEvent.press(screen.getByLabelText('Citation 1: Offline source'));

    await screen.findByText('[1]');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not open citation',
      'Check your connection and try again.',
    );
  });
});
