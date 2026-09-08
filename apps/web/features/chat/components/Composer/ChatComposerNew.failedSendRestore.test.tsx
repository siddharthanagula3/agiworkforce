import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { parkUnsentDraft, useChatStore } from '@shared/stores/web-chat-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
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

const CONVERSATION_ID = 'server-conversation-id';
const OUTGOING = 'summarise the attached report';
const ATTACHMENT_NAME = 'report.txt';
const TYPED_SINCE = 'actually, hold on';

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

function makeFile(): File {
  return new File(['quarterly numbers'], ATTACHMENT_NAME, { type: 'text/plain' });
}

beforeEach(() => {
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
});

describe('WEB-CHAT-COMPOSER-NEW-WIPES-USER-MESSAGE-01', () => {
  it('hands the attachments back, not only the text, when the send never reached a model', () => {
    const file = makeFile();
    const onSend = vi.fn();
    const { rerender } = render(
      <ChatComposerNew onSend={onSend} conversationId={CONVERSATION_ID} droppedFiles={[file]} />,
    );

    fireEvent.change(input(), { target: { value: OUTGOING } });
    expect(screen.getByText(ATTACHMENT_NAME)).toBeInTheDocument();

    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]![0]).toBe(OUTGOING);
    expect(onSend.mock.calls[0]![1]).toEqual([file]);
    expect(input()).toHaveValue('');
    expect(screen.queryByText(ATTACHMENT_NAME)).not.toBeInTheDocument();

    const outgoingAttachments = onSend.mock.calls[0]![1] as File[];
    parkUnsentDraft(CONVERSATION_ID, OUTGOING);
    rerender(
      <ChatComposerNew
        onSend={onSend}
        conversationId={CONVERSATION_ID}
        droppedFiles={outgoingAttachments}
      />,
    );

    expect(input()).toHaveValue(OUTGOING);
    expect(screen.getByText(ATTACHMENT_NAME)).toBeInTheDocument();
  });

  it('holds a handback that live typing displaced, and gives it back when the composer empties', () => {
    const onSend = vi.fn();
    const { rerender } = render(
      <ChatComposerNew onSend={onSend} conversationId={CONVERSATION_ID} />,
    );

    fireEvent.change(input(), { target: { value: TYPED_SINCE } });
    parkUnsentDraft(CONVERSATION_ID, OUTGOING);
    rerender(<ChatComposerNew onSend={onSend} conversationId={CONVERSATION_ID} />);

    expect(input()).toHaveValue(TYPED_SINCE);

    fireEvent.change(input(), { target: { value: '' } });

    expect(input()).toHaveValue(OUTGOING);
    expect(screen.getByText(/couldn't send/i)).toBeInTheDocument();
  });

  it('does not resurrect a draft that belonged to the surface the user just left', () => {
    parkUnsentDraft(CONVERSATION_ID, OUTGOING);
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} emptyState conversationId={null} />);

    fireEvent.change(input(), { target: { value: TYPED_SINCE } });
    fireEvent.change(input(), { target: { value: '' } });

    expect(input()).toHaveValue('');
  });
});
