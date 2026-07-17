/**
 * Verifies that @agiworkforce/artifacts derivation runs in the RN/Jest
 * environment (uuid v5 bundles without react-native-get-random-values) and
 * that mobile's delegation to deriveArtifacts produces the correct output.
 *
 * This test also exercises the mapping layer introduced in
 * src/features/artifacts/store.ts Step 1a of the shared-packages consolidation.
 */
import { deriveArtifacts, computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { deriveAndMapToMobileArtifacts } from '@/src/features/artifacts/store';

const PYTHON_BLOCK = ['```python', 'import os', 'print(os.getcwd())', 'x = 1', 'y = 2', '```'].join(
  '\n',
);

const SHORT_BLOCK = ['```bash', 'ls -la', '```'].join('\n');

const MARKDOWN_TWO_BLOCKS = [PYTHON_BLOCK, 'Some prose.', PYTHON_BLOCK].join('\n\n');

const THEME = {
  teal: '#21808d',
  terraCotta: '#da7756',
  agentThinking: '#a855f7',
  agentActive: '#3b82f6',
};

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
    // uuid v5 format
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

describe('deriveAndMapToMobileArtifacts — delegation + mapping', () => {
  it('produces MobileArtifacts with deterministic ids from deriveArtifacts', () => {
    const result = deriveAndMapToMobileArtifacts(
      PYTHON_BLOCK,
      'conv-42',
      'msg-99',
      '2026-06-21T00:00:00.000Z',
      'Test conversation',
      THEME,
    );

    expect(result).toHaveLength(1);
    const ma = result[0]!;

    // id must be the shared deterministic id (NOT a legacy `${messageId}_code_0` string)
    expect(ma.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // must equal what computeDerivedArtifactId gives directly
    expect(ma.id).toBe(computeDerivedArtifactId('conv-42', 'msg-99', 0));

    expect(ma.kind).toBe('code');
    expect(ma.content).toBeTruthy();
    expect(ma.sourceLabel).toBe('Test conversation');
    // ageLabel is derived from the fixed createdAt — just verify it's a non-empty string
    expect(typeof ma.ageLabel).toBe('string');
    expect(ma.ageLabel.length).toBeGreaterThan(0);
  });

  it('ids are stable across two calls with the same context', () => {
    const a = deriveAndMapToMobileArtifacts(
      PYTHON_BLOCK,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      THEME,
    );
    const b = deriveAndMapToMobileArtifacts(
      PYTHON_BLOCK,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      THEME,
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
      THEME,
    );
    // language should be undefined (gallery falls back to kind label), not 'text'
    if (result.length > 0) {
      expect(result[0]!.language).toBeUndefined();
    }
  });

  it('two blocks get distinct deterministic ids', () => {
    const result = deriveAndMapToMobileArtifacts(
      MARKDOWN_TWO_BLOCKS,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      THEME,
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.id).not.toBe(result[1]!.id);
  });

  it('short blocks are excluded (mobile >=4 line policy)', () => {
    const result = deriveAndMapToMobileArtifacts(
      SHORT_BLOCK,
      'conv-1',
      'msg-1',
      '2026-06-21T00:00:00.000Z',
      'Chat',
      THEME,
    );
    expect(result).toHaveLength(0);
  });
});
