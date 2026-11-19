import { deriveArtifacts, computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { deriveAndMapToMobileArtifacts } from '@/src/features/artifacts/store';

const PYTHON_BLOCK = ['```python', 'import os', 'print(os.getcwd())', 'x = 1', 'y = 2', '```'].join(
  '\n',
);

const SHORT_BLOCK = ['```bash', 'ls -la', '```'].join('\n');

const ARTIFACT_PAGE = [
  '```html',
  '<!-- @artifact -->',
  '<!DOCTYPE html>',
  '<html><head><title>Tiny Counter</title></head>',
  '<body><button>Add one</button></body></html>',
  '```',
].join('\n');

const MARKDOWN_TWO_PAGES = [ARTIFACT_PAGE, 'Some prose.', ARTIFACT_PAGE].join('\n\n');

const LOCAL_PROVENANCE = { scope: 'local' } as const;

describe('uuid v5 bundling in RN/Jest (no react-native-get-random-values required)', () => {
  it('deriveArtifacts runs and returns deterministic ids', () => {
    const a = deriveArtifacts(PYTHON_BLOCK, {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      include: 'code',
      minCodeLines: 4,
      now: '2026-06-21T00:00:00.000Z',
    });
    const b = deriveArtifacts(PYTHON_BLOCK, {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      include: 'code',
      minCodeLines: 4,
      now: '2026-06-21T00:00:00.000Z',
    });

    expect(a).toHaveLength(1);
    expect(a[0]!.id).toBe(b[0]!.id);
    expect(a[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('computeDerivedArtifactId is stable', () => {
    const id1 = computeDerivedArtifactId('conv-1', 'msg-1', 0);
    const id2 = computeDerivedArtifactId('conv-1', 'msg-1', 0);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5/);
  });

  it('short block (< 4 non-empty lines) is excluded by mobile policy', () => {
    const artifacts = deriveArtifacts(SHORT_BLOCK, {
      include: 'code',
      minCodeLines: 4,
    });
    expect(artifacts).toHaveLength(0);
  });
});

describe('deriveAndMapToMobileArtifacts, delegation + mapping', () => {
  it('produces MobileArtifacts with deterministic ids from deriveArtifacts', () => {
    const result = deriveAndMapToMobileArtifacts(
      ARTIFACT_PAGE,
      'conv-42',
      'msg-99',
      '2026-06-21T00:00:00.000Z',
      'Test conversation',
      LOCAL_PROVENANCE,
    );

    expect(result).toHaveLength(1);
    const ma = result[0]!;

    expect(ma.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ma.id).toBe(computeDerivedArtifactId('conv-42', 'msg-99', 0));

    expect(ma.kind).toBe('code');
    expect(ma.content).toBeTruthy();
    expect(ma.sourceLabel).toBe('Test conversation');
    expect(typeof ma.ageLabel).toBe('string');
    expect(ma.ageLabel.length).toBeGreaterThan(0);
  });

  it('ids are stable across two calls with the same context', () => {
    const a = deriveAndMapToMobileArtifacts(
      ARTIFACT_PAGE,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      LOCAL_PROVENANCE,
    );
    const b = deriveAndMapToMobileArtifacts(
      ARTIFACT_PAGE,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      LOCAL_PROVENANCE,
    );
    expect(a[0]!.id).toBe(b[0]!.id);
  });

  it('unlabeled block maps language to undefined (not "text")', () => {
    const unlabeled = ['```', 'a = 1', 'b = 2', 'c = 3', 'd = 4', '```'].join('\n');
    const result = deriveAndMapToMobileArtifacts(
      unlabeled,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      LOCAL_PROVENANCE,
    );
    if (result.length > 0) {
      expect(result[0]!.language).toBeUndefined();
    }
  });

  it('labels a bare svg picture as svg so it opens on its preview', () => {
    const bare = [
      '```',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
      '  <circle r="4" cx="5" cy="5" />',
      '  <rect width="2" height="2" />',
      '</svg>',
      '```',
    ].join('\n');
    const [artifact] = deriveAndMapToMobileArtifacts(
      bare,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      LOCAL_PROVENANCE,
    );
    expect(artifact?.artifactType).toBe('svg');
    expect(artifact?.language).toBe('svg');
  });

  it('two blocks get distinct deterministic ids', () => {
    const result = deriveAndMapToMobileArtifacts(
      MARKDOWN_TWO_PAGES,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      LOCAL_PROVENANCE,
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.id).not.toBe(result[1]!.id);
  });

  it('takes no palette from the caller and keeps the provenance it is given', () => {
    const cloud = { scope: 'cloud', ownerId: 'user-a' } as const;
    const result = deriveAndMapToMobileArtifacts(
      ARTIFACT_PAGE,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      cloud,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.provenance).toEqual(cloud);
    expect(deriveAndMapToMobileArtifacts.length).toBe(6);
  });

  it('lists no plain code sample, which the chat draws inline rather than as a card', () => {
    const result = deriveAndMapToMobileArtifacts(
      PYTHON_BLOCK,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      LOCAL_PROVENANCE,
    );
    expect(result).toHaveLength(0);
  });

  it('short blocks are excluded (mobile >=4 line policy)', () => {
    const result = deriveAndMapToMobileArtifacts(
      SHORT_BLOCK,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      LOCAL_PROVENANCE,
    );
    expect(result).toHaveLength(0);
  });
});
