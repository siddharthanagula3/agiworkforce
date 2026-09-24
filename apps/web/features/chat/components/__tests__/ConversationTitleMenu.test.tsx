import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ConversationTitleMenu, ConversationTitlePlaceholder } from '../ConversationTitleMenu';

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

  it('keeps the title slot busy while the conversation is still loading', () => {
    render(<ConversationTitlePlaceholder />);
    const slot = screen.getByRole('status', { name: /loading conversation title/i });
    expect(slot).toHaveAttribute('aria-busy', 'true');
    expect(slot).toHaveClass('min-w-0', 'flex-1');
    expect(screen.queryByRole('button', { name: /conversation options/i })).toBeNull();
  });

  it.each([
    ['combining marks', 'Café déjà vu, Ünïcödé'],
    ['non-latin script', '会議のまとめ / Итоги встречи'],
    ['right to left', 'ملخص الاجتماع'],
    ['emoji with a skin-tone modifier', '🚀 Launch plan 👩🏽‍💻 v2 🇯🇵'],
  ])('renders a title with %s without mangling it', (_case, title) => {
    render(
      <ConversationTitleMenu
        title={title}
        projects={projects}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: /conversation options/i });
    expect(trigger.textContent).toContain(title);
  });

  it('round-trips an emoji title through rename without splitting the grapheme', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Old"
        projects={projects}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.clear(input);
    await user.paste('👩🏽‍💻 Ünïcödé plan');
    await user.type(input, '{Enter}');

    expect(onRename).toHaveBeenCalledWith('👩🏽‍💻 Ünïcödé plan');
  });

  it('commits the draft when the input loses focus', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Old title"
        projects={projects}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.clear(input);
    await user.type(input, 'Committed on blur');
    await user.tab();

    expect(onRename).toHaveBeenCalledWith('Committed on blur');
  });

  it('Escape abandons the draft and leaves the title untouched', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Old title"
        projects={projects}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.clear(input);
    await user.type(input, 'Abandoned{Escape}');

    expect(onRename).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conversation options/i }).textContent).toContain(
        'Old title',
      ),
    );
    expect(onRename).not.toHaveBeenCalled();
  });

  it('shows the new title before the server answers and restores it when the save fails', async () => {
    let settle: (accepted: boolean) => void = () => {};
    const onRename = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Old title"
        projects={projects}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.clear(input);
    await user.type(input, 'Renamed in flight{Enter}');

    const trigger = await screen.findByRole('button', { name: /conversation options/i });
    expect(trigger.textContent).toContain('Renamed in flight');

    settle(false);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conversation options/i }).textContent).toContain(
        'Old title',
      ),
    );
    expect(screen.getByRole('button', { name: /conversation options/i }).textContent).not.toContain(
      'Renamed in flight',
    );
  });

  it('restores the title when the save throws instead of answering', async () => {
    let fail: (reason: Error) => void = () => {};
    const onRename = vi.fn(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const user = userEvent.setup();
    render(
      <ConversationTitleMenu
        title="Old title"
        projects={projects}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.clear(input);
    await user.type(input, 'Renamed in flight{Enter}');
    expect(
      (await screen.findByRole('button', { name: /conversation options/i })).textContent,
    ).toContain('Renamed in flight');

    fail(new Error('the request never landed'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conversation options/i }).textContent).toContain(
        'Old title',
      ),
    );
  });

  it('keeps the optimistic title until the store catches up, then follows the store', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn(async () => true);
    const { rerender } = render(
      <ConversationTitleMenu
        title="Old title"
        projects={projects}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /conversation options/i }));
    await user.click(await screen.findByText('Rename'));
    const input = await screen.findByRole('textbox', { name: /rename conversation/i });
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    expect(
      (await screen.findByRole('button', { name: /conversation options/i })).textContent,
    ).toContain('Renamed');

    rerender(
      <ConversationTitleMenu
        title="Server chosen title"
        projects={projects}
        onRename={onRename}
        onDelete={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conversation options/i }).textContent).toContain(
        'Server chosen title',
      ),
    );
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
