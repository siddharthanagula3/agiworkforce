import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';

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

function sendButton() {
  return screen.getByRole('button', { name: /send message|sending message/i });
}

function submit(text: string) {
  const textarea = screen.getByRole('textbox', { name: /message input/i });
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

beforeEach(() => {
  resetSendPendingFlagForTests();
});

describe('composer shows a sending indicator across the upload gap (files-2)', () => {
  it('flips the Send button into its sending state the instant a send is handed off', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} emptyState conversationId={null} />);

    submit('summarize the attached file');

    expect(sendButton()).toHaveAttribute('aria-label', 'Sending message…');
  });

  it('survives the empty-state-to-conversation remount WebChatPage performs on first send', () => {
    const onSend = vi.fn();
    const view = render(<ChatComposerNew onSend={onSend} emptyState conversationId={null} />);

    submit('summarize the attached file');
    view.unmount();

    // WebChatPage claims a client-only conversation id and mounts a fresh
    // instance in the other branch of its ternary before the attachment
    // upload this send is waiting on ever resolves -- the sending flag must
    // read back true on THIS instance's very first render, not just the one
    // that set it.
    render(<ChatComposerNew onSend={onSend} conversationId="client-conv-1" isLoading={false} />);

    expect(sendButton()).toHaveAttribute('aria-label', 'Sending message…');
  });

  it('clears once the parent reports the turn actually started', () => {
    const onSend = vi.fn();
    const view = render(<ChatComposerNew onSend={onSend} emptyState conversationId={null} />);
    submit('summarize the attached file');
    view.unmount();

    const { rerender } = render(
      <ChatComposerNew onSend={onSend} conversationId="client-conv-1" isLoading={false} />,
    );
    expect(sendButton()).toHaveAttribute('aria-label', 'Sending message…');

    rerender(<ChatComposerNew onSend={onSend} conversationId="client-conv-1" isLoading />);
    rerender(<ChatComposerNew onSend={onSend} conversationId="client-conv-1" isLoading={false} />);

    expect(sendButton()).toHaveAttribute('aria-label', 'Send message');
  });

  it('never leaves a later, unrelated empty-state mount stuck showing sending', () => {
    const onSend = vi.fn();
    const first = render(<ChatComposerNew onSend={onSend} emptyState conversationId={null} />);
    submit('this send is about to fail');
    first.unmount();

    // The failed send never reaches isTurnActive and, in the case this covers,
    // never hands its content back through prefillText/droppedFiles either
    // (the row already reached the transcript) -- the page falls back to a
    // brand-new bare landing composer, which must not inherit the flag.
    render(<ChatComposerNew onSend={vi.fn()} emptyState conversationId={null} />);

    expect(sendButton()).toHaveAttribute('aria-label', 'Send message');
    expect(sendButton()).toBeDisabled();
  });
});
