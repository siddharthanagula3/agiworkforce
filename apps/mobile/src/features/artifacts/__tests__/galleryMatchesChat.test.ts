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

import { deriveArtifacts } from '@agiworkforce/artifacts';
import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import { artifactExportOptions } from '@/src/features/chat/utils/artifactExport';
import {
  messageArtifactFromShared,
  offersMessageArtifact,
} from '@/stores/chat/derivedMessageArtifact';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  canonicalToMobileArtifact,
  deriveAndMapToMobileArtifacts,
  mergeMobileArtifactsForGallery,
  useArtifactStore,
  viewerArtifactFor,
} from '../store';
import type { MobileArtifactProvenance } from '../types';

const THEME = {
  teal: '#000001',
  terraCotta: '#000002',
  agentThinking: '#000003',
  agentActive: '#000004',
};
const MADE_AT = '2026-11-15T06:55:00.000Z';
const CONVERSATION_ID = '01920000-0000-7000-8000-0000000000c1';
const MESSAGE_ID = '01920000-0000-7000-8000-0000000000d1';
const LOCAL: MobileArtifactProvenance = { scope: 'local' };
const CLOUD: MobileArtifactProvenance = { scope: 'cloud', ownerId: 'user-1' };

const fence = (language: string, ...lines: string[]) =>
  ['```' + language, ...lines, '```'].join('\n');

const HTML_PAGE = fence(
  'html',
  '<!-- @artifact -->',
  '<!DOCTYPE html>',
  '<html><head><title>Tiny Counter</title></head>',
  '<body><button id="add">Add one</button></body>',
  '</html>',
);
const UNTITLED_HTML = fence(
  'html',
  '<!-- @artifact -->',
  '<!DOCTYPE html>',
  '<style>',
  'body { margin: 0 }',
  '</style>',
  '<div>Count: 0</div>',
);
const REACT_COMPONENT = fence(
  'jsx',
  '// @artifact',
  '// @title: Tiny Counter',
  'export default function Counter() {',
  '  return <button>Add one</button>;',
  '}',
);
const SVG_PICTURE = fence(
  'svg',
  '<!-- @artifact -->',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
  '  <circle cx="5" cy="5" r="4" />',
  '</svg>',
);
const QUIZ = fence(
  'markdown',
  '<!-- @artifact -->',
  '~~~quiz',
  '{"title":"Photosynthesis check","questions":[{"type":"multiple_choice","question":"Where does it happen?","options":["Leaf","Root"],"answer":0}]}',
  '~~~',
);
const FLASHCARDS = fence(
  'markdown',
  '<!-- @artifact -->',
  '~~~flashcards',
  '{"title":"Photosynthesis: 3 Key Terms","cards":[{"front":"Chlorophyll","back":"Green pigment"}]}',
  '~~~',
);
const EMAIL_DOCUMENT = fence(
  'markdown',
  '<!-- @artifact -->',
  'To: landlord@example.com',
  'Subject: Boiler repair',
  '',
  'Hello, the boiler has stopped working.',
);
const HEADED_DOCUMENT = fence(
  'markdown',
  '<!-- @artifact -->',
  'Use this to plan the week.',
  '',
  '# Weekly plan',
  '',
  'Ship on Friday.',
);
const PYTHON_SAMPLE = fence(
  'python',
  'def reverse_string(text):',
  '    letters = list(text)',
  '    letters.reverse()',
  '    return "".join(letters)',
  'print(reverse_string("abc"))',
);
const DIAGRAM = fence('mermaid', 'flowchart TD', '  A --> B', '  B --> C', '  C --> D');
const XY_CHART = fence(
  'mermaid',
  'xychart-beta',
  '  title "Sales"',
  '  x-axis [jan, feb]',
  '  bar [1, 2]',
);
const CSV_TABLE = fence(
  'csv',
  'Fruit,Price_USD,Colour',
  'Apple,1.2,Red',
  'Banana,0.5,Yellow',
  'Kiwi,0.8,Green',
);
const EMAIL_FENCE = fence(
  'email',
  'To: landlord@example.com',
  'Subject: Boiler repair',
  '',
  'Hello, the boiler has stopped working.',
);

function gallery(markdown: string, provenance: MobileArtifactProvenance = LOCAL) {
  return deriveAndMapToMobileArtifacts(
    markdown,
    CONVERSATION_ID,
    MESSAGE_ID,
    MADE_AT,
    'Chat',
    provenance,
  );
}

function chatCards(markdown: string, scope: 'local' | 'cloud') {
  return deriveArtifacts(markdown, {
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    include: (block) => offersMessageArtifact(block, scope),
    now: MADE_AT,
  }).map(messageArtifactFromShared);
}

describe('the Artifacts gallery lists what the chat offers as artifact cards', () => {
  const everything = [
    HTML_PAGE,
    REACT_COMPONENT,
    SVG_PICTURE,
    QUIZ,
    FLASHCARDS,
    EMAIL_DOCUMENT,
    PYTHON_SAMPLE,
    DIAGRAM,
    XY_CHART,
    CSV_TABLE,
    EMAIL_FENCE,
  ].join('\n\nSome prose.\n\n');

  it.each([
    ['local', LOCAL],
    ['cloud', CLOUD],
  ] as const)('in a %s chat', (scope, provenance) => {
    const listed = gallery(everything, provenance).map((artifact) => artifact.id);
    const offered = chatCards(everything, scope).map((artifact) => artifact.id);

    expect(listed).toEqual(offered);
    expect(listed.length).toBeGreaterThan(0);
  });

  it('leaves out a code sample, a diagram source, a chart, a table and an email drawn inline', () => {
    for (const drawnInline of [PYTHON_SAMPLE, DIAGRAM, XY_CHART, CSV_TABLE, EMAIL_FENCE]) {
      expect(gallery(drawnInline, LOCAL)).toEqual([]);
      expect(gallery(drawnInline, CLOUD)).toEqual([]);
    }
  });

  it('lists a Cloud page only when the answer marks it as an artifact, as the chat does', () => {
    const unmarked = fence('html', '<!DOCTYPE html>', '<title>Draft</title>', '<p>Hi</p>');
    expect(gallery(unmarked, CLOUD)).toEqual([]);
    expect(gallery(HTML_PAGE, CLOUD)).toHaveLength(1);
  });
});

describe('the title an artifact is listed under', () => {
  const titleOf = (markdown: string) => gallery(markdown, CLOUD)[0]?.title;

  it('takes a study set title, never its fence line', () => {
    expect(titleOf(QUIZ)).toBe('Photosynthesis check');
    expect(titleOf(FLASHCARDS)).toBe('Photosynthesis: 3 Key Terms');
  });

  it('takes the page title, the title comment or the first heading', () => {
    expect(titleOf(HTML_PAGE)).toBe('Tiny Counter');
    expect(titleOf(REACT_COMPONENT)).toBe('Tiny Counter');
    expect(titleOf(HEADED_DOCUMENT)).toBe('Weekly plan');
  });

  it('falls back to what kind of thing it is, never a line of the content', () => {
    expect(titleOf(UNTITLED_HTML)).toBe('Web page');
    expect(titleOf(EMAIL_DOCUMENT)).toBe('Document');
    expect(titleOf(SVG_PICTURE)).toBe('SVG image');
  });

  it('does not take a line of code when the title tag or heading is empty or filled by code', () => {
    const emptyTitle = fence(
      'html',
      '<!-- @artifact -->',
      '<!DOCTYPE html>',
      '<html><head><title></title>',
      '<style>',
      'body { margin: 0 }',
      '</style>',
      '</head><body><h1 id="clock"></h1></body></html>',
    );
    const scriptedHeading = fence(
      'jsx',
      '// @artifact',
      'export default function Card({ title }) {',
      '  return <h1>{title}</h1>;',
      '}',
    );
    const wrappedHeading = fence(
      'jsx',
      '// @artifact',
      'export default function Timer() {',
      '  return (',
      '    <h1>',
      '      Pomodoro Timer',
      '    </h1>',
      '  );',
      '}',
    );
    expect(titleOf(emptyTitle)).toBe('Web page');
    expect(titleOf(scriptedHeading)).toBe('Component');
    expect(titleOf(wrappedHeading)).toBe('Pomodoro Timer');
  });

  it('names a Cloud row with no title by its kind', () => {
    const row = canonicalToMobileArtifact(
      { id: 'row-1', type: 'csv', title: '', content: 'a,b\n1,2', language: 'csv' },
      MADE_AT,
      'Chat',
      THEME,
      LOCAL,
    );
    expect(row.title).toBe('Spreadsheet');
  });

  it('previews a study set by what it holds and a page without its marker', () => {
    const [quiz] = gallery(QUIZ, CLOUD);
    expect(quiz?.previewLines).toEqual(['Quiz, 1 question']);
    expect(quiz?.previewLines.join('\n')).not.toContain('answer');
    const [page] = gallery(HTML_PAGE, CLOUD);
    expect(page?.previewLines.join('\n')).not.toContain('@artifact');
  });

  it('renames an unedited artifact saved under its first line when the chat is read again', () => {
    useArtifactStore.setState({ artifacts: [], versionsById: {}, pendingCloudPushes: {} });
    const [fresh] = gallery(QUIZ, LOCAL);
    useArtifactStore
      .getState()
      .addArtifacts([{ ...fresh!, title: '~~~quiz', previewLines: ['~~~quiz'] }]);

    useArtifactStore.getState().addArtifacts(gallery(QUIZ, LOCAL));

    const [stored] = useArtifactStore.getState().artifacts;
    expect(stored?.title).toBe('Photosynthesis check');
    expect(stored?.createdAt).toBe(MADE_AT);
  });
});

describe('gallery export formats match the chat card', () => {
  const cases: [string, string, string][] = [
    ['an HTML page', HTML_PAGE, 'html'],
    ['an SVG picture', SVG_PICTURE, 'svg'],
    ['a React component', REACT_COMPONENT, 'jsx'],
    ['a document', HEADED_DOCUMENT, 'md'],
  ];

  it.each(cases)('offers the same files for %s', (_label, markdown, firstExtension) => {
    const [listed] = gallery(markdown, CLOUD);
    const [card] = chatCards(markdown, 'cloud');
    const viewed = viewerArtifactFor(listed!);

    const fromGallery = artifactExportOptions(viewed, viewed.content);
    const fromCard = artifactExportOptions(card!, card!.content);
    expect(fromGallery).toEqual(fromCard);
    expect(fromGallery[0]?.extension).toBe(firstExtension);
  });

  it.each([
    ['csv', 'Fruit,Price_USD,Colour\nApple,1.2,Red', 'csv'],
    ['html', '<!DOCTYPE html><title>Tiny Counter</title>', 'html'],
    ['code', 'print(1)', 'py'],
  ])('offers the %s file for a synced Cloud row', (type, content, extension) => {
    const row = canonicalToMobileArtifact(
      {
        id: `row-${type}`,
        type,
        title: 'Sheet',
        content,
        language: type === 'code' ? 'python' : type,
      },
      MADE_AT,
      'Chat',
      THEME,
      LOCAL,
    );
    const options = artifactExportOptions(viewerArtifactFor(row), row.content);
    expect(options.map((option) => option.extension)).toEqual([extension]);
  });
});

describe('gallery ages', () => {
  const OWNER = 'user-1';
  const EARLIER = '2026-11-15T07:05:00.000Z';
  const LATER = '2026-11-15T07:08:00.000Z';

  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    activateCloudAccount(OWNER);
    useArtifactStore.setState({
      artifacts: [],
      versionsById: {},
      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,
      pendingCloudPushes: {},
    });
  });

  function delta(id: string, content: string, createdAt: string, updatedAt: string) {
    return {
      id,
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
      title: 'Tiny Counter',
      artifact_type: 'html',
      language: 'html',
      content,
      current_version: 1,
      pinned: false,
      tags: [],
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: null,
      server_version: '7',
    } as unknown as ArtifactWireDelta;
  }

  it('keeps the time the artifact was made when the same content comes back from sync', () => {
    const [local] = gallery(HTML_PAGE, { scope: 'cloud', ownerId: OWNER });
    const merged = mergeMobileArtifactsForGallery(
      [local!],
      [
        {
          id: local!.id,
          type: 'html',
          title: local!.title,
          content: local!.content,
          language: 'html',
          version: 1,
          createdAt: LATER,
          updatedAt: LATER,
        },
      ],
      THEME,
      OWNER,
    );
    expect(merged[0]?.createdAt).toBe(MADE_AT);
    expect(merged[0]?.editedAt).toBeUndefined();
  });

  it('dates an edit made on another device from when the server took it', () => {
    const [local] = gallery(HTML_PAGE, { scope: 'cloud', ownerId: OWNER });
    const merged = mergeMobileArtifactsForGallery(
      [local!],
      [
        {
          id: local!.id,
          type: 'html',
          title: local!.title,
          content: `${local!.content}\n<p>Edited</p>`,
          language: 'html',
          version: 2,
          createdAt: EARLIER,
          updatedAt: LATER,
        },
      ],
      THEME,
      OWNER,
    );
    expect(merged[0]?.editedAt).toBe(LATER);
  });

  it('records when the person edits it, and keeps that through the push', () => {
    const [local] = gallery(HTML_PAGE, { scope: 'cloud', ownerId: OWNER });
    useArtifactStore.getState().addArtifacts([local!]);
    useArtifactStore
      .getState()
      .applyCloudArtifactDeltas([delta(local!.id, local!.content, LATER, LATER)], OWNER);

    useArtifactStore
      .getState()
      .saveArtifactEdit({ ...local!, content: `${local!.content}\n<p>Mine</p>` });
    const edited = useArtifactStore.getState().artifacts[0]!;
    expect(edited.createdAt).toBe(MADE_AT);
    expect(edited.editedAt).toEqual(expect.any(String));

    useArtifactStore.getState().markArtifactPushed(local!.id, '8');
    const row = useArtifactStore.getState().cloudArtifacts.find((r) => r.id === local!.id);
    expect(row?.updatedAt).toBe(edited.editedAt);
  });

  it('keeps the made time when the same message is derived again with new content', () => {
    const [first] = gallery(HTML_PAGE, LOCAL);
    useArtifactStore.getState().addArtifacts([first!]);
    const revised = deriveAndMapToMobileArtifacts(
      HTML_PAGE.replace('Add one', 'Add two'),
      CONVERSATION_ID,
      MESSAGE_ID,
      LATER,
      'Chat',
      LOCAL,
    );
    useArtifactStore.getState().addArtifacts(revised);
    expect(useArtifactStore.getState().artifacts[0]?.createdAt).toBe(MADE_AT);
  });
});

describe('reopening a chat after many edits', () => {
  beforeEach(() => {
    useArtifactStore.setState({
      artifacts: [],
      versionsById: {},
      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,
      pendingCloudPushes: {},
    });
  });

  it('keeps the latest edit when the original answer is derived again', () => {
    const [original] = gallery(HTML_PAGE, LOCAL);
    useArtifactStore.getState().addArtifacts([original!]);
    let latest = original!.content;
    for (let edit = 1; edit <= 21; edit += 1) {
      latest = `${original!.content}\n<p>Edit ${edit}</p>`;
      useArtifactStore.getState().saveArtifactEdit({ ...original!, content: latest });
    }

    useArtifactStore.getState().addArtifacts(gallery(HTML_PAGE, LOCAL));

    const stored = useArtifactStore.getState().artifacts.find((a) => a.id === original!.id);
    expect(stored?.content).toBe(latest);
    const versions = useArtifactStore.getState().getArtifactVersions(original!.id);
    expect(versions[versions.length - 1]?.content).toBe(latest);
  });

  it('still takes a new derived revision of an artifact nobody edited', () => {
    const [original] = gallery(HTML_PAGE, LOCAL);
    useArtifactStore.getState().addArtifacts([original!]);
    const revised = deriveAndMapToMobileArtifacts(
      HTML_PAGE.replace('Add one', 'Add two'),
      CONVERSATION_ID,
      MESSAGE_ID,
      MADE_AT,
      'Chat',
      LOCAL,
    );
    useArtifactStore.getState().addArtifacts(revised);
    expect(useArtifactStore.getState().artifacts[0]?.content).toContain('Add two');
  });
});
