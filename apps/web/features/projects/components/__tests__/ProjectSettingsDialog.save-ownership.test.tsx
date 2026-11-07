import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@features/projects/stores/project-store';

const updateProject = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/projects/services/managed-cloud-projects', () => ({
  webManagedCloudProjects: { updateProject, deleteProject: vi.fn() },
}));
vi.mock('../KnowledgeFilesPanel', () => ({ KnowledgeFilesPanel: () => <button>Independent files</button> }));
vi.mock('../ProjectMemoryPanel', () => ({ ProjectMemoryPanel: () => <button>Independent memories</button> }));
vi.mock('../ProjectDefaultModelField', () => ({ ProjectDefaultModelField: () => null }));
vi.mock('../ProjectChatDefaultsField', () => ({ ProjectChatDefaultsField: () => null }));

import { ProjectSettingsDialog } from '../ProjectSettingsDialog';

const project = { id: 'project-a', name: 'Alpha', instructions: 'Original', chatDefaults: {} } as Project;
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function props() {
  return { open: true, project, onOpenChange: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() };
}
beforeEach(() => { vi.clearAllMocks(); });

describe('project settings save ownership', () => {
  it('admits one save, freezes fields, and blocks dismissal until it settles', async () => {
    const pending = deferred();
    updateProject.mockReturnValue(pending.promise);
    const callbacks = props();
    render(<ProjectSettingsDialog {...callbacks} />);
    const name = screen.getByLabelText('Project name');
    fireEvent.change(name, { target: { value: 'Submitted' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(name).toBeDisabled();
    expect(screen.getByLabelText('Instructions')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Independent files' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Independent memories' })).not.toBeDisabled();
    await userEvent.setup().keyboard('{Escape}');
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
    await act(async () => pending.resolve(project));
    expect(callbacks.onUpdate).toHaveBeenCalledWith('project-a', expect.objectContaining({ name: 'Submitted' }));
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('preserves draft on same-project parent refresh and releases failed save', async () => {
    const pending = deferred();
    updateProject.mockReturnValue(pending.promise);
    const callbacks = props();
    const view = render(<ProjectSettingsDialog {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'My draft' } });
    view.rerender(<ProjectSettingsDialog {...callbacks} project={{ ...project, instructions: 'Refreshed', chatDefaults: {} }} />);
    expect(screen.getByLabelText('Instructions')).toHaveValue('My draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => pending.reject(new Error('offline')));
    expect(screen.getByLabelText('Instructions')).toHaveValue('My draft');
    expect(screen.getByLabelText('Instructions')).not.toBeDisabled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
  });

  it('retires a pending save when an open dialog switches directly to another project', async () => {
    const pending = deferred();
    updateProject.mockReturnValue(pending.promise);
    const callbacks = props();
    const view = render(<ProjectSettingsDialog {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const next = { ...project, id: 'project-b', name: 'Beta', instructions: 'Beta instructions' };
    view.rerender(<ProjectSettingsDialog {...callbacks} project={next} />);
    expect(screen.getByLabelText('Project name')).toHaveValue('Beta');
    expect(screen.getByLabelText('Instructions')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'Beta draft' } });
    await act(async () => pending.resolve(project));
    expect(callbacks.onUpdate).not.toHaveBeenCalled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Instructions')).toHaveValue('Beta draft');
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it.each(['same', 'different'])('ignores a prior receipt after %s-project reopening', async (target) => {
    const pending = deferred();
    updateProject.mockReturnValue(pending.promise);
    const callbacks = props();
    const view = render(<ProjectSettingsDialog {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    view.rerender(<ProjectSettingsDialog {...callbacks} open={false} />);
    const next = { ...project, id: target === 'same' ? project.id : 'project-b', name: 'Fresh' };
    view.rerender(<ProjectSettingsDialog {...callbacks} project={next} />);
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'New session draft' } });
    await act(async () => pending.resolve(project));
    expect(callbacks.onUpdate).not.toHaveBeenCalled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Instructions')).toHaveValue('New session draft');
    expect(screen.getByLabelText('Project name')).toHaveValue('Fresh');
  });
});
