import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar, SIDEBAR_TOOLTIP_DELAY_MS } from '../Sidebar';
import type { SidebarNavItem, SidebarProject, SidebarSession } from '../types';

const Dot = () => <svg />;

const navItems: SidebarNavItem[] = [
  { id: 'projects', label: 'Projects', icon: Dot, onClick: vi.fn() },
  { id: 'library', label: 'Library', icon: Dot, onClick: vi.fn(), isActive: true },
];

const now = new Date().toISOString();

const sessions: SidebarSession[] = [
  { id: 's1', title: 'Quarterly revenue model', updatedAt: now, pinned: true },
  { id: 's2', title: 'Recent thread', updatedAt: now, projectId: 'p1' },
];

const projects: SidebarProject[] = [{ id: 'p1', name: 'Atlas' }];

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      sessions={sessions}
      projects={projects}
      navItems={navItems}
      headerSlot={
        <span data-host-slot="" data-testid="brand">
          AGI
        </span>
      }
      footerSlot={
        <button data-host-slot="" type="button">
          Account menu
        </button>
      }
      collapsedFooterSlot={
        <button data-host-slot="" type="button">
          Account
        </button>
      }
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onOpenCode={vi.fn()}
      onToggleCollapse={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
      onArchive={vi.fn()}
      onProjectOpen={vi.fn()}
      onProjectNewChat={vi.fn()}
      onProjectCreate={vi.fn()}
      onRetryLoad={vi.fn()}
      {...overrides}
    />,
  );
}

const rootOf = (container: HTMLElement) => container.querySelector('nav') as HTMLElement;

const railOf = (container: HTMLElement) =>
  container.querySelector('[data-sidebar-region="rail"]') as HTMLElement;

/** Controls the sidebar renders itself, excluding anything a host injected. */
function ownControls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('button, a[href]')).filter(
    (element) => !element.closest('[data-host-slot]'),
  );
}

const classTokens = (element: Element): string[] =>
  (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

function describeControl(element: HTMLElement): string {
  return (
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.textContent?.trim() ??
    element.outerHTML.slice(0, 80)
  );
}

function accessibleNameOf(element: HTMLElement): string {
  return (
    element.getAttribute('aria-label') ?? element.getAttribute('title') ?? element.textContent ?? ''
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('collapsing the sidebar hides labels rather than clipping them', () => {
  it('paints no visible label text in the icon rail', () => {
    const { container } = renderSidebar({ collapsed: true });
    const rail = railOf(container);

    const visibleText = Array.from(rail.querySelectorAll<HTMLElement>('*'))
      .filter((element) => element.children.length === 0)
      .filter((element) => !classTokens(element).includes('sr-only'))
      .map((element) => element.textContent?.trim())
      .filter((text): text is string => Boolean(text));

    expect(visibleText).toEqual([]);
  });

  it('still names every rail control for a screen reader', () => {
    const { container } = renderSidebar({ collapsed: true });

    const unnamed = ownControls(railOf(container)).filter(
      (control) => !control.getAttribute('aria-label')?.trim(),
    );

    expect(unnamed.map(describeControl)).toEqual([]);
  });

  /**
   * Anything the expanded panel truncates has to be recoverable. The row itself
   * is what carries the full text: a `title` on the conversation link, the
   * project name inside the expand control's own label.
   */
  it('leaves no truncated label without its full text on the control around it', () => {
    const { container } = renderSidebar();

    const unrecoverable = Array.from(container.querySelectorAll<HTMLElement>('.truncate'))
      .filter((element) => Boolean(element.textContent?.trim()))
      .filter((element) => {
        const control = element.closest<HTMLElement>('button, a[href]');
        if (!control) return true;
        return !accessibleNameOf(control).includes(element.textContent!.trim());
      })
      .map((element) => element.textContent?.trim());

    expect(unrecoverable).toEqual([]);
  });

  it('keeps the active destination visible, not only announced', () => {
    const { container } = renderSidebar({ collapsed: true });
    const rail = railOf(container);

    const active = within(rail).getByRole('button', { name: 'Library' });
    const inactive = within(rail).getByRole('button', { name: 'Projects' });

    expect(active.getAttribute('aria-current')).toBe('page');
    expect(inactive.getAttribute('aria-current')).toBeNull();
    expect(active.className).not.toEqual(inactive.className);
    expect(classTokens(active)).toContain('bg-[hsl(var(--accent))]');
    expect(classTokens(inactive)).not.toContain('bg-[hsl(var(--accent))]');
  });

  it.each([
    ['expanded', false],
    ['collapsed', true],
  ])('gives every %s control a visible keyboard focus state', (_label, collapsed) => {
    const { container } = renderSidebar({ collapsed });

    const withoutFocusState = ownControls(container).filter(
      (control) =>
        !control.className.includes('focus-visible:ring') &&
        !control.className.includes('focus-visible:bg'),
    );

    expect(withoutFocusState.map(describeControl)).toEqual([]);
  });

  /**
   * Collapsing is a width change. Transitioning every animatable property
   * instead repaints the border and both text colours on the same 300ms curve,
   * which reads as the whole column being rebuilt rather than narrowed.
   */
  it.each([
    ['expanded', false],
    ['collapsed', true],
  ])('animates only the width of the %s column', (_label, collapsed) => {
    const { container } = renderSidebar({ collapsed });
    const root = rootOf(container);

    expect(root.className).toContain('transition-[width]');
    expect(root.className).not.toContain('transition-all');
    expect(root.className).toContain('duration-300');
    expect(root.className).not.toContain('absolute');
    expect(root.className).not.toContain('fixed');
  });
});

describe('the icon rail explains itself on hover, after a pause', () => {
  it('waits before showing a label and does not make the reader wait long', async () => {
    vi.useFakeTimers();
    const { container } = renderSidebar({ collapsed: true });
    const trigger = within(railOf(container)).getByRole('button', { name: 'New chat' });

    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
    await act(async () => {
      vi.advanceTimersByTime(Math.max(SIDEBAR_TOOLTIP_DELAY_MS - 50, 0));
    });
    expect(screen.queryByRole('tooltip')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    expect(screen.getByRole('tooltip').textContent).toContain('New chat');
  });

  it('keeps the pause short enough to read and long enough to sweep past', () => {
    expect(SIDEBAR_TOOLTIP_DELAY_MS).toBeGreaterThan(0);
    expect(SIDEBAR_TOOLTIP_DELAY_MS).toBeLessThanOrEqual(400);
  });
});
