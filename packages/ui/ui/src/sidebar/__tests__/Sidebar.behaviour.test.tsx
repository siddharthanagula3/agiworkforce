import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../Sidebar';
import type { SidebarNavItem, SidebarProject, SidebarSession } from '../types';

const Dot = () => <svg />;

const navItems: SidebarNavItem[] = [
  { id: 'projects', label: 'Projects', icon: Dot, onClick: vi.fn() },
  { id: 'library', label: 'Library', icon: Dot, onClick: vi.fn() },
  { id: 'schedules', label: 'Schedules', icon: Dot, onClick: vi.fn() },
];

const now = new Date().toISOString();

const sessions: SidebarSession[] = [
  { id: 's1', title: 'Pinned thread', updatedAt: now, pinned: true },
  { id: 's2', title: 'Recent thread', updatedAt: now },
];

const projects: SidebarProject[] = [{ id: 'p1', name: 'Atlas' }];

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      sessions={sessions}
      projects={projects}
      navItems={navItems}
      headerSlot={<span data-testid="brand">AGI</span>}
      footerSlot={<button type="button">Account menu</button>}
      collapsedFooterSlot={<button type="button">Account</button>}
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onOpenCode={vi.fn()}
      onToggleCollapse={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onProjectOpen={vi.fn()}
      onProjectNewChat={vi.fn()}
      {...overrides}
    />,
  );
}

const rootOf = (container: HTMLElement) => container.querySelector('nav') as HTMLElement;

const scrollRegionOf = (container: HTMLElement) =>
  container.querySelector('nav > div.overflow-y-auto') as HTMLElement;

describe('sidebar sections carry the destinations the rail promises', () => {
  it('leads with the brand mark, the collapse control, New chat and Search', () => {
    const { container } = renderSidebar();
    const header = container.querySelector('[data-sidebar-region="header"]') as HTMLElement;

    expect(within(header).getByTestId('brand')).toBeTruthy();
    expect(within(header).getByLabelText('Toggle sidebar')).toBeTruthy();
    expect(within(header).getByLabelText('New chat')).toBeTruthy();
    expect(within(header).getByRole('button', { name: /Search/ })).toBeTruthy();
  });

  it('carries Projects, Recents and the pinned group in its middle', () => {
    renderSidebar();

    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
    expect(screen.getByText('Atlas')).toBeTruthy();
    expect(screen.getByText('Chats')).toBeTruthy();
    expect(screen.getAllByText('Pinned').length).toBeGreaterThan(0);
    expect(screen.getByText('Recent thread')).toBeTruthy();
  });

  it('gives the host a footer for account, workspace and settings chrome', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeTruthy();
  });

  it('keeps the same footer reachable once collapsed to the icon rail', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
  });
});

describe('sidebar behaviour', () => {
  it('scrolls its own list rather than the page', () => {
    const { container } = renderSidebar();
    const region = scrollRegionOf(container);

    expect(region).toBeTruthy();
    expect(region.className).toContain('overflow-y-auto');
    expect(rootOf(container).className).not.toContain('overflow-y-auto');
  });

  it('holds its scroll position when the host opens a different conversation', () => {
    const { container, rerender } = renderSidebar();
    const region = scrollRegionOf(container);
    region.scrollTop = 240;

    rerender(
      <Sidebar
        sessions={sessions}
        projects={projects}
        navItems={navItems}
        activeSessionId="s2"
        headerSlot={<span data-testid="brand">AGI</span>}
        footerSlot={<button type="button">Account menu</button>}
        onNewChat={vi.fn()}
        onOpenSearch={vi.fn()}
        onOpenCode={vi.fn()}
        onToggleCollapse={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onProjectOpen={vi.fn()}
        onProjectNewChat={vi.fn()}
      />,
    );

    expect(scrollRegionOf(container)).toBe(region);
    expect(region.scrollTop).toBe(240);
  });

  it('names every control in the collapsed rail, so an icon is never the only label', () => {
    const { container } = renderSidebar({ collapsed: true });
    const rail = container.querySelector('[data-sidebar-region="rail"]') as HTMLElement;
    const buttons = [...rail.querySelectorAll('button')];

    expect(buttons.length).toBeGreaterThanOrEqual(4 + navItems.length);
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')?.trim()).toBeTruthy();
    }
  });

  it('orders the header controls the way they read, left to right', () => {
    const { container } = renderSidebar();
    const header = container.querySelector('[data-sidebar-region="header"]') as HTMLElement;
    const labels = [...header.querySelectorAll('button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
    );

    expect(labels.slice(0, 3)).toEqual(['Toggle sidebar', 'New chat', 'AGI Code']);
    expect(labels[3]).toContain('Search');
  });

  it('leaves every header and rail control in the natural tab order', () => {
    const { container } = renderSidebar();
    const header = container.querySelector('[data-sidebar-region="header"]') as HTMLElement;

    for (const button of header.querySelectorAll('button')) {
      expect(button.getAttribute('tabindex')).toBeNull();
      expect(button.getAttribute('disabled')).toBeNull();
    }
  });

  it('never hides core navigation behind a hover', () => {
    const { container } = renderSidebar();
    const header = container.querySelector('[data-sidebar-region="header"]') as HTMLElement;
    const navRegion = scrollRegionOf(container).firstElementChild as HTMLElement;

    for (const control of [
      ...header.querySelectorAll('button'),
      ...navRegion.querySelectorAll('button'),
    ]) {
      expect(control.className).not.toContain('opacity-0');
    }
  });

  it('gives the rail a narrower fixed width than the expanded panel', () => {
    const expanded = renderSidebar();
    const expandedWidth = rootOf(expanded.container).style.width;
    expanded.unmount();

    const collapsed = renderSidebar({ collapsed: true });
    const collapsedWidth = rootOf(collapsed.container).style.width;

    expect(expandedWidth).toBe('260px');
    expect(Number.parseInt(collapsedWidth, 10)).toBeLessThan(Number.parseInt(expandedWidth, 10));
  });

  it('honours the width its host asks for rather than a second hardcoded value', () => {
    const { container } = renderSidebar({ width: 320 });
    expect(rootOf(container).style.width).toBe('320px');
  });

  it('grows the row actions to a finger-sized target where there is no hover', () => {
    const { container } = renderSidebar();
    const projectRow = container.querySelector('.group\\/projrow') as HTMLElement;
    const actions = [...projectRow.querySelectorAll('button')].filter((button) =>
      button.className.includes('opacity-0'),
    );

    expect(projectRow).toBeTruthy();
    for (const button of projectRow.querySelectorAll('button')) {
      if (/(?<![-\w])h-6\b/.test(button.className)) {
        expect(button.className).toContain('[@media(hover:none)]:h-9');
        expect(button.className).toContain('[@media(hover:none)]:w-9');
      }
    }
    expect(actions.length).toBe(0);
  });

  it('keeps an archived conversation openable from the archived view', () => {
    const archived: SidebarSession[] = [
      { id: 'a1', title: 'Archived thread', updatedAt: now, archived: true },
    ];
    const { container } = renderSidebar({
      sessions: archived,
      getSessionHref: (session) => `/chat/${session.id}`,
    });

    const toggle = container.querySelector('[aria-pressed]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);

    expect(container.querySelector('a[href="/chat/a1"]')).toBeTruthy();
  });
});
