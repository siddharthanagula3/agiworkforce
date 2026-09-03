import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkillEditorDialog } from './SkillEditorDialog';

describe('SkillEditorDialog', () => {
  it('renders empty fields and the create title in create mode', () => {
    render(<SkillEditorDialog open mode="create" onOpenChange={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'New skill' })).toBeTruthy();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
    expect(screen.getByLabelText('Instructions')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create skill' })).toBeTruthy();
  });

  it('pre-fills fields from the existing skill in edit mode', () => {
    render(
      <SkillEditorDialog
        open
        mode="edit"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        initialSkill={{
          name: 'release-notes',
          description: 'Draft release notes.',
          body: 'Summarize the diff.',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Edit skill' })).toBeTruthy();
    expect(screen.getByLabelText('Name')).toHaveValue('release-notes');
    expect(screen.getByLabelText('Description')).toHaveValue('Draft release notes.');
    expect(screen.getByLabelText('Instructions')).toHaveValue('Summarize the diff.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('shows a loading state instead of the body field while the current body loads', () => {
    render(
      <SkillEditorDialog open mode="edit" onOpenChange={vi.fn()} onSubmit={vi.fn()} bodyLoading />,
    );

    expect(screen.getByText('Loading current instructions…')).toBeTruthy();
    expect(screen.queryByLabelText('Instructions')).toBeNull();
  });

  it('blocks submit and lists every validation error for an invalid draft', async () => {
    const onSubmit = vi.fn();
    render(<SkillEditorDialog open mode="create" onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create skill' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Name is required.')).toBeTruthy();
    expect(screen.getByText('Description is required.')).toBeTruthy();
    expect(screen.getByText('Skill instructions are required.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed draft once every field is valid', async () => {
    const onSubmit = vi.fn();
    render(<SkillEditorDialog open mode="create" onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  release-notes  ' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: '  Draft release notes from a diff.  ' },
    });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: '  Summarize the diff into a changelog entry.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create skill' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'release-notes',
        description: 'Draft release notes from a diff.',
        body: 'Summarize the diff into a changelog entry.',
      }),
    );
  });

  it('shows a server submit error without discarding the draft', () => {
    render(
      <SkillEditorDialog
        open
        mode="create"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        submitError='You already have a skill named "release-notes".'
      />,
    );

    expect(screen.getByText('You already have a skill named "release-notes".')).toBeTruthy();
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const onOpenChange = vi.fn();
    render(<SkillEditorDialog open mode="create" onOpenChange={onOpenChange} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
