import { fireEvent, render, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

const mockStore = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: {
    getItem: (key: string) => mockStore.get(key) ?? null,
    setItem: (key: string, value: string) => void mockStore.set(key, value),
    removeItem: (key: string) => void mockStore.delete(key),
  },
  storage: { getAllKeys: () => [...mockStore.keys()] },
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockLocalChats: {
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
} = { conversations: [], messages: {} };

jest.mock('@/stores/chat/chatMessageStore', () => ({
  useChatMessageStore: { getState: () => mockLocalChats, setState: jest.fn() },
}));

const mockCloudChats: {
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
} = { conversations: [], messages: {} };

jest.mock('@/stores/chat/chatCloudMessageStore', () => ({
  useChatCloudMessageStore: { getState: () => mockCloudChats, setState: jest.fn() },
}));

const mockCloudEpoch = jest.fn((): { ownerId: string; epoch: number } | null => null);
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('@/src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => mockCloudEpoch(),
}));

const mockOpenedEditor = jest.fn();
jest.mock('../ArtifactFullScreen', () => ({
  ArtifactFullScreen: (props: Record<string, unknown>) => {
    mockOpenedEditor(props);
    return null;
  },
}));

import { renderMarkdownContent } from '../MessageContentRenderer';
import { AssistantDraftScope } from '../AssistantDraftScope';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/ui/theme/tokens';

const CONVERSATION_ID = 'conversation-code';
const MESSAGE_ID = 'message-code';
const PAGE = '<!doctype html>\n<html><body><h1>Hello</h1></body></html>';
const PYTHON = 'def add(a, b):\n    return a + b';
const ANSWER = `Here is a page.\n\n\`\`\`html\n${PAGE}\n\`\`\`\n\nAnd a helper.\n\n\`\`\`python\n${PYTHON}\n\`\`\``;

function finished(markdown: string) {
  return renderMarkdownContent(markdown, undefined, { highlightCode: true, capCodeBlocks: true });
}

function streaming(markdown: string) {
  return renderMarkdownContent(markdown, undefined, {
    highlightCode: false,
    streaming: true,
    capCodeBlocks: true,
  });
}

function inAnswer(nodes: React.ReactNode) {
  return render(<AssistantDraftScope messageId={MESSAGE_ID}>{nodes}</AssistantDraftScope>);
}

function seedAnswer(
  content: string,
  overrides: Partial<ChatMessage> = {},
  chats: typeof mockLocalChats = mockLocalChats,
  executionMode: 'local' | 'cloud' = chats === mockCloudChats ? 'cloud' : 'local',
) {
  chats.conversations = [
    {
      id: CONVERSATION_ID,
      title: 'Helpers',
      updatedAt: '2026-11-16T10:00:00.000Z',
      createdAt: '2026-11-16T10:00:00.000Z',
      messageCount: 2,
      pinned: false,
      executionMode,
    },
  ];
  chats.messages = {
    [CONVERSATION_ID]: [
      {
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        role: 'assistant',
        content,
        createdAt: '2026-11-16T10:00:01.000Z',
        ...overrides,
      } as ChatMessage,
    ],
  };
}

let alert: jest.SpyInstance;

beforeEach(() => {
  mockStore.clear();
  mockOpenedEditor.mockClear();
  mockLocalChats.conversations = [];
  mockLocalChats.messages = {};
  mockCloudChats.conversations = [];
  mockCloudChats.messages = {};
  mockCloudEpoch.mockReset();
  mockCloudEpoch.mockReturnValue(null);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
    pendingCloudPushes: {},
  });
});

afterEach(() => alert.mockRestore());

describe('HTML preview on a code card', () => {
  it('offers Preview on a finished html fence and opens the sandboxed preview sheet', () => {
    const screen = render(<>{finished(`\`\`\`html\n${PAGE}\n\`\`\``)}</>);

    fireEvent.press(screen.getByLabelText('Preview HTML'));

    expect(screen.getByTestId('html-preview-sheet')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'HTML preview' })).toBeTruthy();
    expect(screen.getByLabelText('HTML artifact preview')).toBeTruthy();
    expect(screen.getByLabelText('Loading preview')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Preview' }).props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('caps the Preview label at the header text scale so the row keeps Expand on screen', () => {
    const screen = render(<>{finished(`\`\`\`html\n${PAGE}\n\`\`\``)}</>);

    expect(screen.getByText('Preview').props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
  });

  it('hides the spinner once the page has loaded', () => {
    const screen = render(<>{finished(`\`\`\`html\n${PAGE}\n\`\`\``)}</>);
    fireEvent.press(screen.getByLabelText('Preview HTML'));

    fireEvent(screen.getByLabelText('HTML artifact preview'), 'loadEnd');

    expect(screen.queryByLabelText('Loading preview')).toBeNull();
  });

  it('switches the sheet to the source and back', () => {
    const screen = render(<>{finished(`\`\`\`html\n${PAGE}\n\`\`\``)}</>);
    fireEvent.press(screen.getByLabelText('Preview HTML'));

    fireEvent.press(screen.getByRole('tab', { name: 'Source' }));

    expect(screen.getByTestId('html-preview-source')).toBeTruthy();
    expect(screen.queryByLabelText('HTML artifact preview')).toBeNull();

    fireEvent.press(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByLabelText('HTML artifact preview')).toBeTruthy();
  });

  it('closes the sheet', () => {
    const screen = render(<>{finished(`\`\`\`html\n${PAGE}\n\`\`\``)}</>);
    fireEvent.press(screen.getByLabelText('Preview HTML'));

    fireEvent.press(screen.getByLabelText('Close HTML preview'));

    expect(screen.queryByTestId('html-preview-sheet')).toBeNull();
  });

  it('hides Preview while the fence streams and says when it will appear', () => {
    const screen = render(<>{streaming(`\`\`\`html\n${PAGE}\n\`\`\``)}</>);

    expect(screen.queryByLabelText('Preview HTML')).toBeNull();
    expect(
      screen.getByText('The HTML preview will appear when this block is complete.'),
    ).toBeTruthy();
  });

  it('offers no Preview for an empty html fence or for other languages', () => {
    expect(render(<>{finished('```html\n\n```')}</>).queryByLabelText('Preview HTML')).toBeNull();
    const python = render(<>{finished(`\`\`\`python\n${PYTHON}\n\`\`\``)}</>);
    expect(python.queryByLabelText('Preview HTML')).toBeNull();
    expect(python.queryByTestId('html-preview-pending')).toBeNull();
  });

  it('offers no Preview for an html fence that never closed', () => {
    const screen = render(<>{finished(`\`\`\`html\n${PAGE}`)}</>);
    expect(screen.queryByLabelText('Preview HTML')).toBeNull();
  });
});

describe('Edit on a code card', () => {
  it('stores the fence under the id the web uses and opens the editor', () => {
    seedAnswer(ANSWER);
    const screen = inAnswer(finished(ANSWER));

    const editButtons = screen.getAllByLabelText('Edit code');
    expect(editButtons).toHaveLength(2);
    fireEvent.press(editButtons[1]!);

    const expectedId = computeDerivedArtifactId(CONVERSATION_ID, `${MESSAGE_ID}:editor`, 1);
    const stored = useArtifactStore.getState().artifacts.find((row) => row.id === expectedId);
    expect(stored).toMatchObject({
      messageId: MESSAGE_ID,
      kind: 'code',
      language: 'python',
      content: PYTHON,
      provenance: { scope: 'local' },
    });
    expect(mockOpenedEditor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        initialMode: 'edit',
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        artifact: expect.objectContaining({ id: expectedId, content: PYTHON }),
      }),
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('keeps an earlier saved edit when the same block is opened again', () => {
    seedAnswer(ANSWER);
    const screen = inAnswer(finished(ANSWER));
    fireEvent.press(screen.getAllByLabelText('Edit code')[1]!);
    const expectedId = computeDerivedArtifactId(CONVERSATION_ID, `${MESSAGE_ID}:editor`, 1);
    const stored = useArtifactStore.getState().artifacts.find((row) => row.id === expectedId)!;
    useArtifactStore.getState().saveArtifactEdit({ ...stored, content: 'def add(a, b): ...' });

    fireEvent.press(screen.getAllByLabelText('Edit code')[1]!);

    expect(mockOpenedEditor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        artifact: expect.objectContaining({ id: expectedId, content: 'def add(a, b): ...' }),
      }),
    );
  });

  it('previews the saved edit of an html block without storing another card', () => {
    const edited = '<!doctype html>\n<html><body><h1>Edited</h1></body></html>';
    seedAnswer(ANSWER);
    const screen = inAnswer(finished(ANSWER));
    fireEvent.press(screen.getAllByLabelText('Edit code')[0]!);
    const expectedId = computeDerivedArtifactId(CONVERSATION_ID, `${MESSAGE_ID}:editor`, 0);
    const stored = useArtifactStore.getState().artifacts.find((row) => row.id === expectedId)!;
    useArtifactStore.getState().saveArtifactEdit({ ...stored, content: edited });
    const cardsBefore = useArtifactStore.getState().artifacts.length;

    fireEvent.press(screen.getByLabelText('Preview HTML'));

    expect(screen.getByLabelText('HTML artifact preview').props.source.html).toContain(
      '<h1>Edited</h1>',
    );
    fireEvent.press(screen.getByRole('tab', { name: 'Source' }));
    const source = within(screen.getByTestId('html-preview-source'));
    expect(source.getByLabelText('html code block').props.accessibilityValue).toEqual({
      text: edited,
    });
    expect(useArtifactStore.getState().artifacts).toHaveLength(cardsBefore);
  });

  it('previews the answer text when the block has no saved edit, storing nothing', () => {
    seedAnswer(ANSWER);
    const screen = inAnswer(finished(ANSWER));

    fireEvent.press(screen.getByLabelText('Preview HTML'));

    expect(screen.getByLabelText('HTML artifact preview').props.source.html).toContain(
      '<h1>Hello</h1>',
    );
    expect(useArtifactStore.getState().artifacts).toHaveLength(0);
  });

  it('previews the answer text, not a saved edit made under another Cloud account', () => {
    mockCloudEpoch.mockReturnValue({ ownerId: 'owner-cloud', epoch: 1 });
    seedAnswer(ANSWER, {}, mockCloudChats);
    const screen = inAnswer(finished(ANSWER));
    fireEvent.press(screen.getAllByLabelText('Edit code')[0]!);
    const expectedId = computeDerivedArtifactId(CONVERSATION_ID, `${MESSAGE_ID}:editor`, 0);
    const stored = useArtifactStore.getState().artifacts.find((row) => row.id === expectedId)!;
    useArtifactStore.getState().saveArtifactEdit({ ...stored, content: '<h1>Edited</h1>' });
    mockCloudEpoch.mockReturnValue({ ownerId: 'owner-other', epoch: 2 });

    fireEvent.press(screen.getByLabelText('Preview HTML'));

    const html = screen.getByLabelText('HTML artifact preview').props.source.html as string;
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).not.toContain('Edited');
  });

  it('opens a fence written inside a list step for editing too', () => {
    const steps =
      '1. Add the helper:\n\n   ```python\n   def add(a, b):\n       return a + b\n   ```';
    seedAnswer(steps);
    const screen = inAnswer(finished(steps));

    fireEvent.press(screen.getByLabelText('Edit code'));

    const [stored] = useArtifactStore.getState().artifacts;
    expect(stored).toMatchObject({ messageId: MESSAGE_ID, language: 'python', content: PYTHON });
    expect(mockOpenedEditor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialMode: 'edit',
        artifact: expect.objectContaining({ id: stored!.id }),
      }),
    );
  });

  it('opens no editor for code that is not in the stored answer', () => {
    seedAnswer('A different answer.');
    const screen = inAnswer(finished(ANSWER));

    fireEvent.press(screen.getAllByLabelText('Edit code')[1]!);

    expect(alert).toHaveBeenCalledWith(
      'Edit failed',
      'Could not open this code for editing. Try again.',
    );
    expect(mockOpenedEditor).not.toHaveBeenCalled();
  });

  it('says the code could not be opened and opens no editor when it cannot be stored', () => {
    const screen = inAnswer(finished(ANSWER));

    fireEvent.press(screen.getAllByLabelText('Edit code')[0]!);

    expect(alert).toHaveBeenCalledWith(
      'Edit failed',
      'Could not open this code for editing. Try again.',
    );
    expect(mockOpenedEditor).not.toHaveBeenCalled();
    expect(useArtifactStore.getState().artifacts).toHaveLength(0);
  });

  it('opens no editor while the answer is still being written', () => {
    seedAnswer(ANSWER, { isStreaming: true });
    const screen = inAnswer(finished(ANSWER));

    fireEvent.press(screen.getAllByLabelText('Edit code')[0]!);

    expect(alert).toHaveBeenCalledWith(
      'Edit failed',
      'Could not open this code for editing. Try again.',
    );
    expect(mockOpenedEditor).not.toHaveBeenCalled();
  });

  it('stores code from a Cloud answer under the signed-in owner', () => {
    mockCloudEpoch.mockReturnValue({ ownerId: 'owner-cloud', epoch: 1 });
    seedAnswer(ANSWER, {}, mockCloudChats);
    const screen = inAnswer(finished(ANSWER));

    fireEvent.press(screen.getAllByLabelText('Edit code')[1]!);

    const expectedId = computeDerivedArtifactId(CONVERSATION_ID, `${MESSAGE_ID}:editor`, 1);
    expect(
      useArtifactStore.getState().artifacts.find((row) => row.id === expectedId),
    ).toMatchObject({ content: PYTHON, provenance: { scope: 'cloud', ownerId: 'owner-cloud' } });
    expect(mockOpenedEditor).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialMode: 'edit', conversationId: CONVERSATION_ID }),
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('treats a Cloud conversation held by the local store as Cloud', () => {
    mockCloudEpoch.mockReturnValue({ ownerId: 'owner-cloud', epoch: 1 });
    seedAnswer(ANSWER, {}, mockLocalChats, 'cloud');
    const screen = inAnswer(finished(ANSWER));

    fireEvent.press(screen.getAllByLabelText('Edit code')[1]!);

    const [stored] = useArtifactStore.getState().artifacts;
    expect(stored?.provenance).toEqual({ scope: 'cloud', ownerId: 'owner-cloud' });
  });

  it('opens no editor for a Cloud answer when no Cloud account is signed in', () => {
    seedAnswer(ANSWER, {}, mockCloudChats);
    const screen = inAnswer(finished(ANSWER));

    fireEvent.press(screen.getAllByLabelText('Edit code')[1]!);

    expect(alert).toHaveBeenCalledWith(
      'Edit failed',
      'Could not open this code for editing. Try again.',
    );
    expect(mockOpenedEditor).not.toHaveBeenCalled();
    expect(useArtifactStore.getState().artifacts).toHaveLength(0);
  });

  it('hides Edit while the fence streams and outside an answer', () => {
    expect(inAnswer(streaming(ANSWER)).queryByLabelText('Edit code')).toBeNull();
    expect(render(<>{finished(ANSWER)}</>).queryByLabelText('Edit code')).toBeNull();
  });
});
