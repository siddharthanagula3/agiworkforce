jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { colors } from '@/src/ui/theme';
import { renderMarkdownContent } from '../MessageContentRenderer';

function renderMarkdown(content: string) {
  return render(<>{renderMarkdownContent(content)}</>);
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

describe('mobile markdown emphasis', () => {
  it('draws bold italic, underscore emphasis and nested markup without stray markers', () => {
    renderMarkdown('Plain ***both*** and __under__ and _em_ and **[Docs](https://example.com)**.');

    expect(screen.getByText('both')).toHaveStyle({ fontWeight: '700', fontStyle: 'italic' });
    expect(screen.getByText('under')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('em')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy();
    expect(allText()).not.toMatch(/[*_]/);
  });

  it('leaves snake_case names and spaced asterisks as written', () => {
    renderMarkdown('Call my_var_name with 2 * 3 * 4.');
    expect(allText()).toBe('Call my_var_name with 2 * 3 * 4.');
  });
});

describe('mobile markdown blocks', () => {
  it('draws task list items as read-only checkboxes', () => {
    renderMarkdown('- [x] Done task\n- [ ] Open task');

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((box) => box.props.accessibilityState)).toEqual([
      { checked: true, disabled: true },
      { checked: false, disabled: true },
    ]);
    expect(screen.getByText('Done task')).toBeTruthy();
    expect(allText()).not.toContain('[x]');
    expect(allText()).not.toContain('[ ]');
  });

  it('renders a blockquote with its own list and paragraphs and no markers', () => {
    renderMarkdown('> A quote line\n> - quoted list item\n>\n> Second quote paragraph *stressed*');

    const quote = within(screen.getByTestId('markdown-blockquote'));
    expect(quote.getByText('A quote line')).toHaveStyle({ color: colors.textSecondary });
    expect(quote.getByText('stressed')).toHaveStyle({
      color: colors.textSecondary,
      fontStyle: 'italic',
    });
    expect(quote.getByText('quoted list item')).toBeTruthy();
    expect(quote.getByText('•')).toBeTruthy();
    expect(quote.getByText('Second quote paragraph stressed')).toBeTruthy();
    expect(allText()).not.toContain('>');
  });

  it('turns footnote references into superscripts and lists their definitions', () => {
    renderMarkdown('A claim[^1] and another[^2].\n\n[^1]: First source.\n[^2]: Second source.');

    expect(allText()).toContain('A claim¹ and another².');
    expect(screen.getByLabelText('Footnotes')).toBeTruthy();
    expect(screen.getByText('First source.')).toBeTruthy();
    expect(screen.getByText('2.')).toBeTruthy();
    expect(allText()).not.toContain('[^');
  });

  it('draws list markers and links in the text colour and keeps the square bullet as text', () => {
    renderMarkdown('- one\n  - two\n    - three\n\nSee [docs](https://example.com).');

    expect(screen.getByText('▪︎')).toBeTruthy();
    expect(screen.getByText('•')).toHaveStyle({ color: colors.textPrimary });
    expect(screen.getByRole('link', { name: 'docs' })).toHaveStyle({ color: colors.textPrimary });
  });

  it('draws spaced thematic breaks as a rule rather than bullets', () => {
    renderMarkdown('Above\n\n* * *\n\nBelow');
    expect(screen.queryByText('•')).toBeNull();
    expect(allText()).toBe('AboveBelow');
  });

  it('keeps an indented continuation line inside its list item', () => {
    renderMarkdown('1. Step one\n   More detail\n2) Step two');

    expect(screen.getByText('Step one\nMore detail')).toBeTruthy();
    expect(screen.getByText('2)')).toBeTruthy();
  });

  it('aligns table columns the way the separator row asks', () => {
    renderMarkdown('| Left | Right |\n| :--- | ---: |\n| a | 10 |');
    expect(screen.getByText('10')).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByText('a')).toHaveStyle({ textAlign: 'left' });
  });
});

describe('mobile markdown links, entities and images', () => {
  it('links a bare URL without its trailing punctuation', () => {
    renderMarkdown('Visit https://example.com/page. Or (see https://example.com/a_(b)).');

    fireEvent.press(screen.getByRole('link', { name: 'https://example.com/page' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/page');
    expect(screen.getByRole('link', { name: 'https://example.com/a_(b)' })).toBeTruthy();
    expect(allText()).toContain('https://example.com/page. Or');
  });

  it('decodes HTML entities, line breaks and simple inline tags outside code', () => {
    renderMarkdown('Tom &amp; Jerry &lt;tag&gt; H<sub>2</sub>O x<sup>2</sup> a<br>b `&amp;`');

    expect(allText()).toContain('Tom & Jerry <tag> H₂O x² a\nb');
    expect(screen.getByText('&amp;')).toBeTruthy();
  });

  it('asks before loading an image from another site', () => {
    renderMarkdown('![A chart](https://example.com/chart.png)');

    expect(allText()).not.toContain('!');
    expect(screen.getByText(/Image from example\.com/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Load image from example.com' }));
    expect(screen.getByRole('imagebutton', { name: 'A chart' })).toBeTruthy();
  });
});
