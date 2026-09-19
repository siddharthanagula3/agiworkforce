import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew } from './ChatComposerNew';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { EyeOff } from '@agiworkforce/icons';
import {
  TEMPORARY_CHAT_END_CONFIRMATION,
  TEMPORARY_CHAT_END_LABEL,
  TEMPORARY_CHAT_PRIVACY_EXPLANATION,
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
