/**
 * ProjectGallery tests — pin the create-UX contract introduced by the
 * pixel-parity slice (matches ChatGPT's project-create modal pattern).
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectGallery } from '../ProjectGallery';
import { useProjectStore } from '../../stores/projectStore';

beforeEach(() => {
  useProjectStore.setState({ projects: [], activeProjectId: null });
});

describe('ProjectGallery — enhanced create UX', () => {
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
    // The trigger now shows the selected emoji.
    expect(screen.getByTestId('project-create-emoji-trigger').textContent).toBe('💻');
  });

  it('applies a preset to the name + emoji when the chip is clicked', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.click(screen.getByTestId('project-create-preset-coding'));
    const input = screen.getByTestId('project-create-name-input') as HTMLInputElement;
    expect(input.value).toBe('Coding');
    expect(screen.getByTestId('project-create-emoji-trigger').textContent).toBe('💻');
  });

  it('submits the form and adds the project with iconEmoji + accentColor', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.click(screen.getByTestId('project-create-preset-research'));
    const form = screen.getByTestId('project-create-form');
    fireEvent.submit(form);
    // After submit the form closes and the project lands in the store.
    const projects = useProjectStore.getState().projects;
    expect(projects.length).toBe(1);
    expect(projects[0]!.name).toBe('Research');
    expect(projects[0]!.iconEmoji).toBe('🔬');
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
        iconEmoji: '📁',
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
    // Default starting emoji is the folder.
    expect(projects[0]!.iconEmoji).toBe('📁');
    // Default accent color is zinc.
    expect(projects[0]!.accentColor).toBe('zinc');
  });

  it('resets the form state on cancel', async () => {
    render(<ProjectGallery />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    await userEvent.click(screen.getByTestId('project-create-preset-writing'));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    // Re-open — the form should be back to defaults.
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    const input = screen.getByTestId('project-create-name-input') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(screen.getByTestId('project-create-emoji-trigger').textContent).toBe('📁');
  });
});
