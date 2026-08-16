import { describe, expect, it, vi } from 'vitest';
import { APP_NAV_DESTINATIONS, buildAppNavItems } from './app-nav-items';

/**
 * The /admin console had no inbound link anywhere in the app shell, so an owner
 * could only reach it by typing the URL. It is offered in the rail now, and
 * only to the role that can use it — the route's own server-side gate is
 * unchanged and remains the actual boundary.
 */

function build(isAdmin: boolean | undefined) {
  return buildAppNavItems({
    pathname: '/chat',
    navigate: vi.fn(),
    onOpenCustomize: vi.fn(),
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

  it('is the only admin-gated destination, and points at /admin', () => {
    const gated = APP_NAV_DESTINATIONS.filter((destination) => destination.adminOnly);
    expect(gated.map((destination) => destination.href)).toEqual(['/admin']);
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
