import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInterface, type ChatRuntime, useChatStore } from '@agiworkforce/unified-chat';

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

  it('does not restore removed composer quick-action chips around the desktop empty state', () => {
    const runtime = {
      supportsCodeExecution: true,
      supportsResearch: true,
      supportsImageGeneration: true,
      supportsVideoGeneration: true,
      supportsComputerUse: true,
    } as ChatRuntime;

    render(
      <ChatInterface
        runtime={runtime}
        sidebarSlot={null}
        emptyStateSlot={<div>Desktop empty chat</div>}
        enableSearchOverlay={false}
      />,
    );

    expect(screen.getByText('Desktop empty chat')).toBeInTheDocument();
    for (const label of ['Code', 'Research', 'Image', 'Video', 'Computer']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });
});
