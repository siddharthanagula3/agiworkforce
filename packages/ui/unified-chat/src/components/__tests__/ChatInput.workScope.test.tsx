/**
 * Chat | AGI Work toggle + "Project or folder" picker (web ChatComposerNew
 * parity, host-fed). The toggle and picker exist ONLY when the host feeds
 * `projectPicker`; hosts that don't (mobile) get the unchanged composer and
 * the unchanged onSend signature.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, type ChatInputProps } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

function renderComposer(overrides: Partial<ChatInputProps> = {}) {
  const onSend = vi.fn();
  const view = render(
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages={false}
      conversationId="conv-1"
      {...overrides}
    />,
  );
  return { onSend, view, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
}

function makePicker(overrides: Partial<NonNullable<ChatInputProps['projectPicker']>> = {}) {
  return {
    projects: [
      { id: 'p1', name: 'Apollo' },
      { id: 'p2', name: 'Zephyr' },
    ],
    activeProjectId: null,
    onSelectProject: vi.fn(),
    ...overrides,
  };
}

describe('ChatInput work scope (Chat | AGI Work toggle + project/folder picker)', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
    });
    useModelStore.setState({ selectedModelId: 'auto-economy' });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders host-owned enforcement controls without interpreting them', () => {
    renderComposer({
      hostControls: <span data-testid="host-policy">Terminal: Read-only</span>,
    });

    expect(screen.getByTestId('host-policy').textContent).toBe('Terminal: Read-only');
  });

  it('sends explicit Local Web search as a one-turn scope and clears it afterward', () => {
    const { onSend, textarea } = renderComposer({ supportsExplicitLocalWebSearch: true });

    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search the web' }));
    fireEvent.change(textarea, { target: { value: 'Find current release notes' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/ }));

    expect(onSend.mock.calls[0]?.[8]).toBe('web_search');

    fireEvent.change(textarea, { target: { value: 'Now answer locally' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/ }));
    expect(onSend.mock.calls[1]?.[8]).toBeUndefined();
  });

  it('uses the host-selected Command/Ctrl+Enter submission gesture', () => {
    const { onSend, textarea } = renderComposer({ sendShortcut: 'mod-enter' });
    fireEvent.change(textarea, { target: { value: 'Keep Enter for a newline' } });

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(onSend).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Send message (Cmd/Ctrl+Enter)' })).not.toBeNull();
  });

  it('selects a host-admitted skill and forwards its exact catalog name with the turn', () => {
    const { onSend, textarea } = renderComposer({
      skills: [
        {
          id: 'fixture-reviewed-skill',
          name: 'fixture-reviewed-skill',
          category: 'bundled',
        },
      ],
    });

    fireEvent.change(textarea, { target: { value: 'Review this @fixture' } });
    fireEvent.click(screen.getByRole('option', { name: /fixture-reviewed-skill/i }));

    expect(textarea.value).toBe('Review this');
    expect(screen.getByText('Skill: fixture-reviewed-skill')).not.toBeNull();

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith(
      'Review this',
      'ask',
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      'fixture-reviewed-skill',
    );
    expect(screen.queryByText('Skill: fixture-reviewed-skill')).toBeNull();
  });

  it('renders no toggle and keeps the unchanged send signature when the host feeds no picker', () => {
    const { onSend, textarea } = renderComposer();

    expect(screen.queryByRole('group', { name: 'Composer mode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'AGI Work' })).toBeNull();

    fireEvent.change(textarea, { target: { value: 'Plain send' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    // Exact-arity assertion: no scope argument leaks into picker-less hosts.
    expect(onSend).toHaveBeenCalledWith('Plain send', 'ask', undefined, undefined, false);
  });

  it('renders the toggle when the host feeds the picker, and AGI Work reveals the scope chip', () => {
    renderComposer({ projectPicker: makePicker() });

    expect(screen.queryByRole('group', { name: 'Composer mode' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Project or folder' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));

    expect(screen.getByRole('button', { name: 'AGI Work' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Project or folder' })).not.toBeNull();
  });

  it('keeps ordinary project chat but withholds AGI Work when the host denies the entitlement', () => {
    const picker = makePicker({ activeProjectId: 'p1' });
    const { onSend, textarea } = renderComposer({
      projectPicker: picker,
      canUseAgiWork: false,
      agiWorkUnavailableReason:
        'AGI Work is not available for this local model. Project chat still works.',
      onSelectFolder: vi.fn(),
    });

    expect(screen.queryByRole('group', { name: 'Composer mode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'AGI Work' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Project' })).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    expect(screen.getByRole('status').textContent).toContain(
      'AGI Work is not available for this local model. Project chat still works.',
    );
    expect(screen.queryByText(/Choose a local folder/)).toBeNull();

    fireEvent.change(textarea, { target: { value: 'Project chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    expect(onSend).toHaveBeenCalledWith(
      'Project chat',
      'ask',
      undefined,
      undefined,
      false,
      undefined,
      {
        workMode: 'chat',
        projectId: 'p1',
      },
    );
  });

  it('picking a project selects it and displaces any folder (mutual exclusion)', () => {
    const picker = makePicker();
    const onClearFolder = vi.fn();
    renderComposer({
      projectPicker: picker,
      onSelectFolder: vi.fn(),
      onClearFolder,
      currentFolderLabel: 'my-folder',
    });

    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apollo' }));

    expect(picker.onSelectProject).toHaveBeenCalledWith('p1');
    expect(onClearFolder).toHaveBeenCalled();
  });

  it('a newly chosen folder displaces the active project (mutual exclusion, folder side)', () => {
    const picker = makePicker({ activeProjectId: 'p1' });
    const props: Partial<ChatInputProps> = {
      projectPicker: picker,
      onSelectFolder: vi.fn(),
      onClearFolder: vi.fn(),
      currentFolderLabel: null,
    };
    const { view } = renderComposer(props);
    expect(picker.onSelectProject).not.toHaveBeenCalled();

    // Host's native dialog resolves → folder label transitions null → value.
    view.rerender(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        onModelSelectorClick={vi.fn()}
        hasMessages={false}
        conversationId="conv-1"
        {...props}
        currentFolderLabel="chosen-folder"
      />,
    );

    expect(picker.onSelectProject).toHaveBeenCalledWith(null);
  });

  it('stamps workMode + projectId into the send when scoped', () => {
    // A preselected project lands the composer in AGI Work mode automatically.
    const { onSend, textarea } = renderComposer({
      projectPicker: makePicker({ activeProjectId: 'p1' }),
    });

    expect(screen.getByRole('button', { name: 'AGI Work' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.change(textarea, { target: { value: 'Scoped send' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    expect(onSend).toHaveBeenCalledWith(
      'Scoped send',
      'ask',
      undefined,
      undefined,
      false,
      undefined,
      {
        workMode: 'agiwork',
        projectId: 'p1',
      },
    );
  });

  it('switching back to Chat clears the scope selection (no hidden project on a Chat send)', () => {
    const picker = makePicker({ activeProjectId: 'p1' });
    const onClearFolder = vi.fn();
    renderComposer({ projectPicker: picker, onClearFolder });

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));

    expect(picker.onSelectProject).toHaveBeenCalledWith(null);
    expect(onClearFolder).toHaveBeenCalled();
  });

  it('offers the local-folder action only when the host feeds the folder seam', () => {
    const { view } = renderComposer({ projectPicker: makePicker() });

    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
    expect(screen.queryByText(/Choose a local folder/)).toBeNull();
    view.unmount();

    renderComposer({ projectPicker: makePicker(), onSelectFolder: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
    expect(screen.queryByText(/Choose a local folder/)).not.toBeNull();
  });

  it('delegates project creation to the host-owned creation flow', () => {
    const onCreateProject = vi.fn();
    renderComposer({ projectPicker: makePicker({ onCreateProject }) });

    fireEvent.click(screen.getByRole('button', { name: 'AGI Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project or folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(onCreateProject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Create project' })).toBeNull();
  });
});
