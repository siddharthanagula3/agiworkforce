import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ConversationTitleMenu } from '../ConversationTitleMenu';

beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
});

const projects = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Beta' },
];

describe('ConversationTitleMenu', () => {
  it('renders the title as a dropdown trigger', () => {
    render(
      <ConversationTitleMenu
        title="Domain strategy"
        projects={projects}
        onRename={vi.fn()}
        onMoveToProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: /conversation options/i });
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('Domain strategy');
  });

  it('stays in the header flex flow so side panels cannot overlap it', () => {
    render(
      <ConversationTitleMenu
        title="A long conversation title"
        projects={projects}
        onRename={vi.fn()}
        onMoveToProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const wrapper = screen.getByRole('button', { name: /conversation options/i }).parentElement;
    expect(wrapper).toHaveClass('min-w-0', 'flex-1');
    expect(wrapper).not.toHaveClass('absolute');
  });

  it('offers Archive, and Unarchive once the conversation is archived', async () => {
    // The sidebar hides an archived row behind its archive filter, so without
    // these the conversation's own header had no way to bring it back.
    const user = userEvent.setup();
    const onArchiveToggle = vi.fn();
    const { unmount } = render(
      <ConversationTitleMenu
        title="Domain strategy"
        projects={projects}
        onRename={vi.fn()}
        onArchiveToggle={onArchiveToggle}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(onArchiveToggle).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <ConversationTitleMenu
        title="Domain strategy"
        archived
        projects={projects}
        onRename={vi.fn()}
        onArchiveToggle={onArchiveToggle}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    expect(await screen.findByRole('menuitem', { name: 'Unarchive' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
  });

  it('opens to Rename / Move to project / Delete when projects exist', async () => {
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Domain strategy"
        projects={projects}
        onRename={vi.fn()}
        onMoveToProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    expect(await screen.findByText('Rename')).toBeTruthy();
    expect(screen.getByText('Move to project')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('hides Move to project when there are no projects', async () => {
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Domain strategy"
        projects={[]}
        onRename={vi.fn()}
        onMoveToProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    expect(await screen.findByText('Rename')).toBeTruthy();
    expect(screen.queryByText('Move to project')).toBeNull();
  });

  it('Rename swaps in an input and commits a trimmed new title on Enter', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Old title"
        projects={projects}
        onRename={onRename}
        onMoveToProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));

    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    expect((input as HTMLInputElement).value).toBe('Old title');
    await user.clear(input);
    await user.type(input, '  New title  {Enter}');

    expect(onRename).toHaveBeenCalledWith('New title');
  });

  it('does not call onRename when the title is unchanged', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Same"
        projects={projects}
        onRename={onRename}
        onMoveToProject={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.type(input, '{Enter}');
    expect(onRename).not.toHaveBeenCalled();
  });

  it('Delete calls onDelete', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Domain strategy"
        projects={projects}
        onRename={vi.fn()}
        onMoveToProject={vi.fn()}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
