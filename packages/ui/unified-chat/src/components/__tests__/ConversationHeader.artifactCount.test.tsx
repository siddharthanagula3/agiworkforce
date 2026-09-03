import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConversationHeader } from '../ConversationHeader';
import { useChatStore } from '../../stores/chatStore';

beforeEach(() => {
  useChatStore.setState({
    activeConversationId: 'c1',
    conversations: [{ id: 'c1', title: 'Landing page', messages: [], createdAt: 0, updatedAt: 0 }],
  } as never);
});

afterEach(cleanup);

describe('ConversationHeader artifact count', () => {
  it('folds the count into the accessible name and renders it visibly', () => {
    render(<ConversationHeader onToggleArtifacts={vi.fn()} artifactCount={3} />);

    const toggle = screen.getByLabelText('Toggle artifacts panel (3)');
    expect(toggle.textContent).toContain('3');
  });

  it('omits the count entirely when the conversation has none', () => {
    render(<ConversationHeader onToggleArtifacts={vi.fn()} artifactCount={0} />);

    const toggle = screen.getByLabelText('Toggle artifacts panel');
    expect(toggle.textContent).toBe('');
  });

  it('still renders no toggle when the host passes no handler', () => {
    render(<ConversationHeader artifactCount={5} />);
    expect(screen.queryByLabelText(/Toggle artifacts panel/)).toBeNull();
  });

  it('reflects the open state for assistive technology', () => {
    render(<ConversationHeader onToggleArtifacts={vi.fn()} artifactCount={2} artifactsOpen />);
    expect(screen.getByLabelText('Toggle artifacts panel (2)').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
