/**
 * AdminConsolePage — control-plane reachability and status-tone tests (CRIT-014).
 *
 * Two defects are covered here.
 *
 * 1. `/admin/directory-sync` is a fully wired SCIM control plane — create a
 *    connection, mint and revoke bearer tokens, read the provisioning event log
 *    — and NOTHING in the product linked to it. `grep -rn "admin/directory-sync"
 *    apps/web` returned only the route file itself, so it was reachable solely
 *    by typing the URL. The "Admin controls" inventory is the fix; delete that
 *    section and the reachability tests below fail.
 *
 * 2. Every readiness status rendered in the same emerald success badge no matter
 *    what it said. With the incident kill-switch engaged the table showed
 *    "Temporarily disabled (incident kill-switch)" in green while the header
 *    correctly turned amber. Drop the tone lookup and the tone tests fail.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AdminConsolePage from './AdminConsolePage';

vi.mock('../components/SecurityOperationsPanel', () => ({
  default: () => <div data-testid="security-operations-panel">Live security operations</div>,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

function controlsSection(container: HTMLElement): HTMLElement {
  const section = container.querySelector('[aria-labelledby="admin-controls-title"]');
  if (!(section instanceof HTMLElement)) throw new Error('Admin controls section is missing');
  return section;
}

function hrefsIn(section: HTMLElement): string[] {
  return Array.from(section.querySelectorAll('a')).map(
    (anchor) => anchor.getAttribute('href') ?? '',
  );
}

describe('AdminConsolePage — admin control inventory', () => {
  it('links to the directory-sync control plane, which had no inbound link anywhere', () => {
    const { container } = render(<AdminConsolePage />);
    expect(hrefsIn(controlsSection(container))).toContain('/admin/directory-sync');
  });

  it('links to the surface that operates enterprise SSO connections', () => {
    const { container } = render(<AdminConsolePage />);
    expect(hrefsIn(controlsSection(container))).toContain('/settings/team');
  });

  it('gives every listed control a destination — an inventory entry with no link is a dead control', () => {
    const { container } = render(<AdminConsolePage />);
    const section = controlsSection(container);
    const items = section.querySelectorAll('li');

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const anchor = item.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('href')).toBeTruthy();
    }
  });

  it('names the authoritative service behind each control', () => {
    const { container } = render(<AdminConsolePage />);
    const text = controlsSection(container).textContent ?? '';

    expect(text).toContain('/api/admin/security');
    expect(text).toContain('/api/admin/directory-sync');
    expect(text).toContain('/api/admin/sso');
  });

  it('anchors the on-page controls at the security operations panel heading', () => {
    const { container } = render(<AdminConsolePage />);
    expect(hrefsIn(controlsSection(container))).toContain('#security-operations-title');
  });
});

describe('AdminConsolePage — readiness status tone', () => {
  it('marks the managed-compute row warn, not success, when the kill-switch is engaged', () => {
    vi.stubEnv('AGI_MANAGED_COMPUTE_PRIVATE_BETA', 'off');
    render(<AdminConsolePage />);

    const badge = screen.getByText('Temporarily disabled (incident kill-switch)');

    expect(badge.getAttribute('data-tone')).toBe('warn');
    expect(badge.className).not.toContain('emerald');
    expect(badge.className).toContain('amber');
  });

  it('marks the managed-compute row ok when compute is open', () => {
    vi.stubEnv('AGI_MANAGED_COMPUTE_PRIVATE_BETA', '');
    render(<AdminConsolePage />);

    const badge = screen.getByText('Public alpha');

    expect(badge.getAttribute('data-tone')).toBe('ok');
    expect(badge.className).toContain('emerald');
  });

  it('gives every readiness badge an explicit tone', () => {
    vi.stubEnv('AGI_MANAGED_COMPUTE_PRIVATE_BETA', 'false');
    const { container } = render(<AdminConsolePage />);

    const rows = Array.from(container.querySelectorAll('tbody tr'));
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const badge = within(row as HTMLElement).getByText(/.+/, { selector: '[data-tone]' });
      expect(['ok', 'warn']).toContain(badge.getAttribute('data-tone'));
    }
  });
});
