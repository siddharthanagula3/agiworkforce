var mockMmkv: Map<string, string>;

jest.mock('@/lib/mmkv', () => {
  mockMmkv = new Map<string, string>();
  return {
    storage: {
      getString: (key: string) => mockMmkv.get(key),
      set: (key: string, value: string) => void mockMmkv.set(key, value),
      delete: (key: string) => void mockMmkv.delete(key),
      remove: (key: string) => void mockMmkv.delete(key),
      getAllKeys: () => [...mockMmkv.keys()],
    },
    mmkvStorage: {
      getItem: (key: string) => mockMmkv.get(key) ?? null,
      setItem: (key: string, value: string) => void mockMmkv.set(key, value),
      removeItem: (key: string) => void mockMmkv.delete(key),
    },
    whenMmkvReady: (callback: () => void) => callback(),
    rehydrateWhenMmkvReady: jest.fn(),
  };
});

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

import { artifactKindLabel, computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { liveMessageArtifacts } from '@/stores/chat/derivedMessageArtifact';
import { deriveAndMapToMobileArtifacts, useArtifactStore } from '../store';
import type { MobileArtifact, ScopedMobileArtifact } from '../types';

const CLOUD = { scope: 'cloud', ownerId: 'user-1' } as const;
const CONVERSATION_ID = '01a1df54-1bf2-7000-a6b2-9dbfae1fb3e1';
const QUIZ_MESSAGE_ID = '01a1df54-858f-7000-872e-668a75767dd5';
const CARDS_MESSAGE_ID = '01a1df56-af44-7001-be7c-f17a325dcf22';
const CODE_MESSAGE_ID = '01a1df58-0000-7000-8000-000000000001';
const LOCAL_MESSAGE_ID = 'msg_1763212345678_abc1234';

const timeOf = (uuid: string) =>
  new Date(parseInt(uuid.replace(/-/g, '').slice(0, 12), 16)).toISOString();

const FLASHCARDS_BODY = [
  '~~~flashcards',
  JSON.stringify(
    {
      title: 'Photosynthesis: 3 Key Terms',
      cards: [
        { front: 'What is photosynthesis?', back: 'How plants make food.' },
        { front: 'What is chlorophyll?', back: 'The green pigment.' },
        { front: 'What is oxygen?', back: 'A gas plants release.' },
      ],
    },
    null,
    2,
  ),
  '~~~',
].join('\n');

const QUIZ_BODY = [
  '~~~quiz',
  JSON.stringify(
    {
      title: 'Photosynthesis check',
      questions: [
        {
          type: 'multiple_choice',
          question: 'What supplies the energy?',
          options: ['Sunlight', 'Soil'],
          answer: 0,
        },
      ],
    },
    null,
    2,
  ),
  '~~~',
].join('\n');

const markedDocumentMessage = (body: string) =>
  ['```markdown', '<!-- @artifact -->', body, '```'].join('\n');

function stored(
  overrides: Partial<ScopedMobileArtifact> & Pick<MobileArtifact, 'id' | 'content'>,
): ScopedMobileArtifact {
  return {
    title: 'markdown snippet',
    kind: 'document',
    language: 'markdown',
    ageLabel: 'just now',
    sourceLabel: 'Practise it: Photosynthesis',
    accentColor: '#000001',
    previewLines: overrides.content.split('\n').filter((line) => !line.startsWith('~~~')),
    provenance: CLOUD,
    ...overrides,
  };
}

async function hydrateFromVersion(
  version: number,
  artifacts: MobileArtifact[],
  versionsById: Record<string, MobileArtifact[]> = {},
) {
  mockMmkv.set(
    'artifact-store',
    JSON.stringify({
      state: {
        artifacts,
        versionsById,
        cloudArtifacts: [],
        cloudArtifactsOwnerId: null,
        pendingCloudPushes: {},
      },
      version,
    }),
  );
  await useArtifactStore.persist.rehydrate();
  return useArtifactStore.getState().artifacts;
}

beforeEach(() => {
  mockMmkv.clear();
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
    pendingCloudPushes: {},
  });
});

describe('a Study quiz and flashcards in a stored chat', () => {
  it('give one gallery item each, titled by the set, and no card under the answer', () => {
    for (const [messageId, body, title, preview] of [
      [CARDS_MESSAGE_ID, FLASHCARDS_BODY, 'Photosynthesis: 3 Key Terms', 'Flashcards, 3 cards'],
      [QUIZ_MESSAGE_ID, QUIZ_BODY, 'Photosynthesis check', 'Quiz, 1 question'],
    ] as const) {
      const message = markedDocumentMessage(body);
      const listed = deriveAndMapToMobileArtifacts(
        message,
        CONVERSATION_ID,
        messageId,
        timeOf(messageId),
        'Chat',
        CLOUD,
      );
      expect(listed.map((artifact) => [artifact.title, artifact.previewLines])).toEqual([
        [title, [preview]],
      ]);
      expect(
        liveMessageArtifacts(message, CONVERSATION_ID, messageId, timeOf(messageId), 'cloud'),
      ).toEqual([]);
    }
  });
});

describe('the one-time repair of artifacts saved by earlier builds', () => {
  it('renames a study set saved as a markdown snippet and dates it from its message', async () => {
    const cards = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, CARDS_MESSAGE_ID, 0),
      messageId: CARDS_MESSAGE_ID,
      content: FLASHCARDS_BODY,
    });
    const quiz = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, QUIZ_MESSAGE_ID, 0),
      messageId: QUIZ_MESSAGE_ID,
      content: QUIZ_BODY,
    });

    const artifacts = await hydrateFromVersion(2, [cards, quiz]);

    expect(
      artifacts.map((artifact) => [artifact.title, artifact.previewLines, artifact.createdAt]),
    ).toEqual([
      ['Photosynthesis: 3 Key Terms', ['Flashcards, 3 cards'], timeOf(CARDS_MESSAGE_ID)],
      ['Photosynthesis check', ['Quiz, 1 question'], timeOf(QUIZ_MESSAGE_ID)],
    ]);
    expect(useArtifactStore.getState().versionsById[cards.id]?.[0]?.title).toBe(
      'Photosynthesis: 3 Key Terms',
    );
  });

  it('keeps one item when the same study set was saved twice for one message', async () => {
    const first = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, CARDS_MESSAGE_ID, 0),
      messageId: CARDS_MESSAGE_ID,
      content: FLASHCARDS_BODY,
    });
    const second = { ...first, id: computeDerivedArtifactId('', CARDS_MESSAGE_ID, 0) };

    const artifacts = await hydrateFromVersion(2, [first, second]);

    expect(artifacts.map((artifact) => artifact.id)).toEqual([first.id]);
  });

  it('keeps unedited code the gallery no longer lists and repairs its title, kind and preview', async () => {
    const table = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, CODE_MESSAGE_ID, 0),
      messageId: CODE_MESSAGE_ID,
      title: 'Fruit,Price_USD,Colour',
      kind: 'code',
      language: 'csv',
      content: 'Fruit,Price_USD,Colour\nApple,0.75,Red\nBanana,0.30,Yellow\nPear,0.90,Green',
    });
    const sample = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, CODE_MESSAGE_ID, 1),
      messageId: CODE_MESSAGE_ID,
      title: 'fn1',
      kind: 'code',
      language: 'typescript',
      content: '// fn1\nfunction fn1() {}\n// fn2\nfunction fn2() {}',
    });
    const component = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, CODE_MESSAGE_ID, 2),
      messageId: CODE_MESSAGE_ID,
      title: 'Tiny Counter',
      kind: 'document',
      language: 'jsx',
      content: '// @artifact\n// @title: Tiny Counter\nfunction App() {\n  return null;\n}',
    });

    const artifacts = await hydrateFromVersion(2, [table, sample, component]);

    expect(
      artifacts.map((artifact) => [artifact.title, artifact.kind, artifact.previewLines]),
    ).toEqual([
      [
        'Spreadsheet',
        'code',
        ['Fruit,Price_USD,Colour', 'Apple,0.75,Red', 'Banana,0.30,Yellow', 'Pear,0.90,Green'],
      ],
      ['fn1', 'code', ['// fn1', 'function fn1() {}', '// fn2', 'function fn2() {}']],
      ['Tiny Counter', 'code', ['function App() {', '  return null;', '}']],
    ]);
    expect(artifacts.map((artifact) => artifact.createdAt)).toEqual([
      timeOf(CODE_MESSAGE_ID),
      timeOf(CODE_MESSAGE_ID),
      timeOf(CODE_MESSAGE_ID),
    ]);
  });

  it('keeps edited artifacts, saved documents and pictures, and only dates them', async () => {
    const edited = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, CODE_MESSAGE_ID, 3),
      messageId: CODE_MESSAGE_ID,
      title: 'My table',
      kind: 'code',
      language: 'csv',
      content: 'a,b\n1,2',
      editedAt: '2026-11-15T13:30:00.000Z',
    });
    const savedAnswer = stored({
      id: '01a1df60-0000-7000-8000-000000000009',
      messageId: LOCAL_MESSAGE_ID,
      title: 'Notes',
      content: 'Plain notes',
      provenance: { scope: 'local' },
    });
    const picture = stored({
      id: `generated-image-${CODE_MESSAGE_ID}`,
      title: 'Generated image',
      kind: 'image',
      language: 'PNG',
      content: '/api/files/abc',
      previewLines: ['A kite'],
    });

    const artifacts = await hydrateFromVersion(2, [edited, savedAnswer, picture]);

    expect(
      artifacts.map((artifact) => [artifact.title, artifact.createdAt, artifact.previewLines]),
    ).toEqual([
      ['My table', timeOf(CODE_MESSAGE_ID), ['a,b', '1,2']],
      ['Notes', new Date(1763212345678).toISOString(), ['Plain notes']],
      ['Generated image', timeOf(CODE_MESSAGE_ID), ['A kite']],
    ]);
  });

  it.each([2, 3])(
    'names an edited email draft saved as Code by its kind, from store version %i',
    async (version) => {
      const email = stored({
        id: computeDerivedArtifactId(CONVERSATION_ID, CODE_MESSAGE_ID, 4),
        messageId: CODE_MESSAGE_ID,
        title: artifactKindLabel('code'),
        kind: 'code',
        language: 'email',
        content: 'To: sam@example.com\nSubject: Review\n\nHi Sam,\nThe review is on Friday.',
        editedAt: '2026-11-15T13:30:00.000Z',
      });
      const first = { ...email, content: 'To: sam@example.com\nSubject: Review\n\nHi Sam' };

      const artifacts = await hydrateFromVersion(version, [email], { [email.id]: [first, email] });

      expect(artifacts.map((artifact) => artifact.title)).toEqual([artifactKindLabel('email')]);
    },
  );

  it('does not run again once the store is current', async () => {
    const snippet = stored({
      id: computeDerivedArtifactId(CONVERSATION_ID, CARDS_MESSAGE_ID, 0),
      messageId: CARDS_MESSAGE_ID,
      content: FLASHCARDS_BODY,
    });

    const artifacts = await hydrateFromVersion(4, [snippet]);

    expect(artifacts.map((artifact) => artifact.title)).toEqual(['markdown snippet']);
  });
});

describe('an artifact saved before its time was recorded', () => {
  it('takes the time of its message when the chat is read again', () => {
    const [derived] = deriveAndMapToMobileArtifacts(
      markedDocumentMessage(FLASHCARDS_BODY),
      CONVERSATION_ID,
      CARDS_MESSAGE_ID,
      timeOf(CARDS_MESSAGE_ID),
      'Chat',
      CLOUD,
    );
    const { createdAt: _unknown, ...undated } = derived!;
    useArtifactStore.getState().addArtifacts([{ ...undated, ageLabel: 'just now' }]);

    useArtifactStore.getState().addArtifacts([derived!]);

    expect(useArtifactStore.getState().artifacts[0]?.createdAt).toBe(timeOf(CARDS_MESSAGE_ID));
  });
});

describe('gallery previews', () => {
  it('leave out the title line the title is read from', () => {
    const [component] = deriveAndMapToMobileArtifacts(
      '```jsx\n// @artifact\n// @title: React Counter\nfunction App() {\n  return null;\n}\n```',
      CONVERSATION_ID,
      CODE_MESSAGE_ID,
      timeOf(CODE_MESSAGE_ID),
      'Chat',
      CLOUD,
    );
    expect(component?.title).toBe('React Counter');
    expect(component?.previewLines).toEqual(['function App() {', '  return null;', '}']);
  });
});
