import { deriveArtifacts } from '@agiworkforce/artifacts';
import { messageArtifactFromShared } from '../stores/chat/derivedMessageArtifact';

const SVG_FENCE = [
  '```',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
  '  <circle cx="5" cy="5" r="4" />',
  '  <rect x="1" y="1" width="2" height="2" />',
  '</svg>',
  '```',
].join('\n');

function derived(markdown: string) {
  return deriveArtifacts(markdown, {
    conversationId: 'conv-artifact',
    messageId: 'msg-artifact',
    include: 'code',
    minCodeLines: 4,
    now: '2026-11-14T00:00:00.000Z',
  }).map(messageArtifactFromShared);
}

describe('an artifact derived from a code fence', () => {
  it('opens a bare fence holding an svg as an svg, so it gets a Preview', () => {
    expect(derived(SVG_FENCE)).toEqual([
      expect.objectContaining({ type: 'code', language: 'svg' }),
    ]);
  });

  it('keeps the language a fence names', () => {
    const python = ['```python', 'a = 1', 'b = 2', 'c = 3', 'print(a + b + c)', '```'].join('\n');
    expect(derived(python)).toEqual([
      expect.objectContaining({ type: 'code', language: 'python' }),
    ]);
  });

  it('gives an untyped fence of plain code no language', () => {
    const plain = ['```', 'one', 'two', 'three', 'four', '```'].join('\n');
    const [artifact] = derived(plain);
    expect(artifact?.type).toBe('code');
    expect(artifact).not.toHaveProperty('language');
  });
});

describe('the title of an artifact derived from a fenced document', () => {
  const quizDocument = (...opening: string[]) =>
    [
      '```markdown',
      '<!-- @artifact -->',
      ...opening,
      '~~~quiz',
      '{"title":"Cells","questions":[]}',
      '~~~',
      '',
      'Answer each question, then check your score.',
      '```',
    ].join('\n');

  it('takes the first heading, never the fence line inside it', () => {
    const [artifact] = derived(quizDocument('Use this to revise.', '', '# Cell biology quiz', ''));
    expect(artifact?.title).toBe('Cell biology quiz');
  });

  it('never names the artifact after a nested fence when the document has no heading', () => {
    const [artifact] = derived(quizDocument());
    expect(artifact?.title).not.toMatch(/^[~`]{3}/);
    expect(artifact?.title).not.toContain('quiz');
  });

  it('names a marked document with no heading and no prose Document', () => {
    const [artifact] = deriveArtifacts('```markdown\n<!-- @artifact -->\n~~~quiz\n{}\n~~~\n```', {
      include: 'code',
      minCodeLines: 1,
    });
    expect(artifact?.title).toBe('Document');
  });

  it('leaves the artifact marker out of the content a preview shows', () => {
    const [artifact] = derived(quizDocument('# Cell biology quiz'));
    expect(artifact?.content.startsWith('<!-- @artifact -->')).toBe(false);
    expect(artifact?.content).not.toContain('@artifact');
  });
});
