import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectEditDetailsDialog } from '../ProjectEditDetailsDialog';
import { useProjectStore, type Project } from '../../../stores/projectStore';

const project: Project = {
  id: 'project-1',
  name: 'Launch plan',
  description: 'Coordinate launch work',
  customInstructions: '',
  files: [],
  conversationIds: [],
  isArchived: false,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
  knowledgeBaseFiles: [],
};

describe('ProjectEditDetailsDialog', () => {
  beforeEach(() => {
    useProjectStore.setState({
      updateProject: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders required name and description fields', () => {
    render(<ProjectEditDetailsDialog open onOpenChange={vi.fn()} project={project} />);

    expect(screen.getByRole('dialog', { name: 'Edit details' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name *')).toHaveValue('Launch plan');
    expect(screen.getByLabelText('Description *')).toHaveValue('Coordinate launch work');
  });

  it('requires both fields before saving', async () => {
    const user = userEvent.setup();
    render(<ProjectEditDetailsDialog open onOpenChange={vi.fn()} project={project} />);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeEnabled();

    await user.clear(screen.getByLabelText('Description *'));

    expect(saveButton).toBeDisabled();
  });

  it('saves trimmed details and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const updateProject = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({ updateProject });

    render(<ProjectEditDetailsDialog open onOpenChange={onOpenChange} project={project} />);

    await user.clear(screen.getByLabelText('Name *'));
    await user.type(screen.getByLabelText('Name *'), '  Updated launch  ');
    await user.clear(screen.getByLabelText('Description *'));
    await user.type(screen.getByLabelText('Description *'), '  Updated description  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('project-1', {
        name: 'Updated launch',
        description: 'Updated description',
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
