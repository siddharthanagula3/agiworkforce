import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createProject = vi.hoisted(() => vi.fn());

vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: { createProject },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@features/projects/stores/project-store', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({ addProject: vi.fn() } as never),
}));

const { CreateProjectDialog } = await import('./CreateProjectDialog');
const { PROJECT_TEMPLATES } = await import('@/features/projects/data/project-templates');

function open() {
  return render(<CreateProjectDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  createProject.mockResolvedValue({ id: 'project-1', name: 'Research' });
});

describe('CreateProjectDialog — templates', () => {
  it('offers every template', async () => {
    open();

    for (const template of PROJECT_TEMPLATES) {
      expect(await screen.findByRole('button', { name: template.label })).toBeInTheDocument();
    }
  });

  it('starts on Blank so the default path is unchanged', async () => {
    open();

    const blank = await screen.findByRole('button', { name: 'Blank' });
    expect(blank).toHaveAttribute('aria-pressed', 'true');
  });

  it('fills the name when the field is untouched', async () => {
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Research' }));

    expect(screen.getByLabelText('Project name')).toHaveValue('Research');
  });

  it('never overwrites a name the user typed', async () => {
    open();
    const input = await screen.findByLabelText('Project name');
    await userEvent.type(input, 'Q3 competitive analysis');

    await userEvent.click(screen.getByRole('button', { name: 'Research' }));

    expect(input).toHaveValue('Q3 competitive analysis');
  });

  it('replaces another template’s suggestion when switching', async () => {
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Research' }));
    await userEvent.click(screen.getByRole('button', { name: 'Writing' }));

    expect(screen.getByLabelText('Project name')).toHaveValue('Writing');
  });

  it('sends the template’s instructions with the create request', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Engineering' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    const payload = createProject.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['name']).toBe('Engineering');
    expect(String(payload['instructions'])).toContain('codebase');
  });

  it('sends no description or instructions for Blank', async () => {
    open();
    await userEvent.type(await screen.findByLabelText('Project name'), 'Untitled work');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    const payload = createProject.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('instructions');
    expect(payload).not.toHaveProperty('description');
  });
});
