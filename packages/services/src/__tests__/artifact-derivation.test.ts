import { describe, it, expect } from 'vitest';
import {
  extractCodeBlocks,
  isRenderableArtifact,
  detectArtifactType,
  extractArtifactTitle,
  computeDerivedArtifactId,
  deriveArtifacts,
  hasArtifacts,
  removeArtifactBlocks,
  extractTrailingUnclosedBlock,
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

  it('uses a fresh regex per call (no shared lastIndex leakage)', () => {
    expect(extractCodeBlocks(HTML)).toHaveLength(1);
    expect(extractCodeBlocks(HTML)).toHaveLength(1);
  });
});

describe('computeDerivedArtifactId — deterministic identity (the de-dup/sync key)', () => {
  it('is stable across calls for the same (conversation, message, ordinal)', () => {
    const a = computeDerivedArtifactId('c1', 'm1', 0);
    const b = computeDerivedArtifactId('c1', 'm1', 0);
    expect(a).toBe(b);
    // looks like a uuid
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

describe('deriveArtifacts — ids are deterministic (fixes the non-deterministic fork)', () => {
  it('produces identical ids on repeated derivation of the same message', () => {
    const opts = { conversationId: 'c1', messageId: 'm1', now: '2026-06-21T00:00:00.000Z' };
    const first = deriveArtifacts(HTML, opts);
    const second = deriveArtifacts(HTML, opts);
    expect(first[0]!.id).toBe(second[0]!.id);
    expect(first[0]!.id).toBe(computeDerivedArtifactId('c1', 'm1', 0));
    expect(first).toEqual(second); // fully reproducible with a fixed `now`
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
    // HTML(1 line after collapse? it's one line) + PY(4 lines) — only blocks with >=4 non-empty lines
    expect(arts.every((a) => a.content.split('\n').filter((l) => l.trim()).length >= 4)).toBe(true);
    expect(arts.some((a) => a.language === 'python')).toBe(true);
    expect(arts.some((a) => a.language === 'bash')).toBe(false); // one-liner excluded
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
    expect(hasArtifacts(PY)).toBe(false); // renderable default
    expect(hasArtifacts(PY, { include: 'code', minCodeLines: 4 })).toBe(true);
  });

  it('removeArtifactBlocks strips the rendered block from the body', () => {
    const arts = deriveArtifacts(HTML, { conversationId: 'c', messageId: 'm' });
    const cleaned = removeArtifactBlocks(`before\n${HTML}\nafter`, arts);
    expect(cleaned).not.toContain('<!DOCTYPE');
    expect(cleaned).toContain('before');
    expect(cleaned).toContain('after');
  });

  // Regression: in the live web flow MessageBubble passes artifacts from the STORE, whose
  // content can drift from the final markdown (an artifact captured mid-stream). The old
  // exact-content regex then missed, leaving a DUPLICATE raw code block beside the card.
  // Position-based removal must strip the block even with a stale/partial passed content.
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
    // Same deterministic id as the eventual completed artifact
    expect(computeDerivedArtifactId('c1', 'm1', block!.ordinal)).toBe(
      computeDerivedArtifactId('c1', 'm1', 2),
    );
  });

  it('stays consistent with extractCodeBlocks fence pairing on fence-like inner text', () => {
    // extractCodeBlocks pairs lazily: the inner ``` closes the first block, and
    // the next ```-with-newline opens a new (unclosed) one. The streaming parser
    // MUST mirror that pairing — its ordinal/startIndex have to match what the
    // canonical extractor will produce once the fence closes (id-handoff invariant).
    const md = '```md\nUse ``` to open a fence\n```\n\nplain prose after';
    const closed = extractCodeBlocks(md);
    const block = extractTrailingUnclosedBlock(md);
    expect(block).not.toBeNull();
    expect(block!.ordinal).toBe(closed.length);
    expect(block!.startIndex).toBeGreaterThanOrEqual(closed[closed.length - 1]!.endIndex);
    // Once a closing fence arrives, the canonical extractor sees the same block.
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
