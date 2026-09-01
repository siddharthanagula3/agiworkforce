const MIN_CHUNK_CHARS = 1;
const CHUNK_CEILINGS = [1, 3, 9, 27, 81] as const;
const RNG_SEEDS = [1, 7, 42, 1337, 20260901] as const;
const RNG_INCREMENT = 0x6d2b79f5;
const RNG_DIVISOR = 0x100000000;
const RENDER_CHUNK_CEILINGS: readonly number[] = [9, 81];

export interface StreamRun {
  readonly seed: number;
  readonly ceiling: number;
}

export const STREAM_RUNS: readonly StreamRun[] = RNG_SEEDS.map((seed, index) => ({
  seed,
  ceiling: CHUNK_CEILINGS[index] ?? MIN_CHUNK_CHARS,
}));

export const RENDER_STREAM_RUNS: readonly StreamRun[] = STREAM_RUNS.filter((run) =>
  RENDER_CHUNK_CEILINGS.includes(run.ceiling),
);

export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + RNG_INCREMENT) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / RNG_DIVISOR;
  };
}

export function streamChunks(source: string, run: StreamRun): string[] {
  const rng = createRng(run.seed);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const span = MIN_CHUNK_CHARS + Math.floor(rng() * (run.ceiling - MIN_CHUNK_CHARS + 1));
    chunks.push(source.slice(cursor, cursor + span));
    cursor += span;
  }
  return chunks;
}

export const lines = (...parts: string[]) => parts.join('\n');

export interface CorpusDocument {
  readonly name: string;
  readonly source: string;
}

export const MARKDOWN_STREAM_CORPUS: readonly CorpusDocument[] = [
  {
    name: 'plain paragraphs',
    source: lines('First paragraph of the answer.', '', 'Second paragraph.', '', 'Third one.'),
  },
  {
    name: 'atx and setext headings',
    source: lines(
      '# Title',
      '',
      'Intro prose.',
      '',
      'Subtitle',
      '--------',
      '',
      '## Later heading',
      '',
      'Closing prose.',
    ),
  },
  {
    name: 'closed fence with info string',
    source: lines(
      'Here is the code:',
      '',
      '```ts',
      'export const answer = 42;',
      '```',
      '',
      'And prose after it.',
    ),
  },
  {
    name: 'unterminated fence',
    source: lines('Streaming stopped mid fence:', '', '```python', 'def partial():', '    return'),
  },
  {
    name: 'fence without info string followed immediately by prose',
    source: lines('Before.', '', '```', 'raw', '```', 'Directly after with no blank line.'),
  },
  {
    name: 'tilde fence',
    source: lines('Tilde:', '', '~~~sql', 'select 1;', '~~~', '', 'Done.'),
  },
  {
    name: 'nested fence',
    source: lines(
      'Outer:',
      '',
      '````md',
      'Inner example:',
      '',
      '```js',
      'const a = 1;',
      '```',
      '````',
      '',
      'After.',
    ),
  },
  {
    name: 'mermaid fence',
    source: lines(
      'Diagram:',
      '',
      '```mermaid',
      'graph TD',
      '  A[Start] --> B[End]',
      '```',
      '',
      'Explanation follows.',
    ),
  },
  {
    name: 'closed display math',
    source: lines('The identity is', '', '$$', 'e^{i\\pi} + 1 = 0', '$$', '', 'which is famous.'),
  },
  {
    name: 'trailing open display math',
    source: lines('Partial derivation:', '', '$$', '\\frac{\\partial f}{\\partial x}'),
  },
  {
    name: 'inline and bracket math',
    source: lines(
      'Inline $x^2$ and bracket \\(y^2\\).',
      '',
      'Display \\[z^2\\] inline-ish.',
      '',
      'End.',
    ),
  },
  {
    name: 'gfm table',
    source: lines(
      'Comparison:',
      '',
      '| Surface | Parser | Notes |',
      '| ------- | ------ | ----- |',
      '| web | remark | canonical |',
      '| desktop | remark | shared |',
      '',
      'Table done.',
    ),
  },
  {
    name: 'gfm task list and strikethrough',
    source: lines(
      'Checklist:',
      '',
      '- [x] ~~old approach~~',
      '- [ ] new approach',
      '- [ ] measure it',
      '',
      'Next steps below.',
    ),
  },
  {
    name: 'loose list',
    source: lines('Reasons:', '', '- first reason', '', '- second reason', '', 'Summary line.'),
  },
  {
    name: 'nested list with continuation paragraphs',
    source: lines(
      '1. Outer step',
      '',
      '   Continuation of the outer step.',
      '',
      '   - inner a',
      '   - inner b',
      '',
      '2. Second step',
      '',
      'Afterword.',
    ),
  },
  {
    name: 'blockquote with lazy continuation',
    source: lines(
      'Quote incoming:',
      '',
      '> quoted line one',
      'lazy continuation line',
      '',
      '> second quote',
      '',
      'Back to prose.',
    ),
  },
  {
    name: 'indented code across a blank line',
    source: lines(
      'Sample:',
      '',
      '    first indented line',
      '',
      '    second indented line',
      '',
      'Done.',
    ),
  },
  {
    name: 'thematic breaks',
    source: lines('Above.', '', '---', '', 'Between.', '', '***', '', 'Below.'),
  },
  {
    name: 'indented top-level blocks',
    source: lines(
      'Leading paragraph.',
      '',
      '  - indented item one',
      '  - indented item two',
      '',
      '  > indented quote',
      '',
      '   # indented heading',
      '',
      '  ```',
      '  indented fence body',
      '  ```',
      '',
      'Closing paragraph.',
    ),
  },
  {
    name: 'footnotes and link definitions',
    source: lines(
      'Claim with a footnote[^note] and a [reference link][spec].',
      '',
      'Body paragraph before the definitions.',
      '',
      '[^note]: The footnote body.',
      '',
      '[spec]: https://example.com/spec',
      '',
      'Trailing paragraph.',
      '',
      'Penultimate paragraph.',
      '',
      'Final paragraph.',
    ),
  },
  {
    name: 'definitions before their references',
    source: lines(
      '[spec]: https://example.com/spec',
      '',
      'Paragraph one referencing [spec].',
      '',
      'Paragraph two.',
      '',
      'Paragraph three.',
      '',
      'Paragraph four.',
    ),
  },
  {
    name: 'details container spanning blank lines',
    source: lines(
      'Expandable section:',
      '',
      '<details>',
      '<summary>Show detail</summary>',
      '',
      'Hidden paragraph inside.',
      '',
      '- hidden list item',
      '',
      '</details>',
      '',
      'Visible paragraph after.',
    ),
  },
  {
    name: 'unbalanced raw html container',
    source: lines('Intro.', '', '<div class="card">', '', 'Inner paragraph.', '', 'Still inner.'),
  },
  {
    name: 'inline html and void tags',
    source: lines(
      'A <span>highlighted</span> word and a break<br />here.',
      '',
      'An <img src="https://example.com/a.png" alt="a"> image tag.',
      '',
      'End of section.',
    ),
  },
  {
    name: 'hard breaks and crlf',
    source: 'Line one  \r\nline two\r\n\r\nSecond paragraph\r\nwith a soft break.\r\n\r\nThird.',
  },
  {
    name: 'html comment around a container',
    source: lines(
      'Before comment.',
      '',
      '<!-- <div> inside a comment should not count -->',
      '',
      'After comment.',
      '',
      'Penultimate paragraph.',
      '',
      'Trailing paragraph.',
    ),
  },
  {
    name: 'emphasis and inline code across blocks',
    source: lines(
      'A **bold claim** with `inline code` and a [link](https://example.com/a).',
      '',
      'A second paragraph with **more bold** text.',
      '',
      'A third paragraph.',
      '',
      'A fourth paragraph.',
    ),
  },
  {
    name: 'transcript shaped answer',
    source: lines(
      'Short answer: the splitter settles every top-level block except the last, so the parse cost per token stops tracking the length of the whole message.',
      '',
      '## How it works',
      '',
      'On each update only the active tail is parsed. When that tail yields two or more',
      'top-level nodes, everything before the final node is frozen into settled blocks and',
      'removed from the tail.',
      '',
      '1. Parse the tail with the renderer plugin list.',
      '2. Find the start offset of the final node.',
      '3. Slice the settled prefix out of the source string.',
      '',
      'The guards matter more than the happy path:',
      '',
      '- the final node never settles, which protects open fences and unclosed math;',
      '- link and footnote definitions stop settling entirely;',
      '- raw HTML containers only settle at balance-zero boundaries.',
      '',
      '```ts',
      'const splitter = createMarkdownBlockSplitter();',
      'const { settled, tail } = splitter.update(content);',
      '```',
      '',
      '| Case | Settles | Why |',
      '| ---- | ------- | --- |',
      '| closed fence | yes | the code node is complete |',
      '| open fence | no | it is the final node |',
      '| open `<details>` | no | tag balance is non-zero |',
      '',
      '> The boundary oracle is the same parser that renders the text, so a settled',
      '> boundary can never disagree with what the renderer would have produced.',
      '',
      'That is the whole mechanism. Everything else is bookkeeping: a prefix-stability',
      'guard for non-append transitions, and content-derived keys so React never remounts',
      'a block whose source did not change.',
    ),
  },
];
