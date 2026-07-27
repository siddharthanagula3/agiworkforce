/**
 * ConversationHeader.test.tsx — DCL-08.
 *
 * The header was a title and nothing else, so Desktop chat had no rename, no
 * share and no route to artifacts while web's own header offered all three.
 * Actions are now injected: a host that cannot perform one does not pass a
 * handler, and the control is not rendered — the alternative is a visible
 * button that does nothing, which is the defect class removed across the
 * surfaces today.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConversationHeader } from '../ConversationHeader';
import { useChatStore } from '../../stores/chatStore';

function seedConversation(title = 'Quarterly planning') {
  useChatStore.setState({
    activeConversationId: 'c1',
    conversations: [{ id: 'c1', title, messages: [], createdAt: 0, updatedAt: 0 }],
  } as never);
}

describe('ConversationHeader', () => {
  beforeEach(() => {
    seedConversation();
  });

  it('renders no actions when the host supplies no handlers', () => {
    render(<ConversationHeader />);
    expect(screen.getByText('Quarterly planning')).toBeTruthy();
    expect(screen.queryByLabelText('Rename conversation')).toBeNull();
    expect(screen.queryByLabelText('Share conversation')).toBeNull();
    expect(screen.queryByLabelText('Toggle artifacts panel')).toBeNull();
  });

  it('renders only the actions the host can perform', () => {
    render(<ConversationHeader onRename={vi.fn()} />);
    expect(screen.getByLabelText('Rename conversation')).toBeTruthy();
    // Share was not supplied, so it must not appear as a dead control.
    expect(screen.queryByLabelText('Share conversation')).toBeNull();
  });

  it('commits a rename to the store and the host', () => {
    const onRename = vi.fn();
    render(<ConversationHeader onRename={onRename} />);

    fireEvent.click(screen.getByLabelText('Rename conversation'));
    const input = screen.getByLabelText('Conversation title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Roadmap review  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('c1', 'Roadmap review');
    expect(useChatStore.getState().conversations[0]?.title).toBe('Roadmap review');
  });

  it('does not notify the host when the title is unchanged', () => {
    const onRename = vi.fn();
    render(<ConversationHeader onRename={onRename} />);

    fireEvent.click(screen.getByLabelText('Rename conversation'));
    fireEvent.keyDown(screen.getByLabelText('Conversation title'), { key: 'Enter' });

    // A no-op rename should not produce a network write.
    expect(onRename).not.toHaveBeenCalled();
  });

  it('discards the draft on Escape', () => {
    const onRename = vi.fn();
    render(<ConversationHeader onRename={onRename} />);

    fireEvent.click(screen.getByLabelText('Rename conversation'));
    const input = screen.getByLabelText('Conversation title');
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(useChatStore.getState().conversations[0]?.title).toBe('Quarterly planning');
  });

  it('rejects an empty title rather than blanking the conversation', () => {
    const onRename = vi.fn();
    render(<ConversationHeader onRename={onRename} />);

    fireEvent.click(screen.getByLabelText('Rename conversation'));
    const input = screen.getByLabelText('Conversation title');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(useChatStore.getState().conversations[0]?.title).toBe('Quarterly planning');
  });

  it('reports the artifacts panel state to assistive tech', () => {
    render(<ConversationHeader onToggleArtifacts={vi.fn()} artifactsOpen />);
    expect(screen.getByLabelText('Toggle artifacts panel').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
