import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { useChatStore } from '@shared/stores/web-chat-store';
import { CHAT_SLASH_DONE, type ChatSlashActions } from '@features/chat/lib/chat-slash-commands';

const openSettings = vi.fn();
const openModelPicker = vi.fn(() => true);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSettingsModal: () => ({ isOpen: false, openSettings, closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/lib/model-picker-trigger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  MODEL_SELECTOR_TRIGGER_ID: 'model-selector',
  openModelPicker: () => openModelPicker(),
}));

vi.mock('@features/chat/hooks/use-skills-list', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

function type(text: string) {
  fireEvent.change(input(), { target: { value: text } });
}

function send(text: string) {
  type(text);
  fireEvent.keyDown(input(), { key: 'Enter' });
}

function menuLabels(): string[] {
  return screen.getAllByText(/^\/[a-z]+$/).map((node) => node.textContent ?? '');
}

function allActions(): Required<Omit<ChatSlashActions, 'model'>> {
  return {
    new: { run: vi.fn(() => CHAT_SLASH_DONE) },
    rename: { run: vi.fn(() => CHAT_SLASH_DONE) },
    archive: { run: vi.fn(() => CHAT_SLASH_DONE) },
    pin: { run: vi.fn(() => CHAT_SLASH_DONE), description: 'Unpin this chat' },
    share: { run: vi.fn(() => CHAT_SLASH_DONE) },
    status: {
      run: vi.fn(() => ({
        kind: 'status' as const,
        lines: [
          { label: 'Model', value: 'Model A' },
          { label: 'Plan', value: 'Pro' },
        ],
      })),
    },
  };
}

beforeEach(() => {
  // A typed '/' is parked as the chat's draft; without this the next test
  // restores it and typing '/' again changes nothing.
  localStorage.clear();
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
  openSettings.mockClear();
  openModelPicker.mockClear();
});

describe('chat slash commands are listed only when their action exists', () => {
  it('lists no conversation command when the host supplies none, but keeps /model', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="c1" />);
    type('/');

    const listed = menuLabels();
    for (const label of ['/new', '/rename', '/archive', '/pin', '/share', '/status']) {
      expect(listed).not.toContain(label);
    }
    expect(listed).toContain('/model');
  });

  it('lists exactly the commands whose actions were supplied', () => {
    const { new: newChat, status } = allActions();
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId="c1"
        chatSlashActions={{ new: newChat, status }}
      />,
    );
    type('/');

    const listed = menuLabels();
    expect(listed).toContain('/new');
    expect(listed).toContain('/status');
    expect(listed).not.toContain('/rename');
    expect(listed).not.toContain('/share');
  });

  it("uses the action's own description when its state changes the wording", () => {
    render(
      <ChatComposerNew onSend={vi.fn()} conversationId="c1" chatSlashActions={allActions()} />,
    );
    type('/pi');

    expect(screen.getByText('Unpin this chat')).toBeInTheDocument();
  });
});

describe('running chat slash commands', () => {
  it('runs a typed command with its argument instead of sending it as a message', () => {
    const onSend = vi.fn();
    const actions = allActions();
    render(<ChatComposerNew onSend={onSend} conversationId="c1" chatSlashActions={actions} />);

    send('/rename Trip plan');

    expect(actions.rename.run).toHaveBeenCalledWith('Trip plan');
    expect(onSend).not.toHaveBeenCalled();
    expect(input()).toHaveValue('');
  });

  it('keeps the text and shows the reason when an action declines', () => {
    const onSend = vi.fn();
    const rename = {
      run: vi.fn(() => ({ kind: 'notice' as const, message: 'Type the new name after /rename.' })),
    };
    render(<ChatComposerNew onSend={onSend} conversationId="c1" chatSlashActions={{ rename }} />);

    send('/rename ');

    expect(screen.getByRole('alert')).toHaveTextContent('Type the new name after /rename.');
    expect(input()).toHaveValue('/rename ');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('runs a command picked from the menu', () => {
    const actions = allActions();
    render(<ChatComposerNew onSend={vi.fn()} conversationId="c1" chatSlashActions={actions} />);
    type('/arch');

    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(actions.archive.run).toHaveBeenCalledTimes(1);
  });

  it('writes /rename back for its argument when picked from the menu with none typed', () => {
    const actions = allActions();
    render(<ChatComposerNew onSend={vi.fn()} conversationId="c1" chatSlashActions={actions} />);
    type('/ren');

    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(actions.rename.run).not.toHaveBeenCalled();
    expect(input()).toHaveValue('/rename ');
  });

  it('opens the model picker for /model', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="c1" />);

    send('/model');

    expect(openModelPicker).toHaveBeenCalledTimes(1);
  });

  it('shows /status as a panel with a way to the full usage page', () => {
    const actions = allActions();
    render(<ChatComposerNew onSend={vi.fn()} conversationId="c1" chatSlashActions={actions} />);

    send('/status');

    const panel = screen.getByTestId('composer-status-panel');
    expect(within(panel).getByText('Model A')).toBeInTheDocument();
    expect(within(panel).getByText('Pro')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Usage details' }));
    expect(openSettings).toHaveBeenCalledWith('usage');
    expect(screen.queryByTestId('composer-status-panel')).toBeNull();
  });
});
