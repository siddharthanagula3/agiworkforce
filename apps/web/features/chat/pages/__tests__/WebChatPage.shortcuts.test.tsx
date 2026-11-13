import { createWebChatWorkspaceFixture } from './WebChatWorkspaceFixture';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emitAppCommand } from '@shared/lib/app-commands';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('react-i18next');
type ScanModule1 = typeof import('@/app/settings/_lib/preferences-client');
type ScanModule2 = typeof import('@/lib/hooks/useMediaGeneration');
type ScanModule3 = typeof import('../../hooks/use-keyboard-shortcuts');
type ScanModule4 = typeof import('@shared/utils/browser-utils');
type ScanModule5 = typeof import('@agiworkforce/ui');
type ScanModule6 = typeof import('@agiworkforce/unified-chat');
type ScanModule7 = typeof import('../../components/ConversationTitleMenu');
type ScanModule8 = typeof import('@features/chat/hooks/use-voice-session');
type ScanModule9 = typeof import('../../stores/voice-session-store');

const mocks = vi.hoisted(() => ({
  useKeyboardShortcuts: vi.fn(),
  writeText: vi.fn(async () => true),
  deleteConversation: vi.fn(async () => true),
  openSettings: vi.fn(),
  openModelPicker: vi.fn(() => true),
  exitVoiceSession: vi.fn(),
  enterVoiceSession: vi.fn(),
  routerPush: vi.fn(),
  createProject: vi.fn(),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000911';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: mocks.routerPush, back: vi.fn() }),
  useParams: () => ({ sessionId: CONVERSATION_ID }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/chat/${CONVERSATION_ID}`,
}));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } =
    await import('@/lib/identity/__tests__/clerk-session-fixture');
  const session = createClerkSessionFixture(
    () => ({
      getToken: async () => 'fixture-token',
      isLoaded: true,
      userId: 'fixture-user',
      isSignedIn: true,
      sessionId: 'fixture-session',
    }),
    { signOut: vi.fn() },
  );
  return {
    ...session,
    useUser: () => ({ user: null }),
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  fetchPreferenceNamespace: async () => ({ browserReplyReady: true }),
  readAutonomousToolApprovalsAllowed: async () => false,
  PREFERENCE_NAMESPACE_SAVED_EVENT: 'agi:preference-namespace-saved',
}));

vi.mock('@/lib/hooks/useConversations', async (importOriginal) => {
  const { useChatStore } = await import('@shared/stores/web-chat-store');
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useConversations: () => ({
      conversations: useChatStore((state) => state.conversations),
      isLoading: false,
      createConversation: vi.fn(),
      loadConversation: vi.fn(),
      deleteConversation: mocks.deleteConversation,
      updateConversation: vi.fn(async () => true),
      setActiveConversation: vi.fn(),
    }),
  };
});

vi.mock('@/lib/hooks/useManagedUsageSummary', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getWorstUsagePercent: () => 0,
  readManagedUsageBuckets: () => [],
  useManagedUsageSummary: () => ({ usage: null }),
}));

vi.mock('@/lib/hooks/useMediaGeneration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return {
    ...actual,
    useMediaGeneration: () => ({
      generateImage: vi.fn(),
      generateVideo: vi.fn(),
      startVideoGeneration: vi.fn(),
      watchVideoGeneration: vi.fn(),
    }),
  };
});

vi.mock('../../components/Composer/ChatComposerNew', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatComposerNew: () => null,
  SEND_GUARD_BLOCKED: 'fixture-send-guard-blocked',
}));
vi.mock('../../components/messages/ChatMessageList', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatMessageList: () => <div data-testid="message-list" />,
}));
vi.mock('../../components/GreetingBanner/GreetingBanner', () => ({
  GreetingBanner: () => null,
}));
vi.mock('../../components/ChatStreamRuntimeProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useChatStreamRuntime: () => ({
    sendMessage: vi.fn(),
    stopGeneration: vi.fn(),
    continueGeneration: vi.fn(),
    resolveToolApproval: vi.fn(),
  }),
}));
vi.mock('../../hooks/use-artifact-cloud-sync', () => ({ useArtifactCloudSync: vi.fn() }));
vi.mock('../../hooks/use-share-conversation', () => ({
  useShareConversation: () => ({
    share: vi.fn(),
    isSharing: false,
    view: null,
    isViewCurrent: () => false,
    workspacePending: false,
    workspaceUnavailable: false,
    inventoryIncomplete: false,
  }),
}));
vi.mock('../../hooks/use-conversation-branches', () => ({
  useConversationBranches: () => ({
    groupsByMessageId: {},
    branchingMessageId: null,
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
  }),
}));
vi.mock('../../lib/model-picker-trigger', () => ({
  MODEL_SELECTOR_TRIGGER_ID: 'model-selector',
  openModelPicker: mocks.openModelPicker,
}));
vi.mock('@features/chat/hooks/use-voice-session', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  exitVoiceSession: mocks.exitVoiceSession,
}));
vi.mock('../../stores/voice-session-store', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  enterVoiceSession: mocks.enterVoiceSession,
}));
vi.mock('../../hooks/use-keyboard-shortcuts', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, useKeyboardShortcuts: mocks.useKeyboardShortcuts };
});
vi.mock('@shared/utils/browser-utils', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return { ...actual, safeClipboard: { ...actual.safeClipboard, writeText: mocks.writeText } };
});

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSettingsModal: () => ({ openSettings: mocks.openSettings }),
}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => {
  const state = { hydrateFromServer: vi.fn() };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useToolPermissionsStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@features/projects', async (importOriginal) => {
  const projectState = {
    projects: [],
    activeProjectId: null,
    setActiveProject: vi.fn(),
    updateProject: vi.fn(),
    removeProject: vi.fn(),
    setProjects: vi.fn(),
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useManagedCloudProjects: () => ({ projects: [], isReady: true }),
    useProjectStore: (selector: (value: typeof projectState) => unknown) => selector(projectState),
    ProjectSettingsDialog: () => null,
  };
});
vi.mock('@features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: {
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    createProject: mocks.createProject,
  },
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return { ...actual, Sidebar: () => null };
});
vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule6>();
  return {
    ...actual,
    LocalByokHandoffDialog: () => null,
    UsageWarningBanner: () => null,
  };
});

vi.mock('../../components/dialogs/UpgradePlanDialog', () => ({
  UpgradePlanDialog: () => null,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', () => ({
  UpgradeConfirmDialog: () => null,
}));
vi.mock('@/features/time-focus/TimeFocusReminder', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  TimeFocusReminder: () => null,
}));
vi.mock('../../components/ConversationTitleMenu', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  ConversationTitleMenu: () => null,
}));
vi.mock('../../components/approvals/ApprovalInbox', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ApprovalInbox: () => null,
}));
vi.mock('../../components/work-session/WorkSessionPanel', () => ({
  hasWorkSession: () => false,
  WorkSessionPanel: () => null,
  WorkSessionToggleButton: () => null,
}));
vi.mock('../../components/artifacts/ArtifactsPanel', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ArtifactsPanel: () => null,
  ArtifactsToggleButton: () => null,
}));
vi.mock('../../components/research/ResearchPanel', async (importOriginal) => ({
  ...(await importOriginal()),
  ResearchPanel: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ResearchToggleButton: () => null,
}));
vi.mock('@shared/components/agi/SidebarWordmark', () => ({ SidebarWordmark: () => null }));

import WebChatPage from '../WebChatPage';

const workspaceFixture = createWebChatWorkspaceFixture();
import { useChatStore } from '@shared/stores/web-chat-store';
import { emitAppCommand } from '@shared/lib/app-commands';
import { KEYBOARD_SHORTCUT_DOCS } from '../../hooks/use-keyboard-shortcuts';
import { useVoiceSessionStore } from '../../stores/voice-session-store';
import { VOICE_SESSION_EVENT } from '@agiworkforce/unified-chat';

const HANDLER_BY_DESCRIPTION: Record<string, string> = {
  'Open search': 'onSearch',
  'Show keyboard shortcuts': 'onShowShortcuts',
  'New conversation': 'onNewChat',
  'Toggle sidebar': 'onToggleSidebar',
  'Focus message composer': 'onFocusComposer',
  'Copy last message': 'onCopyLastMessage',
  'Regenerate last message': 'onRegenerateLastMessage',
  'Toggle artifacts panel': 'onToggleArtifacts',
  'Select model': 'onSelectModel',
  'Toggle voice': 'onToggleVoice',
  'Set custom instructions': 'onSetCustomInstructions',
  'Copy last code block': 'onCopyLastCodeBlock',
  'Delete chat': 'onDeleteConversation',
};

const LAST_ASSISTANT_CONTENT = 'The answer the viewer would copy.';
const LAST_CODE_BLOCK = 'const answer = 42;';
const CODE_ASSISTANT_CONTENT = ['Here is the code.', '', '```ts', LAST_CODE_BLOCK, '```'].join(
  '\n',
);

function openConversation(assistantContent: string = LAST_ASSISTANT_CONTENT): void {
  useChatStore.getState().reset();
  useChatStore.getState().setConversations([
    {
      id: CONVERSATION_ID,
      title: 'Shortcut chat',
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
  ]);
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [
    {
      id: '00000000-0000-4000-8000-0000000009b1',
      role: 'user',
      content: 'Ask something',
      createdAt: '2026-08-15T00:00:01.000Z',
    },
    {
      id: '00000000-0000-4000-8000-0000000009b2',
      role: 'assistant',
      content: assistantContent,
      createdAt: '2026-08-15T00:00:02.000Z',
    },
  ]);
}

function latestShortcutOptions(): Record<string, unknown> {
  const call = mocks.useKeyboardShortcuts.mock.calls.at(-1);
  expect(call).toBeDefined();
  return (call?.[0] ?? {}) as Record<string, unknown>;
}

describe('WebChatPage keyboard shortcut wiring', () => {
  beforeEach(() => {
    mocks.useKeyboardShortcuts.mockClear();
    mocks.writeText.mockClear();
    mocks.deleteConversation.mockClear();
    mocks.openSettings.mockClear();
    mocks.openModelPicker.mockClear();
    mocks.exitVoiceSession.mockClear();
    mocks.enterVoiceSession.mockClear();
    mocks.routerPush.mockClear();
    mocks.createProject.mockReset();
    mocks.createProject.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000c11',
      name: 'Field notes',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
    vi.unstubAllGlobals();
  });

  it('opens the feedback dialog when Send Feedback reaches the chat page', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');
    expect(screen.queryByRole('dialog', { name: 'Share feedback' })).toBeNull();

    await act(async () => {
      emitAppCommand('open-feedback');
    });

    expect(await screen.findByRole('dialog', { name: 'Share feedback' })).toBeInTheDocument();
  });

  it('opens Keyboard Shortcuts when that command reaches the chat page', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');
    expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeNull();

    await act(async () => {
      emitAppCommand('open-shortcuts');
    });

    expect(await screen.findByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
  });

  it('opens Search on the chat page the public window loads without running a query', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');
    expect(screen.queryByRole('dialog', { name: 'Search Conversations' })).toBeNull();

    await act(async () => {
      emitAppCommand('open-search');
    });

    expect(await screen.findByRole('dialog', { name: 'Search Conversations' })).toBeVisible();
    expect(screen.getByPlaceholderText('Search messages and conversations...')).toBeVisible();
  });

  it('opens the create dialog when File > New Project reaches the chat page', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');
    expect(screen.queryByRole('dialog', { name: 'Create project' })).toBeNull();

    await act(async () => {
      emitAppCommand('new-project');
    });

    expect(await screen.findByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });

  it('creates the named project when File > New Project is submitted on the public chat page', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    await act(async () => {
      emitAppCommand('new-project');
    });

    fireEvent.change(await screen.findByLabelText('Project name'), {
      target: { value: 'Field notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalled());
    expect(mocks.createProject.mock.calls[0]?.[0]).toMatchObject({ name: 'Field notes' });
    await waitFor(() =>
      expect(mocks.routerPush).toHaveBeenCalledWith(
        '/chat/projects/00000000-0000-4000-8000-000000000c11',
      ),
    );
  });

  it('supplies a handler for every shortcut the dialog documents on this page', async () => {
    openConversation();

    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    const options = latestShortcutOptions();
    const unmapped = KEYBOARD_SHORTCUT_DOCS.filter(
      (doc) => doc.scope === 'app' && !HANDLER_BY_DESCRIPTION[doc.description],
    ).map((doc) => doc.description);
    expect(unmapped).toEqual([]);

    const unhandled = KEYBOARD_SHORTCUT_DOCS.map((doc) => HANDLER_BY_DESCRIPTION[doc.description])
      .filter((key): key is string => Boolean(key))
      .filter((key) => typeof options[key] !== 'function');

    expect(unhandled).toEqual([]);
  });

  it('copies the last assistant message when the copy shortcut fires', async () => {
    openConversation();

    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    await waitFor(() => {
      const copy = latestShortcutOptions()['onCopyLastMessage'];
      expect(typeof copy).toBe('function');
    });
    await (latestShortcutOptions()['onCopyLastMessage'] as () => Promise<void>)();

    expect(mocks.writeText).toHaveBeenCalledWith(LAST_ASSISTANT_CONTENT);
  });
  it('opens the model picker from the select model shortcut', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    (latestShortcutOptions()['onSelectModel'] as () => void)();

    expect(mocks.openModelPicker).toHaveBeenCalledTimes(1);
  });

  it('opens the personalization instructions from the custom instructions shortcut', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    (latestShortcutOptions()['onSetCustomInstructions'] as () => void)();

    expect(mocks.openSettings).toHaveBeenCalledWith('personalization');
  });

  it('copies only the last code block of the last reply', async () => {
    openConversation(CODE_ASSISTANT_CONTENT);
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    await (latestShortcutOptions()['onCopyLastCodeBlock'] as () => Promise<void>)();

    expect(mocks.writeText).toHaveBeenCalledWith(LAST_CODE_BLOCK);
  });

  it('copies nothing when no reply holds a code block', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    await (latestShortcutOptions()['onCopyLastCodeBlock'] as () => Promise<void>)();

    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it('starts voice mode when none is running', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    (latestShortcutOptions()['onToggleVoice'] as () => void)();

    expect(mocks.enterVoiceSession).toHaveBeenCalledTimes(1);
    expect(mocks.exitVoiceSession).not.toHaveBeenCalled();
  });

  it('ends voice mode when it is already running', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.enter });

    (latestShortcutOptions()['onToggleVoice'] as () => void)();

    expect(mocks.exitVoiceSession).toHaveBeenCalledTimes(1);
    expect(mocks.enterVoiceSession).not.toHaveBeenCalled();
  });

  it('asks before deleting the open chat and deletes only after confirming', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    (latestShortcutOptions()['onDeleteConversation'] as () => void)();

    expect(await screen.findByText('Delete conversation?')).toBeTruthy();
    expect(mocks.deleteConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete conversation' }));

    await waitFor(() => expect(mocks.deleteConversation).toHaveBeenCalledWith(CONVERSATION_ID));
  });

  it('deletes nothing when the confirmation is dismissed', async () => {
    openConversation();
    render(<WebChatPage />, { wrapper: workspaceFixture.wrapper });
    await screen.findByTestId('message-list');

    (latestShortcutOptions()['onDeleteConversation'] as () => void)();
    await screen.findByText('Delete conversation?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.deleteConversation).not.toHaveBeenCalled();
  });
});

describe('WebChatPage and the desktop menu', () => {
  const NEWER_ID = '00000000-0000-4000-8000-000000000912';
  const OLDER_ID = '00000000-0000-4000-8000-000000000910';

  function openBetweenTwoChats(): void {
    openConversation();
    useChatStore.getState().setConversations([
      {
        id: NEWER_ID,
        title: 'Newer chat',
        createdAt: '2026-08-16T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
      },
      {
        id: CONVERSATION_ID,
        title: 'Shortcut chat',
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
      },
      {
        id: OLDER_ID,
        title: 'Older chat',
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ]);
  }

  beforeEach(() => {
    navigation.push.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the chat below and above the open one, in the rail order', async () => {
    openBetweenTwoChats();
    render(<WebChatPage />);
    await screen.findByTestId('message-list');

    act(() => {
      emitAppCommand('go-to-next-chat');
    });
    expect(navigation.push).toHaveBeenLastCalledWith(expect.stringContaining(OLDER_ID));

    act(() => {
      emitAppCommand('go-to-previous-chat');
    });
    expect(navigation.push).toHaveBeenLastCalledWith(expect.stringContaining(NEWER_ID));
  });

  it('starts a new chat armed as temporary', async () => {
    openConversation();
    render(<WebChatPage />);
    await screen.findByTestId('message-list');

    act(() => {
      emitAppCommand('new-temporary-chat');
    });

    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);
    expect(navigation.push).toHaveBeenCalled();
  });
});
