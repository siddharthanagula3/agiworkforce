import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: false as boolean,
  prefersReducedMotion: false as boolean,
}));

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: host.invoke,
  get isTauri() {
    return host.isTauri;
  },
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  useReducedMotion: () => host.prefersReducedMotion,
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { useChatStore } from '../../../stores/chat/chatStore';
import type { Project } from '../../../stores/projectStore';
import { ProjectSettingsDialog } from '../ProjectSettingsDialog';

const EDIT_PROJECT: Project = {
  id: 'project-1',
  name: 'Native project',
  description: 'A project used to exercise the edit dialog.',
  customInstructions: '',
  files: [],
  conversationIds: [],
  isArchived: false,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
};

describe('ProjectSettingsDialog host-aware rendering', () => {
  beforeEach(() => {
    host.isTauri = false;
    host.prefersReducedMotion = false;
    useAppModeStore.setState({ mode: 'local' });
    useChatStore.setState({ conversations: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(
    [
      {
        host: 'Tauri',
        isTauri: true,
        prefersReducedMotion: false,
        animationDisabled: true,
      },
      {
        host: 'non-Tauri',
        isTauri: false,
        prefersReducedMotion: false,
        animationDisabled: false,
      },
      {
        host: 'reduced-motion',
        isTauri: false,
        prefersReducedMotion: true,
        animationDisabled: true,
      },
    ].flatMap((hostCase) => [
      {
        ...hostCase,
        mode: 'create' as const,
        project: undefined,
        title: 'Create a project',
      },
      {
        ...hostCase,
        mode: 'edit' as const,
        project: EDIT_PROJECT,
        title: 'Edit Project',
      },
    ]),
  )(
    '$host renders the $mode branch with the correct motion policy and dismisses on Escape',
    async ({ isTauri, prefersReducedMotion, animationDisabled, mode, project, title }) => {
      host.isTauri = isTauri;
      host.prefersReducedMotion = prefersReducedMotion;
      const onOpenChange = vi.fn();

      render(
        <ProjectSettingsDialog open mode={mode} project={project} onOpenChange={onOpenChange} />,
      );

      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      const dialog = screen.getByRole('dialog');
      const overlay = dialog.previousElementSibling as HTMLElement | null;

      expect(overlay).not.toBeNull();
      if (animationDisabled) {
        expect(dialog.className).not.toContain('animate-in');
        expect(overlay?.className).not.toContain('animate-in');
      } else {
        expect(dialog.className).toContain('animate-in');
        expect(overlay?.className).toContain('animate-in');
      }

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    },
  );
});
