import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectGallery } from '../ProjectGallery';
import { useProjectStore } from '../../stores/projectStore';

beforeEach(() => {
  useProjectStore.setState({ projects: [], activeProjectId: null });
});

describe('ProjectGallery, enhanced create UX', () => {
  it('gives the shared project search a stable accessible name', () => {
    render(<ProjectGallery />);
    expect(screen.getByRole('searchbox', { name: 'Search projects' })).toBeDefined();
  });

  it('opens the create form when New is clicked', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.getByTestId('project-create-form')).toBeDefined();
    expect(screen.getByTestId('project-create-name-input')).toBeDefined();
    expect(screen.getByTestId('project-create-emoji-trigger')).toBeDefined();
    expect(screen.getByTestId('project-create-presets')).toBeDefined();
  });

  it('toggles the emoji picker when the emoji trigger is clicked', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.queryByTestId('project-create-emoji-picker')).toBeNull();
    await userEvent.click(screen.getByTestId('project-create-emoji-trigger'));
    expect(screen.getByTestId('project-create-emoji-picker')).toBeDefined();
  });

  it('selects an emoji from the picker and closes the picker', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.click(screen.getByTestId('project-create-emoji-trigger'));
    const picker = screen.getByTestId('project-create-emoji-picker');
    const options = picker.querySelectorAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    await userEvent.click(options[1]!);
    expect(screen.queryByTestId('project-create-emoji-picker')).toBeNull();
    await userEvent.type(screen.getByTestId('project-create-name-input'), 'Picked');
    fireEvent.submit(screen.getByTestId('project-create-form'));
    expect(useProjectStore.getState().projects[0]!.iconEmoji).toBe('code');
  });

  it('applies a preset to the name + emoji when the chip is clicked', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.click(screen.getByTestId('project-create-preset-coding'));
    const input = screen.getByTestId('project-create-name-input') as HTMLInputElement;
    expect(input.value).toBe('Coding');
    fireEvent.submit(screen.getByTestId('project-create-form'));
    expect(useProjectStore.getState().projects[0]!.iconEmoji).toBe('code');
  });

  it('submits the form and adds the project with iconEmoji + accentColor', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.click(screen.getByTestId('project-create-preset-research'));
    const form = screen.getByTestId('project-create-form');
    fireEvent.submit(form);
    const projects = useProjectStore.getState().projects;
    expect(projects.length).toBe(1);
    expect(projects[0]!.name).toBe('Research');
    expect(projects[0]!.iconEmoji).toBe('brain');
    expect(projects[0]!.accentColor).toBe('emerald');
  });

  it('adds the canonical project returned by a managed host to the shared view model', async () => {
    const onCreate = vi.fn().mockResolvedValue({
      id: 'project_server_1',
      name: 'Cloud project',
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    });

    render(<ProjectGallery onCreate={onCreate} />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.type(screen.getByTestId('project-create-name-input'), 'Cloud project');
    fireEvent.submit(screen.getByTestId('project-create-form'));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Cloud project',
        iconEmoji: 'folder',
        accentColor: 'zinc',
      });
      expect(useProjectStore.getState().projects).toEqual([
        expect.objectContaining({ id: 'project_server_1', name: 'Cloud project' }),
      ]);
    });
  });

  it('keeps the form open and shows an error when managed creation fails', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Cloud project creation failed'));

    render(<ProjectGallery onCreate={onCreate} />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.type(screen.getByTestId('project-create-name-input'), 'Retry me');
    fireEvent.submit(screen.getByTestId('project-create-form'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Cloud project creation failed',
    );
    expect(screen.queryByTestId('project-create-form')).not.toBeNull();
    expect(useProjectStore.getState().projects).toEqual([]);
  });

  it('omits the iconEmoji when the user picks the default folder emoji', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    const input = screen.getByTestId('project-create-name-input') as HTMLInputElement;
    await userEvent.type(input, 'Generic project');
    const form = screen.getByTestId('project-create-form');
    fireEvent.submit(form);
    const projects = useProjectStore.getState().projects;
    expect(projects.length).toBe(1);
    expect(projects[0]!.name).toBe('Generic project');
    expect(projects[0]!.iconEmoji).toBe('folder');
    expect(projects[0]!.accentColor).toBe('zinc');
  });

  it('resets the form state on cancel', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.click(screen.getByTestId('project-create-preset-writing'));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    const input = screen.getByTestId('project-create-name-input') as HTMLInputElement;
    expect(input.value).toBe('');
    await userEvent.type(input, 'After cancel');
    fireEvent.submit(screen.getByTestId('project-create-form'));
    expect(useProjectStore.getState().projects[0]!.iconEmoji).toBe('folder');
    expect(useProjectStore.getState().projects[0]!.accentColor).toBe('zinc');
  });
});

describe('ProjectGallery, safe error recovery', () => {
  it.each([
    [
      'HTTP 400: Your Free plan includes 1 project folder. Upgrade to add more.',
      'Your Free plan includes 1 project folder. Upgrade to add more.',
    ],
    [
      'HTTP 500: SELECT secret FROM accounts',
      'Something went wrong on our side. Try again shortly.',
    ],
    ['Failed to fetch', 'Could not reach the server.'],
  ])('shows helpful text for %s without losing the draft', async (raw, expected) => {
    const onCreate = vi.fn().mockRejectedValue(new Error(raw));
    render(<ProjectGallery onCreate={onCreate} />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.type(screen.getByTestId('project-create-name-input'), 'Keep my draft');
    fireEvent.submit(screen.getByTestId('project-create-form'));
    expect((await screen.findByRole('alert')).textContent).toBe(expected);
    expect((screen.getByTestId('project-create-name-input') as HTMLInputElement).value).toBe(
      'Keep my draft',
    );
    expect(useProjectStore.getState().projects).toEqual([]);
    onCreate.mockResolvedValueOnce({ id: 'recovered-project', name: 'Keep my draft' });
    fireEvent.submit(screen.getByTestId('project-create-form'));
    await waitFor(() =>
      expect(useProjectStore.getState().projects[0]?.id).toBe('recovered-project'),
    );
  });
});

describe('ProjectGallery, empty states', () => {
  const seed = (extra: Array<Record<string, unknown>> = []) =>
    useProjectStore.setState({
      projects: [
        { id: 'a', name: 'Alpha', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'b', name: 'Beta', createdAt: '2026-01-02', updatedAt: '2026-01-02' },
        ...extra,
      ] as never,
    });

  it('offers search recovery, not creation, when a query matches nothing', async () => {
    seed();
    render(<ProjectGallery />);
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'zzz');
    expect(screen.getByText('No projects match "zzz".')).toBeDefined();
    expect(screen.getByTestId('projects-clear-search')).toBeDefined();
    expect(screen.queryByText(/Create one to group/)).toBeNull();
    expect(screen.getByRole('button', { name: /new/i })).toBeDefined();
  });

  it('says only loaded projects were searched when more are available', async () => {
    seed();
    render(<ProjectGallery moreAvailable />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'zzz');
    expect(screen.getByText('No match in the projects loaded so far.')).toBeDefined();
    expect(screen.queryByText(/No projects match/)).toBeNull();
  });

  it('clears the query, restores every project and refocuses the search box', async () => {
    seed();
    render(<ProjectGallery />);
    const input = screen.getByRole('searchbox', { name: 'Search projects' }) as HTMLInputElement;
    await userEvent.type(input, 'zzz');
    await userEvent.click(screen.getByTestId('projects-clear-search'));
    expect(input.value).toBe('');
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(document.activeElement).toBe(input);
  });

  it('keeps the creation state for an empty collection', () => {
    render(<ProjectGallery />);
    expect(screen.getByText('No projects yet.')).toBeDefined();
    expect(screen.getByText(/Create one to group/)).toBeDefined();
    expect(screen.queryByTestId('projects-clear-search')).toBeNull();
    expect(screen.getByRole('button', { name: /new/i })).toBeDefined();
  });

  it('treats an archived-only collection as empty even with a query', async () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'x',
          name: 'Old',
          isArchived: true,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ] as never,
    });
    render(<ProjectGallery />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'old');
    expect(screen.getByText('No projects yet.')).toBeDefined();
    expect(screen.queryByText(/No projects match/)).toBeNull();
    expect(screen.queryByTestId('projects-clear-search')).toBeNull();
  });
});
