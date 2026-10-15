import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ArtifactPanel, type ArtifactPanelHostAction } from '../ArtifactPanel';
import type { Artifact } from '../../lib/types';

const artifact: Artifact = { id: 'doc-1', type: 'markdown', title: 'Notes', content: '# Hi' };

function renderPanel(hostActions: ArtifactPanelHostAction[]) {
  render(
    <ArtifactPanel
      artifact={artifact}
      viewMode="code"
      onViewModeChange={() => {}}
      onClose={() => {}}
      hostActions={hostActions}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
}

describe('ArtifactPanel host actions', () => {
  it('lists host actions in the options menu and runs one with the artifact on screen', () => {
    const onSelect = vi.fn();
    renderPanel([{ id: 'pin', label: 'Pin to gallery', onSelect }]);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin to gallery' }));

    expect(onSelect).toHaveBeenCalledWith(artifact);
  });

  it('asks before an action that cannot be undone and names its consequence', () => {
    const onSelect = vi.fn();
    renderPanel([
      {
        id: 'delete',
        label: 'Delete',
        destructive: true,
        confirm: {
          title: 'Delete this artifact?',
          description: 'Every saved version is permanently removed.',
          confirmLabel: 'Delete artifact',
        },
        onSelect,
      },
    ]);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onSelect).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Every saved version is permanently removed.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete artifact' }));

    expect(onSelect).toHaveBeenCalledWith(artifact);
  });

  it('shows only Download and Publish when the host offers nothing', () => {
    renderPanel([]);

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Download',
      'Publish',
    ]);
  });
});
