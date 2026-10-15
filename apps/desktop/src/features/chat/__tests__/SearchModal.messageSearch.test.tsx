import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  invoke: vi.fn(),
  selectConversation: vi.fn(),
  conversations: [
    {
      id: 'chat-roadmap',
      title: 'Planning notes',
      pinned: false,
      archived: false,
      lastMessage: '',
      updatedAt: new Date('2026-10-01T10:00:00Z'),
    },
    {
      id: 'chat-archived',
      title: 'Old thread',
      pinned: false,
      archived: true,
      lastMessage: '',
      updatedAt: new Date('2026-09-01T10:00:00Z'),
    },
  ],
}));

vi.mock('../../../hooks/useSearchModal', () => ({
  useSearchModal: (selector: (state: unknown) => unknown) =>
    selector({ isOpen: true, close: mocks.close }),
}));

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}));

vi.mock('../../../stores/chat/chatStore', async (importOriginal) => ({
  ...(await importOriginal<ChatstoreModule>()),
  resolveDesktopChatOwnerId: () => 'local-desktop-user',
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({ conversations: mocks.conversations, selectConversation: mocks.selectConversation }),
  uuidToDbId: (id: string) => ({ 'chat-roadmap': 41, 'chat-archived': 42 })[id],
}));

vi.mock('../../../stores/projectStore', async (importOriginal) => ({
  ...(await importOriginal<ProjectstoreModule>()),
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({ projects: [], setActiveProject: vi.fn() }),
}));

vi.mock('../../../stores/artifactStore', () => ({
  useArtifactStore: (selector: (state: unknown) => unknown) =>
    selector({ summaries: [], setActiveArtifact: vi.fn(), openPanel: vi.fn() }),
}));

vi.mock('../../../stores/appModeStore', async (importOriginal) => {
  const actual = await importOriginal<AppmodestoreModule>();
  return {
    ...actual,
    selectPrivacyMode: (state: { privacyMode: string }) => state.privacyMode,
    useAppModeStore: Object.assign(
      (selector: (state: unknown) => unknown) => selector({ privacyMode: 'local' }),
      actual.useAppModeStore,
    ),
  };
});

vi.mock('../../../stores/auth', async (importOriginal) => ({
  ...(await importOriginal<AuthModule>()),
  selectHasCloudAccountSession: () => false,
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ cloudSessionEpoch: 0, user: null }),
}));

vi.mock('../../../services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: vi.fn(),
}));

vi.mock('../../../api/cloudApi', async (importOriginal) => ({
  ...(await importOriginal<CloudapiModule>()),
  CLOUD_API_BASE_URL: 'https://agiworkforce.com',
}));

vi.mock('@agiworkforce/unified-chat', () => ({ useReducedMotion: () => false }));

vi.mock('../../../lib/runtimeEnvironment', async (importOriginal) => ({
  ...(await importOriginal<RuntimeenvironmentModule>()),
  isTauri: true,
  isElectronHost: false,
  supportsLocalAppMode: true,
}));

vi.mock('../../artifacts/openArtifactInChat', async (importOriginal) => ({
  ...(await importOriginal<OpenartifactinchatModule>()),
  openArtifactInChat: vi.fn(),
}));

import { SearchModal } from '../SearchModal';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type ChatstoreModule = typeof import('../../../stores/chat/chatStore');
type ProjectstoreModule = typeof import('../../../stores/projectStore');
type AppmodestoreModule = typeof import('../../../stores/appModeStore');
type AuthModule = typeof import('../../../stores/auth');
type CloudapiModule = typeof import('../../../api/cloudApi');
type RuntimeenvironmentModule = typeof import('../../../lib/runtimeEnvironment');
type OpenartifactinchatModule = typeof import('../../artifacts/openArtifactInChat');

async function searchFor(value: string): Promise<void> {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();
  });
}

describe('SearchModal Local message search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('finds a chat by text inside its messages, scoped to the Local owner', async () => {
    mocks.invoke.mockResolvedValue([
      {
        message_id: 7,
        conversation_id: 41,
        conversation_title: 'Planning notes',
        content_snippet: 'the [roadmap] for Q4',
        role: 'assistant',
        created_at: '2026-10-01T10:00:00Z',
        rank: -1.2,
      },
    ]);
    render(<SearchModal />);

    await searchFor('roadmap');

    expect(mocks.invoke).toHaveBeenCalledWith('search_chat_history', {
      query: 'roadmap',
      limit: 20,
      userId: 'local-desktop-user',
      appMode: 'local',
    });
    expect(screen.getByText('Planning notes')).toBeInTheDocument();
    expect(screen.getByText('the [roadmap] for Q4')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Planning notes'));
    expect(mocks.selectConversation).toHaveBeenCalledWith('chat-roadmap');
  });

  it('leaves archived chats out of message hits, as the title search does', async () => {
    mocks.invoke.mockResolvedValue([
      {
        message_id: 9,
        conversation_id: 42,
        conversation_title: 'Old thread',
        content_snippet: 'archived [roadmap]',
        role: 'user',
        created_at: '2026-09-01T10:00:00Z',
        rank: -0.5,
      },
    ]);
    render(<SearchModal />);

    await searchFor('roadmap');

    expect(screen.queryByText('Old thread')).not.toBeInTheDocument();
  });

  it('does not query the index for queries shorter than three characters', async () => {
    render(<SearchModal />);

    await searchFor('ro');

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('says so when the message search fails instead of showing no results silently', async () => {
    mocks.invoke.mockRejectedValue(new Error('index unavailable'));
    render(<SearchModal />);

    await searchFor('roadmap');

    expect(screen.getByRole('alert')).toHaveTextContent('index unavailable');
  });
});
