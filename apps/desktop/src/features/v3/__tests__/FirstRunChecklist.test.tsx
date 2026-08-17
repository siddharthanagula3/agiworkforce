import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@agiworkforce/unified-chat';

import { EmptyChat } from '../EmptyChat';

describe('DESK-96 desktop first-run onboarding checklist', () => {
  beforeEach(() => {
    useChatStore.getState().setDraftContent('');
  });

  afterEach(() => {
    cleanup();
  });

  it('lists every unfinished setup step and marks the finished ones done', () => {
    render(
      <EmptyChat
        workspaceLabel="agiworkforce"
        onSelectWorkspace={vi.fn()}
        onSetUpLocalModel={vi.fn()}
        needsLocalModelSetup
        onOpenConnectors={vi.fn()}
        hasConnectedTools={false}
      />,
    );

    expect(screen.getByTestId('v3-first-run-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('v3-checklist-workspace')).toHaveAttribute('data-done', 'true');
    expect(screen.getByTestId('v3-checklist-local-model')).toHaveAttribute('data-done', 'false');
    expect(screen.getByTestId('v3-checklist-connectors')).toHaveAttribute('data-done', 'false');
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
  });

  it('routes each step to the real surface that finishes it', () => {
    const onSelectWorkspace = vi.fn();
    const onSetUpLocalModel = vi.fn();
    const onOpenConnectors = vi.fn();

    render(
      <EmptyChat
        onSelectWorkspace={onSelectWorkspace}
        onSetUpLocalModel={onSetUpLocalModel}
        needsLocalModelSetup
        onOpenConnectors={onOpenConnectors}
      />,
    );

    fireEvent.click(screen.getByTestId('v3-checklist-workspace'));
    fireEvent.click(screen.getByTestId('v3-checklist-local-model'));
    fireEvent.click(screen.getByTestId('v3-checklist-connectors'));

    expect(onSelectWorkspace).toHaveBeenCalledOnce();
    expect(onSetUpLocalModel).toHaveBeenCalledOnce();
    expect(onOpenConnectors).toHaveBeenCalledOnce();
  });

  it('disappears once every step is finished', () => {
    render(
      <EmptyChat
        workspaceLabel="agiworkforce"
        onSelectWorkspace={vi.fn()}
        onSetUpLocalModel={vi.fn()}
        needsLocalModelSetup={false}
        onOpenConnectors={vi.fn()}
        hasConnectedTools
      />,
    );

    expect(screen.queryByTestId('v3-first-run-checklist')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create a file or build a site' })).toBeEnabled();
  });
});
