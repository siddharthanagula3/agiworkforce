import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPOSER_SEND_ACCEPTED, ChatInput, type ChatInputProps } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

const FOLDER = 'customer-research-and-implementation-notes-with-a-long-workspace-name';

function hostControls(onFolder = vi.fn()) {
  return (
    <div
      role="group"
      aria-label="Host execution context"
      style={{ display: 'flex', flexWrap: 'wrap', minWidth: 0, gap: 4 }}
    >
      <button type="button">Terminal: Workspace write</button>
      <button type="button">Approvals: Automatic</button>
      <button type="button" onClick={onFolder}>
        Workspace {FOLDER}
      </button>
    </div>
  );
}

function composer(props: Partial<ChatInputProps> = {}) {
  return (
    <ChatInput
      onSend={vi.fn(() => COMPOSER_SEND_ACCEPTED)}
      onStop={vi.fn()}
      hasMessages
      conversationId="host-layout"
      supportsResearch={false}
      supportsAgentControl={false}
      supportsReasoningEffort={false}
      {...props}
    />
  );
}

describe('composer host context and primary actions', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'host-layout',
      draftContent: 'Keep the primary actions available.',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
  });

  afterEach(() => cleanup());

  it('keeps long host context outside the primary row without changing its actions', () => {
    const onFolder = vi.fn();
    const onSend = vi.fn(() => COMPOSER_SEND_ACCEPTED);
    const { container } = render(composer({ hostControls: hostControls(onFolder), onSend }));
    const context = screen.getByRole('group', { name: 'Host execution context' });
    const hostRow = container.querySelector('[data-composer-host-controls]');
    const primary = container.querySelector('[data-composer-primary-controls]');

    expect(hostRow?.contains(context)).toBe(true);
    expect(primary?.contains(context)).toBe(false);
    expect(primary?.contains(screen.getByRole('button', { name: /add attachment/i }))).toBe(true);
    expect(primary?.contains(screen.getByRole('button', { name: 'Select model' }))).toBe(true);
    const send = screen.getByRole('button', { name: /send message/i });
    expect(primary?.contains(send)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: `Workspace ${FOLDER}` }));
    expect(onFolder).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('keeps host focus while the primary Send slot becomes Stop', () => {
    const controls = hostControls();
    const onStop = vi.fn();
    const view = render(composer({ hostControls: controls, onStop }));
    const folder = screen.getByRole('button', { name: `Workspace ${FOLDER}` });
    folder.focus();
    expect(document.activeElement).toBe(folder);

    view.rerender(composer({ hostControls: controls, onStop, isStreamingOverride: true }));

    expect(document.activeElement).toBe(folder);
    const stop = screen.getByRole('button', { name: 'Stop the current response' });
    expect(view.container.querySelector('[data-composer-primary-controls]')?.contains(stop)).toBe(
      true,
    );
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('does not insert a host row when the surface supplies no controls', () => {
    const { container } = render(composer());
    expect(container.querySelector('[data-composer-host-controls]')).toBeNull();
    expect(screen.getByRole('button', { name: /send message/i })).toBeTruthy();
  });
});
