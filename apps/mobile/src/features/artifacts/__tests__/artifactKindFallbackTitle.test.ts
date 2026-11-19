jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getAllKeys: () => [],
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
  },
}));

import { artifactKindLabel } from '@agiworkforce/artifacts';
import { artifactDisplayTitle, artifactKindTitle } from '../artifactTitle';
import { canonicalToMobileArtifact } from '../store';

const THEME = {
  teal: '#000001',
  terraCotta: '#000002',
  agentThinking: '#000003',
  agentActive: '#000004',
};
const EMAIL = 'To: sam@example.com\nSubject: Quarterly review\n\nHi Sam,\nThe review is on Friday.';
const CHART = '{"type":"bar","title":"Sales","data":[{"label":"Q1","value":3}]}';

function cloudRow(title: string, language: string, content: string) {
  return canonicalToMobileArtifact(
    { id: 'a-1', type: 'code', title, content, language },
    '2026-11-01T00:00:00.000Z',
    'Chat',
    THEME,
    { scope: 'cloud', ownerId: 'owner-1' },
  );
}

describe('artifact kind fallback titles', () => {
  it.each([
    ['chart', artifactKindTitle('chart')],
    ['email', artifactKindLabel('email')],
    ['mermaid', artifactKindTitle('mermaid')],
    ['Email', artifactKindLabel('email')],
  ])('names a code fence in %s by its kind', (language, title) => {
    expect(artifactKindTitle('code', language)).toBe(title);
    expect(artifactKindTitle('code', language)).not.toBe(artifactKindLabel('code'));
  });

  it('keeps the generic name for a fence in a programming language', () => {
    expect(artifactKindTitle('code', 'python')).toBe(artifactKindLabel('code'));
    expect(artifactKindTitle('code')).toBe(artifactKindLabel('code'));
  });

  it('titles an untitled email draft and chart by their kind in the gallery', () => {
    expect(artifactDisplayTitle({ type: 'code', language: 'email', content: EMAIL })).toBe(
      artifactKindLabel('email'),
    );
    expect(artifactDisplayTitle({ type: 'code', language: 'chart', content: CHART })).toBe(
      artifactKindTitle('chart'),
    );
  });

  it('replaces a synced generic title with the kind name and keeps a real title', () => {
    expect(cloudRow('', 'email', EMAIL).title).toBe(artifactKindLabel('email'));
    expect(cloudRow(artifactKindLabel('code'), 'chart', CHART).title).toBe(
      artifactKindTitle('chart'),
    );
    expect(cloudRow('Review invite', 'email', EMAIL).title).toBe('Review invite');
    expect(cloudRow(artifactKindLabel('code'), 'python', 'print(1)').title).toBe(
      artifactKindLabel('code'),
    );
  });
});
