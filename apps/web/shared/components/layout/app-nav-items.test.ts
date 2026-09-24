import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { APP_NAV_DESTINATIONS, buildAppNavItems } from './app-nav-items';

/**
 * The rail offers an admin destination only to an org admin or owner, and only
 * one that role can actually open. `/admin` itself is the platform-operator
 * console (allowlisted Clerk ids, everyone else is redirected to `/`), so the
 * rail points at the org-scoped directory-sync page instead of advertising a
 * console that bounces the user straight back out.
 */

function build(isAdmin: boolean | undefined) {
  return buildAppNavItems({
    pathname: '/chat',
    navigate: vi.fn(),
    ...(isAdmin === undefined ? {} : { isAdmin }),
  });
}

describe('app rail · admin destination', () => {
  it('is absent for an ordinary user', () => {
    expect(build(false).map((item) => item.id)).not.toContain('admin');
  });

  it('is absent when the caller says nothing, so a new surface cannot leak it', () => {
    expect(build(undefined).map((item) => item.id)).not.toContain('admin');
  });

  it('is offered to an admin', () => {
    expect(build(true).map((item) => item.id)).toContain('admin');
  });

  it('is the only admin-gated destination, and points at the org-scoped page', () => {
    const gated = APP_NAV_DESTINATIONS.filter((destination) => destination.adminOnly);
    expect(gated.map((destination) => destination.href)).toEqual(['/admin/directory-sync']);
  });

  it('never offers the platform-operator console, which redirects an org admin away', () => {
    const offered = APP_NAV_DESTINATIONS.filter((destination) => destination.adminOnly);
    expect(offered.map((destination) => destination.href)).not.toContain('/admin');
  });

  it('marks itself active anywhere under /admin', () => {
    const admin = APP_NAV_DESTINATIONS.find((destination) => destination.id === 'admin');
    expect(admin?.isActive('/admin')).toBe(true);
    expect(admin?.isActive('/admin/directory-sync')).toBe(true);
    expect(admin?.isActive('/chat')).toBe(false);
  });

  it('leaves every other destination visible to everyone', () => {
    const ordinary = build(false).map((item) => item.id);
    const asAdmin = build(true).map((item) => item.id);
    expect(asAdmin.filter((id) => id !== 'admin')).toEqual(ordinary);
  });
});

// A rail entry whose href has no page behind it is a 404 with an icon, and a
// shipped screen with no rail entry is unreachable without typing the URL.
// /skills was the latter: indexed, linked from marketing, the target of two
// redirects, and absent from the rail. Both directions are asserted here.
describe('app rail · every destination resolves to a real route', () => {
  const APP_DIR = path.resolve(__dirname, '../../../app');

  const pageFor = (href: string) => {
    const segments = href.replace(/^\//, '').split('/');
    return ['page.tsx', 'page.ts'].some((basename) =>
      existsSync(path.join(APP_DIR, ...segments, basename)),
    );
  };

  const routed = APP_NAV_DESTINATIONS.filter((d) => typeof d.href === 'string');

  it('covers the destinations that navigate somewhere', () => {
    expect(routed.length).toBeGreaterThan(4);
  });

  it.each(routed.map((d) => [d.id, d.href as string]))('%s -> %s exists', (_id, href) => {
    expect(pageFor(href), `${href} has no page.tsx`).toBe(true);
  });

  // Founder decision 2026-08-29: the rail carries neither Skills nor Customize.
  // Skills keeps its own Settings pane and /skills route; Settings is reached
  // from the account menu.
  it('carries neither Skills nor Customize', () => {
    const ids = APP_NAV_DESTINATIONS.map((d) => d.id);
    expect(ids).not.toContain('skills');
    expect(ids).not.toContain('customize');
  });

  // Founder decision 2026-09-01: the rail carries no Tasks entry. The /tasks
  // route itself is deliberately left shipped, so run notifications and deep
  // links still resolve; only the rail destination is withdrawn.
  it('carries no Tasks destination', () => {
    const ids = APP_NAV_DESTINATIONS.map((d) => d.id);
    expect(ids).not.toContain('tasks');
    expect(APP_NAV_DESTINATIONS.map((d) => d.href)).not.toContain('/tasks');
  });

  // Founder decision 2026-09-06: Code left the rail. It is its own top-level
  // route with its own sidebar, so a rail entry beside that sidebar was the
  // second of two navigation columns on one screen. The sidebar's ">_" control
  // and the command palette are how it is reached now.
  it('carries no Code destination', () => {
    const ids = APP_NAV_DESTINATIONS.map((d) => d.id);
    expect(ids).not.toContain('code');
    expect(APP_NAV_DESTINATIONS.map((d) => d.href)).not.toContain('/chat/code');
    expect(APP_NAV_DESTINATIONS.map((d) => d.href)).not.toContain('/code');
  });

  it('routes every destination, with no modal-only entry left behind', () => {
    expect(APP_NAV_DESTINATIONS.every((d) => typeof d.href === 'string' && d.href.length > 0)).toBe(
      true,
    );
  });
});

describe('app rail · workspace feature controls', () => {
  it('drops a destination whose feature the workspace turned off', () => {
    const ids = buildAppNavItems({
      pathname: '/chat',
      navigate: vi.fn(),
      disabledFeatures: ['schedules'],
    }).map((item) => item.id);
    expect(ids).not.toContain('schedules');
    expect(ids).toContain('chat-home');
  });

  it('keeps every destination when no feature is turned off', () => {
    const ids = buildAppNavItems({ pathname: '/chat', navigate: vi.fn() }).map((item) => item.id);
    expect(ids).toContain('schedules');
  });
});

describe('app rail · Study', () => {
  it('offers Study as its own destination', () => {
    const study = APP_NAV_DESTINATIONS.find((destination) => destination.id === 'study');
    expect(study).toMatchObject({ href: '/chat/study', hideable: true });
  });

  it('is the active entry on its own route, and Chat is not', () => {
    const chat = APP_NAV_DESTINATIONS.find((destination) => destination.id === 'chat-home');
    const study = APP_NAV_DESTINATIONS.find((destination) => destination.id === 'study');
    expect(study?.isActive('/chat/study')).toBe(true);
    expect(chat?.isActive('/chat/study')).toBe(false);
  });

  it('does not claim a conversation route', () => {
    const study = APP_NAV_DESTINATIONS.find((destination) => destination.id === 'study');
    expect(study?.isActive('/chat/abc')).toBe(false);
  });

  it('can be hidden from the rail like every other optional destination', () => {
    const ids = buildAppNavItems({
      pathname: '/chat',
      navigate: vi.fn(),
      hiddenIds: ['study'],
    }).map((item) => item.id);
    expect(ids).not.toContain('study');
  });
});

describe('app rail · Projects', () => {
  it('offers Projects to every account on every route, including once a conversation is open', () => {
    for (const pathname of ['/chat', '/chat/abc', '/chat/library', '/models']) {
      for (const isAdmin of [true, false]) {
        const projects = buildAppNavItems({ pathname, navigate: vi.fn(), isAdmin }).find(
          (item) => item.id === 'projects',
        );
        expect(projects, `${pathname} admin=${isAdmin}`).toBeDefined();
      }
    }
  });

  it('opens the projects hub and marks itself current anywhere under it', () => {
    const navigate = vi.fn();
    const projects = buildAppNavItems({ pathname: '/chat/projects/p1', navigate }).find(
      (item) => item.id === 'projects',
    );
    expect(projects?.isActive).toBe(true);
    projects?.onClick();
    expect(navigate).toHaveBeenCalledWith('/chat/projects');
  });
});

describe('app rail · Models', () => {
  it('has no Models entry: the founder removed it from the sidebar on 2026-09-21', () => {
    for (const isAdmin of [true, false]) {
      const ids = buildAppNavItems({ pathname: '/chat', navigate: vi.fn(), isAdmin }).map(
        (item) => item.id,
      );
      expect(ids).not.toContain('models');
    }
  });
});
