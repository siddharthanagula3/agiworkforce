import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { useChatStore } from '@shared/stores/web-chat-store';

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

const CONVERSATION_ID = 'conv-1';
const REASON = 'Your plan usage for this billing period is used up.';
const RESET_AT = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
const ACTION_LABEL = 'Buy credits';

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

beforeEach(() => {
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
});

describe('WEB-CHAT-MESSAGE-LIST-ACCOUNT-WIDE-QUOTA-01 · composer', () => {
  it('says why it is blocked and offers the recovery the server asked for', () => {
    const onRecover = vi.fn();
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={CONVERSATION_ID}
        usageBlock={{
          reason: REASON,
          resetAt: RESET_AT,
          actionLabel: ACTION_LABEL,
          onRecover,
        }}
      />,
    );

    const banner = screen.getByTestId('composer-usage-block');
    expect(banner.textContent).toContain(REASON);
    expect(banner.textContent).toMatch(/Resets in (3 hours|2 hr 59 min)\./);

    fireEvent.click(screen.getByRole('button', { name: ACTION_LABEL }));
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it('refuses the send and routes the attempt to the recovery instead', () => {
    const onSend = vi.fn();
    const onRecover = vi.fn();
    render(
      <ChatComposerNew
        onSend={onSend}
        conversationId={CONVERSATION_ID}
        usageBlock={{ reason: REASON, actionLabel: ACTION_LABEL, onRecover }}
      />,
    );

    fireEvent.change(input(), { target: { value: 'one more question' } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
    expect(onRecover).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue('one more question');
  });

  // The leader's usage states name the wait, and a wait formatted once and left
  // alone stops being true while the banner is still on screen.
  it('keeps the wait current instead of freezing it at the moment of refusal', () => {
    vi.useFakeTimers();
    try {
      render(
        <ChatComposerNew
          onSend={vi.fn()}
          conversationId={CONVERSATION_ID}
          usageBlock={{ reason: REASON, resetAt: new Date(Date.now() + 3_600_000).toISOString() }}
        />,
      );

      expect(screen.getByTestId('composer-usage-block').textContent).toMatch(/Resets in 1 hour\./);

      act(() => {
        vi.advanceTimersByTime(31 * 60 * 1000);
      });

      expect(screen.getByTestId('composer-usage-block').textContent).toMatch(
        /Resets in 29 min\.|Resets in 28 min\./,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays out of the way when the account has capacity', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId={CONVERSATION_ID} />);

    expect(screen.queryByTestId('composer-usage-block')).toBeNull();
  });

  it('shows one banner, not two, when the free trial is also exhausted', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={CONVERSATION_ID}
        freeTrial={{ enabled: true, limitReached: true }}
        usageBlock={{ reason: REASON, actionLabel: ACTION_LABEL, onRecover: vi.fn() }}
      />,
    );

    expect(screen.getByText('Free usage limit reached. Upgrade to continue.')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-usage-block')).toBeNull();
  });

  it('renders the reason alone when the block offers no way out', () => {
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        conversationId={CONVERSATION_ID}
        usageBlock={{ reason: REASON }}
      />,
    );

    expect(screen.getByTestId('composer-usage-block').textContent).toContain(REASON);
    expect(screen.queryByRole('button', { name: ACTION_LABEL })).toBeNull();
  });
});
