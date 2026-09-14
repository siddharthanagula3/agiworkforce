import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalModel } from '@agiworkforce/local-runtime-contract';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { useLocalModelSelection } from '@features/desktop-host';
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

const CONVERSATION_ID = 'conv-local-attachments';

const LOCAL_MODEL: LocalModel = {
  id: 'local:ollama/qwen2.5:1.5b',
  serverId: 'ollama',
  serverLabel: 'Ollama',
  name: 'qwen2.5:1.5b',
  sizeBillion: 1.5,
};

const REFUSAL =
  'Local models on this device cannot read attachments. Switch to a cloud model or remove the attachment.';

function attach(): void {
  const picker = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!picker) throw new Error('the composer exposes no file input');
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  fireEvent.change(picker, { target: { files: [file] } });
}

beforeEach(() => {
  useChatStore.getState().reset();
  resetSendPendingFlagForTests();
  useLocalModelSelection.getState().select(LOCAL_MODEL);
});

afterEach(() => {
  useLocalModelSelection.getState().select(null);
});

describe('a local turn with an attachment staged', () => {
  it('refuses the send and offers both ways out', async () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} conversationId={CONVERSATION_ID} />);

    attach();
    const notice = await screen.findByTestId('local-attachment-conflict');
    expect(notice.textContent).toContain(REFUSAL);

    fireEvent.change(screen.getByRole('textbox', { name: /message input/i }), {
      target: { value: 'summarise this' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('clears the refusal when the attachments are removed', async () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId={CONVERSATION_ID} />);

    attach();
    await screen.findByTestId('local-attachment-conflict');

    fireEvent.click(screen.getByTestId('local-attachment-remove'));

    await waitFor(() =>
      expect(screen.queryByTestId('local-attachment-conflict')).not.toBeInTheDocument(),
    );
    expect(useLocalModelSelection.getState().selected?.id).toBe(LOCAL_MODEL.id);
  });

  it('clears the refusal when the composer goes back to a cloud model', async () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId={CONVERSATION_ID} />);

    attach();
    await screen.findByTestId('local-attachment-conflict');

    fireEvent.click(screen.getByTestId('local-attachment-switch-cloud'));

    await waitFor(() => expect(useLocalModelSelection.getState().selected).toBeNull());
    expect(screen.queryByTestId('local-attachment-conflict')).not.toBeInTheDocument();
  });

  it('stays quiet when no local model is selected', () => {
    useLocalModelSelection.getState().select(null);
    render(<ChatComposerNew onSend={vi.fn()} conversationId={CONVERSATION_ID} />);

    attach();
    expect(screen.queryByTestId('local-attachment-conflict')).not.toBeInTheDocument();
  });
});
