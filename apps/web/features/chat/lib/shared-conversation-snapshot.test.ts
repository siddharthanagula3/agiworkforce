import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { describe, expect, it } from 'vitest';
import { snapshotArtifacts, type SnapshotArtifactSource } from './shared-conversation-snapshot';

const CONVERSATION_ID = 'conv-legacy';
const MESSAGE_ID = 'msg-legacy';
const idAt = (ordinal: number) => computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, ordinal);

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

function savedPage(id: string, content: string): SnapshotArtifactSource {
  return { id, title: 'Tool page', type: 'html', language: 'html', content };
}

describe('snapshotArtifacts', () => {
  it('maps an artifact saved under its pre-correction id onto the block it belongs to', () => {
    expect(
      snapshotArtifacts(CONVERSATION_ID, MESSAGE_ID, NESTED_WITHOUT_LONGER_FENCE, [
        savedPage(idAt(2), PAGE),
      ]),
    ).toEqual([{ ordinal: 1, title: 'Tool page', type: 'html', language: 'html', content: PAGE }]);
  });

  it('keeps the artifact saved under the current id when the old id is saved too', () => {
    const current = PAGE.replace('Tool', 'Current tool');
    expect(
      snapshotArtifacts(CONVERSATION_ID, MESSAGE_ID, NESTED_WITHOUT_LONGER_FENCE, [
        savedPage(idAt(2), PAGE.replace('Tool', 'Old tool')),
        savedPage(idAt(1), current),
      ]),
    ).toEqual([
      { ordinal: 1, title: 'Tool page', type: 'html', language: 'html', content: current },
    ]);
  });

  it('keeps an artifact that matches no block as a standalone artifact', () => {
    expect(
      snapshotArtifacts(CONVERSATION_ID, MESSAGE_ID, NESTED_WITHOUT_LONGER_FENCE, [
        savedPage('artifact-made-elsewhere', PAGE),
      ]),
    ).toEqual([
      { ordinal: null, title: 'Tool page', type: 'html', language: 'html', content: PAGE },
    ]);
  });
});
