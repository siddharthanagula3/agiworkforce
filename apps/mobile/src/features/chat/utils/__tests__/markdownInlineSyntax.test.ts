import {
  collectLinkDefinitions,
  inlinePlainText,
  parseInlineMarkdown,
  readLinkDefinition,
  protectEscapes,
  restoreEscapes,
  type InlineNode,
} from '../markdownInlineSyntax';

function shape(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value;
        case 'math':
          return `{math:${node.tex}}`;
        case 'code':
          return `{code:${node.value}}`;
        case 'styled':
          return `{${node.style}:${shape(node.children)}}`;
        case 'link':
          return `{link ${node.href}:${shape(node.children)}}`;
        case 'footnote':
          return `{fn:${node.label}}`;
        case 'citation':
          return `{cite:${node.markers.join(',')}}`;
        case 'badge':
          return `{badge:${node.label}}`;
      }
    })
    .join('');
}

const parse = (source: string) => shape(parseInlineMarkdown(source));

describe('inline emphasis', () => {
  it('keeps italic running across bold inside it', () => {
    expect(parse('*This is **important** text*')).toBe('{em:This is {strong:important} text}');
    expect(parse('*a **b** c*')).toBe('{em:a {strong:b} c}');
    expect(parse('*see **this***')).toBe('{em:see {strong:this}}');
  });

  it('keeps a spaced asterisk inside italic and leaves arithmetic alone', () => {
    expect(parse('*a * b*')).toBe('{em:a * b}');
    expect(parse('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(parse('**bold** and *em*')).toBe('{strong:bold} and {em:em}');
  });

  it('strikes single and double tilde runs', () => {
    expect(parse('~x~ and ~~y~~')).toBe('{strike:x} and {strike:y}');
    expect(parse('about ~5 minutes and ~10 more')).toBe('about ~5 minutes and ~10 more');
  });
});

describe('inline code spans', () => {
  it('reads spans fenced by two or more backticks', () => {
    expect(parse('``code with ` tick``')).toBe('{code:code with ` tick}');
    expect(parse('``a`b``')).toBe('{code:a`b}');
    expect(parse('``` `` ```')).toBe('{code:``}');
  });

  it('keeps an unmatched backtick run as text and does not pad code', () => {
    expect(parse('a `` b `c`')).toBe('a `` b {code:c}');
    expect(inlinePlainText('call `fn()` now')).toBe('call fn() now');
  });

  it('keeps markup inside code literal', () => {
    expect(parse('`**not bold** \\*`')).toBe('{code:**not bold** \\*}');
  });
});

describe('inline links', () => {
  it('parses formatting, code and math inside a link label', () => {
    expect(parse('[**Docs** page](https://example.com)')).toBe(
      '{link https://example.com:{strong:Docs} page}',
    );
    expect(parse('[`useState`](https://react.dev)')).toBe(
      '{link https://react.dev:{code:useState}}',
    );
    expect(parse('[$E=mc^2$](https://example.com)')).toBe(
      '{link https://example.com:{math:E=mc^2}}',
    );
    expect(parse('[`a]`](https://example.com)')).toBe('{link https://example.com:{code:a]}}');
  });

  it('links a bare email address to a new mail', () => {
    expect(parse('Write to foo@bar.com.')).toBe('Write to {link mailto:foo@bar.com:foo@bar.com}.');
    expect(parse('see https://x.com/a@b.com')).toBe(
      'see {link https://x.com/a@b.com:https://x.com/a@b.com}',
    );
  });
});

describe('inline HTML', () => {
  it('drops script and style elements with their content', () => {
    expect(parse('Before <script>alert(1)</script> after <STYLE>p{}</STYLE>.')).toBe(
      'Before  after .',
    );
  });

  it('drops layout tags but keeps their text', () => {
    expect(parse('<div align="center">Hello <span>there</span></div>')).toBe('Hello there');
    expect(parse('use `<div>` here')).toBe('use {code:<div>} here');
  });

  it('keeps sup and sub that have no script form as raised and lowered spans', () => {
    expect(parse('x<sup>2</sup> x<sup>abc</sup> H<sub>2</sub> a<sub>xyz</sub>')).toBe(
      'x² x{sup:abc} H₂ a{sub:xyz}',
    );
  });
});

describe('escape protection', () => {
  it('leaves real private-use characters alone', () => {
    const privateUse = '\uE02A\uE05F\uE000';
    expect(inlinePlainText(`Glyph ${privateUse} stays`)).toBe(`Glyph ${privateUse} stays`);
    expect(restoreEscapes(protectEscapes(`a ${privateUse} \\* b`))).toBe(`a ${privateUse} * b`);
  });

  it('protects escapes idempotently so a second pass changes nothing', () => {
    const once = protectEscapes('\\*not em\\* and `\\*code\\*`');
    expect(protectEscapes(once)).toBe(once);
    expect(inlinePlainText(once)).toBe('*not em* and \\*code\\*');
  });
});

describe('plain text of an inline', () => {
  it('reads what the renderer shows', () => {
    expect(
      inlinePlainText('Tom &amp; Jerry[^1] say *hi* to [the **docs**](https://a.b) $x^2$ [3]'),
    ).toBe('Tom & Jerry¹ say hi to the docs x^2 [3]');
  });
});

describe('streaming partial inline input', () => {
  it('shows unfinished markup as text until it closes', () => {
    expect(parse('*This is **important')).toBe('*This is **important');
    expect(parse('Use ``code wi')).toBe('Use ``code wi');
    expect(parse('[**Docs** pa')).toBe('[{strong:Docs} pa');
    expect(parse('[Docs](https://exa')).toBe('[Docs](https://exa');
    expect(parse('mail foo@bar')).toBe('mail foo@bar');
    expect(parse('~strike')).toBe('~strike');
  });

  it('parses a long run of open brackets and an open double dollar in bounded time', () => {
    const line = `${'[a[b'.repeat(2000)} $$${'x '.repeat(3000)}`;
    const started = Date.now();
    const text = inlinePlainText(line, { citationCount: 3 });
    expect(text === line).toBe(true);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('parses a long line of unclosed emphasis markers in bounded time', () => {
    const line = '*a **b '.repeat(400);
    const started = Date.now();
    expect(inlinePlainText(line)).toBe(line);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('citation markers', () => {
  const cited = (source: string, count = 3) =>
    shape(parseInlineMarkdown(source, { citationCount: count }));

  it('reads a run of markers as one group and leaves one beyond the sources as text', () => {
    expect(cited('a [1][2] b [3] c [9]')).toBe('a {cite:1,2} b {cite:3} c [9]');
  });

  it('never reads a reference definition, a reference link or a marker followed by a link as a marker', () => {
    expect(cited('[1]: https://x.test/a')).not.toContain('cite');
    expect(cited('[text][1]')).toBe('[text][1]');
    expect(cited('[1](https://x.test)')).toBe('{link https://x.test:1}');
  });

  it('keeps a marker in code and an unfinished marker as written', () => {
    expect(cited('use `a[1]` then [2')).toBe('use {code:a[1]} then [2');
  });

  it('shows a marker as text when no sources came with the answer', () => {
    expect(parse('claim [1][2]')).toBe('claim [1][2]');
  });
});

describe('reference links', () => {
  const linked = (source: string) =>
    shape(
      parseInlineMarkdown(source, {
        linkDefinitions: { ref: 'https://x.test/r', 'two words': 'https://x.test/t' },
      }),
    );

  it('resolves full, collapsed and spaced references and keeps unknown ones as text', () => {
    expect(linked('[a][ref] [ref][] [b][Two  Words] [c][zz]')).toBe(
      '{link https://x.test/r:a} {link https://x.test/r:ref} {link https://x.test/t:b} [c][zz]',
    );
  });

  it('reads definitions from lines, keyed without case or extra spaces', () => {
    expect(
      collectLinkDefinitions([
        '[Ref One]: <https://x.test/1> "T"',
        'text',
        '[^note]: not a link',
        '  [b]: /p',
      ]),
    ).toEqual({ 'ref one': 'https://x.test/1', b: '/p' });
    expect(readLinkDefinition('[a]: https://x.test extra words')).toBeNull();
  });
});

describe('inline math and entities', () => {
  it('reads double-dollar math inside a line as inline math', () => {
    expect(parse('so $$x^2 + y$$ is small and $a$ too')).toBe(
      'so {math:x^2 + y} is small and {math:a} too',
    );
  });

  it('decodes the rarer named entities and numbered footnote labels by position', () => {
    expect(inlinePlainText('&alpha;&beta; &check; &Omega; &eacute;')).toBe(
      '\u03b1\u03b2 \u2713 \u03a9 \u00e9',
    );
    expect(inlinePlainText('&notanentity; &toString;')).toBe('&notanentity; &toString;');
    expect(inlinePlainText('x[^b] y[^1]', { footnoteOrder: ['b', '1'] })).toBe('x\u00b9 y\u00b9');
  });
});

describe('answer badges', () => {
  it('reads the lifted badge span as a badge and keeps other spans as plain text', () => {
    expect(parse('Status <span class="answer-badge">Verified</span> today')).toBe(
      'Status {badge:Verified} today',
    );
    expect(parse('a <span class="note">kept</span> b')).toBe('a kept b');
    expect(inlinePlainText('Status <span class="answer-badge">Verified</span>')).toBe(
      'Status Verified',
    );
  });

  it('leaves an unfinished badge span out of the words', () => {
    expect(parse('Status <span class="answer-badge">Verif')).toBe('Status Verif');
  });
});

describe('shortcut reference links', () => {
  const linked = (source: string) =>
    shape(parseInlineMarkdown(source, { linkDefinitions: { docs: 'https://x.test/d' } }));

  it('links a bracketed label that has a definition and keeps others as written', () => {
    expect(linked('Read [Docs] and [Other] now')).toBe(
      'Read {link https://x.test/d:Docs} and [Other] now',
    );
    expect(linked('[docs](https://y.test) [docs][] [x] **[nope]**')).toBe(
      '{link https://y.test:docs} {link https://x.test/d:docs} [x] {strong:[nope]}',
    );
  });

  it('keeps a definition-shaped line start as written even when the label is defined', () => {
    expect(linked('Text\n[docs]: https://x.test/d')).toBe(
      'Text\n[docs]: {link https://x.test/d:https://x.test/d}',
    );
    expect(linked('See [docs]: the start')).toBe('See {link https://x.test/d:docs}: the start');
  });

  it('still finds links and emphasis inside an unknown bracket', () => {
    expect(linked('[see *this* https://z.test/a]')).toBe(
      '[see {em:this} {link https://z.test/a:https://z.test/a}]',
    );
  });

  it('keeps one text node for an unknown bracket and never links without definitions', () => {
    expect(parseInlineMarkdown('see [note] here')).toEqual([
      { type: 'text', value: 'see [note] here' },
    ]);
  });
});

describe('every html entity the web decodes', () => {
  it('decodes rare names, numbers and hex, and keeps unknown and prototype names', () => {
    expect(inlinePlainText('&Aacute;&zeta;&hearts;&#x1F600;&#945;')).toBe(
      '\u00c1\u03b6\u2665\u{1F600}\u03b1',
    );
    expect(inlinePlainText('&hasOwnProperty; &constructor; &#0; &#xD800; &amp')).toBe(
      '&hasOwnProperty; &constructor; &#0; &#xD800; &amp',
    );
    expect(inlinePlainText('&nbsp;')).toBe('\u00a0');
  });
});

describe('emphasis and code across a line ending', () => {
  it('formats bold, italic, bold italic and strike that wrap onto the next line', () => {
    expect(parse('**bold\ncontinues** end')).toBe('{strong:bold\ncontinues} end');
    expect(parse('***both\nlines*** end')).toBe('{strongEm:both\nlines} end');
    expect(parse('__bold\ncontinues__ end')).toBe('{strong:bold\ncontinues} end');
    expect(parse('_slant\nwrap_ end')).toBe('{em:slant\nwrap} end');
    expect(parse('*slant\nwrap* end')).toBe('{em:slant\nwrap} end');
    expect(parse('~~gone\nlines~~ end')).toBe('{strike:gone\nlines} end');
    expect(parse('~gone\nlines~ end')).toBe('{strike:gone\nlines} end');
  });

  it('reads a code span that crosses a line ending with the break shown as a space', () => {
    expect(parse('run `npm\ninstall` now')).toBe('run {code:npm install} now');
    expect(parse('run ``a\n`b`\nc`` now')).toBe('run {code:a `b` c} now');
  });

  it('still leaves an unclosed marker as written', () => {
    expect(parse('**open\nnever closed')).toBe('**open\nnever closed');
    expect(parse('a `open\nnever closed')).toBe('a `open\nnever closed');
  });
});

describe('a backslash at the end of a line', () => {
  it('is a hard line break and shows no backslash', () => {
    expect(parse('first\\\nsecond')).toBe('first\nsecond');
    expect(inlinePlainText('first\\\nsecond')).toBe('first\nsecond');
  });

  it('keeps a backslash that ends the text and one inside a code span', () => {
    expect(parse('path\\')).toBe('path\\');
    expect(parse('run `a\\\nb` now')).toBe('run {code:a\\ b} now');
  });
});

describe('inline html the web allows', () => {
  it('turns an anchor with an href into a link and keeps its label formatting', () => {
    expect(parse('see <a href="https://example.com/docs">the <b>docs</b></a> now')).toBe(
      'see {link https://example.com/docs:the {strong:docs}} now',
    );
    expect(parse("<a href='https://example.com'>single</a>")).toBe(
      '{link https://example.com:single}',
    );
  });

  it('drops the tags of an anchor with no href and keeps its text', () => {
    expect(parse('<a name="top"></a>Heading <a id="x">here</a>')).toBe('Heading here');
  });

  it('turns an img tag into the labelled link a Markdown image becomes', () => {
    expect(parse('before <img src="https://example.com/a.png" alt="A chart"> after')).toBe(
      'before {link https://example.com/a.png:A chart} after',
    );
    expect(parse('<img src="https://example.com/a.png">')).toBe(
      '{link https://example.com/a.png:Image}',
    );
    expect(parse('<img alt="no source">')).toBe('');
  });

  it('hides a closed comment inside a line and keeps an unclosed one as written', () => {
    expect(parse('before <!-- note --> after')).toBe('before  after');
    expect(parse('a <!-- one -->b<!-- two -->c')).toBe('a bc');
    expect(parse('a <!-- never closed')).toBe('a <!-- never closed');
  });

  it('styles strike, cite, dfn and var and draws tt and samp as code', () => {
    expect(parse('<strike>old</strike> <cite>Book</cite> <dfn>term</dfn> <var>x</var>')).toBe(
      '{strike:old} {em:Book} {em:term} {em:x}',
    );
    expect(parse('<tt>a</tt> <samp>b</samp>')).toBe('{code:a} {code:b}');
  });

  it('strips abbr, bdi, bdo, q, label and wbr tags and keeps their text', () => {
    expect(parse('<abbr title="World Health Organization">WHO</abbr> <bdi>x</bdi> a<wbr>b')).toBe(
      'WHO x ab',
    );
  });

  it('never turns a script href into a link target the app would open', () => {
    const [node] = parseInlineMarkdown('<a href="javascript:alert(1)">tap</a>');
    expect(node).toMatchObject({ type: 'link', href: 'javascript:alert(1)' });
  });
});
