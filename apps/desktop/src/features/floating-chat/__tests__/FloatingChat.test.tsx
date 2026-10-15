import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StreamListener = (event: { type: string; content?: string; error?: string }) => void;

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  mode: 'local' as 'local' | 'cloud',
  selectedModelId: 'fixture-local-selected',
  listeners: new Set<(event: { type: string; content?: string; error?: string }) => void>(),
  sendMessage: vi.fn(),
  stopGeneration: vi.fn(),
  finishTurn: null as null | (() => void),
}));

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: host.invoke,
  isTauri: true,
}));

vi.mock('../../../runtime/TauriRuntime', () => ({
  TauriRuntime: class {
    onStream(listener: StreamListener) {
      host.listeners.add(listener);
      return () => host.listeners.delete(listener);
    }
    sendMessage(...args: unknown[]) {
      return host.sendMessage(...args);
    }
    stopGeneration(conversationId: string) {
      host.stopGeneration(conversationId);
    }
  },
}));

vi.mock('../../../stores/appModeStore', () => ({
  useAppModeStore: (selector: (state: { mode: string }) => unknown) =>
    selector({ mode: host.mode }),
  selectPrivacyMode: (state: { mode: string }) => (state.mode === 'local' ? 'local' : 'managed'),
}));

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ windowPreferences: { theme: 'dark' } }),
}));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<UnifiedChatModule>();
  return {
    parseDiscoveredChatModels: actual.parseDiscoveredChatModels,
    toUserMessage: actual.toUserMessage,
    useChatModelStore: { getState: () => ({ selectedModelId: host.selectedModelId }) },
    MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { FloatingChat } from '../index';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

const LOCAL_MODELS = [
  { id: 'fixture-local-first', name: 'First local model', provider: 'ollama', available: true },
  {
    id: 'fixture-local-selected',
    name: 'Selected local model',
    provider: 'ollama',
    available: true,
  },
  { id: 'fixture-byok-model', name: 'Keyed model', provider: 'openai', available: true },
];

function emit(event: { type: string; content?: string; error?: string }) {
  act(() => {
    for (const listener of host.listeners) listener(event);
  });
}

function holdTurnOpen() {
  host.sendMessage.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        host.finishTurn = resolve;
      }),
  );
}

async function sendFromComposer(text: string) {
  const composer = await screen.findByLabelText('Message');
  await waitFor(() => expect((composer as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
}

describe('FloatingChat', () => {
  beforeEach(() => {
    host.mode = 'local';
    host.selectedModelId = 'fixture-local-selected';
    host.listeners.clear();
    host.finishTurn = null;
    host.invoke.mockImplementation(async (command: string) =>
      command === 'llm_get_available_models' ? LOCAL_MODELS : undefined,
    );
    host.sendMessage.mockResolvedValue(undefined);
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
  });

  it('renders the streamed reply, which the old window discarded', async () => {
    holdTurnOpen();
    render(<FloatingChat />);

    await sendFromComposer('What is a monad?');
    expect(screen.getByText('What is a monad?')).toBeTruthy();

    emit({ type: 'content', content: 'A monad is ' });
    emit({ type: 'content', content: 'a monoid in the category of endofunctors.' });

    expect(screen.getByText('A monad is a monoid in the category of endofunctors.')).toBeTruthy();

    await act(async () => host.finishTurn?.());
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
  });

  it('sends through the Local runtime on the model picked in the main window', async () => {
    render(<FloatingChat />);

    await sendFromComposer('Hello');

    await waitFor(() => expect(host.sendMessage).toHaveBeenCalledTimes(1));
    expect(host.sendMessage).toHaveBeenCalledWith(expect.any(String), 'Hello', {
      model: 'fixture-local-selected',
      provider: 'ollama',
    });
    expect(screen.getByText('Selected local model · on this device')).toBeTruthy();
    expect(host.invoke).not.toHaveBeenCalledWith('chat_send_message', expect.anything());
  });

  it('never picks a model behind a provider key, even when it is the selected one', async () => {
    host.selectedModelId = 'fixture-byok-model';
    render(<FloatingChat />);

    await sendFromComposer('Hello');

    await waitFor(() => expect(host.sendMessage).toHaveBeenCalledTimes(1));
    expect(host.sendMessage.mock.calls[0]?.[2]).toEqual({
      model: 'fixture-local-first',
      provider: 'ollama',
    });
  });

  it('offers Stop in the send slot while a reply is streaming', async () => {
    holdTurnOpen();
    render(<FloatingChat />);
    await sendFromComposer('Write a long answer');

    fireEvent.click(await screen.findByRole('button', { name: 'Stop generating' }));

    expect(host.stopGeneration).toHaveBeenCalledWith(host.sendMessage.mock.calls[0]?.[0]);
    await act(async () => host.finishTurn?.());
  });

  it('shows why a reply failed instead of leaving the turn blank', async () => {
    holdTurnOpen();
    render(<FloatingChat />);
    await sendFromComposer('Hello');

    emit({ type: 'error', error: 'The local model stopped responding.' });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The local model stopped responding.',
    );
    await act(async () => host.finishTurn?.());
  });

  it('says so when no model runs on this device, and retries on request', async () => {
    host.invoke.mockImplementation(async (command: string) =>
      command === 'llm_get_available_models' ? [LOCAL_MODELS[2]] : undefined,
    );
    render(<FloatingChat />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No model is running on this device.',
    );
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);

    host.invoke.mockImplementation(async (command: string) =>
      command === 'llm_get_available_models' ? LOCAL_MODELS : undefined,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(false),
    );
  });

  it('is granted event listening, without which the stream never reaches the window', () => {
    const read = (file: string) =>
      JSON.parse(readFileSync(resolve(process.cwd(), 'src-tauri', file), 'utf8')) as {
        windows?: string[];
        permissions?: string[];
        app?: { security: { capabilities: string[] } };
      };

    const capability = read('capabilities/floating.json');
    expect(capability.windows).toEqual(['floating']);
    expect(capability.permissions).toEqual([
      'core:event:allow-listen',
      'core:event:allow-unlisten',
    ]);
    expect(read('tauri.conf.json').app?.security.capabilities).toContain('floating');
    expect(read('tauri.conf.wdio.json').app?.security.capabilities).toContain('floating');
  });

  it('does not run a device chat while the app is in Cloud mode', async () => {
    host.mode = 'cloud';
    render(<FloatingChat />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Quick chat runs on this device only.',
    );
    expect(host.invoke).not.toHaveBeenCalledWith('llm_get_available_models');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
