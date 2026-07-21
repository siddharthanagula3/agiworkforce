import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

// Stub the heavy 6-tab dialog: the wiring under test is "settings button opens
// the dialog for the clicked project", not the dialog internals.
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
  beforeEach(() => {
    useProjectStore.setState({
      projects: [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')],
      isLoading: false,
      loadProjects: vi.fn(async () => undefined),
      createProject: vi.fn(async () => undefined),
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
});
