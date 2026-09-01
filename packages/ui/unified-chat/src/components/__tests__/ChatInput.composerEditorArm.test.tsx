import '../../composer-editor/__tests__/dom-stubs';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, CHAT_COMPOSER_EDITOR_MODES } from '../ChatInput';
import { COMPOSER_EDITOR_ATTRIBUTE } from '../../composer-editor';
import { LARGE_PASTE_THRESHOLD } from '../../lib/largePaste';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

const CONVERSATION_ID = 'conv-editor';

type ComposerOverrides = Partial<Parameters<typeof ChatInput>[0]>;

async function renderEditorArm(overrides: ComposerOverrides = {}) {
  const onSend = vi.fn();
  const view = render(
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      hasMessages={false}
      conversationId={CONVERSATION_ID}
      composerEditorMode={CHAT_COMPOSER_EDITOR_MODES.editor}
      {...overrides}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector(`[${COMPOSER_EDITOR_ATTRIBUTE}]`)).not.toBeNull(),
  );
  const content = view.container.querySelector(`[${COMPOSER_EDITOR_ATTRIBUTE}]`) as HTMLElement;
  return { onSend, view, content };
}

function draft(): string {
  return useChatStore.getState().draftContent;
}

function setDraft(value: string): void {
  act(() => {
    useChatStore.getState().setDraftContent(value, CONVERSATION_ID);
  });
}

beforeEach(() => {
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    draftContent: '',
    draftsByConversation: {},
    isStreaming: false,
    conversations: [],
  });
  useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
});

afterEach(cleanup);

describe('ChatInput composer editor arm', () => {
  it('renders the editor instead of the textarea and keeps the textbox role', async () => {
    const { view, content } = await renderEditorArm();

    expect(view.container.querySelector('textarea')).toBeNull();
    expect(content.getAttribute('role')).toBe('textbox');
    expect(content.getAttribute('aria-label')).toBe('Chat message input');
    expect(screen.getByRole('textbox')).toBe(content);
  });

  it('seeds the parked draft into the editor when the handle attaches', async () => {
    useChatStore.setState({ draftContent: 'draft from the last visit' });

    const { content } = await renderEditorArm();

    await waitFor(() => expect(content.textContent).toBe('draft from the last visit'));
  });

  it('pushes a store write that did not come from a keystroke into the editor', async () => {
    const { content } = await renderEditorArm();

    setDraft('spoken through the microphone');
    await waitFor(() => expect(content.textContent).toBe('spoken through the microphone'));

    act(() => {
      useChatStore.getState().appendDraftContent('appended context');
    });
    await waitFor(() => expect(content.textContent).toContain('appended context'));
  });

  it('sends on enter and clears the editor with the store', async () => {
    const { onSend, content } = await renderEditorArm();

    setDraft('ship it');
    await waitFor(() => expect(content.textContent).toBe('ship it'));

    fireEvent.keyDown(content, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toBe('ship it');
    await waitFor(() => expect(content.textContent).toBe(''));
    expect(draft()).toBe('');
  });

  it('leaves shift+enter to the editor as a newline', async () => {
    const { onSend, content } = await renderEditorArm();

    setDraft('first line');
    await waitFor(() => expect(content.textContent).toBe('first line'));

    fireEvent.keyDown(content, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    await waitFor(() => expect(draft()).toBe('first line\n'));
  });

  it('honours the mod-enter send shortcut the host asked for', async () => {
    const { onSend, content } = await renderEditorArm({ sendShortcut: 'mod-enter' });

    setDraft('needs a modifier');
    await waitFor(() => expect(content.textContent).toBe('needs a modifier'));

    fireEvent.keyDown(content, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(content, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(content, { key: 'Enter', metaKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('gives enter to the slash menu instead of sending while it is open', async () => {
    const togglePlanMode = vi.fn();
    const { onSend, content } = await renderEditorArm({
      slashCommandHost: { togglePlanMode },
    });

    setDraft('/plan');
    await screen.findByRole('option', { name: /plan/i });

    fireEvent.keyDown(content, { key: 'Enter' });

    expect(togglePlanMode).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    await waitFor(() => expect(draft()).toBe(''));
  });

  it('moves the slash selection with the arrow keys the editor forwards', async () => {
    const { content } = await renderEditorArm({
      supportsImageGeneration: true,
      supportsVideoGeneration: true,
      slashCommandHost: { togglePlanMode: vi.fn() },
    });

    setDraft('/');
    await screen.findByRole('option', { name: /plan/i });

    const selected = () =>
      content.ownerDocument.querySelector('[aria-selected="true"]')?.textContent ?? '';
    const first = selected();

    fireEvent.keyDown(content, { key: 'ArrowDown' });
    await waitFor(() => expect(selected()).not.toBe(first));
  });

  it('turns a paste that crosses the attachment threshold into a file', async () => {
    const { content } = await renderEditorArm();

    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [],
        getData: (type: string) => (type === 'text/plain' ? 'x'.repeat(LARGE_PASTE_THRESHOLD) : ''),
      },
    });
    fireEvent(content, event);

    await waitFor(() => expect(screen.getByText('Pasted text.txt')).not.toBeNull());
    expect(draft()).toBe('');
  });
});
