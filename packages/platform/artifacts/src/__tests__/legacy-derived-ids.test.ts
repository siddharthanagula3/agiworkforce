import { describe, expect, it } from 'vitest';
import { computeDerivedArtifactId, deriveArtifacts } from '../artifact-derivation';
import { extractLegacyCodeBlocks, legacyArtifactIdAdoptions } from '../legacy-derived-ids';

const scope = { conversationId: 'conv-legacy', messageId: 'msg-legacy' };
const idAt = (ordinal: number) =>
  computeDerivedArtifactId(scope.conversationId, scope.messageId, ordinal);

const PAGE = '<!DOCTYPE html><html><body><h1>Tool</h1></body></html>';
const NESTED_WITHOUT_LONGER_FENCE = [
  'README:',
  '```markdown',
  '# Tool',
  '```bash',
  'npm i tool',
  '```',
  '```',
  '',
  'Page:',
  '```html',
  PAGE,
  '```',
].join('\n');

const FOUR_BACKTICK_WRAPPER = [
  '````markdown',
  '# Setup',
  '```bash',
  'npm i a',
  '```',
  '```bash',
  'npm i b',
  '```',
  '````',
  '',
  '```html',
  PAGE,
  '```',
].join('\n');

describe('extractLegacyCodeBlocks', () => {
  it('splits a nested fence the way the previous parser did', () => {
    expect(
      extractLegacyCodeBlocks(NESTED_WITHOUT_LONGER_FENCE).map(({ ordinal, content }) => ({
        ordinal,
        content,
      })),
    ).toEqual([
      { ordinal: 0, content: '# Tool' },
      { ordinal: 1, content: '' },
      { ordinal: 2, content: PAGE },
    ]);
  });

  it('skips fences longer than three backticks', () => {
    expect(extractLegacyCodeBlocks(FOUR_BACKTICK_WRAPPER).map((block) => block.content)).toEqual([
      'npm i a',
      'npm i b',
      PAGE,
    ]);
  });

  it('reports the content range each block held', () => {
    const [block] = extractLegacyCodeBlocks('intro\n```html\n<p>x</p>\n```\n');
    expect(block).toMatchObject({ contentStart: 14, contentEnd: 23 });
  });
});

describe('legacyArtifactIdAdoptions', () => {
  it('maps the page that moved ordinal onto the id it was saved under', () => {
    const [page] = deriveArtifacts(NESTED_WITHOUT_LONGER_FENCE, scope);
    expect(page?.id).toBe(idAt(1));
    expect(legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, scope)).toEqual([
      { id: idAt(1), legacyId: idAt(2) },
    ]);
  });

  it('adopts nothing for a block that holds more than one old block', () => {
    expect(legacyArtifactIdAdoptions(FOUR_BACKTICK_WRAPPER, scope)).toEqual([
      { id: idAt(1), legacyId: idAt(2) },
    ]);
  });

  it('adopts an old id that now belongs to a block deriving no artifact', () => {
    const message = '````md\nhello\n````\n```html\n' + PAGE + '\n```';
    expect(extractLegacyCodeBlocks(message).map((block) => block.content)).toEqual([PAGE]);
    expect(deriveArtifacts(message, scope).map((artifact) => artifact.id)).toEqual([idAt(1)]);
    expect(legacyArtifactIdAdoptions(message, scope)).toEqual([{ id: idAt(1), legacyId: idAt(0) }]);
  });

  it('never adopts an old id that a current block of the message still derives', () => {
    const message =
      '````html\n<!DOCTYPE html><html><body>Other</body></html>\n````\n```html\n' + PAGE + '\n```';
    expect(extractLegacyCodeBlocks(message).map((block) => block.content)).toEqual([PAGE]);
    expect(deriveArtifacts(message, scope).map((artifact) => artifact.id)).toEqual([
      idAt(0),
      idAt(1),
    ]);
    expect(legacyArtifactIdAdoptions(message, scope)).toEqual([]);
  });

  it('never adopts an old id that a trailing unclosed block now carries', () => {
    const message = `${NESTED_WITHOUT_LONGER_FENCE}\n\n\`\`\`html\n<main>`;
    expect(extractLegacyCodeBlocks(message).map((block) => block.ordinal)).toEqual([0, 1, 2]);
    expect(deriveArtifacts(message, scope).map((artifact) => artifact.id)).toEqual([idAt(1)]);
    expect(legacyArtifactIdAdoptions(message, scope)).toEqual([]);
  });

  it('has nothing to adopt when both parsers agree', () => {
    const message = 'intro\n```html\n' + PAGE + '\n```\nthen\n```python\nprint(1)\n```';
    expect(legacyArtifactIdAdoptions(message, scope)).toEqual([]);
  });
});
