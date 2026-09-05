import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarProject, SidebarSession } from '../types';

/**
 * Slice E item 2: the chat row menu must carry Share, Rename, Pin, Archive,
 * Delete and Move to project in that order (ChatGPT), with Copy link and
 * Mark as unread folded in (Claude). `Menu.keyboard.test.tsx` already covers
 * the arrow/Home/End/Escape contract every `role="menu"` panel inherits from
 * the shared `Menu` primitive; this file only checks this menu's own
 * entries and their order.
 */

const session: SidebarSession = {
  id: 's1',
  title: 'Repository structure overview',
  updatedAt: new Date(2026, 8, 1).toISOString(),
};

const projects: SidebarProject[] = [{ id: 'p1', name: 'agiworkforce' }];

function renderRowMenu(overrides: Partial<SidebarProps> = {}) {
  render(
    <Sidebar
      sessions={[session]}
      projects={projects}
      onNewChat={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
      onStar={vi.fn()}
      onArchive={vi.fn()}
      onShare={vi.fn()}
      onMoveToProject={vi.fn()}
      onMarkUnread={vi.fn()}
      getSessionHref={(s) => `/chat/${s.id}`}
      {...overrides}
    />,
  );
  fireEvent.click(screen.getByLabelText('Conversation actions'));
  return screen.getByRole('menu');
}

function itemLabels(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((el) => el.textContent?.trim() ?? '');
}

describe('chat row menu (Sidebar > SessionItem)', () => {
  it('lists every entry in the leader-matched order', () => {
    const menu = renderRowMenu();
    expect(itemLabels(menu)).toEqual([
      'Share',
      'Copy link',
      'Rename',
      'Pin',
      'Star',
      'Mark as unread',
      'Archive',
      'Delete',
      'agiworkforce',
    ]);
  });

  it('shows the Move to project group last, labelled and separated', () => {
    const menu = renderRowMenu();
    const groupLabel = within(menu).getByText('Move to project');
    const items = within(menu).getAllByRole('menuitem');
    const deleteIndex = items.findIndex((el) => el.textContent?.trim() === 'Delete');
    const projectIndex = items.findIndex((el) => el.textContent?.trim() === 'agiworkforce');
    expect(projectIndex).toBeGreaterThan(deleteIndex);
    expect(
      groupLabel.compareDocumentPosition(items[projectIndex]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('omits Copy link when the caller supplies no href', () => {
    const menu = renderRowMenu({ getSessionHref: undefined });
    expect(itemLabels(menu)).not.toContain('Copy link');
  });

  it('flips the unread entry to "Mark as read" once the session is unread', () => {
    const menu = renderRowMenu({ sessions: [{ ...session, unread: true }] });
    expect(itemLabels(menu)).toContain('Mark as read');
    expect(itemLabels(menu)).not.toContain('Mark as unread');
  });

  it('omits Mark as unread entirely when the host supplies no handler', () => {
    const menu = renderRowMenu({ onMarkUnread: undefined });
    expect(itemLabels(menu)).not.toContain('Mark as unread');
  });
});
