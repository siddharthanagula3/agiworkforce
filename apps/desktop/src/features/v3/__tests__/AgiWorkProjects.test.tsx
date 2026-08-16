import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectStore, type Project } from '../../../stores/projectStore';
import { AgiWorkProjects } from '../AgiWorkProjects';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'agiWork.projects.title': 'Projects',
        'agiWork.projects.newProject': 'New project',
        'agiWork.projects.empty': 'No projects yet',
        'agiWork.projects.settings': 'Project settings',
        'agiWork.projects.updated': `Updated ${params?.['when'] ?? ''}`,
        'agiWork.projects.sessions': `${params?.['count'] ?? 0} sessions`,
        'common.loading': 'Loading…',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../chat/ProjectSettingsDialog', () => ({
  ProjectSettingsDialog: ({ open, project }: { open: boolean; project: Project | null }) =>
    open ? <div data-testid="settings-dialog">{project?.id ?? 'none'}</div> : null,
}));

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    description: '',
    customInstructions: '',
    files: [],
    conversationIds: [],
    isArchived: false,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
  };
}

describe('AgiWorkProjects settings wiring', () => {
  const updateProject = vi.fn(async (id: string, updates: Partial<Project>) => {
    useProjectStore.setState((state) => ({
      projects: state.projects.map((project) =>
        project.id === id ? { ...project, ...updates } : project,
      ),
    }));
  });

  beforeEach(() => {
    updateProject.mockClear();
    useProjectStore.setState({
      projects: [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')],
      isLoading: false,
      loadProjects: vi.fn(async () => undefined),
      createProject: vi.fn(async () => undefined),
      updateProject,
      unarchiveProject: vi.fn(async () => undefined),
    } as unknown as Partial<ReturnType<typeof useProjectStore.getState>>);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a settings trigger per project and opens the dialog for the clicked project', () => {
    render(<AgiWorkProjects />);

    const triggers = screen.getAllByRole('button', { name: 'Project settings' });
    expect(triggers).toHaveLength(2);
    expect(screen.queryByTestId('settings-dialog')).toBeNull();

    fireEvent.click(triggers[1]!);

    const dialog = screen.getByTestId('settings-dialog');
    expect(dialog).toHaveTextContent('p2');
  });

  it('matches Web project discovery with search, sorting, and starring', async () => {
    render(<AgiWorkProjects />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), {
      target: { value: 'Beta' },
    });
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Beta')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Star Beta' }));
    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('p2', { isStarred: true });
    });
    expect(screen.getByRole('button', { name: 'Unstar Beta' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Sort projects' })).toBeTruthy();
  });
});
