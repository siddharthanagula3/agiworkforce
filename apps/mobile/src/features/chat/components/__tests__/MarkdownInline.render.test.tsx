jest.mock('../MathBlock', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MathBlock: ({ latex, color }: { latex: string; color?: string }) => (
      <Text testID="inline-math" accessibilityHint={color}>
        {latex}
      </Text>
    ),
  };
});
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));
jest.mock('@/src/shared/components/Toast', () => ({ showToast: jest.fn() }));

import { Alert, Platform, Share, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { colors } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { showToast } from '@/src/shared/components/Toast';
import { renderInlineMarkdown } from '../MarkdownInline';
import { ActionMenuHost } from '@/src/shared/components/ActionMenuHost';
import {
  actionMenuLabels,
  actionMenuTitle,
  cancelActionMenu,
  chooseActionMenuItem,
  isActionMenuOpen,
} from '@/test-utils/actionMenu';
import type { CitationSource } from '../CitationChip';

type AlertButton = { text: string; onPress?: () => void };

function renderInline(source: string, footnotes?: Record<string, string>) {
  return render(<>{renderInlineMarkdown(source, 'test', colors, [], footnotes)}</>);
}

const SOURCES: CitationSource[] = [
  {
    title: 'Rates explained',
    url: 'https://www.reuters.com/a?utm_source=x',
    snippet: 'Rates rose.',
  },
  { title: 'Outlook', url: 'https://www.ft.com/b' },
  { title: 'Not a page', url: 'file:///private/x' },
];

function renderCited(source: string, citations: CitationSource[] = SOURCES) {
  return render(<>{renderInlineMarkdown(source, 'test', colors, citations)}</>);
}

function visibleText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((child) => visibleText(child, out));
  else if (node && typeof node === 'object') {
    visibleText((node as { children?: unknown }).children, out);
  }
  return out;
}

function allText(): string {
  return visibleText(screen.toJSON()).join('');
}

function alertButtons(spy: jest.SpyInstance, call = 0): AlertButton[] {
  return (spy.mock.calls[call]?.[2] ?? []) as AlertButton[];
}

describe('inline markdown rendering', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('draws italic text that contains bold with no asterisks left over', () => {
    renderInline('*This is **important** text*');

    expect(allText()).toBe('This is important text');
    expect(screen.getByText('important')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('This is important text')).toHaveStyle({ fontStyle: 'italic' });
  });

  it('strikes through single tilde text', () => {
    renderInline('Price ~old~ now');

    expect(allText()).toBe('Price old now');
    expect(screen.getByText('old')).toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('draws a double backtick span as one code span without added spaces', () => {
    renderInline('Use ``code with ` tick`` here');

    const code = screen.getByText('code with ` tick', { normalizer: (text) => text });
    expect(code).toHaveStyle({ fontFamily: 'Menlo' });
    expect(allText()).toBe('Use code with ` tick here');
  });

  it('draws bold, code and math inside a link label', () => {
    renderInline(
      '[**Docs** page](https://example.com) [`useState`](https://react.dev) [$E=mc^2$](https://example.com/m)',
    );

    const docs = screen.getByRole('link', { name: 'Docs page' });
    expect(docs).toHaveStyle({ textDecorationLine: 'underline' });
    expect(screen.getByText('Docs')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('useState')).toHaveStyle({ fontFamily: 'Menlo' });
    expect(screen.getByTestId('inline-math')).toHaveTextContent('E=mc^2');
    expect(allText()).not.toMatch(/[*`$]/);
  });

  it('opens a link without its tracking parameters', () => {
    renderInline('[Guide](https://example.com/guide?utm_source=chat&page=2&fbclid=abc)');

    fireEvent.press(screen.getByRole('link', { name: 'Guide' }));

    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/guide?page=2');
  });

  it('draws refused and in-page links as plain text with no link role', () => {
    renderInline('[Bad](javascript:alert(1)) and [Section](#intro) and [Rel](/docs)');

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(allText()).toBe('Bad and Section and Rel');
    expect(StyleSheet.flatten(screen.getByText('Bad').props.style)).not.toHaveProperty(
      'textDecorationLine',
    );
  });

  it('links a bare email address through the Open in Mail prompt', () => {
    renderInline('Write to foo@bar.com today.');

    fireEvent.press(screen.getByRole('link', { name: 'foo@bar.com' }));

    expect(alertSpy).toHaveBeenCalledWith(
      'Open in Mail?',
      'To: foo@bar.com',
      expect.arrayContaining([expect.objectContaining({ text: 'Open' })]),
    );
  });

  it('offers Open and Copy Link on a long press and copies the cleaned address', async () => {
    renderInline('[Guide](https://example.com/a?utm_medium=x&q=1)');

    fireEvent(screen.getByRole('link', { name: 'Guide' }), 'longPress');

    expect(alertSpy.mock.calls[0]?.[0]).toBe('https://example.com/a?q=1');
    const buttons = alertButtons(alertSpy);
    expect(buttons.map((button) => button.text)).toEqual([
      'Open',
      'Copy Link',
      'Share Link',
      'Cancel',
    ]);

    await act(async () => {
      buttons.find((button) => button.text === 'Copy Link')?.onPress?.();
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://example.com/a?q=1');

    buttons.find((button) => button.text === 'Open')?.onPress?.();
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/a?q=1');
  });

  it('shows a footnote when its reference is tapped and leaves an unknown one inert', () => {
    renderInline('A claim[^1] and[^9].', { '1': 'The **first** source.' });

    fireEvent.press(screen.getByRole('button', { name: 'Footnote 1' }));
    expect(alertSpy).toHaveBeenCalledWith('Footnote 1', 'The first source.');

    expect(screen.getByLabelText('Footnote 9').props.onPress).toBeUndefined();
    expect(allText()).toBe('A claim¹ and⁹.');
  });

  it('raises superscript text that has no superscript characters', () => {
    renderInline('x<sup>abc</sup> and y<sub>xyz</sub>');

    const [raised, lowered] = screen.getAllByTestId('markdown-script-shift');
    expect(raised).toHaveStyle({ transform: [{ translateY: -Math.round(typeScale.caption / 2) }] });
    expect(lowered).toHaveStyle({ transform: [{ translateY: Math.round(typeScale.caption / 4) }] });
    expect(screen.getByText('abc')).toHaveStyle({ fontSize: typeScale.caption });
  });

  it('shows nothing for script and style elements and drops layout tags', () => {
    renderInline('<div>Kept <script>steal()</script>text<style>b{}</style></div>');

    expect(allText()).toBe('Kept text');
  });

  it('opens an html anchor and an html image through the same link route as Markdown', () => {
    renderInline(
      'Read <a href="https://example.com/docs?utm_source=chat">the docs</a> and <img src="https://example.com/a.png" alt="the chart"> then<!-- note --> stop.',
    );

    fireEvent.press(screen.getByRole('link', { name: 'the docs' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/docs');
    fireEvent.press(screen.getByRole('link', { name: 'the chart' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/a.png');
    expect(allText()).toBe('Read the docs and the chart then stop.');
  });

  it('draws an html anchor with a script address as plain text', () => {
    renderInline('<a href="javascript:alert(1)">tap</a>');

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(allText()).toBe('tap');
  });

  it('breaks the line at a trailing backslash with no backslash shown', () => {
    renderInline('first\\\nsecond');

    expect(allText()).toBe('first\nsecond');
  });

  it('keeps a private-use character exactly as written', () => {
    renderInline('Icon \uE02A here \\* and \uE05F');

    expect(allText()).toBe('Icon \uE02A here * and \uE05F');
  });

  describe('citation markers', () => {
    describe('linkifyNumericCitations', () => {
      const NEWS: CitationSource[] = [{ url: 'https://news.example/story', title: 'News' }];
      const SOURCE = 'Rose [1] per [news.example](https://news.example/story).';

      it('keeps a bare [n] as plain text and turns only the matching link into a chip', () => {
        render(
          <>
            {renderInlineMarkdown(SOURCE, 'k', undefined, NEWS, undefined, {
              linkifyNumericCitations: false,
            })}
          </>,
        );

        expect(allText()).toContain('Rose [1] per');
        expect(screen.getAllByRole('link', { name: /^Citation \d/ })).toHaveLength(1);
        expect(screen.getByRole('link', { name: /Citation 1: / })).toBeTruthy();
      });

      it('shows a chip for the bare marker and one for the link when the option is left out', () => {
        render(<>{renderInlineMarkdown(SOURCE, 'k', undefined, NEWS)}</>);

        expect(allText()).not.toContain('[1]');
        expect(screen.getAllByRole('link', { name: /^Citation \d/ })).toHaveLength(2);
      });
    });

    it('shows the publisher for a numbered marker and previews that source on tap', () => {
      renderCited('Rates rose [1].');

      expect(allText()).toBe('Rates rose reuters.com.');
      fireEvent.press(screen.getByRole('link', { name: /Citation 1: Rates explained/ }));

      expect(alertSpy.mock.calls[0]?.[0]).toBe('Rates explained');
      expect(String(alertSpy.mock.calls[0]?.[1])).toContain('reuters.com');
      const open = alertButtons(alertSpy).find((button) => button.text === 'Open page');
      open?.onPress?.();
      expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://www.reuters.com/a');
    });

    it('groups a run of markers into one control that lists every source', () => {
      renderCited('Both agree [1][2].');

      expect(allText()).toBe('Both agree reuters.com +1.');
      fireEvent.press(screen.getByRole('link', { name: /Citation 1, 2/ }));

      expect(alertSpy.mock.calls[0]?.[0]).toBe('2 sources');
      expect(alertButtons(alertSpy).map((button) => button.text)).toEqual([
        '[1] Rates explained',
        '[2] Outlook',
        'Cancel',
      ]);
      alertButtons(alertSpy)[1]?.onPress?.();
      expect(alertSpy.mock.calls[1]?.[0]).toBe('Outlook');
    });

    it('leaves a marker with no delivered or openable source as plain text', () => {
      renderCited('Gone [7] and local [3].');

      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(allText()).toBe('Gone [7] and local [3].');
    });

    it('does not turn reference definitions or reference links into markers', () => {
      const { toJSON } = renderCited('See [the docs][1] now.\n[1]: https://example.com/d');

      expect(JSON.stringify(toJSON())).not.toContain('Citation');
    });

    it('drops the parentheses that wrap a marker', () => {
      renderCited('Rates rose ([1]).');

      expect(allText()).toBe('Rates rose reuters.com.');
    });

    it('keeps a bracketed index in code and a streaming marker as written', () => {
      renderCited('Use `rows[1]` then [2');

      expect(allText()).toBe('Use rows[1] then [2');
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    it('turns a link whose text is only the source domain into that source marker', () => {
      renderCited('Read [ft.com](https://www.ft.com/b) today');

      expect(allText()).toBe('Read ft.com today');
      expect(screen.getByRole('link', { name: /Citation 2: Outlook/ })).toBeTruthy();
    });

    it('keeps a link with words of its own as a link', () => {
      renderCited('Read [the FT outlook](https://www.ft.com/b) today');

      expect(screen.getByRole('link', { name: 'the FT outlook' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: /Citation/ })).toBeNull();
    });

    it('gives the marker a hit area that reaches 44 points on each axis', () => {
      renderCited('Rates rose [1].');

      const marker = screen.getByRole('link', { name: /Citation 1/ });
      const slop = marker.props.hitSlop as {
        top: number;
        bottom: number;
        left: number;
        right: number;
      };
      expect(slop.top + slop.bottom + typeScale.body).toBeGreaterThanOrEqual(44);
      expect(slop.left + slop.right).toBeGreaterThanOrEqual(24);
    });
  });

  describe('links that open', () => {
    it('alerts when the page cannot be opened', async () => {
      (openUntrustedUrlInAppBrowser as jest.Mock).mockResolvedValueOnce(false);
      renderInline('[Guide](https://example.com/guide)');

      await act(async () => {
        fireEvent.press(screen.getByRole('link', { name: 'Guide' }));
      });

      expect(alertSpy).toHaveBeenCalledWith('Could not open link', expect.any(String));
    });

    it('routes a link to this app in the app and leaves an unknown path as plain text', () => {
      renderInline(
        '[Chat](/chat/abc-1) [Mine](https://agiworkforce.com/open/chat/xyz) [Gone](/nowhere)',
      );

      fireEvent.press(screen.getByRole('link', { name: 'Chat' }));
      fireEvent.press(screen.getByRole('link', { name: 'Mine' }));

      expect(router.push).toHaveBeenNthCalledWith(1, '/(app)/open/chat/abc-1');
      expect(router.push).toHaveBeenNthCalledWith(2, '/(app)/open/chat/xyz');
      expect(openUntrustedUrlInAppBrowser).not.toHaveBeenCalled();
      expect(screen.queryByRole('link', { name: 'Gone' })).toBeNull();
    });

    it('shares the cleaned address from the long-press menu and confirms a copy', async () => {
      const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
      renderInline('[Guide](https://example.com/a?utm_medium=x&q=1)');

      fireEvent(screen.getByRole('link', { name: 'Guide' }), 'longPress');
      const buttons = alertButtons(alertSpy);
      await act(async () => {
        buttons.find((button) => button.text === 'Copy Link')?.onPress?.();
      });
      buttons.find((button) => button.text === 'Share Link')?.onPress?.();

      expect(showToast).toHaveBeenCalledWith('Copied');
      expect(share).toHaveBeenCalledWith({ message: 'https://example.com/a?q=1' });
      share.mockRestore();
    });

    it('opens an image written inside a sentence as a link labelled with its alt text', () => {
      renderInline('See ![chart](https://example.com/c.png) here');

      fireEvent.press(screen.getByRole('link', { name: 'chart' }));

      expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/c.png');
    });
  });

  describe('reference links, math and footnotes', () => {
    it('links a reference to the URL its definition gives and hides unknown references', () => {
      render(
        <>
          {renderInlineMarkdown('Go to [docs][ref] or [nope][zz]', 'test', colors, [], undefined, {
            linkDefinitions: { ref: 'https://example.com/docs' },
          })}
        </>,
      );

      fireEvent.press(screen.getByRole('link', { name: 'docs' }));
      expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/docs');
      expect(allText()).toBe('Go to docs or [nope][zz]');
    });

    it('draws inline math in the colour the surrounding text uses, including inside a quote', () => {
      const quoteColors = { ...colors, textPrimary: colors.textSecondary };
      render(<>{renderInlineMarkdown('so $x^2$ holds', 'test', quoteColors)}</>);
      expect(screen.getByTestId('inline-math').props.accessibilityHint).toBe(colors.textSecondary);
      screen.unmount();
      render(<>{renderInlineMarkdown('so $x^2$ holds', 'test', colors)}</>);
      expect(screen.getByTestId('inline-math').props.accessibilityHint).toBe(colors.textPrimary);
    });

    it('draws double-dollar math inside a sentence as inline math', () => {
      renderInline('so $$x^2$$ is small');

      expect(screen.getByTestId('inline-math')).toHaveTextContent('x^2');
      expect(allText()).toBe('so x^2 is small');
    });

    it('decodes named entities beyond the common ones and ignores a prototype name', () => {
      renderInline('&alpha; &check; &rarr; &constructor;');

      expect(allText()).toBe('\u03b1 \u2713 \u2192 &constructor;');
    });

    it('draws a lifted badge as a pill with its label and the success tint', () => {
      renderInline('Status <span class="answer-badge">Verified</span> today');

      const badge = screen.getByTestId('markdown-answer-badge');
      expect(badge).toHaveStyle({
        backgroundColor: colors.successSurface,
        borderRadius: radii.full,
        paddingHorizontal: spacing.sm,
      });
      expect(badge.props.accessibilityLabel).toBe('Verified');
      expect(screen.getByText('Verified')).toHaveStyle({
        color: colors.agentSuccess,
        fontSize: typeScale.caption,
      });
      expect(allText()).toBe('Status Verified today');
    });

    it('opens a shortcut reference link whose definition came with the answer', () => {
      render(
        <>
          {renderInlineMarkdown('See [Docs] or [Gone].', 'test', colors, [], undefined, {
            linkDefinitions: { docs: 'https://docs.example.com/start' },
          })}
        </>,
      );

      expect(allText()).toBe('See Docs or [Gone].');
      fireEvent.press(screen.getByText('Docs'));
      expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://docs.example.com/start');
    });

    it('hands a tapped footnote to the caller to jump to, numbering named notes by position', () => {
      const jump = jest.fn();
      render(
        <>
          {renderInlineMarkdown(
            'Claim[^b] and[^a].',
            'test',
            colors,
            [],
            { b: 'Bee', a: 'Ay' },
            {
              onFootnotePress: jump,
            },
          )}
        </>,
      );

      expect(allText()).toBe('Claim\u00b9 and\u00b2.');
      fireEvent.press(screen.getByRole('button', { name: 'Footnote 2' }));
      expect(jump).toHaveBeenCalledWith('a');
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });
});

describe('inline menus on Android', () => {
  const PHONE: Metrics = {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 24, right: 0, bottom: 16, left: 0 },
  };
  const FOUR_SOURCES: CitationSource[] = [
    { title: 'Rates explained', url: 'https://www.reuters.com/a' },
    { title: 'Outlook', url: 'https://www.ft.com/b' },
    { title: 'Markets', url: 'https://www.bbc.co.uk/c' },
    { title: 'Housing', url: 'https://www.nytimes.com/d' },
  ];
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    platform.restore();
    jest.useRealTimers();
  });

  function renderWithHost(source: string, citations: CitationSource[] = []) {
    return render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <Text>{renderInlineMarkdown(source, 'test', colors, citations)}</Text>
        <ActionMenuHost />
      </SafeAreaProvider>,
    );
  }

  it('offers Open, Copy Link and Share Link in the app sheet, which Cancel closes', () => {
    renderWithHost('[Guide](https://example.com/a?utm_medium=x&q=1)');

    fireEvent(screen.getByRole('link', { name: 'Guide' }), 'longPress');

    expect(alertSpy).not.toHaveBeenCalled();
    expect(actionMenuTitle()).toBe('https://example.com/a?q=1');
    expect(actionMenuLabels()).toEqual(['Open', 'Copy Link', 'Share Link']);
    cancelActionMenu();
    expect(isActionMenuOpen()).toBe(false);
    expect(openUntrustedUrlInAppBrowser).not.toHaveBeenCalled();
  });

  it('runs each link action from the sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    renderWithHost('[Guide](https://example.com/a?utm_medium=x&q=1)');
    const link = () => screen.getByRole('link', { name: 'Guide' });

    fireEvent(link(), 'longPress');
    chooseActionMenuItem('Share Link');
    expect(share).toHaveBeenCalledWith({ message: 'https://example.com/a?q=1' });

    fireEvent(link(), 'longPress');
    chooseActionMenuItem('Copy Link');
    await act(async () => {});
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://example.com/a?q=1');

    fireEvent(link(), 'longPress');
    chooseActionMenuItem('Open');
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/a?q=1');
    share.mockRestore();
  });

  it('lists every source of a grouped citation and previews the one chosen', () => {
    renderWithHost('All agree [1][2][3][4].', FOUR_SOURCES);

    fireEvent.press(screen.getByRole('link', { name: /Citation 1, 2, 3, 4/ }));

    expect(actionMenuTitle()).toBe('4 sources');
    expect(actionMenuLabels()).toEqual([
      '[1] Rates explained',
      '[2] Outlook',
      '[3] Markets',
      '[4] Housing',
    ]);
    chooseActionMenuItem('[4] Housing');
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe('Housing');
  });
});
