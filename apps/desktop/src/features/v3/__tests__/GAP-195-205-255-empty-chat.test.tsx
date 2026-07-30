import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInterface, useChatStore } from '@agiworkforce/unified-chat';

import { EmptyChat } from '../EmptyChat';

describe('GAP-195, GAP-205, and GAP-255 desktop empty chat', () => {
  beforeEach(() => {
    useChatStore.getState().setDraftContent('');
    useChatStore.getState().setActiveMode(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('names the active workspace and makes it re-selectable', () => {
    const onSelectWorkspace = vi.fn();

    render(<EmptyChat workspaceLabel="agiworkforce" onSelectWorkspace={onSelectWorkspace} />);

    expect(
      screen.getByRole('heading', { name: 'What should we build in agiworkforce?' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change workspace from agiworkforce' }));
    expect(onSelectWorkspace).toHaveBeenCalledOnce();
  });

  it('prefills executable starter prompts and opens the real schedule surface', () => {
    const onOpenScheduled = vi.fn();
    render(<EmptyChat onOpenScheduled={onOpenScheduled} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create a file or build a site' }));
    expect(useChatStore.getState().draftContent).toBe('Create a file or build a site that ');

    fireEvent.click(screen.getByRole('button', { name: 'Research and plan next steps' }));
    expect(useChatStore.getState().draftContent).toBe(
      'Research this topic and plan the next steps: ',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Automate routine and recurring work' }));
    expect(onOpenScheduled).toHaveBeenCalledOnce();
  });

  it('keeps capability-aware category chips below the composer and seeds their prompts', () => {
    render(
      <ChatInterface
        runtime={null}
        sidebarSlot={null}
        emptyStateSlot={<div>Desktop empty chat</div>}
        enableSearchOverlay={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Code' }));

    expect(useChatStore.getState().draftContent).toBe('Help me write code for ');
  });
});
