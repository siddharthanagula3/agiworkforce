import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManagedCloudProjectUpdateRequestSchema } from '@agiworkforce/cloud-contracts';

const updateProject = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: { updateProject, deleteProject: vi.fn() },
}));
vi.mock('../KnowledgeFilesPanel', () => ({ KnowledgeFilesPanel: () => null }));
vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({
    skills: [
      {
        name: 'brand-voice',
        description: 'Write in the brand voice',
        source: 'user',
        requiredTools: [],
      },
    ],
    loading: false,
    error: null,
  }),
}));

import { ProjectSettingsDialog } from '../ProjectSettingsDialog';
import type { Project } from '@features/projects/stores/project-store';

function renderDialog(project: Partial<Project> = {}) {
  const onUpdate = vi.fn();
  render(
    <ProjectSettingsDialog
      open
      onOpenChange={vi.fn()}
      project={
        {
          id: 'proj_defaults',
          name: 'Data work',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          ...project,
        } as unknown as Project
      }
      onUpdate={onUpdate}
      onDelete={vi.fn()}
    />,
  );
  return { onUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateProject.mockResolvedValue({});
});

describe('ProjectSettingsDialog chat defaults', () => {
  it('saves the tools and Skill new chats in the project start with', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDialog();

    await user.click(screen.getByRole('checkbox', { name: 'Run code' }));
    await user.selectOptions(screen.getByLabelText('Skill'), 'brand-voice');
    await user.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const sent = updateProject.mock.calls[0]![1];
    expect(sent.chatDefaults).toEqual({ codeExecution: true, skillName: 'brand-voice' });
    expect(ManagedCloudProjectUpdateRequestSchema.safeParse(sent).success).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith(
      'proj_defaults',
      expect.objectContaining({ chatDefaults: { codeExecution: true, skillName: 'brand-voice' } }),
    );
  });

  it('shows saved defaults and leaves them out of a save that did not change them', async () => {
    const user = userEvent.setup();
    renderDialog({ chatDefaults: { research: true, skillName: 'retired-skill' } });

    expect(screen.getByRole('checkbox', { name: 'Research' })).toBeChecked();
    expect(screen.getByLabelText('Skill')).toHaveValue('retired-skill');
    expect(
      screen.getByRole('option', { name: /retired-skill \(no longer in your Skills\)/ }),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Project name'));
    await user.type(screen.getByLabelText('Project name'), 'Renamed');
    await user.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(updateProject.mock.calls[0]![1]).not.toHaveProperty('chatDefaults');
  });
});
