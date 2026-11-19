import { Alert, PixelRatio, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

const mockPictures: Record<string, unknown>[] = [];

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: (props: Record<string, unknown>) => {
      mockPictures.push(props);
      return <View testID="inline-picture" {...props} />;
    },
  };
});
jest.mock('@/lib/safeOpenURL', () => ({
  isInAppBrowsableUrl: (value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value),
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));

import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { chatTypography } from '@/src/ui/theme/tokens';
import { renderMarkdownContent, type MarkdownRenderOptions } from '../MessageContentRenderer';
import {
  prepareMarkdownSource,
  splitInlineImages,
  splitParagraphImages,
} from '../markdownBlockSyntax';

function renderMarkdown(content: string, options?: MarkdownRenderOptions) {
  return render(<>{renderMarkdownContent(content, undefined, options)}</>);
}

function tree(content: string): string {
  const view = renderMarkdown(content);
  const json = JSON.stringify(view.toJSON());
  view.unmount();
  return json;
}

const STREAMING = { highlightCode: false } as const;
const STOPPED = { stopped: true } as const;

beforeEach(() => {
  mockPictures.length = 0;
  jest.clearAllMocks();
});

describe('runs of blank lines', () => {
  it('draws one paragraph gap however many blank lines separate two paragraphs', () => {
    expect(tree('a\n\n\n\nb')).toBe(tree('a\n\nb'));
    expect(tree('a\n \n\t\n\nb')).toBe(tree('a\n\nb'));
  });

  it('adds nothing for blank lines before the first and after the last paragraph', () => {
    expect(tree('\n\n\na\n\n\n')).toBe(tree('a'));
  });

  it('still separates paragraphs by a gap', () => {
    expect(tree('a\n\nb')).not.toBe(tree('a\nb'));
  });
});

describe('lazy continuation of a block quote', () => {
  it('keeps a following line without a marker inside the quote', () => {
    renderMarkdown('> first\nsecond');
    const quote = screen.getByTestId('markdown-blockquote');
    expect(within(quote).getByText('first\nsecond')).toBeTruthy();
  });

  it('keeps several unmarked lines and a marked line in the same quote', () => {
    renderMarkdown('> one\ntwo\n> three\nfour');
    const quote = screen.getByTestId('markdown-blockquote');
    expect(within(quote).getByText('one\ntwo\nthree\nfour')).toBeTruthy();
    expect(screen.getAllByTestId('markdown-blockquote')).toHaveLength(1);
  });

  it('ends the quote at a blank line', () => {
    renderMarkdown('> a\n\nb');
    const quote = screen.getByTestId('markdown-blockquote');
    expect(within(quote).getByText('a')).toBeTruthy();
    expect(within(quote).queryByText('b')).toBeNull();
    expect(screen.getByText('b')).toBeTruthy();
  });

  it('ends the quote at a line that opens another block', () => {
    for (const opener of ['- item', '# Heading', '1. first']) {
      const view = renderMarkdown(`> a\n${opener}`);
      const quote = view.getByTestId('markdown-blockquote');
      expect(within(quote).getByText('a')).toBeTruthy();
      expect(within(quote).queryByText(/item|Heading|first/)).toBeNull();
      view.unmount();
    }
  });

  it('does not pull a code fence or a thematic break into the quote', () => {
    const rules = (root: ReactTestInstance) =>
      root.findAll((node) => StyleSheet.flatten(node.props?.style)?.height === 1);

    const fence = renderMarkdown('> a\n```js\nconst x = 1;\n```');
    const fenceQuote = fence.getByTestId('markdown-blockquote');
    expect(within(fenceQuote).getByText('a')).toBeTruthy();
    expect(within(fenceQuote).queryByLabelText('js code block')).toBeNull();
    expect(fence.getByLabelText('js code block')).toBeTruthy();
    fence.unmount();

    const rule = renderMarkdown('> a\n---');
    const ruleQuote = rule.getByTestId('markdown-blockquote');
    expect(within(ruleQuote).getByText('a')).toBeTruthy();
    expect(rules(ruleQuote)).toHaveLength(0);
    expect(rules(rule.UNSAFE_root)).not.toHaveLength(0);
  });

  it('does not continue after a heading or a code fence inside the quote', () => {
    const afterHeading = renderMarkdown('> # Title\nplain');
    expect(within(afterHeading.getByTestId('markdown-blockquote')).queryByText('plain')).toBeNull();
    afterHeading.unmount();

    const afterFence = renderMarkdown('> ```\n> code\nplain');
    expect(within(afterFence.getByTestId('markdown-blockquote')).queryByText('plain')).toBeNull();
  });
});

describe('an image whose address is still arriving', () => {
  it('shows nothing of it in the middle of a sentence while streaming', () => {
    const view = renderMarkdown('See ![chart](https://exam', STREAMING);
    expect(view.getByText('See')).toBeTruthy();
    expect(view.queryByText(/!\[/)).toBeNull();
    expect(view.queryByText(/exam/)).toBeNull();
  });

  it('shows nothing of it at the start of a line while streaming', () => {
    for (const partial of ['![chart](https://exam', '![chart](', '![chart]', '![cha', '![']) {
      const view = renderMarkdown(`Look:\n${partial}`, STREAMING);
      expect(JSON.stringify(view.toJSON())).not.toContain('![');
      view.unmount();
    }
  });

  it('draws the image once its closing bracket arrives', () => {
    renderMarkdown('See ![chart](https://example.com/c.png) now', STREAMING);
    expect(screen.getByLabelText('Load image from example.com')).toBeTruthy();
  });

  it('shows the alt text of a stopped answer that ends inside an image', () => {
    const view = renderMarkdown('See ![chart](https://exam', STOPPED);
    expect(view.getByText('See chart')).toBeTruthy();
    expect(view.queryByText(/!\[|exam/)).toBeNull();
    view.unmount();

    const lineStart = renderMarkdown('Look:\n\n![chart](https://exam', STOPPED);
    expect(lineStart.getByText('chart')).toBeTruthy();
    expect(JSON.stringify(lineStart.toJSON())).not.toContain('![');
  });

  it('shows nothing for a stopped image with no alt text', () => {
    const view = renderMarkdown('See ![](https://exam', STOPPED);
    expect(view.getByText('See')).toBeTruthy();
    expect(view.queryByText(/!\[|exam/)).toBeNull();
  });

  it('drops the marker of a list item that held only the image', () => {
    expect(prepareMarkdownSource('- one\n- ![chart](https://exam', true)).toBe('- one\n');
    expect(prepareMarkdownSource('- one\n- ![chart](https://exam', false, true)).toBe(
      '- one\n- chart',
    );
    expect(prepareMarkdownSource('- one\n- ![](https://exam', false, true)).toBe('- one\n');
  });

  it('leaves code fences, code spans and settled answers alone', () => {
    const fenced = '```md\n![chart](https://exam';
    expect(prepareMarkdownSource(fenced, true)).toContain('![chart](https://exam');
    expect(prepareMarkdownSource('Run `![a](http', true)).toContain('![a](http');
    expect(prepareMarkdownSource('Run `x` then ![a](http', true)).toBe('Run `x` then ');
    expect(prepareMarkdownSource('    ![a](http', true)).toContain('![a](http');
    expect(prepareMarkdownSource('See ![a](https://exam', false)).toContain('![a](https://exam');
  });

  it('leaves an open image inside a fence held by a quote or a nested list item', () => {
    for (const source of [
      '> ```md\n> ![a](http',
      '- item\n\n    ```md\n    ![a](http',
      '- item\n  - inner\n      ```md\n      ![a](http',
    ]) {
      expect(prepareMarkdownSource(source, true)).toContain('![a](http');
      expect(prepareMarkdownSource(source, false, true)).toContain('![a](http');
    }
  });

  it('leaves an open image on any line of an indented code block', () => {
    for (const source of ['    one\n    ![a](http', 'Text\n\n    one\n\n    ![a](http']) {
      expect(prepareMarkdownSource(source, true)).toContain('![a](http');
      expect(prepareMarkdownSource(source, false, true)).toContain('![a](http');
    }
  });

  it('still cuts an open image on an indented line that continues a list item', () => {
    expect(prepareMarkdownSource('- item\n    ![a](http', true)).toBe('- item\n');
    expect(prepareMarkdownSource('Text\n    ![a](http', true)).toBe('Text\n');
  });

  it('cuts an open image after a fence that was closed inside a quote', () => {
    expect(prepareMarkdownSource('> ```\n> code\n> ```\n![a](http', true)).toBe(
      '> ```\n> code\n> ```\n',
    );
  });

  it('leaves a finished image before an unfinished one', () => {
    const prepared = prepareMarkdownSource(
      '![a](https://a.example/a.png) and ![b](https://b',
      true,
    );
    expect(prepared).toBe('![a](https://a.example/a.png) and ');
  });
});

describe('a draft stopped before it finished', () => {
  it('shows an email stopped before its body as a draft card with a caption', () => {
    renderMarkdown('```email\nTo: ann@example.com\nSubject: Lunch', STOPPED);
    expect(screen.getByTestId('answer-surface-email')).toBeTruthy();
    expect(screen.getByDisplayValue('ann@example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('Lunch')).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe('');
    expect(screen.getByTestId('answer-surface-stopped')).toHaveTextContent(
      'Stopped before it finished',
    );
    expect(screen.getByLabelText('Copy email')).toBeTruthy();
    expect(screen.getByLabelText('Open in Mail')).toBeTruthy();
    expect(screen.queryByTestId('markdown-surface-unfinished')).toBeNull();
  });

  it('keeps the partial text of an email stopped inside its body', () => {
    renderMarkdown('```email\nTo: ann@example.com\nSubject: Lunch\n\nHi Ann, are you fr', STOPPED);
    expect(screen.getByDisplayValue('Hi Ann, are you fr')).toBeTruthy();
    expect(screen.getByTestId('answer-surface-stopped')).toBeTruthy();
  });

  it('shows a stopped writing block as a draft card with the caption', () => {
    renderMarkdown('```message\nHello the', STOPPED);
    expect(screen.getByTestId('answer-surface-writing')).toBeTruthy();
    expect(screen.getByTestId('answer-surface-stopped')).toBeTruthy();
  });

  it('keeps the code card and its note when nothing of the header arrived', () => {
    renderMarkdown('```email\nHello there', STOPPED);
    expect(screen.queryByTestId('answer-surface-email')).toBeNull();
    expect(screen.getByTestId('markdown-surface-unfinished')).toBeTruthy();
  });

  it('does not caption a draft that was finished', () => {
    renderMarkdown(
      '```email\nTo: ann@example.com\nSubject: Lunch\n\nSee you at noon.\n```',
      STOPPED,
    );
    expect(screen.getByTestId('answer-surface-email')).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-stopped')).toBeNull();
  });

  it('leaves the text of a finished card body as written when the answer was stopped', () => {
    renderMarkdown('```card\ntitle: Math\n\nSee ![x](\n```', STOPPED);
    expect(screen.getByTestId('answer-surface-card')).toBeTruthy();
    expect(screen.getByText('See ![x](')).toBeTruthy();
  });

  it('shows the alt text in the body of a card stopped before it was closed', () => {
    renderMarkdown('```card\ntitle: Math\n\nSee ![x](https://exam', STOPPED);
    expect(screen.getByTestId('answer-surface-card')).toBeTruthy();
    expect(screen.getByText('See x')).toBeTruthy();
  });

  it('keeps the code card of an email stopped before its body when the answer was not stopped', () => {
    renderMarkdown('```email\nTo: ann@example.com\nSubject: Lunch', { streaming: false });
    expect(screen.queryByTestId('answer-surface-email')).toBeNull();
    expect(screen.getByTestId('markdown-surface-unfinished')).toBeTruthy();
  });
});

describe('an HTML image inside a sentence', () => {
  it('splits it out of the sentence like a Markdown image', () => {
    expect(
      splitParagraphImages('See <img src="https://x.example/a.png" alt="the chart"> now'),
    ).toEqual([
      { kind: 'text', text: 'See' },
      { kind: 'image', alt: 'the chart', src: 'https://x.example/a.png' },
      { kind: 'text', text: 'now' },
    ]);
    expect(
      splitParagraphImages("<img alt='a' src='https://x.example/a.png' data-src='no'>"),
    ).toEqual([{ kind: 'image', alt: 'a', src: 'https://x.example/a.png' }]);
  });

  it('leaves an image that sits inside bold, italic, strike or an HTML style tag where it was', () => {
    for (const line of [
      '**Note ![i](https://x.example/i.png) here**',
      '**![i](https://x.example/i.png)**',
      '*a ![i](https://x.example/i.png) b*',
      '_a ![i](https://x.example/i.png) b_',
      '~~a ![i](https://x.example/i.png) b~~',
      '<b>x <img src="https://x.example/i.png" alt="i"> y</b>',
      '<em>x ![i](https://x.example/i.png) y</em>',
    ]) {
      expect(splitInlineImages(line, false)).toBeNull();
    }
  });

  it('still splits an image beside a style run, a stray marker or code', () => {
    for (const line of [
      '**Note** ![i](https://x.example/i.png) **here**',
      '5 * 3 ![i](https://x.example/i.png)',
      '`**` ![i](https://x.example/i.png) `**`',
      '<b>x</b> ![i](https://x.example/i.png) <b>y</b>',
    ]) {
      expect(splitInlineImages(line, false)).not.toBeNull();
    }
  });

  it('keeps bold text around an image in a list item', () => {
    const view = renderMarkdown('- **Note ![i](https://example.com/i.png) here**');
    expect(JSON.stringify(view.toJSON())).not.toContain('**');
    expect(view.getByText(/Note/)).toBeTruthy();
  });

  it('leaves an image with no source, inside code or inside a link where it was', () => {
    expect(splitParagraphImages('<img alt="no source">')).toBeNull();
    expect(
      splitParagraphImages('Write `<img src="https://x.example/a.png">` to embed.'),
    ).toBeNull();
    expect(
      splitParagraphImages('<a href="https://x.example"><img src="https://x.example/a.png"></a>'),
    ).toBeNull();
  });

  it('asks before loading it, as for a Markdown image', () => {
    renderMarkdown('See <img src="https://example.com/a.png" alt="the chart"> now');
    expect(screen.getByText('See')).toBeTruthy();
    expect(screen.getByText('now')).toBeTruthy();
    expect(screen.getByLabelText('Load image from example.com')).toBeTruthy();
    expect(screen.queryByTestId('inline-picture')).toBeNull();
  });
});

describe('an image inside a list item, a table cell or a heading', () => {
  const trusted = { trustedImageUrls: ['https://example.com/c.png'] };

  it('stays a labelled link before the person agrees to load it', () => {
    renderMarkdown('- ![chart](https://example.com/c.png) of sales');
    expect(screen.getByRole('link', { name: 'chart' })).toBeTruthy();
    expect(screen.queryByTestId('inline-picture')).toBeNull();
    expect(screen.queryByLabelText('Load image from example.com')).toBeNull();
  });

  it('offers the load from the link menu and shows a small picture afterwards', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderMarkdown('- ![chart](https://example.com/inline-load.png) of sales');

    fireEvent(screen.getByRole('link', { name: 'chart' }), 'longPress');
    const buttons = (alert.mock.calls[0]?.[2] ?? []) as { text: string; onPress?: () => void }[];
    expect(buttons.map((button) => button.text)).toContain('Load image from example.com');
    act(() => {
      buttons.find((button) => button.text === 'Load image from example.com')?.onPress?.();
    });

    expect(screen.queryByRole('link', { name: 'chart' })).toBeNull();
    expect(screen.getByTestId('inline-picture').props.source).toEqual({
      uri: 'https://example.com/inline-load.png',
    });
    expect(screen.getByText(/of sales/)).toBeTruthy();
    alert.mockRestore();
  });

  it('shows a small picture at once for an address the turn already trusts and opens it on tap', () => {
    renderMarkdown('- ![chart](https://example.com/c.png)', trusted);
    const picture = screen.getByTestId('inline-picture');
    expect(picture.props.accessibilityLabel).toBe('chart');
    expect(picture.props.style.width).toBe(picture.props.style.height);
    expect(picture.props.style.width).toBe(
      Math.round(chatTypography.body.lineHeight * PixelRatio.getFontScale()),
    );

    fireEvent.press(screen.getByRole('imagebutton', { name: 'chart' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/c.png');
  });

  it('keeps the spaces around the picture in the sentence', () => {
    renderMarkdown('- See ![chart](https://example.com/c.png) now', trusted);
    expect(screen.getByText('See  now')).toBeTruthy();
  });

  it('draws the picture in a table cell and in a heading', () => {
    renderMarkdown(
      '# ![chart](https://example.com/c.png) Sales\n\n| Chart |\n|---|\n| ![chart](https://example.com/c.png) |',
      trusted,
    );
    expect(screen.getAllByTestId('inline-picture')).toHaveLength(2);
  });

  it('falls back to the alt text as a link when the picture does not load', () => {
    renderMarkdown('- ![chart](https://example.com/c.png)', trusted);
    act(() => {
      (screen.getByTestId('inline-picture').props.onError as () => void)();
    });

    expect(screen.queryByTestId('inline-picture')).toBeNull();
    fireEvent.press(screen.getByRole('link', { name: 'chart' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/c.png');
  });

  it('keeps the link for an address that is not an image source', () => {
    renderMarkdown('- ![chart](ftp://example.com/c.png)', trusted);
    expect(screen.queryByTestId('inline-picture')).toBeNull();
  });
});
