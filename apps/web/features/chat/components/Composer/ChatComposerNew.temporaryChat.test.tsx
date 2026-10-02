import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalModel } from '@agiworkforce/local-runtime-contract';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { useLocalModelSelection } from '@features/desktop-host';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { EyeOff } from '@agiworkforce/icons';
import {
  LOCAL_MODEL_PROJECT_REFUSAL,
  TEMPORARY_CHAT_END_CONFIRMATION,
  TEMPORARY_CHAT_END_LABEL,
  TEMPORARY_CHAT_PRIVACY_EXPLANATION,
  TEMPORARY_CHAT_PROJECT_NOTICE,
} from '@/lib/temporary-chat-policy';

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

function openPlusMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: /Add attachments and tools/ }));
}

beforeEach(() => {
  useChatStore.getState().reset();
  useSettingsStore.getState().setNewChatsTemporary(false);
  routerPush.mockClear();
});

function openTemporaryConversation(): void {
  useChatStore.setState({
    activeConversationId: TEMPORARY_CONVERSATION.id,
    conversations: [TEMPORARY_CONVERSATION] as never,
  });
}

const TEMPORARY_CONVERSATION = {
  id: 'conv-temp',
  title: 'Temporary',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isTemporary: true,
};

function temporaryRow(): HTMLElement {
  return screen.getByRole('button', { name: 'Temporary chat' });
}

describe('temporary chat armed before a conversation exists', () => {
  it('shows the enabled default and lets a new chat explicitly opt out', () => {
    useSettingsStore.getState().setNewChatsTemporary(true);
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();
    expect(temporaryRow()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(temporaryRow());
    openPlusMenu();
    expect(temporaryRow()).toHaveAttribute('aria-pressed', 'false');
    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });

  it('offers the toggle on a brand-new chat with no onSetTemporaryChat host wiring', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    expect(screen.getByRole('button', { name: 'Temporary chat' })).toBeEnabled();
  });

  it('arms the pending flag and checks the menu row, with no composer-face chip', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Temporary chat' }));

    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);
    // The composer face stays plus, mode pill, Style, model trigger, mic,
    // send; temporary chat surfaces only in this menu and the page header.
    expect(screen.queryByText('Temporary chat')).not.toBeInTheDocument();

    openPlusMenu();
    expect(screen.getByRole('button', { name: 'Temporary chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('toggles back off on a second click', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Temporary chat' }));
    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);

    openPlusMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Temporary chat' }));
    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });
});

describe('what the control says before it is used', () => {
  it('carries the temporary-chat glyph, not a neighbouring row one', () => {
    const reference = render(<EyeOff />).container.querySelector('svg')?.innerHTML;
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    const drawn = temporaryRow().querySelector('svg')?.innerHTML;
    const memoryGlyph = screen
      .getByRole('button', { name: 'Memory' })
      .querySelector('svg')?.innerHTML;

    expect(drawn).toBe(reference);
    expect(drawn).not.toBe(memoryGlyph);
  });

  it('states what it costs on screen, not only in a pointer tooltip', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    expect(screen.getByText(TEMPORARY_CHAT_PRIVACY_EXPLANATION)).toBeVisible();
  });

  it('keeps the long retention note on the row it describes', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    expect(temporaryRow().getAttribute('title')).toContain('skips memory');
  });
});

describe('ending a temporary chat', () => {
  it('is not offered while there is no temporary chat to end', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openPlusMenu();

    expect(screen.queryByRole('button', { name: TEMPORARY_CHAT_END_LABEL })).toBeNull();
  });

  it('is offered once a temporary conversation is open', () => {
    openTemporaryConversation();
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={TEMPORARY_CONVERSATION.id}
        onSetTemporaryChat={vi.fn(async () => true)}
      />,
    );
    openPlusMenu();

    expect(screen.getByRole('button', { name: TEMPORARY_CHAT_END_LABEL })).toBeEnabled();
  });

  it('asks first, and names what is lost', () => {
    openTemporaryConversation();
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={TEMPORARY_CONVERSATION.id}
        onSetTemporaryChat={vi.fn(async () => true)}
      />,
    );
    openPlusMenu();

    fireEvent.click(screen.getByRole('button', { name: TEMPORARY_CHAT_END_LABEL }));

    expect(screen.getByText(TEMPORARY_CHAT_END_CONFIRMATION.title)).toBeVisible();
    expect(screen.getByText(TEMPORARY_CHAT_END_CONFIRMATION.description)).toBeVisible();
    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('leaves the chat open when the question is declined', () => {
    openTemporaryConversation();
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={TEMPORARY_CONVERSATION.id}
        onSetTemporaryChat={vi.fn(async () => true)}
      />,
    );
    openPlusMenu();
    fireEvent.click(screen.getByRole('button', { name: TEMPORARY_CHAT_END_LABEL }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('drops the transcript and leaves for a fresh chat once confirmed', async () => {
    openTemporaryConversation();
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={TEMPORARY_CONVERSATION.id}
        onSetTemporaryChat={vi.fn(async () => true)}
      />,
    );
    openPlusMenu();
    fireEvent.click(screen.getByRole('button', { name: TEMPORARY_CHAT_END_LABEL }));

    fireEvent.click(
      screen.getByRole('button', { name: TEMPORARY_CHAT_END_CONFIRMATION.confirmLabel }),
    );

    await vi.waitFor(() => expect(useChatStore.getState().conversations).toHaveLength(0));
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(useChatStore.getState().pendingTemporaryChat).toBeNull();
    expect(routerPush).toHaveBeenCalledWith('/chat');
  });
});

describe('temporary chat inside a project', () => {
  const PROJECT_ID = 'project-1';
  const projectPicker = {
    projects: [{ id: PROJECT_ID, name: 'Launch' }],
    activeProjectId: PROJECT_ID,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
  };

  it('is not offered for a new chat filed under a project', () => {
    useSettingsStore.getState().setNewChatsTemporary(true);
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={projectPicker} />);
    openPlusMenu();

    expect(screen.queryByRole('button', { name: 'Temporary chat' })).toBeNull();
  });

  it('is not offered on a project page composer', () => {
    render(<ChatComposerNew onSend={vi.fn()} projectId={PROJECT_ID} />);
    openPlusMenu();

    expect(screen.queryByRole('button', { name: 'Temporary chat' })).toBeNull();
  });

  it('is not offered in an existing project conversation', () => {
    useChatStore.setState({
      activeConversationId: 'conv-project',
      conversations: [
        {
          ...TEMPORARY_CONVERSATION,
          id: 'conv-project',
          isTemporary: false,
          projectId: PROJECT_ID,
        },
      ] as never,
    });
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId="conv-project"
        onSetTemporaryChat={vi.fn(async () => true)}
      />,
    );
    openPlusMenu();

    expect(screen.queryByRole('button', { name: 'Temporary chat' })).toBeNull();
  });

  it('stays offered on a chat already temporary inside a project, so it can be turned off', () => {
    useChatStore.setState({
      activeConversationId: TEMPORARY_CONVERSATION.id,
      conversations: [{ ...TEMPORARY_CONVERSATION, projectId: PROJECT_ID }] as never,
    });
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={TEMPORARY_CONVERSATION.id}
        onSetTemporaryChat={vi.fn(async () => true)}
      />,
    );
    openPlusMenu();

    expect(temporaryRow()).toHaveAttribute('aria-pressed', 'true');
  });

  it('says a new project chat will be saved when new chats start temporary', () => {
    useSettingsStore.getState().setNewChatsTemporary(true);
    render(<ChatComposerNew onSend={vi.fn()} projectId={PROJECT_ID} />);

    expect(screen.getByText(TEMPORARY_CHAT_PROJECT_NOTICE)).toHaveAttribute('role', 'status');
  });

  it('says so when a temporary chat was armed before the project was picked', () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    render(<ChatComposerNew onSend={vi.fn()} projectPicker={projectPicker} />);

    expect(screen.getByText(TEMPORARY_CHAT_PROJECT_NOTICE)).toBeVisible();
  });

  it('stays quiet when temporary chat is off or the chat is outside a project', () => {
    const { unmount } = render(<ChatComposerNew onSend={vi.fn()} projectId={PROJECT_ID} />);
    expect(screen.queryByText(TEMPORARY_CHAT_PROJECT_NOTICE)).toBeNull();
    unmount();

    useSettingsStore.getState().setNewChatsTemporary(true);
    render(<ChatComposerNew onSend={vi.fn()} />);
    expect(screen.queryByText(TEMPORARY_CHAT_PROJECT_NOTICE)).toBeNull();
  });
});

describe('a model on this device inside a project', () => {
  const LOCAL_MODEL: LocalModel = {
    id: 'local:ollama/qwen2.5:1.5b',
    serverId: 'ollama',
    serverLabel: 'Ollama',
    name: 'qwen2.5:1.5b',
  };

  function typeMessage(value: string): HTMLElement {
    const input = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(input, { target: { value } });
    return input;
  }

  beforeEach(() => {
    resetSendPendingFlagForTests();
    useLocalModelSelection.getState().select(LOCAL_MODEL);
  });

  afterEach(() => {
    useLocalModelSelection.getState().select(null);
  });

  it('says the chat cannot be saved in the project and does not send it', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} projectId="project-1" />);

    expect(screen.getByTestId('local-model-project-conflict')).toHaveTextContent(
      LOCAL_MODEL_PROJECT_REFUSAL,
    );
    const input = typeMessage('my biopsy result says');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('offers to go back to a cloud model', async () => {
    render(<ChatComposerNew onSend={vi.fn()} projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to a cloud model' }));

    await waitFor(() => expect(useLocalModelSelection.getState().selected).toBeNull());
    expect(screen.queryByTestId('local-model-project-conflict')).toBeNull();
  });

  it('stays quiet for a new chat outside any project', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);

    expect(screen.queryByTestId('local-model-project-conflict')).toBeNull();
    typeMessage('hello');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
