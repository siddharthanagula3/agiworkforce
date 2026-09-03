import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { firstParkedSend, selectParkedSends, useChatStore } from '@shared/stores/web-chat-store';

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
  }),
}));

const PLACEHOLDER_ID = 'client-placeholder-id';
const REAL_ID = 'server-conversation-id';
const FINGERPRINT = 'Actually, forget the file, just say hi|';
const BLOCKED_CONTENT = 'Actually, forget the file, just say hi';

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

function parkedSendNow() {
  return firstParkedSend(selectParkedSends(useChatStore.getState()));
}

beforeEach(() => {
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
});

describe('a blocked send comes back into whichever composer is on screen (files-1)', () => {
  it('restores on a fresh mount, with no prop handoff from the instance that was blocked', () => {
    useChatStore.getState().parkBlockedSend(FINGERPRINT, BLOCKED_CONTENT);

    render(<ChatComposerNew onSend={vi.fn()} conversationId={REAL_ID} />);

    expect(input()).toHaveValue(BLOCKED_CONTENT);
  });

  it('restores again on the next mount, because the slot outlives the composer that showed it', () => {
    useChatStore.getState().parkBlockedSend(FINGERPRINT, BLOCKED_CONTENT);

    const empty = render(<ChatComposerNew onSend={vi.fn()} emptyState conversationId={null} />);
    expect(input()).toHaveValue(BLOCKED_CONTENT);
    empty.unmount();

    render(<ChatComposerNew onSend={vi.fn()} conversationId={PLACEHOLDER_ID} />);

    expect(input()).toHaveValue(BLOCKED_CONTENT);
    expect(parkedSendNow()).not.toBeNull();
  });

  it('survives the placeholder-to-real rename that empties the conversation draft slot', () => {
    useChatStore.getState().parkBlockedSend(FINGERPRINT, BLOCKED_CONTENT);
    const { rerender } = render(
      <ChatComposerNew onSend={vi.fn()} conversationId={PLACEHOLDER_ID} />,
    );
    expect(input()).toHaveValue(BLOCKED_CONTENT);

    rerender(<ChatComposerNew onSend={vi.fn()} conversationId={REAL_ID} />);

    expect(input()).toHaveValue(BLOCKED_CONTENT);
  });

  it('releases the slot exactly once, when the restored message is finally sent', () => {
    const onSend = vi.fn();
    useChatStore.getState().parkBlockedSend(FINGERPRINT, BLOCKED_CONTENT);
    render(<ChatComposerNew onSend={onSend} conversationId={REAL_ID} />);

    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]![0]).toBe(BLOCKED_CONTENT);
    expect(parkedSendNow()).toBeNull();
  });

  it('never overwrites text the user typed while the send was blocked', () => {
    const { rerender } = render(<ChatComposerNew onSend={vi.fn()} conversationId={REAL_ID} />);
    fireEvent.change(input(), { target: { value: 'something else entirely' } });

    useChatStore.getState().parkBlockedSend(FINGERPRINT, BLOCKED_CONTENT);
    rerender(<ChatComposerNew onSend={vi.fn()} conversationId={REAL_ID} />);

    expect(input()).toHaveValue('something else entirely');
    expect(parkedSendNow()).toBeNull();
  });
});
