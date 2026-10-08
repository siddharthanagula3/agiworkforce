import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ManagedCloudProjectUpdateRequestSchema,
  PROJECT_INSTRUCTIONS_MAX_LENGTH,
} from '@agiworkforce/cloud-contracts';

const updateProject = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: { updateProject, deleteProject: vi.fn() },
}));
vi.mock('../KnowledgeFilesPanel', () => ({ KnowledgeFilesPanel: () => null }));

import { ProjectSettingsDialog } from '../ProjectSettingsDialog';
import type { Project } from '@features/projects/stores/project-store';

const PROJECT = {
  id: 'proj_desc',
  name: 'Launch plan',
  description: 'Everything for the September launch.',
  instructions: 'Always cite project sources.',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as unknown as Project;

function renderDialog() {
  const onUpdate = vi.fn();
  render(
    <ProjectSettingsDialog
      open
      onOpenChange={vi.fn()}
      project={PROJECT}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
    />,
  );
  return { onUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateProject.mockResolvedValue(PROJECT);
});

describe('ProjectSettingsDialog description', () => {
  it('clears saved instructions using an explicit null update', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDialog();
    const field = screen.getByLabelText('Instructions');
    expect(field).toHaveValue('Always cite project sources.');

    await user.clear(field);
    await user.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(JSON.parse(JSON.stringify(updateProject.mock.calls[0]![1]))).toMatchObject({
      instructions: null,
    });
    expect(onUpdate).toHaveBeenCalledWith(
      'proj_desc',
      expect.objectContaining({ instructions: undefined }),
    );
  });

  it('stops instructions at the length the server accepts and counts toward it', () => {
    renderDialog();

    expect(screen.getByLabelText('Instructions')).toHaveAttribute(
      'maxLength',
      String(PROJECT_INSTRUCTIONS_MAX_LENGTH),
    );
    expect(
      screen.getByText(
        `${'Always cite project sources.'.length} / ${PROJECT_INSTRUCTIONS_MAX_LENGTH.toLocaleString()}`,
      ),
    ).toBeInTheDocument();
    expect(
      ManagedCloudProjectUpdateRequestSchema.safeParse({
        instructions: 'x'.repeat(PROJECT_INSTRUCTIONS_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      ManagedCloudProjectUpdateRequestSchema.safeParse({
        instructions: 'x'.repeat(PROJECT_INSTRUCTIONS_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it('shows the saved description and persists an edit', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDialog();

    const field = screen.getByLabelText('Description');
    expect(field).toHaveValue('Everything for the September launch.');

    await user.clear(field);
    await user.type(field, 'Launch checklist and owners');
    await user.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(updateProject.mock.calls[0]![1]).toMatchObject({
      description: 'Launch checklist and owners',
    });
    expect(onUpdate).toHaveBeenCalledWith(
      'proj_desc',
      expect.objectContaining({ description: 'Launch checklist and owners' }),
    );
  });

  it('clears the description on the server when the field is emptied', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Description'));
    await user.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(updateProject.mock.calls[0]![1]).toMatchObject({ description: null });
  });
});
