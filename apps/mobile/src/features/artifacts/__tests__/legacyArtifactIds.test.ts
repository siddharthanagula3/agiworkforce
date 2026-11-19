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

import { legacyArtifactIdAdoptions } from '@agiworkforce/artifacts';
import type { CloudArtifact } from '@agiworkforce/artifacts';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  deriveAndMapToMobileArtifacts,
  mergeMobileArtifactsForGallery,
  useArtifactStore,
} from '../store';

const THEME = {
  teal: '#000001',
  terraCotta: '#000002',
  agentThinking: '#000003',
  agentActive: '#000004',
};
const OWNER = 'user-1';
const MADE_AT = '2026-11-15T06:55:00.000Z';
const CONVERSATION_ID = '01920000-0000-7000-8000-0000000000c2';
const MESSAGE_ID = '01920000-0000-7000-8000-0000000000d2';
const PAGE = '<!-- @artifact -->\n<!DOCTYPE html><html><body><h1>Tool</h1></body></html>';

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
const PLAIN_MESSAGE = ['Page:', '```html', PAGE, '```'].join('\n');

function derive(markdown: string) {
  return deriveAndMapToMobileArtifacts(markdown, CONVERSATION_ID, MESSAGE_ID, MADE_AT, 'Chat', {
    scope: 'cloud',
    ownerId: OWNER,
  });
}

function cloudRow(id: string, content: string, overrides: Partial<CloudArtifact> = {}) {
  return {
    id,
    type: 'html',
    title: 'Tool',
    content,
    language: 'html',
    version: 1,
    createdAt: MADE_AT,
    updatedAt: MADE_AT,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    ...overrides,
  } as CloudArtifact;
}

function galleryIds(local: ReturnType<typeof derive>, cloud: CloudArtifact[]): string[] {
  return mergeMobileArtifactsForGallery(local, cloud, THEME, OWNER).map((card) => card.id);
}

describe('a synced row under the id an earlier parser gave a block', () => {
  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    activateCloudAccount(OWNER);
    useArtifactStore.getState().clearArtifacts();
  });

  it('shows one card when the new id is held locally with the same content', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    const local = derive(NESTED_WITHOUT_LONGER_FENCE);
    expect(local.map((card) => card.id)).toEqual([adoption!.id]);

    const ids = galleryIds(local, [cloudRow(adoption!.legacyId, local[0]!.content)]);

    expect(ids).toEqual([adoption!.id]);
  });

  it('shows one card when both ids are synced rows with the same content', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    derive(NESTED_WITHOUT_LONGER_FENCE);

    const ids = galleryIds([], [cloudRow(adoption!.id, PAGE), cloudRow(adoption!.legacyId, PAGE)]);

    expect(ids).toEqual([adoption!.id]);
  });

  it('keeps the old-id row when its content is held nowhere else', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    const local = derive(NESTED_WITHOUT_LONGER_FENCE);

    const ids = galleryIds(local, [cloudRow(adoption!.legacyId, `${PAGE}\n<p>Edited</p>`)]);

    expect(ids).toEqual(expect.arrayContaining([adoption!.id, adoption!.legacyId]));
    expect(ids).toHaveLength(2);
  });

  it('keeps the old-id row when the new id has no row and no record', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    derive(NESTED_WITHOUT_LONGER_FENCE);

    expect(galleryIds([], [cloudRow(adoption!.legacyId, PAGE)])).toEqual([adoption!.legacyId]);
  });

  it('keeps a record held locally under the old id', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    const [page] = derive(NESTED_WITHOUT_LONGER_FENCE);
    const oldRecord = { ...page!, id: adoption!.legacyId };

    const ids = galleryIds([page!, oldRecord], [cloudRow(adoption!.legacyId, page!.content)]);

    expect(ids).toEqual(expect.arrayContaining([adoption!.id, adoption!.legacyId]));
  });

  it('keeps the old-id row of another message', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    const local = derive(NESTED_WITHOUT_LONGER_FENCE);
    const otherMessage = cloudRow(adoption!.legacyId, local[0]!.content, {
      messageId: '01920000-0000-7000-8000-0000000000d3',
    });

    expect(galleryIds(local, [otherMessage])).toContain(adoption!.legacyId);
  });

  it('leaves every row alone for a message without nested fences', () => {
    const local = derive(PLAIN_MESSAGE);
    const sibling = cloudRow('01920000-0000-5000-8000-0000000000aa', local[0]!.content);

    const ids = galleryIds(local, [sibling]);

    expect(ids).toEqual(expect.arrayContaining([local[0]!.id, sibling.id]));
    expect(ids).toHaveLength(2);
  });

  it('hides nothing until the message has been read on this phone', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });

    const ids = galleryIds([], [cloudRow(adoption!.id, PAGE), cloudRow(adoption!.legacyId, PAGE)]);

    expect(ids).toHaveLength(2);
  });

  it('forgets what it learned when the account is cleared', () => {
    const [adoption] = legacyArtifactIdAdoptions(NESTED_WITHOUT_LONGER_FENCE, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    derive(NESTED_WITHOUT_LONGER_FENCE);
    useArtifactStore.getState().clearAccountScopedArtifacts();

    const ids = galleryIds([], [cloudRow(adoption!.id, PAGE), cloudRow(adoption!.legacyId, PAGE)]);

    expect(ids).toHaveLength(2);
  });
});
