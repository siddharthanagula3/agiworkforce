import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockCharts: unknown[] = [];
const mockSlides: (readonly string[])[] = [];

const mockMath: { latex: string; display: boolean; color?: string }[] = [];

jest.mock('../MathBlock', () => ({
  MathBlock: ({ latex, display, color }: { latex: string; display: boolean; color?: string }) => {
    mockMath.push({ latex, display, ...(display && color ? { color } : {}) });
    return null;
  },
}));
jest.mock('../ReportChart', () => ({
  ReportChart: ({ chart }: { chart: unknown }) => {
    mockCharts.push(chart);
    return null;
  },
  chartSeriesColor: (_colors: unknown, index: number) => String(index),
}));
jest.mock('../SvgGallery', () => ({
  SvgGallery: ({ slides }: { slides: readonly string[] }) => {
    mockSlides.push(slides);
    return null;
  },
}));

import { extractMarkdownHeadings } from '@agiworkforce/unified-chat/markdown-headings';
import { colors as defaultColors } from '@/src/ui/theme';
import {
  renderMarkdownContent,
  scaleColumnWidth,
  type MarkdownRenderOptions,
} from '../MessageContentRenderer';
import {
  collectDetails,
  collectFootnoteDefinitions,
  isOpenImageTail,
  referencedFootnotes,
  setextHeadingLevel,
  splitParagraphImages,
} from '../markdownBlockSyntax';

function renderMarkdown(content: string, options?: MarkdownRenderOptions) {
  return render(<>{renderMarkdownContent(content, undefined, options)}</>);
}

beforeEach(() => {
  mockMath.length = 0;
  mockCharts.length = 0;
  mockSlides.length = 0;
});

describe('footnote references', () => {
  it('collects every definition outside fences, first one wins, with its continuation', () => {
    expect(
      collectFootnoteDefinitions(
        [
          'Claim[^1] and[^note].',
          '',
          '[^1]: First source.',
          '    continued here',
          '[^note]: Second.',
          '[^1]: Ignored duplicate.',
          '```',
          '[^code]: not a note',
          '```',
        ].join('\n'),
      ),
    ).toEqual({ '1': 'First source.\ncontinued here', note: 'Second.' });
  });

  it('opens the note when the reader taps its marker in a paragraph, list item and table', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderMarkdown(
      [
        'Paragraph claim[^1].',
        '',
        '- Listed claim[^1]',
        '',
        '| Claim | Note |',
        '| --- | --- |',
        '| Cell | See[^1] |',
        '',
        '[^1]: The **source** text.',
      ].join('\n'),
    );

    const markers = screen.getAllByRole('button', { name: 'Footnote 1' });
    expect(markers).toHaveLength(3);
    for (const marker of markers) fireEvent.press(marker);
    expect(alertSpy).toHaveBeenCalledTimes(3);
    expect(alertSpy).toHaveBeenLastCalledWith('Footnote 1', 'The source text.');
    alertSpy.mockRestore();
  });
});

describe('raw HTML blocks', () => {
  it('drops a script or style element that spans several lines', () => {
    const view = renderMarkdown(
      [
        'Before',
        '<script>',
        'alert(1)',
        '</script>',
        '<style>',
        'p { color: red }',
        '</style>',
        'After',
      ].join('\n'),
    );

    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('alert(1)');
    expect(JSON.stringify(view.toJSON())).not.toContain('color: red');
  });

  it('hides an HTML comment block, as the web renderer does', () => {
    const view = renderMarkdown('<!-- deck -->\n# Title');

    expect(screen.getByText('Title')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('deck');
  });

  it('hides a comment that spans lines and keeps the paragraphs around it apart', () => {
    const view = renderMarkdown(['Before', '<!-- a note', 'for the model -->', 'After'].join('\n'));

    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('note');
  });

  it('drops the rest of an unclosed script while it streams', () => {
    const view = renderMarkdown(['Before', '<script>', 'let a = 1'].join('\n'), {
      streaming: true,
      highlightCode: false,
    });

    expect(screen.getByText('Before')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('let a = 1');
  });

  it('drops a script that opens mid-line and keeps the words around it', () => {
    const view = renderMarkdown(['Intro <script>', 'alert(1)', '</script> outro'].join('\n'));

    expect(screen.getByText(/^Intro\s+outro$/)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('alert(1)');
  });

  it('keeps a script shown as code inside a fence', () => {
    renderMarkdown(['```html', '<script>', 'alert(1)', '</script>', '```'].join('\n'));

    expect(screen.getByLabelText('html code block').props.accessibilityValue).toEqual({
      text: '<script>\nalert(1)\n</script>',
    });
  });

  it('renders details as a collapsed disclosure that opens on tap', () => {
    renderMarkdown(
      [
        '<details>',
        '<summary>More **info**</summary>',
        '',
        'Hidden body',
        '</details>',
        'Tail',
      ].join('\n'),
    );

    const toggle = screen.getByRole('button', { name: 'More info' });
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByText('Hidden body')).toBeNull();
    expect(screen.getByText('Tail')).toBeTruthy();

    fireEvent.press(toggle);

    expect(screen.getByText('Hidden body')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More info' }).props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it('reads nested details, the open attribute and a missing summary', () => {
    const lines = [
      '<details open>',
      'Outer',
      '<details><summary>Inner</summary>x</details>',
      '</details>',
      'after',
    ];
    expect(collectDetails(lines, 0)).toEqual({
      summary: 'Details',
      body: 'Outer\n<details><summary>Inner</summary>x</details>',
      initiallyOpen: true,
      closed: true,
      next: 4,
    });
  });
});

describe('images inside a sentence', () => {
  it('shows a mid-sentence image behind the same load control as a full-line image', () => {
    renderMarkdown('See ![Chart](https://example.com/chart.png) for the trend.');

    expect(screen.getByText('See')).toBeTruthy();
    expect(screen.getByText('for the trend.')).toBeTruthy();
    expect(screen.getByLabelText('Load image from example.com')).toBeTruthy();
  });

  it('leaves a linked badge image and an image in a code span inside the sentence', () => {
    expect(
      splitParagraphImages('[![Build](https://ci.example/b.svg)](https://ci.example)'),
    ).toBeNull();
    expect(splitParagraphImages('Write `![a](https://x.example/a.png)` to embed.')).toBeNull();
    expect(splitParagraphImages('A ![x](https://x.example/a.png) b')).toEqual([
      { kind: 'text', text: 'A' },
      { kind: 'image', alt: 'x', src: 'https://x.example/a.png' },
      { kind: 'text', text: 'b' },
    ]);
  });

  it('loads an image from a page this answer cites without asking', () => {
    renderMarkdown('![Photo](https://news.example/photo.jpg#top)', {
      citations: [{ url: 'https://news.example/photo.jpg', title: 'News' }],
    });
    expect(screen.queryByLabelText('Load image from news.example')).toBeNull();
  });

  it('loads an image from a page the turn searched without asking', () => {
    renderMarkdown('![Photo](https://search.example/p.png)', {
      trustedImageUrls: ['https://search.example/p.png'],
    });
    expect(screen.queryByLabelText('Load image from search.example')).toBeNull();
  });

  it('carries the image title on a full-line and a mid-sentence image', () => {
    renderMarkdown(
      [
        '![Sales](https://search.example/a.png "Weekly sales")',
        '',
        'See ![Map](https://search.example/b.png "Store map") here.',
      ].join('\n'),
      { trustedImageUrls: ['https://search.example/a.png', 'https://search.example/b.png'] },
    );

    expect(screen.getByHintText('Weekly sales. Opens the image in the browser')).toBeTruthy();
    expect(screen.getByHintText('Store map. Opens the image in the browser')).toBeTruthy();
    expect(splitParagraphImages('A ![x](https://x.example/a.png "T") b')?.[1]).toEqual({
      kind: 'image',
      alt: 'x',
      src: 'https://x.example/a.png',
      title: 'T',
    });
  });

  it('still asks for an image no tool or search returned', () => {
    renderMarkdown('![Photo](https://other.example/p.png)', {
      trustedImageUrls: ['https://search.example/p.png'],
    });
    expect(screen.getByLabelText('Load image from other.example')).toBeTruthy();
  });
});

describe('task lists', () => {
  const tasks = ['- [ ] Verify-chat-rendering', '- [x] Ship', '  - [ ] Nested task'].join('\n');

  it('shows a slug label with spaces once the answer has settled, not while it streams', () => {
    renderMarkdown(tasks);
    expect(screen.getByText('Verify chat rendering')).toBeTruthy();

    renderMarkdown(tasks, { highlightCode: false });
    expect(screen.getByText('Verify-chat-rendering')).toBeTruthy();
  });

  it('hands the ordinal of the ticked task to an editable document', () => {
    const onTaskToggle = jest.fn();
    renderMarkdown(tasks, { onTaskToggle });

    fireEvent.press(screen.getByRole('checkbox', { name: 'Ship' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'Nested task' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'Verify chat rendering' }));

    expect(onTaskToggle.mock.calls).toEqual([[1], [2], [0]]);
    expect(screen.getByRole('checkbox', { name: 'Ship' }).props.accessibilityState).toEqual({
      checked: true,
    });
  });

  it('keeps tasks read-only in a chat answer, while streaming, and inside a quote', () => {
    const onTaskToggle = jest.fn();
    const cases: [string, MarkdownRenderOptions][] = [
      [tasks, {}],
      [tasks, { onTaskToggle, highlightCode: false }],
      ['> - [ ] Quoted', { onTaskToggle }],
    ];
    for (const [content, options] of cases) {
      const view = renderMarkdown(content, options);
      const boxes = view.getAllByRole('checkbox');
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.props.accessibilityState.disabled).toBe(true);
        fireEvent.press(box);
      }
      view.unmount();
    }
    expect(onTaskToggle).not.toHaveBeenCalled();
  });
});

describe('chart fences', () => {
  it('plots a JSON fence that names a chart type once the answer has settled', () => {
    const fence = [
      '```json',
      '{"type": "bar", "title": "Sales", "data": [{"month": "Jan", "sales": 3}, {"month": "Feb", "sales": 5}]}',
      '```',
    ].join('\n');

    renderMarkdown(fence, { highlightCode: false });
    expect(mockCharts).toHaveLength(0);

    renderMarkdown(fence);
    expect(mockCharts).toEqual([
      expect.objectContaining({
        kind: 'xy',
        title: 'Sales',
        categories: ['Jan', 'Feb'],
        series: [expect.objectContaining({ type: 'bar', values: [3, 5] })],
      }),
    ]);
  });

  it('draws a donut chart fence as a donut, not as bars', () => {
    renderMarkdown(
      [
        '```chart',
        '{"type": "donut", "data": [{"label": "A", "value": 2}, {"label": "B", "value": 3}]}',
        '```',
      ].join('\n'),
    );
    expect(mockCharts).toEqual([
      expect.objectContaining({ kind: 'pie', donut: true, slices: expect.any(Array) }),
    ]);
  });

  it('keeps an unfinished Mermaid pie as code while it streams and plots it when it closes', () => {
    const open = ['```mermaid', 'pie title Pets', '"Dogs" : 3', '"Cats" : 2'].join('\n');
    renderMarkdown(open, { highlightCode: false });
    expect(mockCharts).toHaveLength(0);
    expect(screen.getByText('mermaid')).toBeTruthy();

    renderMarkdown(`${open}\n\`\`\``, { highlightCode: false });
    expect(mockCharts).toEqual([expect.objectContaining({ kind: 'pie' })]);
  });
});

describe('SVG fences', () => {
  it('shows each svg picture in the gallery instead of its source', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const view = renderMarkdown(['Intro', '', '```svg', svg, '```', '', 'Outro'].join('\n'));

    expect(mockSlides).toEqual([[svg]]);
    expect(screen.getByText('Intro')).toBeTruthy();
    expect(screen.getByText('Outro')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('viewBox');
  });
});

describe('tables with more cells than headers', () => {
  it('draws the table with the extra cells dropped, as GFM does', () => {
    renderMarkdown(['| A | B |', '| --- | --- |', '| 1 | 2 | 3 |'].join('\n'));

    expect(screen.getByTestId('markdown-table')).toBeTruthy();
    expect(screen.queryByLabelText('markdown code block')).toBeNull();
    expect(screen.queryByText('3')).toBeNull();
  });

  it('keeps a table whose short rows leave cells blank', () => {
    renderMarkdown(['| A | B |', '| --- | --- |', '| 1 |'].join('\n'));
    expect(screen.getByTestId('markdown-table')).toBeTruthy();
  });
});

describe('answer surfaces while they stream', () => {
  it('holds back a half-written last line instead of flashing the source', () => {
    renderMarkdown(['```form', 'title: Feedback', 'text: Name', 'emai'].join('\n'), {
      highlightCode: false,
    });
    expect(screen.getAllByText('Feedback').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('answer-fallback')).toBeNull();
  });

  it('shows one placeholder while nothing parses yet', () => {
    renderMarkdown(['```form', 'titl'].join('\n'), { highlightCode: false });
    expect(screen.getByTestId('markdown-surface-pending')).toBeTruthy();
    expect(screen.queryByText('titl')).toBeNull();
  });

  it('after Stop shows the source with a not finished notice', () => {
    renderMarkdown(['```form', 'titl'].join('\n'), { streaming: false });
    expect(screen.getByTestId('markdown-surface-unfinished')).toBeTruthy();
    expect(screen.getByLabelText('form code block').props.accessibilityValue).toEqual({
      text: 'titl',
    });
  });
});

describe('reference links', () => {
  it('links a reference to its definition and hides the definition line', () => {
    const view = renderMarkdown(
      [
        'See [the docs][docs] and [the guide][Guide].',
        '',
        '[docs]: https://example.com/docs',
        '[guide]: <https://example.com/guide> "Guide"',
      ].join('\n'),
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(JSON.stringify(view.toJSON())).not.toContain('[docs]:');
    expect(JSON.stringify(view.toJSON())).not.toContain('https://example.com/guide>');
  });

  it('keeps a definition-like line inside a fence and one that continues a paragraph', () => {
    const view = renderMarkdown(
      [
        '```text',
        '[docs]: https://example.com/docs',
        '```',
        'Text',
        '[later]: https://example.com/l',
      ].join('\n'),
    );
    expect(screen.getByLabelText('text code block').props.accessibilityValue).toEqual({
      text: '[docs]: https://example.com/docs',
    });
    expect(JSON.stringify(view.toJSON())).toContain('[later]: ');
    expect(screen.queryByText('later')).toBeNull();
  });
});

describe('CommonMark block details', () => {
  it('numbers an ordered list from its first number, the way web shows it', () => {
    renderMarkdown(['3. a', '1. b', '1. c', '   1. inner', '   1. inner two', '1. d'].join('\n'));
    expect(screen.getAllByText(/^\d+\.$/).map((node) => node.props.children)).toEqual([
      '3.',
      '4.',
      '5.',
      '1.',
      '2.',
      '6.',
    ]);
  });

  it('starts numbering again for a new delimiter', () => {
    renderMarkdown(['1. a', '1. b', '1) c', '1) d'].join('\n'));
    expect(screen.getAllByText(/^\d+[.)]$/).map((node) => node.props.children)).toEqual([
      '1.',
      '2.',
      '1)',
      '2)',
    ]);
  });

  it('reads an underlined line as a heading', () => {
    renderMarkdown(['Title', '=====', '', 'Section', '---', 'Body'].join('\n'));
    expect(screen.getAllByRole('header').map((node) => node.props.children)).toHaveLength(2);
    expect(screen.getByRole('header', { name: 'Title' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Section' })).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('keeps a list item and a quote above a rule as themselves', () => {
    expect(setextHeadingLevel('- item', '---')).toBe(0);
    expect(setextHeadingLevel('> quote', '===')).toBe(0);
    expect(setextHeadingLevel('Text', '- item')).toBe(0);
    expect(setextHeadingLevel('Text', '-')).toBe(2);
  });

  it('waits for the underline to finish while the answer streams', () => {
    renderMarkdown(['Intro', '-'].join('\n'), { highlightCode: false });
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('holds an image line whose address is still arriving', () => {
    const view = renderMarkdown(['Look:', '![Chart](https://exam'].join('\n'), {
      highlightCode: false,
    });
    expect(JSON.stringify(view.toJSON())).not.toContain('![Chart]');
    expect(screen.queryByLabelText(/Load image/)).toBeNull();
    expect(isOpenImageTail('![Chart](https://exam')).toBe(true);
    expect(isOpenImageTail('![Cha')).toBe(true);
    expect(isOpenImageTail('![Chart](https://example.com/c.png)')).toBe(false);
  });

  it('draws double-dollar math inside a sentence inline, not as a display block', () => {
    renderMarkdown('so $$x^2$$ is small');
    expect(mockMath).toEqual([{ latex: 'x^2', display: false }]);
  });
});

describe('large text', () => {
  it('widens a table column with the text size up to the scaled column cap and never narrows it', () => {
    expect(scaleColumnWidth(100, 2)).toBe(200);
    expect(scaleColumnWidth(200, 2)).toBe(400);
    expect(scaleColumnWidth(260, 2)).toBe(520);
    expect(scaleColumnWidth(100, 1)).toBe(100);
    expect(scaleColumnWidth(100, 0.8)).toBe(100);
  });
});

describe('answer badges', () => {
  it('lifts a [[Label]] badge out of the prose and leaves fences alone', () => {
    const view = renderMarkdown(
      ['Status [[Done]] today.', '', '```text', '[[raw]]', '```'].join('\n'),
    );
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toContain('[[Done]]');
    expect(tree).toContain('Done');
    expect(screen.getByTestId('markdown-answer-badge')).toBeTruthy();
    expect(screen.getByLabelText('text code block').props.accessibilityValue).toEqual({
      text: '[[raw]]',
    });
  });
});

describe('checklist surface', () => {
  it('offers Reset once a tick changes and puts the ticks back as the answer gave them', () => {
    renderMarkdown(
      ['```checklist', 'title: Launch', '- [ ] Write notes', '- [x] Tag build', '```'].join('\n'),
    );

    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Write notes' }));
    expect(
      screen.getByRole('checkbox', { name: 'Write notes' }).props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });

    fireEvent.press(screen.getByRole('button', { name: 'Reset' }));

    expect(
      screen.getByRole('checkbox', { name: 'Write notes' }).props.accessibilityState,
    ).toMatchObject({
      checked: false,
    });
    expect(
      screen.getByRole('checkbox', { name: 'Tag build' }).props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });
});

describe('right-to-left blocks', () => {
  it('lays out an Arabic or Hebrew paragraph, heading and list item from the right', () => {
    renderMarkdown(
      ['## عنوان', '', 'هذه فقرة **مهمة**.', '', '- عنصر أول', '- English item'].join('\n'),
    );

    const rtl = { writingDirection: 'rtl', textAlign: 'right' };
    expect(screen.getByRole('header').props.style).toMatchObject(rtl);
    expect(screen.getByText(/هذه فقرة/).props.style).toMatchObject(rtl);
    expect(screen.getByText('عنصر أول').props.style).toMatchObject(rtl);
    expect(screen.getAllByTestId('markdown-list-item-rtl')).toHaveLength(1);
    expect(screen.getByText('English item').props.style).not.toMatchObject(rtl);
  });
});

describe('math inside a table', () => {
  it('keeps a double-dollar formula inside its cell as inline math', () => {
    renderMarkdown(['| Name | Formula |', '| --- | --- |', '| Square | $$x^2$$ |'].join('\n'));
    expect(screen.getAllByTestId('markdown-table')).toHaveLength(1);
    expect(mockMath).toContainEqual({ latex: 'x^2', display: false });
    expect(mockMath.some((call) => call.display)).toBe(false);
  });
});

describe('footnote section', () => {
  it('gathers definitions written mid-answer at the end, in reference order, and drops unused ones', () => {
    const view = renderMarkdown(
      [
        'First[^b] then[^a].',
        '',
        '[^a]: Note A.',
        '[^unused]: Nobody points here.',
        '',
        'Middle paragraph.',
        '',
        '[^b]: Note B.',
      ].join('\n'),
    );

    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toContain('Nobody points here.');
    expect(screen.getAllByLabelText('Footnotes')).toHaveLength(1);
    expect(tree.indexOf('Middle paragraph.')).toBeLessThan(tree.indexOf('Note B.'));
    expect(tree.indexOf('Note B.')).toBeLessThan(tree.indexOf('Note A.'));
    expect(
      Object.keys(
        referencedFootnotes('x[^b] y[^a] z[^b]\n[^a]: A\n[^b]: B', { a: 'A', b: 'B', c: 'C' }),
      ),
    ).toEqual(['b', 'a']);
  });
});

describe('footnotes inside a disclosure', () => {
  it('draws a note defined inside details once, at the end of the answer', () => {
    const view = renderMarkdown(
      [
        'Intro.',
        '',
        '<details open>',
        '<summary>More</summary>',
        '',
        'Hidden claim[^1].',
        '',
        '[^1]: Hidden source.',
        '',
        '</details>',
      ].join('\n'),
    );

    const tree = JSON.stringify(view.toJSON());
    expect(screen.getAllByLabelText('Footnotes')).toHaveLength(1);
    expect(tree.split('Hidden source.')).toHaveLength(2);
  });

  it('still draws a note defined inside a quote, which the answer does not gather', () => {
    const view = renderMarkdown(
      ['Claim[^q].', '', '> Quoted[^q].', '>', '> [^q]: Quote source.'].join('\n'),
    );

    const tree = JSON.stringify(view.toJSON());
    expect(screen.getAllByLabelText('Footnotes')).toHaveLength(1);
    expect(tree.split('Quote source.')).toHaveLength(2);
  });
});

describe('ordered task items', () => {
  it('shows the number and the box for a task in a numbered list', () => {
    renderMarkdown(['1. [x] Step one', '2. [ ] Step two'].join('\n'));

    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('2.')).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: 'Step one' }).props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
    expect(screen.queryByText(/\[x\]/)).toBeNull();
  });
});

describe('display math colour', () => {
  it('paints display math in the quote colour inside a quote and the body colour outside', () => {
    renderMarkdown(['$$', 'a^2', '$$', '', '> $$', '> b^2', '> $$'].join('\n'));

    const display = mockMath.filter((entry) => entry.display);
    expect(display.map((entry) => [entry.latex, entry.color])).toEqual([
      ['a^2', defaultColors.textPrimary],
      ['b^2', defaultColors.textSecondary],
    ]);
  });
});

describe('streaming email fence', () => {
  it('keeps a header name that is still arriving out of the body', () => {
    const view = renderMarkdown(['```email', 'To: sam@example.com', 'Sub'].join('\n'), {
      streaming: true,
      highlightCode: false,
    });

    expect(screen.getByTestId('answer-surface-email')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain('sam@example.com');
    expect(JSON.stringify(view.toJSON())).not.toMatch(/"Sub"/);
  });
});

describe('paragraphs over several lines', () => {
  it('keeps the lines of one paragraph in one text block with their breaks', () => {
    renderMarkdown(
      ['First line  ', '   second line\\', 'third line', '', 'Next paragraph'].join('\n'),
    );

    expect(screen.getByText('First line\nsecond line\nthird line')).toBeTruthy();
    expect(screen.getByText('Next paragraph')).toBeTruthy();
  });

  it('ends a paragraph where a list, quote, heading, fence or table starts', () => {
    renderMarkdown(
      [
        'Intro',
        '- item',
        'Lead',
        '> quoted',
        '',
        'Before heading',
        '## Heading',
        'Before code',
        '```js',
        'x()',
        '```',
        'Before table',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
      ].join('\n'),
    );

    for (const text of [
      'Intro',
      'item',
      'Lead',
      'quoted',
      'Before heading',
      'Heading',
      'Before code',
      'Before table',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByLabelText('js code block')).toBeTruthy();
    expect(screen.getAllByTestId('markdown-table')).toHaveLength(1);
  });

  it('keeps an indented line that continues a paragraph as words, not code', () => {
    renderMarkdown(['A paragraph', '    still the paragraph'].join('\n'));

    expect(screen.getByText('A paragraph\nstill the paragraph')).toBeTruthy();
    expect(screen.queryByLabelText('Plain text code block')).toBeNull();
  });
});

describe('study fences', () => {
  const quiz = JSON.stringify({
    title: 'Cells',
    questions: [
      {
        type: 'multiple_choice',
        question: 'Which organelle makes ATP?',
        options: ['Nucleus', 'Mitochondrion'],
        answer: 1,
        explanation: 'Mitochondria run cellular respiration.',
      },
    ],
  });

  it('renders a marked study document as the quiz, never its source or answer', () => {
    const view = renderMarkdown(
      [
        'Here is your quiz.',
        '',
        '```markdown',
        '<!-- @artifact -->',
        '# Practice',
        '',
        '~~~quiz',
        quiz,
        '~~~',
        '```',
      ].join('\n'),
    );

    expect(screen.getByTestId('study-document')).toBeTruthy();
    expect(screen.getByText('Which organelle makes ATP?')).toBeTruthy();
    expect(screen.getByText('Practice')).toBeTruthy();
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toContain('"answer"');
    expect(tree).not.toContain('@artifact');
    expect(tree).not.toContain('Mitochondria run cellular respiration.');
  });

  it('renders a bare quiz fence as the quiz', () => {
    renderMarkdown(['```quiz', quiz, '```'].join('\n'));

    expect(screen.getByText('Which organelle makes ATP?')).toBeTruthy();
    expect(screen.queryByText(/"questions"/)).toBeNull();
  });

  it('keeps an ordinary Markdown fence as a code card', () => {
    renderMarkdown(['```markdown', '# Notes', '```'].join('\n'));

    expect(screen.queryByTestId('study-document')).toBeNull();
    expect(screen.getByText('markdown')).toBeTruthy();
  });
});

describe('heading positions for section jumps', () => {
  it('reports each heading by the shared slug, numbering a repeated one', () => {
    const onHeadingLayout = jest.fn();
    const content = ['# Report', '', 'Intro.', '', '## Key findings', '', '## Key findings'].join(
      '\n',
    );
    renderMarkdown(content, { onHeadingLayout });

    const headings = screen.getAllByRole('header');
    headings.forEach((heading, index) =>
      fireEvent(heading, 'layout', { nativeEvent: { layout: { x: 0, y: index * 40 } } }),
    );

    expect(onHeadingLayout.mock.calls).toEqual(
      extractMarkdownHeadings(content).map((heading, index) => [heading.id, index * 40]),
    );
    expect(onHeadingLayout.mock.calls.map(([id]) => id)).toEqual([
      'report',
      'key-findings',
      'key-findings-1',
    ]);
  });

  it('adds no layout listener when nothing asks for positions', () => {
    renderMarkdown('# Report');

    expect(screen.getByRole('header').props.onLayout).toBeUndefined();
  });
});
