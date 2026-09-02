import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

import { REMARK_PLUGINS } from './remarkPlugins';
import {
  createMarkdownBlockSplitter,
  TAIL_NODE_RESERVE,
  type MarkdownBlockSplit,
} from './splitMarkdownBlocks';
import {
  MARKDOWN_STREAM_CORPUS as CORPUS,
  STREAM_RUNS,
  lines,
  streamChunks,
} from './__fixtures__/markdownStreamCorpus';

const oracle = unified().use(remarkParse).use(REMARK_PLUGINS).freeze();

interface OracleNode {
  readonly type: string;
  readonly position: {
    readonly start: { readonly offset: number };
    readonly end: { readonly offset: number };
  };
}

const segmentCache = new Map<string, string[]>();

function segment(source: string): string[] {
  const cached = segmentCache.get(source);
  if (cached) return cached;

  const root = oracle.parse(source) as unknown as { readonly children: readonly OracleNode[] };
  const segments = root.children.map(
    (node) => `${node.type}:${source.slice(node.position.start.offset, node.position.end.offset)}`,
  );
  segmentCache.set(source, segments);
  return segments;
}

function decompose(split: MarkdownBlockSplit): string[] {
  return [...split.settled.flatMap((block) => segment(block.source)), ...segment(split.tail)];
}

describe('splitMarkdownBlocks — universal equivalence property', () => {
  it.each(CORPUS)(
    '$name keeps concat and segmentation intact at every chunk size',
    ({ name, source }) => {
      for (const run of STREAM_RUNS) {
        const label = `doc=${name} seed=${run.seed} ceiling=${run.ceiling}`;
        const finalSegments = segment(source);
        const splitter = createMarkdownBlockSplitter();
        let streamed = '';
        let previousSources: string[] = [];
        let previousKeys: string[] = [];
        let split: MarkdownBlockSplit = splitter.update(streamed);

        for (const chunk of streamChunks(source, run)) {
          streamed += chunk;
          split = splitter.update(streamed);

          const sources = split.settled.map((block) => block.source);
          const keys = split.settled.map((block) => block.key);
          const settledSegments = split.settled.flatMap((block) => segment(block.source));

          expect(sources.join('') + split.tail, `${label} concat`).toBe(streamed);
          expect(sources.length, `${label} monotonic`).toBeGreaterThanOrEqual(
            previousSources.length,
          );
          expect(sources.slice(0, previousSources.length), `${label} immutable sources`).toEqual(
            previousSources,
          );
          expect(keys.slice(0, previousKeys.length), `${label} immutable keys`).toEqual(
            previousKeys,
          );
          expect(settledSegments, `${label} settled blocks are already final`).toEqual(
            finalSegments.slice(0, settledSegments.length),
          );

          previousSources = sources;
          previousKeys = keys;
        }

        expect(streamed, `${label} streamed the whole document`).toBe(source);
        expect(decompose(split), `${label} segmentation`).toEqual(segment(source));
      }
    },
  );
});

describe('splitMarkdownBlocks — invariants', () => {
  it('keeps the last two top-level nodes in the tail', () => {
    for (const { name, source } of CORPUS) {
      const splitter = createMarkdownBlockSplitter();
      let streamed = '';
      for (const chunk of streamChunks(source, STREAM_RUNS[3]!)) {
        streamed += chunk;
        const split = splitter.update(streamed);
        const reserved = segment(streamed).slice(-TAIL_NODE_RESERVE);
        expect(split.tail.length, `doc=${name} non-empty tail`).toBeGreaterThan(0);
        expect(segment(split.tail).slice(-TAIL_NODE_RESERVE), `doc=${name} reserved tail`).toEqual(
          reserved,
        );
      }
    }
  });

  it('keeps a list unsettled while a later item can still join it', () => {
    const source = lines('- alpha', '', '- beta', '', 'Gamma paragraph.', '', 'Delta paragraph.');
    const finalSegments = segment(source);
    const splitter = createMarkdownBlockSplitter();
    let streamed = '';
    let split = splitter.update(streamed);
    for (const character of source) {
      streamed += character;
      split = splitter.update(streamed);
      const settledSegments = split.settled.flatMap((block) => segment(block.source));
      expect(settledSegments).toEqual(finalSegments.slice(0, settledSegments.length));
    }

    expect(decompose(split)).toEqual(segment(source));
  });

  it('returns the identical split object when the content has not changed', () => {
    const splitter = createMarkdownBlockSplitter();
    const content = lines('Alpha.', '', 'Beta.', '', 'Gamma.');
    const first = splitter.update(content);
    expect(splitter.update(content)).toBe(first);
  });

  it('keeps the settled array identity stable until a block is added', () => {
    const splitter = createMarkdownBlockSplitter();
    const settledOnce = splitter.update(lines('Alpha.', '', 'Beta.', '', 'Gamma')).settled;
    expect(settledOnce).toHaveLength(1);
    expect(splitter.update(lines('Alpha.', '', 'Beta.', '', 'Gamma.')).settled).toBe(settledOnce);
    expect(
      splitter.update(lines('Alpha.', '', 'Beta.', '', 'Gamma.', '', 'Delta')).settled,
    ).not.toBe(settledOnce);
  });

  it('derives keys from content so identical blocks keep their key across a reset', () => {
    const content = lines('Alpha.', '', 'Beta.', '', 'Gamma.');
    const splitter = createMarkdownBlockSplitter();
    const original = splitter.update(content).settled.map((block) => block.key);
    expect(original.length).toBeGreaterThan(0);

    const diverged = splitter.update(`Prefix. ${content}`).settled.map((block) => block.key);
    expect(diverged).not.toEqual(original);

    expect(splitter.update(content).settled.map((block) => block.key)).toEqual(original);
  });

  it('drops every settled block when reset explicitly', () => {
    const splitter = createMarkdownBlockSplitter();
    expect(
      splitter.update(lines('Alpha.', '', 'Beta.', '', 'Gamma')).settled.length,
    ).toBeGreaterThan(0);
    splitter.reset();
    const afterReset = splitter.update('Only one paragraph');
    expect(afterReset.settled).toHaveLength(0);
    expect(afterReset.tail).toBe('Only one paragraph');
  });
});

describe('splitMarkdownBlocks — prefix-stability guard', () => {
  const RESET_FIXTURES: ReadonlyArray<{
    readonly name: string;
    readonly before: string;
    readonly after: string;
  }> = [
    {
      name: 'artifact fence excised and replaced by prose',
      before: lines('Here is the plan.', '', 'It has two parts.', '', '```artifact', '<html>'),
      after: lines(
        'Here is the plan.',
        '',
        'It has two parts.',
        '',
        'The artifact is on the right.',
      ),
    },
    {
      name: 'trailing whitespace trimmed away',
      before: lines('Alpha.', '', 'Beta.', '', 'Gamma.', '', ''),
      after: lines('Alpha.', '', 'Beta.', '', 'Gamma.'),
    },
    {
      name: 'a settled block is edited in place',
      before: lines('Alpha.', '', 'Beta.', '', 'Gamma.'),
      after: lines('Alpha edited.', '', 'Beta.', '', 'Gamma.'),
    },
    {
      name: 'regeneration replaces the message wholesale',
      before: lines('Old answer part one.', '', 'Old answer part two.', '', 'Old tail.'),
      after: lines('New answer.', '', 'Completely different body.', '', 'New tail.'),
    },
    {
      name: 'a leading source list is stripped',
      before: lines('[1]: https://example.com', '', 'Body paragraph.', '', 'Tail paragraph.'),
      after: lines('Body paragraph.', '', 'Tail paragraph.'),
    },
  ];

  it.each(RESET_FIXTURES)('$name converges to a from-scratch split', ({ before, after }) => {
    const splitter = createMarkdownBlockSplitter();
    let streamed = '';
    for (const chunk of streamChunks(before, STREAM_RUNS[1]!)) {
      streamed += chunk;
      splitter.update(streamed);
    }

    const recovered = splitter.update(after);
    const fresh = createMarkdownBlockSplitter().update(after);

    expect(recovered.settled.map((block) => block.source)).toEqual(
      fresh.settled.map((block) => block.source),
    );
    expect(recovered.settled.map((block) => block.key)).toEqual(
      fresh.settled.map((block) => block.key),
    );
    expect(recovered.tail).toBe(fresh.tail);
    expect(recovered.settled.map((block) => block.source).join('') + recovered.tail).toBe(after);
    expect(decompose(recovered)).toEqual(segment(after));
  });

  it('keeps streaming incrementally after a reset', () => {
    const splitter = createMarkdownBlockSplitter();
    splitter.update(lines('Alpha.', '', 'Beta.', '', 'Gamma'));
    splitter.update(lines('Replaced alpha.', '', 'Beta.', '', 'Gamma'));
    const grown = splitter.update(lines('Replaced alpha.', '', 'Beta.', '', 'Gamma.', '', 'Delta'));

    expect(grown.settled.map((block) => block.source)).toEqual([
      'Replaced alpha.\n\n',
      'Beta.\n\n',
    ]);
    expect(grown.tail).toBe('Gamma.\n\nDelta');
  });
});

describe('splitMarkdownBlocks — boundary safety', () => {
  function settleFully(source: string): MarkdownBlockSplit {
    const splitter = createMarkdownBlockSplitter();
    let streamed = '';
    let split = splitter.update(streamed);
    for (const chunk of streamChunks(source, STREAM_RUNS[0]!)) {
      streamed += chunk;
      split = splitter.update(streamed);
    }
    return split;
  }

  it('stops settling at a link definition', () => {
    const source = lines(
      'Alpha paragraph.',
      '',
      '[spec]: https://example.com/spec',
      '',
      'Beta paragraph.',
      '',
      'Gamma paragraph.',
      '',
      'Delta paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled.map((block) => block.source)).toEqual(['Alpha paragraph.\n\n']);
    expect(split.tail.startsWith('[spec]:')).toBe(true);
  });

  it('reports a reference definition so a consumer can stop splitting the message', () => {
    const splitter = createMarkdownBlockSplitter();
    const beforeDefinition = lines(
      'Alpha paragraph with a [reference link][spec].',
      '',
      'Beta paragraph.',
      '',
      'Gamma paragraph.',
    );
    expect(splitter.update(beforeDefinition).hasReferenceDefinition).toBe(false);

    const withDefinition = lines(beforeDefinition, '', '[spec]: https://example.com/spec');
    expect(splitter.update(withDefinition).hasReferenceDefinition).toBe(true);
  });

  it('never settles a definition into the frozen prefix', () => {
    for (const { name, source } of CORPUS) {
      const split = settleFully(source);
      const settledSource = split.settled.map((block) => block.source).join('');
      const settledTypes = segment(settledSource).map((entry) => entry.split(':')[0]);
      expect(settledTypes, `doc=${name}`).not.toContain('definition');
      expect(settledTypes, `doc=${name}`).not.toContain('footnoteDefinition');
    }
  });

  it('stops settling at a footnote definition', () => {
    const source = lines(
      'Alpha paragraph.',
      '',
      '[^n]: The footnote body.',
      '',
      'Beta paragraph.',
      '',
      'Gamma paragraph.',
      '',
      'Delta paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled.map((block) => block.source)).toEqual(['Alpha paragraph.\n\n']);
    expect(split.tail.startsWith('[^n]:')).toBe(true);
  });

  it('never settles a definition that leads the message', () => {
    const source = lines(
      '[spec]: https://example.com/spec',
      '',
      'Alpha paragraph.',
      '',
      'Beta paragraph.',
      '',
      'Gamma paragraph.',
      '',
      'Delta paragraph.',
    );
    expect(settleFully(source).settled).toHaveLength(0);
  });

  it('refuses to settle inside an unbalanced raw html container', () => {
    const source = lines(
      'Intro paragraph.',
      '',
      '<div class="card">',
      '',
      'Inner paragraph.',
      '',
      'Another inner paragraph.',
      '',
      'Yet another inner paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled.map((block) => block.source)).toEqual(['Intro paragraph.\n\n']);
    expect(split.tail.startsWith('<div class="card">')).toBe(true);
  });

  it('settles a balanced container as a single block', () => {
    const source = lines(
      'Intro paragraph.',
      '',
      '<details>',
      '',
      'Hidden paragraph.',
      '',
      '</details>',
      '',
      'Outro paragraph.',
      '',
      'Final paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled.map((block) => block.source)).toEqual([
      'Intro paragraph.\n\n',
      '<details>\n\nHidden paragraph.\n\n</details>\n\n',
    ]);
    expect(split.tail).toBe('Outro paragraph.\n\nFinal paragraph.');
  });

  it('does not count void or self-closing tags towards the balance', () => {
    const source = lines(
      'A break<br>here.',
      '',
      'An <img src="https://example.com/a.png" alt="a" /> image.',
      '',
      'A <my-el /> custom element.',
      '',
      'Penultimate paragraph.',
      '',
      'Trailing paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled).toHaveLength(3);
    expect(split.tail).toBe('Penultimate paragraph.\n\nTrailing paragraph.');
  });

  it('does not count container tags that only appear inside an html comment', () => {
    const source = lines(
      'Before comment.',
      '',
      '<!-- <div> inside a comment should not count -->',
      '',
      'After comment.',
      '',
      'Penultimate paragraph.',
      '',
      'Trailing paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled).toHaveLength(3);
    expect(split.tail).toBe('Penultimate paragraph.\n\nTrailing paragraph.');
  });

  it('strips a comment that only becomes visible after an inner comment is removed', () => {
    const source = lines(
      'Before comment.',
      '',
      '<!-- lead --><!<!-- inner -->-- outer <div> -->',
      '',
      'After comment.',
      '',
      'Penultimate paragraph.',
      '',
      'Trailing paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled).toHaveLength(3);
    expect(split.tail).toBe('Penultimate paragraph.\n\nTrailing paragraph.');
  });

  it('ignores container tags that only appear inside a code fence', () => {
    const source = lines(
      'Example markup:',
      '',
      '```html',
      '<div class="unclosed">',
      '```',
      '',
      'Prose after the fence.',
      '',
      'Final paragraph.',
    );
    const split = settleFully(source);

    expect(split.settled).toHaveLength(2);
    expect(split.tail).toBe('Prose after the fence.\n\nFinal paragraph.');
  });

  it('never settles an open fence', () => {
    const source = lines(
      'Before the fence.',
      '',
      'Second paragraph.',
      '',
      '```py',
      'def partial():',
      '    return 1',
    );
    const split = settleFully(source);

    expect(split.settled.map((block) => block.source)).toEqual(['Before the fence.\n\n']);
    expect(split.tail.endsWith('```py\ndef partial():\n    return 1')).toBe(true);
  });

  it('never settles unclosed display math', () => {
    const source = lines('Before the math.', '', 'Second paragraph.', '', '$$', '\\frac{a}{b}');
    const split = settleFully(source);

    expect(split.settled.map((block) => block.source)).toEqual(['Before the math.\n\n']);
    expect(split.tail.endsWith('$$\n\\frac{a}{b}')).toBe(true);
  });
});
