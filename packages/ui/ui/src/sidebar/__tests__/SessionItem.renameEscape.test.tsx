import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { isInlineEditActive, keepOpenForMenuEscape } from '../escape-guard';
import type { SidebarSession } from '../types';

/**
 * Escape while renaming a row tore the whole mobile navigation drawer down at
 * 390x844: the field cancelled its own edit and the drawer's Radix layer took
 * the same key, leaving the user on an empty chat page with no sidebar. The
 * drawer asks `keepOpenForMenuEscape` whether to dismiss, so these cover the
 * answer it gets; the drawer's own behaviour is proved by the e2e spec.
 */

const session: SidebarSession = {
  id: 's1',
  title: 'Repository structure overview',
  updatedAt: new Date().toISOString(),
};

function startRename(onRename = vi.fn()) {
  render(
    <Sidebar
      sessions={[session]}
      projects={[]}
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={onRename}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
      onArchive={vi.fn()}
      getSessionHref={(s) => `/chat/${s.id}`}
    />,
  );
  fireEvent.click(screen.getByLabelText('Conversation actions'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
  return screen.getByDisplayValue(session.title);
}

describe('inline rename escape signal for a hosting drawer', () => {
  it('reports no inline edit before a rename starts', () => {
    expect(isInlineEditActive()).toBe(false);
  });

  it('reports an inline edit while the rename field is open', () => {
    startRename();
    expect(isInlineEditActive()).toBe(true);
  });

  it('declines the drawer dismissal while a rename is in flight', () => {
    startRename();
    const escape = { preventDefault: vi.fn() };
    keepOpenForMenuEscape(escape);
    expect(escape.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('cancels only the rename on Escape and lets the drawer take the next one', async () => {
    const onRename = vi.fn();
    const input = startRename(onRename);
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByDisplayValue('Renamed')).toBeNull());
    expect(onRename).not.toHaveBeenCalled();

    const escape = { preventDefault: vi.fn() };
    keepOpenForMenuEscape(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(isInlineEditActive()).toBe(false);
  });
});
