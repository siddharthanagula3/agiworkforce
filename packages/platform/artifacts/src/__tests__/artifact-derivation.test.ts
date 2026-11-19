import { describe, it, expect } from 'vitest';
import {
  extractCodeBlocks,
  isRenderableArtifact,
  detectArtifactType,
  extractArtifactTitle,
  artifactKindLabel,
  withoutArtifactMarker,
  withoutTitleDirectives,
  computeDerivedArtifactId,
  deriveArtifacts,
  hasArtifacts,
  removeArtifactBlocks,
  splitProseAroundArtifacts,
  extractTrailingUnclosedBlock,
  artifactInclusionForPolicy,
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
  EXPLICIT_ARTIFACT_MARKER_FOR,
} from '../artifact-derivation';

const HTML = '```html\n<!DOCTYPE html><html><body><h1>Hi</h1></body></html>\n```';
const PY = '```python\nimport os\nprint(os.getcwd())\nx = 1\ny = 2\n```';
const ONE_LINER = '```bash\nls -la\n```';

describe('extractCodeBlocks', () => {
  it('returns blocks in order with 0-based ordinals and line counts', () => {
    const blocks = extractCodeBlocks(`intro\n${HTML}\nmiddle\n${PY}\n`);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.language).toBe('html');
    expect(blocks[0]!.ordinal).toBe(0);
    expect(blocks[1]!.language).toBe('python');
    expect(blocks[1]!.ordinal).toBe(1);
    expect(blocks[1]!.lineCount).toBe(4);
  });

  it('pairs fences correctly when the info string is not a bare word', () => {
    const md = [
      'intro',
      '```html title="x"',
      '<div>one</div>',
      '```',
      'middle prose',
      '```objective-c',
      'NSLog(@"hi");',
      '```',
      'outro',
    ].join('\n');
    const blocks = extractCodeBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.language).toBe('html');
    expect(blocks[0]!.content).toBe('<div>one</div>');
    expect(blocks[1]!.language).toBe('objective-c');
    expect(blocks[1]!.content).toBe('NSLog(@"hi");');
    expect(md.slice(blocks[0]!.startIndex, blocks[0]!.endIndex)).toBe(
      '```html title="x"\n<div>one</div>\n```',
    );
    expect(extractTrailingUnclosedBlock(md)).toBeNull();
  });

  it('pairs fences correctly with CRLF line endings', () => {
    const blocks = extractCodeBlocks('a\r\n```html\r\n<div>x</div>\r\n```\r\nb');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.language).toBe('html');
    expect(blocks[0]!.content).toBe('<div>x</div>');
  });

  it('uses a fresh regex per call (no shared lastIndex leakage)', () => {
    expect(extractCodeBlocks(HTML)).toHaveLength(1);
    expect(extractCodeBlocks(HTML)).toHaveLength(1);
  });
});

describe('computeDerivedArtifactId, deterministic identity (the de-dup/sync key)', () => {
  it('is stable across calls for the same (conversation, message, ordinal)', () => {
    const a = computeDerivedArtifactId('c1', 'm1', 0);
    const b = computeDerivedArtifactId('c1', 'm1', 0);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('differs by ordinal, message, and conversation', () => {
    expect(computeDerivedArtifactId('c1', 'm1', 0)).not.toBe(
      computeDerivedArtifactId('c1', 'm1', 1),
    );
    expect(computeDerivedArtifactId('c1', 'm1', 0)).not.toBe(
      computeDerivedArtifactId('c1', 'm2', 0),
    );
    expect(computeDerivedArtifactId('c1', 'm1', 0)).not.toBe(
      computeDerivedArtifactId('c2', 'm1', 0),
    );
  });
});

describe('deriveArtifacts, ids are deterministic (fixes the non-deterministic fork)', () => {
  it('produces identical ids on repeated derivation of the same message', () => {
    const opts = { conversationId: 'c1', messageId: 'm1', now: '2026-06-21T00:00:00.000Z' };
    const first = deriveArtifacts(HTML, opts);
    const second = deriveArtifacts(HTML, opts);
    expect(first[0]!.id).toBe(second[0]!.id);
    expect(first[0]!.id).toBe(computeDerivedArtifactId('c1', 'm1', 0));
    expect(first).toEqual(second);
  });
});

describe('inclusion policy', () => {
  it("'renderable' (web default) keeps html/react/svg/mermaid, drops plain code", () => {
    const arts = deriveArtifacts(`${HTML}\n${PY}`, { conversationId: 'c', messageId: 'm' });
    expect(arts).toHaveLength(1);
    expect(arts[0]!.type).toBe('html');
  });

  it("'code' (mobile gallery) keeps all code blocks with >= minCodeLines lines", () => {
    const arts = deriveArtifacts(`${HTML}\n${PY}\n${ONE_LINER}`, {
      conversationId: 'c',
      messageId: 'm',
      include: 'code',
      minCodeLines: 4,
    });
    expect(arts.every((a) => a.content.split('\n').filter((l) => l.trim()).length >= 4)).toBe(true);
    expect(arts.some((a) => a.language === 'python')).toBe(true);
    expect(arts.some((a) => a.language === 'bash')).toBe(false);
  });

  it('accepts a custom predicate', () => {
    const arts = deriveArtifacts(`${HTML}\n${PY}`, {
      conversationId: 'c',
      messageId: 'm',
      include: (b) => b.language === 'python',
    });
    expect(arts).toHaveLength(1);
    expect(arts[0]!.language).toBe('python');
  });

  it("'explicit-renderable' keeps marked previews and leaves an unmarked HTML example inert", () => {
    const inert = '```html\n<main>Unmarked example</main>\n```';
    const preview = '```html\n<!-- @artifact -->\n<main>Preview me</main>\n```';
    const arts = deriveArtifacts(`${inert}\n\n${preview}`, {
      conversationId: 'c',
      messageId: 'm',
      include: 'explicit-renderable',
    });

    expect(arts).toHaveLength(1);
    expect(arts[0]!.content).toContain('Preview me');
    expect(artifactInclusionForPolicy(EXPLICIT_ARTIFACT_DERIVATION_POLICY)).toBe(
      'explicit-renderable',
    );
  });
});

describe('classification helpers', () => {
  it('isRenderableArtifact', () => {
    expect(isRenderableArtifact('html', '<div></div>')).toBe(true);
    expect(isRenderableArtifact('mermaid', 'graph TD;')).toBe(true);
    expect(isRenderableArtifact('python', 'print(1)')).toBe(false);
    expect(isRenderableArtifact('js', '// @artifact\nconsole.log(1)')).toBe(true);
  });

  it('detectArtifactType', () => {
    expect(detectArtifactType('mermaid', '')).toBe('mermaid');
    expect(detectArtifactType('tsx', '')).toBe('react');
    expect(detectArtifactType('', '<svg></svg>')).toBe('svg');
    expect(detectArtifactType('python', 'x=1')).toBe('code');
  });

  it('extractArtifactTitle prefers <title>, then @title, then <h1>', () => {
    expect(extractArtifactTitle('<title>My Doc</title>')).toBe('My Doc');
    expect(extractArtifactTitle('// @title: Cool Thing\ncode')).toBe('Cool Thing');
    expect(extractArtifactTitle('<h1>Heading <b>x</b></h1>')).toBe('Heading x');
  });
});

describe('hasArtifacts + removeArtifactBlocks', () => {
  it('hasArtifacts respects the inclusion policy', () => {
    expect(hasArtifacts(HTML)).toBe(true);
    expect(hasArtifacts(PY)).toBe(false);
    expect(hasArtifacts(PY, { include: 'code', minCodeLines: 4 })).toBe(true);
  });

  it('removeArtifactBlocks strips the rendered block from the body', () => {
    const arts = deriveArtifacts(HTML, { conversationId: 'c', messageId: 'm' });
    const cleaned = removeArtifactBlocks(`before\n${HTML}\nafter`, arts);
    expect(cleaned).not.toContain('<!DOCTYPE');
    expect(cleaned).toContain('before');
    expect(cleaned).toContain('after');
  });

  it('strips a renderable block even when the passed artifact content is stale/partial', () => {
    const body = `before\n${HTML}\nafter`;
    const stale = [{ content: '<!DOCTYPE html><html><head><title>Mini', language: 'html' }];
    const cleaned = removeArtifactBlocks(body, stale);
    expect(cleaned).not.toContain('<!DOCTYPE');
    expect(cleaned).not.toContain('```');
    expect(cleaned).toContain('before');
    expect(cleaned).toContain('after');
  });

  it('leaves a non-renderable code block intact when it is not a passed artifact', () => {
    const body = 'A\n\n```bash\nls -la\n```\n\nB';
    const cleaned = removeArtifactBlocks(body, [{ content: 'unrelated', language: 'html' }]);
    expect(cleaned).toContain('ls -la');
  });

  it('removes only marked artifacts under the explicit policy', () => {
    const inert = '```html\n<main>Unmarked example</main>\n```';
    const preview = '```html\n<!-- @artifact -->\n<main>Preview me</main>\n```';
    const body = `Before\n\n${inert}\n\n${preview}\n\nAfter`;
    const arts = deriveArtifacts(body, {
      conversationId: 'c',
      messageId: 'm',
      include: 'explicit-renderable',
    });
    const cleaned = removeArtifactBlocks(body, arts, { include: 'explicit-renderable' });

    expect(cleaned).toContain('<main>Unmarked example</main>');
    expect(cleaned).not.toContain('Preview me');
    expect(cleaned).toContain('Before');
    expect(cleaned).toContain('After');
  });
});

describe('extractTrailingUnclosedBlock', () => {
  it('detects a trailing unclosed fence and returns its partial body', () => {
    const md = 'Here is your page:\n\n```html\n<!DOCTYPE html>\n<html>\n<body>';
    const block = extractTrailingUnclosedBlock(md);
    expect(block).not.toBeNull();
    expect(block!.language).toBe('html');
    expect(block!.content).toBe('<!DOCTYPE html>\n<html>\n<body>');
    expect(block!.ordinal).toBe(0);
    expect(md.slice(block!.startIndex)).toMatch(/^```html\n/);
  });

  it('returns null when every fence is closed', () => {
    expect(extractTrailingUnclosedBlock(`intro\n${HTML}\nafter`)).toBeNull();
    expect(extractTrailingUnclosedBlock('no code at all')).toBeNull();
    expect(extractTrailingUnclosedBlock('')).toBeNull();
  });

  it('returns null while the opening fence line is still incomplete (no newline yet)', () => {
    expect(extractTrailingUnclosedBlock('Sure:\n\n```ht')).toBeNull();
    expect(extractTrailingUnclosedBlock('Sure:\n\n```html')).toBeNull();
  });

  it('detects the fence as soon as the language line completes, with empty body', () => {
    const block = extractTrailingUnclosedBlock('Sure:\n\n```html\n');
    expect(block).not.toBeNull();
    expect(block!.language).toBe('html');
    expect(block!.content).toBe('');
  });

  it('assigns the ordinal the block will have once closed (after complete blocks)', () => {
    const md = `${HTML}\n\ntext\n\n${PY}\n\nnow streaming:\n\n\`\`\`svg\n<svg`;
    const block = extractTrailingUnclosedBlock(md);
    expect(block).not.toBeNull();
    expect(block!.language).toBe('svg');
    expect(block!.ordinal).toBe(2);
    expect(computeDerivedArtifactId('c1', 'm1', block!.ordinal)).toBe(
      computeDerivedArtifactId('c1', 'm1', 2),
    );
  });

  it('stays consistent with extractCodeBlocks fence pairing on fence-like inner text', () => {
    const md = '```md\nUse ``` to open a fence\n```\n\nnow streaming:\n\n```html\n<div>';
    const closed = extractCodeBlocks(md);
    expect(closed).toHaveLength(1);
    expect(closed[0]!.content).toBe('Use ``` to open a fence');
    const block = extractTrailingUnclosedBlock(md);
    expect(block).not.toBeNull();
    expect(block!.language).toBe('html');
    expect(block!.ordinal).toBe(closed.length);
    expect(block!.startIndex).toBeGreaterThanOrEqual(closed[closed.length - 1]!.endIndex);
    const completed = extractCodeBlocks(md + '\n```');
    expect(completed).toHaveLength(closed.length + 1);
    expect(completed[closed.length]!.ordinal).toBe(block!.ordinal);
  });

  it('defaults language to text for a bare ``` fence', () => {
    const block = extractTrailingUnclosedBlock('```\npartial body');
    expect(block).not.toBeNull();
    expect(block!.language).toBe('text');
  });

  it('handles a giant single-line partial body without pathological cost', () => {
    const giant = 'x'.repeat(500_000);
    const block = extractTrailingUnclosedBlock('```html\n' + giant);
    expect(block).not.toBeNull();
    expect(block!.content).toHaveLength(500_000);
  });
});

describe('extractArtifactTitle, linear rewrite parity', () => {
  const LEGACY_TITLE = /<title>(.*?)<\/title>/i;
  const LEGACY_COMMENT = /(?:\/\/|<!--|#)\s*@title:?\s*(.+?)(?:\n|-->)/i;
  const LEGACY_H1 = /<h1[^>]*>(.*?)<\/h1>/i;

  const cases = [
    '<title>Hello</title>',
    '<TITLE>Upper</TITLE>',
    '<title>  spaced  </title>',
    '<h1>Heading</h1>',
    '<h1 class="x">Attrs</h1>',
    '<h1><span>Nested</span> markup</h1>',
    '// @title: Comment Title\nrest',
    '<!-- @title: Html Comment -->',
    '# @title Hash Title\nrest',
    '<title>First</title><h1>Second</h1>',
    'no title at all\njust text',
  ];

  it.each(cases)('agrees with the expressions it replaced: %j', (content) => {
    const legacy =
      LEGACY_TITLE.exec(content)?.[1]?.trim() ||
      LEGACY_COMMENT.exec(content)?.[1]?.trim() ||
      (() => {
        const h = LEGACY_H1.exec(content)?.[1];
        if (!h) return undefined;
        let text = h;
        let prev: string;
        do {
          prev = text;
          text = text.replace(/<[^>]*>/g, '');
        } while (text !== prev);
        return text.trim() || undefined;
      })() ||
      undefined;

    if (legacy) expect(extractArtifactTitle(content)).toBe(legacy);
  });

  it.each([
    ['unterminated <title>', `<title>${'a'.repeat(200_000)}`],
    ['unterminated <h1>', `<h1>${'a'.repeat(200_000)}`],
    ['unterminated @title comment', `<!-- @title: ${'a'.repeat(200_000)}`],
  ])('answers immediately on %s, which the old expressions made quadratic', (_label, content) => {
    expect(() => extractArtifactTitle(content)).not.toThrow();
  });

  it('still falls back to the first meaningful line', () => {
    expect(extractArtifactTitle('\n\n# Fallback Heading\nmore')).toBe('Fallback Heading');
  });

  it('never takes a fence line or a line inside a fence as the title', () => {
    expect(extractArtifactTitle('~~~quiz\n{"title":"Cells"}\n~~~')).toBeUndefined();
    expect(extractArtifactTitle('```js\nconst a = 1;\n```\nAfter the code')).toBe('After the code');
    const [artifact] = deriveArtifacts(
      '```markdown\n<!-- @artifact -->\n~~~quiz\n{"title":"Cells","questions":[]}\n~~~\n```',
      { conversationId: 'c', messageId: 'm' },
    );
    expect(artifact?.title).toBe('Document');
  });

  it('names a document or deck with nothing to title it by its kind', () => {
    const [document] = deriveArtifacts('```markdown\n<!-- @artifact -->\n```', {
      conversationId: 'c',
      messageId: 'm',
    });
    expect(document?.title).toBe('Document');
    const [deck] = deriveArtifacts(
      '```markdown\n<!-- @artifact -->\n<!-- deck -->\n~~~flashcards\n{"cards":[]}\n~~~\n```',
      { conversationId: 'c', messageId: 'm' },
    );
    expect(deck?.type).toBe('presentation');
    expect(deck?.title).toBe('Slides');
    const [code] = deriveArtifacts('```html\n<!-- @artifact -->\n<div></div>\n```', {
      conversationId: 'c',
      messageId: 'm',
    });
    expect(code?.title).toBe('html snippet');
  });

  it('labels each artifact kind the way every surface shows it', () => {
    expect(artifactKindLabel('react')).toBe('Code');
    expect(artifactKindLabel('csv')).toBe('Spreadsheet');
    expect(artifactKindLabel('presentation')).toBe('Slides');
    expect(artifactKindLabel('email')).toBe('Email');
    expect(artifactKindLabel('image')).toBe('Image');
    expect(artifactKindLabel('document')).toBe('Document');
    expect(artifactKindLabel('research')).toBe('Document');
  });

  it('prefers the first Markdown heading in a Markdown document', () => {
    const content = 'Use this to revise.\n\n# Cell biology quiz\n\n~~~quiz\n{}\n~~~';
    expect(extractArtifactTitle(content, 'markdown')).toBe('Cell biology quiz');
    expect(extractArtifactTitle(content)).toBe('Use this to revise.');
    expect(extractArtifactTitle('import os\n# Load the data', 'python')).toBe('import os');
    const [artifact] = deriveArtifacts(
      '```markdown\n<!-- @artifact -->\nUse this to revise.\n\n# Cell biology quiz\n```',
      { conversationId: 'c', messageId: 'm' },
    );
    expect(artifact?.title).toBe('Cell biology quiz');
  });
});

describe('withoutArtifactMarker', () => {
  it('drops a first line that is an artifact marker and nothing else', () => {
    expect(withoutArtifactMarker('<!-- @artifact -->\n# Notes')).toBe('# Notes');
    expect(withoutArtifactMarker('  // @artifact  \ncode')).toBe('code');
    expect(withoutArtifactMarker('%% @artifact')).toBe('');
    expect(withoutArtifactMarker('# Notes\n<!-- @artifact -->')).toBe(
      '# Notes\n<!-- @artifact -->',
    );
  });

  it('never names an artifact after its marker or its opening markup', () => {
    expect(extractArtifactTitle('<!-- @artifact -->\n<!doctype html>\n<html><body>')).toBe(
      undefined,
    );
    expect(extractArtifactTitle('// @artifact\n// Budget tracker\nfunction App() {}')).toBe(
      'Budget tracker',
    );
    expect(extractArtifactTitle('%% @artifact\nflowchart TD')).toBe('flowchart TD');
  });
});

describe('splitProseAroundArtifacts', () => {
  const reply = [
    'Lead sentence.',
    '',
    '```html',
    '<!-- @artifact -->',
    '<main>ONE</main>',
    '```',
    '',
    'Between them.',
    '',
    '```python',
    'print(1)',
    '```',
    '',
    'After everything.',
  ].join('\n');

  it('keeps the prose after the last artifact apart and strips every artifact block', () => {
    const artifacts = deriveArtifacts(reply, { include: 'explicit-renderable' });
    const split = splitProseAroundArtifacts(reply, artifacts, { include: 'explicit-renderable' });

    expect(split.before).toBe('Lead sentence.');
    expect(split.after).toContain('Between them.');
    expect(split.after).toContain('print(1)');
    expect(split.after).toContain('After everything.');
    expect(split.before + split.after).not.toContain('ONE');
  });

  it('puts everything before when nothing follows the artifact or there is none', () => {
    expect(splitProseAroundArtifacts('Just text.', [])).toEqual({
      before: 'Just text.',
      after: '',
    });
    const only = 'Lead.\n\n```html\n<!-- @artifact -->\n<main>X</main>\n```';
    const artifacts = deriveArtifacts(only, { include: 'explicit-renderable' });
    expect(splitProseAroundArtifacts(only, artifacts, { include: 'explicit-renderable' })).toEqual({
      before: 'Lead.',
      after: '',
    });
  });
});

describe('the explicit marker for each renderable type', () => {
  it.each([
    ['html', '<main>Calculator</main>'],
    ['svg', '<svg viewBox="0 0 10 10"></svg>'],
    ['jsx', 'function App() { return <main />; }'],
    ['mermaid', 'graph TD; A-->B'],
  ] as const)(
    'makes a %s block derive under explicit-v1 when it opens the block',
    (language, body) => {
      const type = detectArtifactType(language, body) as keyof typeof EXPLICIT_ARTIFACT_MARKER_FOR;
      const marker = EXPLICIT_ARTIFACT_MARKER_FOR[type];
      const include = artifactInclusionForPolicy(EXPLICIT_ARTIFACT_DERIVATION_POLICY);

      expect(deriveArtifacts(`\`\`\`${language}\n${body}\n\`\`\``, { include })).toHaveLength(0);
      const derived = deriveArtifacts(`\`\`\`${language}\n${marker}\n${body}\n\`\`\``, { include });
      expect(derived).toHaveLength(1);
      expect(derived[0]!.type).toBe(type);
    },
  );
});

describe('marked markdown documents and decks', () => {
  const DOC = '```markdown\n<!-- @artifact -->\n# Launch plan\n\nShip in March.\n```';
  const DECK =
    '```md\n<!-- @artifact -->\n<!-- deck theme=midnight -->\n\n# Pitch\n\n---\n\n## Ask\n\nFunding\n```';
  const UNMARKED = '```markdown\n# Just an example\n\nNot an artifact.\n```';
  const MARKER_LATER = '```markdown\n# Example\n<!-- @artifact -->\ntext\n```';

  for (const include of ['renderable', 'explicit-renderable'] as const) {
    it(`derives a marked markdown block as a document without its marker (${include})`, () => {
      const [doc] = deriveArtifacts(DOC, { conversationId: 'c', messageId: 'm', include });
      expect(doc).toMatchObject({ type: 'document', language: 'markdown', title: 'Launch plan' });
      expect(doc!.content).toBe('# Launch plan\n\nShip in March.');
    });

    it(`derives a marked block with a deck line as a presentation (${include})`, () => {
      const [deck] = deriveArtifacts(DECK, { conversationId: 'c', messageId: 'm', include });
      expect(deck).toMatchObject({ type: 'presentation', language: 'markdown', title: 'Pitch' });
      expect(deck!.content.startsWith('<!-- deck theme=midnight -->')).toBe(true);
    });

    it(`never derives an unmarked markdown block (${include})`, () => {
      expect(deriveArtifacts(UNMARKED, { include })).toHaveLength(0);
      expect(hasArtifacts(UNMARKED, { include })).toBe(false);
    });

    it(`does not treat a marker below the first line as a document (${include})`, () => {
      const derived = deriveArtifacts(MARKER_LATER, { include });
      expect(derived.every((artifact) => artifact.type !== 'document')).toBe(true);
    });
  }

  it('leaves every existing type unchanged', () => {
    expect(detectArtifactType('html', '<!-- @artifact -->\n<main/>')).toBe('html');
    expect(detectArtifactType('svg', '<svg></svg>')).toBe('svg');
    expect(detectArtifactType('tsx', '// @artifact\nexport default 1')).toBe('react');
    expect(detectArtifactType('mermaid', '%% @artifact\ngraph TD')).toBe('mermaid');
    expect(detectArtifactType('python', 'print(1)')).toBe('code');
    expect(detectArtifactType('markdown', '# heading only')).toBe('code');
    expect(EXPLICIT_ARTIFACT_MARKER_FOR.markdown).toBe('<!-- @artifact -->');
  });

  it('removes the marked block from the prose around it', () => {
    const message = `Here is the plan.\n\n${DOC}\n\nTell me what to change.`;
    const artifacts = deriveArtifacts(message, { include: 'explicit-renderable' });
    expect(removeArtifactBlocks(message, artifacts, { include: 'explicit-renderable' })).toBe(
      'Here is the plan.\n\n\n\nTell me what to change.',
    );
  });
});

describe('a marked document wrapped in an outer fence', () => {
  const QUIZ = JSON.stringify(
    {
      title: 'Cell parts',
      questions: [
        {
          type: 'multiple_choice',
          question: 'Which organelle makes ATP?',
          options: ['Nucleus', 'Mitochondrion'],
          answer: 1,
        },
      ],
    },
    null,
    2,
  );
  const CARDS = JSON.stringify(
    { title: 'Cell terms', cards: [{ front: 'Osmosis', back: 'Water crossing a membrane' }] },
    null,
    2,
  );
  const BACKTICK_INNER = [
    '```markdown',
    '<!-- @artifact -->',
    '```quiz',
    QUIZ,
    '```',
    '',
    '```flashcards',
    CARDS,
    '```',
    '```',
  ].join('\n');
  const TILDE_INNER = [
    'Here is your practice.',
    '',
    '```markdown',
    '<!-- @artifact -->',
    '~~~quiz',
    QUIZ,
    '~~~',
    '',
    '~~~flashcards',
    CARDS,
    '~~~',
    '```',
  ].join('\n');
  const LONGER_OUTER = [
    '````markdown',
    '<!-- @artifact -->',
    '# Review',
    '',
    '```quiz',
    QUIZ,
    '```',
    '````',
  ].join('\n');
  const INNER_DOCUMENT = ['```quiz', QUIZ, '```', '', '```flashcards', CARDS, '```'].join('\n');

  for (const include of ['code', 'renderable', 'explicit-renderable'] as const) {
    it(`derives one document holding every inner block (${include})`, () => {
      const artifacts = deriveArtifacts(BACKTICK_INNER, {
        conversationId: 'c',
        messageId: 'm',
        include,
      });
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toMatchObject({
        type: 'document',
        language: 'markdown',
        title: 'Cell parts',
        content: INNER_DOCUMENT,
      });
      expect(removeArtifactBlocks(BACKTICK_INNER, artifacts, { include })).toBe('');
    });

    it(`titles a tilde-inner document by the study set and a longer-fence one by its heading (${include})`, () => {
      const [tilde] = deriveArtifacts(TILDE_INNER, { include });
      const [longer] = deriveArtifacts(LONGER_OUTER, { include });
      expect(tilde).toMatchObject({ type: 'document', title: 'Cell parts' });
      expect(longer).toMatchObject({ type: 'document', title: 'Review' });
      expect(longer!.content).toBe(['# Review', '', '```quiz', QUIZ, '```'].join('\n'));
    });

    it(`keeps the document heading over an untitled set with questions (${include})`, () => {
      const untitledQuiz = QUIZ.replace('"title": "Cell parts",', '');
      const guide = [
        '```markdown',
        '<!-- @artifact -->',
        '# Photosynthesis study guide',
        '',
        'Light reactions happen in the thylakoid.',
        '',
        '~~~quiz',
        untitledQuiz,
        '~~~',
        '```',
      ].join('\n');
      const [doc] = deriveArtifacts(guide, { include });
      expect(doc).toMatchObject({ type: 'document', title: 'Photosynthesis study guide' });
    });

    it(`derives nothing from a longer-fence Markdown example around an html block (${include})`, () => {
      const example = [
        '````markdown',
        'Paste this into your notes:',
        '',
        '```html',
        '<!-- @artifact -->',
        '<div>Hello</div>',
        '```',
        '````',
      ].join('\n');
      const artifacts = deriveArtifacts(example, { include });
      expect(artifacts.some((artifact) => artifact.type === 'html')).toBe(false);
      expect(artifacts.every((artifact) => artifact.language === 'markdown')).toBe(true);
    });
  }

  it('titles a set only in a study fence or a marked document', () => {
    const html = [
      '```html',
      '<!-- @artifact -->',
      '<title>My page</title>',
      '<pre>',
      '~~~quiz',
      QUIZ,
      '~~~',
      '</pre>',
      '```',
    ].join('\n');
    expect(deriveArtifacts(html)[0]!.title).toBe('My page');
    const untitledHtml = html.replace('<title>My page</title>\n', '');
    expect(deriveArtifacts(untitledHtml)[0]!.title).toBe('html snippet');
  });

  it('falls back to the set label when the set title is too long for a title', () => {
    const longQuiz = QUIZ.replace('Cell parts', 'Cell parts '.repeat(8).trim());
    const [quiz] = deriveArtifacts(['```quiz', longQuiz, '```'].join('\n'), { include: 'code' });
    expect(quiz!.title).toBe('Quiz');
  });

  it('drops a position counter the model wrote into a set title', () => {
    const titled = (kind: 'quiz' | 'flashcards', title: string) => {
      const source = kind === 'quiz' ? QUIZ : CARDS;
      const named = source.replace(kind === 'quiz' ? 'Cell parts' : 'Cell terms', title);
      return deriveArtifacts(['```' + kind, named, '```'].join('\n'), { include: 'code' })[0]!
        .title;
    };
    expect(titled('quiz', 'Photosynthesis: Question 1 of 2')).toBe('Photosynthesis');
    expect(titled('quiz', 'Question #1 of 2: Photosynthesis')).toBe('Photosynthesis');
    expect(titled('quiz', 'Photosynthesis: Q1 of 2')).toBe('Photosynthesis');
    expect(titled('quiz', 'Question 1 of 2')).toBe('Quiz');
    expect(titled('quiz', 'Q3/4 planning review')).toBe('Q3/4 planning review');
    expect(titled('quiz', 'Budget review Q2 of 2026')).toBe('Budget review Q2 of 2026');
    expect(titled('flashcards', 'Terms: Card 1 of 3')).toBe('Terms');
    expect(titled('flashcards', 'Terms: Question 1 of 2')).toBe('Terms: Question 1 of 2');
    const long = 'Cell parts and the organelles of eukaryotic cells';
    expect(titled('quiz', `${long} (Question 1 of 12)`)).toBe(long);
    const [document] = deriveArtifacts(
      BACKTICK_INNER.replace('Cell parts', 'Cell parts: Question 1 of 2'),
    );
    expect(document).toMatchObject({ type: 'document', title: 'Cell parts' });
  });

  it('names an untitled set Quiz or Flashcards and never a fence line', () => {
    const untitledQuiz = QUIZ.replace('"title": "Cell parts",', '');
    const untitledCards = CARDS.replace('"title":"Cell terms",', '').replace(
      '"title": "Cell terms",',
      '',
    );
    const [quiz] = deriveArtifacts(
      ['```markdown', '<!-- @artifact -->', '```quiz', untitledQuiz, '```', '```'].join('\n'),
    );
    const [cards] = deriveArtifacts(
      ['```md', '<!-- @artifact -->', '~~~flashcards', untitledCards, '~~~', '```'].join('\n'),
    );
    expect(quiz!.title).toBe('Quiz');
    expect(cards!.title).toBe('Flashcards');
    const [bare] = deriveArtifacts(['```flashcards', CARDS, '```'].join('\n'), {
      include: 'code',
    });
    expect(bare).toMatchObject({ language: 'flashcards', title: 'Cell terms' });
  });

  it('keeps CommonMark pairing for a fence that is not a marked document', () => {
    const md = ['```markdown', '# Example', '```js', 'run()', '```', 'after', '```'].join('\n');
    const blocks = extractCodeBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.content).toBe('# Example\n```js\nrun()');
    expect(extractTrailingUnclosedBlock(`${md}\n`, blocks)).toMatchObject({
      language: 'text',
      content: '',
    });
  });

  it('streams the wrapped document as one open block until its own fence closes', () => {
    const partial = BACKTICK_INNER.slice(0, BACKTICK_INNER.lastIndexOf('\n```'));
    expect(extractCodeBlocks(partial)).toEqual([]);
    const open = extractTrailingUnclosedBlock(partial);
    expect(open).toMatchObject({ language: 'markdown', ordinal: 0, startIndex: 0 });
    expect(open!.content).toBe(`<!-- @artifact -->\n${INNER_DOCUMENT}`);
  });
});

describe('titles of tabular artifacts', () => {
  const TABLE = 'Fruit,Price_USD,Colour\nApple,0.75,Red\nBanana,0.30,Yellow\nPear,0.90,Green';

  it('never takes the header row of a table as its title', () => {
    expect(extractArtifactTitle(TABLE, 'csv')).toBeUndefined();
    expect(extractArtifactTitle(TABLE.replace(/,/g, '\t'), 'TSV')).toBeUndefined();
    expect(extractArtifactTitle(`# @title: Fruit prices\n${TABLE}`, 'csv')).toBe('Fruit prices');
  });

  it('names an untitled table by its kind', () => {
    const [table] = deriveArtifacts(['```csv', TABLE, '```'].join('\n'), {
      conversationId: 'c',
      messageId: 'm',
      include: 'code',
    });
    expect(table?.title).toBe(artifactKindLabel('csv'));
  });
});

describe('withoutTitleDirectives', () => {
  it('drops the title directive lines the title is read from and keeps the rest', () => {
    const component = '// @artifact\n// @title: Tiny Counter\nfunction App() {\n  return null;\n}';
    expect(extractArtifactTitle(component)).toBe('Tiny Counter');
    expect(withoutTitleDirectives(component)).toBe(
      '// @artifact\nfunction App() {\n  return null;\n}',
    );
    expect(withoutTitleDirectives('<!-- @title Report -->\n<p>Hi</p>')).toBe('<p>Hi</p>');
    expect(withoutTitleDirectives('  # @Title: Sheet\nx = 1')).toBe('x = 1');
    expect(withoutTitleDirectives('const title = "@title";')).toBe('const title = "@title";');
  });
});
