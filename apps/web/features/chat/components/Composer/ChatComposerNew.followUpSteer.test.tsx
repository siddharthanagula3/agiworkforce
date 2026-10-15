import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ChatComposerNew } from './ChatComposerNew';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
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

function field() {
  return screen.getByRole('textbox', { name: /message input/i });
}

async function send(text: string, invert = false) {
  await userEvent.type(field(), text);
  fireEvent.keyDown(field(), { key: 'Enter', shiftKey: invert, metaKey: invert, ctrlKey: invert });
}
function streamRun() {
  useChatStore.setState({
    messages: [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        isStreaming: true,
        sessionId: 'c1',
        timestamp: new Date(),
        metadata: { cloudAgentRun: { runId: 'run-1' } },
      } as never,
    ],
  });
}

beforeEach(() => {
  localStorage.clear();
  useChatStore.getState().reset();
});

describe('one-message override on MAIN follow-up behavior', () => {
  it('queue setting: Enter queues, no steer', async () => {
    useSettingsStore.setState({ followUpBehavior: 'queue' });
    streamRun();
    const steer = vi.fn(async () => 'steer-1');
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        onStop={vi.fn()}
        isLoading
        isGenerating
        conversationId="c1"
        onSteerQueuedMessage={steer}
      />,
    );
    await send('wait');
    await new Promise((r) => setTimeout(r, 20));
    expect(steer).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('queued-followup')).toHaveLength(1);
  });
  it('queue setting: Cmd/Ctrl+Shift+Enter steers this one into the running reply', async () => {
    useSettingsStore.setState({ followUpBehavior: 'queue' });
    streamRun();
    const steer = vi.fn(async () => 'steer-1');
    const onStop = vi.fn();
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        onStop={onStop}
        isLoading
        isGenerating
        conversationId="c1"
        onSteerQueuedMessage={steer}
      />,
    );
    await send('now', true);
    await waitFor(() => expect(steer).toHaveBeenCalledWith('now'));
    expect(onStop).not.toHaveBeenCalled();
    expect(await screen.findByText(/Sent to the running reply/)).toBeTruthy();
  });
  it('steer setting: Enter steers', async () => {
    useSettingsStore.setState({ followUpBehavior: 'steer' });
    streamRun();
    const steer = vi.fn(async () => 'steer-1');
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        onStop={vi.fn()}
        isLoading
        isGenerating
        conversationId="c1"
        onSteerQueuedMessage={steer}
      />,
    );
    await send('go');
    await waitFor(() => expect(steer).toHaveBeenCalledWith('go'));
  });
  it('steer setting: Cmd/Ctrl+Shift+Enter keeps this one queued', async () => {
    useSettingsStore.setState({ followUpBehavior: 'steer' });
    streamRun();
    const steer = vi.fn(async () => 'steer-1');
    render(
      <ChatComposerNew
        onSend={vi.fn()}
        onStop={vi.fn()}
        isLoading
        isGenerating
        conversationId="c1"
        onSteerQueuedMessage={steer}
      />,
    );
    await send('later', true);
    await new Promise((r) => setTimeout(r, 20));
    expect(steer).not.toHaveBeenCalled();
    expect(screen.getByTestId('queued-followup')).toHaveTextContent('Queued: later');
  });
});
