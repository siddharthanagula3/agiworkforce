import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useBillingStore } from '@shared/stores/web-auth-store';

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

function input() {
  return screen.getByRole('textbox', { name: /message input/i });
}

function send(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key: 'Enter' });
}

beforeEach(() => {
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
  useBillingStore.setState({
    subscription: {
      tier: 'pro',
      display_name: 'Pro',
      status: 'active',
      current_period_end: null,
      plan_name: 'Pro',
    },
    featureFlags: { generic_web_search: true, advanced_model_access: true },
  });
});

// `webSearchEnabled` is ambient and already true on every search-capable model,
// so a command that only set it left the turn with search merely offered.
describe('/search asks for a search rather than allowing one', () => {
  it('sends a per-turn search request the ambient toggle cannot express', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} conversationId="c1" />);

    send('/search what changed in the EU AI Act');

    expect(onSend).toHaveBeenCalledTimes(1);
    const [content, , , meta] = onSend.mock.calls[0]!;
    expect(content).toBe('what changed in the EU AI Act');
    expect(meta).toMatchObject({ searchRequested: true, webSearchEnabled: true });
  });

  it('leaves an ordinary turn with no search request at all', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} conversationId="c1" />);

    send('rewrite this paragraph');

    expect(onSend).toHaveBeenCalledTimes(1);
    const meta = onSend.mock.calls[0]![3];
    expect(meta?.searchRequested).toBeUndefined();
  });

  it('does not carry the request into the next turn', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} conversationId="c1" />);

    send('/search what changed in the EU AI Act');
    send('now summarise that');

    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[1]![3]?.searchRequested).toBeUndefined();
  });
});
