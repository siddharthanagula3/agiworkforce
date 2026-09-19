import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const navigationState = vi.hoisted(() => ({ pathname: '/workspace' }));

vi.mock('next/navigation', () => ({ usePathname: () => navigationState.pathname }));

import { WorkspaceConsoleShell } from '../WorkspaceConsoleShell';

const ORG = '11111111-1111-4111-8111-111111111111';

function shell(props: Partial<Parameters<typeof WorkspaceConsoleShell>[0]> = {}) {
  return render(
    <WorkspaceConsoleShell
      role="owner"
      organizationId={ORG}
      membershipUnavailable={false}
      {...props}
    >
      <p>console body</p>
    </WorkspaceConsoleShell>,
  );
}

describe('WorkspaceConsoleShell', () => {
  beforeEach(() => {
    navigationState.pathname = '/workspace';
  });

  it('renders the console for an owner', () => {
    shell({ role: 'owner' });

    expect(screen.getByText('console body')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: /workspace administration/i })).toHaveLength(
      2,
    );
  });

  it('renders the console for an admin', () => {
    shell({ role: 'admin' });
    expect(screen.getByText('console body')).toBeInTheDocument();
  });

  it('tells a member they do not administer the workspace, and names their role', () => {
    shell({ role: 'member' });

    expect(screen.queryByText('console body')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /do not administer/i })).toBeInTheDocument();
    expect(screen.getByText(/"member"/)).toBeInTheDocument();
  });

  it('denies a viewer the same way', () => {
    shell({ role: 'viewer' });
    expect(screen.getByText(/"viewer"/)).toBeInTheDocument();
  });

  it('distinguishes a personal account from a denial', () => {
    shell({ role: null, organizationId: null });

    expect(screen.getByRole('heading', { name: /no workspace selected/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /team settings/i })).toHaveAttribute(
      'href',
      '/settings/team',
    );
  });

  it('distinguishes a database fault from a lost workspace', () => {
    // Rendering "you have no workspace" on a read failure would tell an
    // administrator their organization had vanished.
    shell({ role: null, organizationId: null, membershipUnavailable: true });

    expect(screen.getByRole('heading', { name: /temporarily unavailable/i })).toBeInTheDocument();
    expect(screen.queryByText(/no workspace selected/i)).not.toBeInTheDocument();
  });

  it('never leaks console content into a denial state', () => {
    for (const role of ['member', 'viewer'] as const) {
      const { unmount } = shell({ role });
      expect(screen.queryByText('console body')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: /workspace administration/i })).toBeNull();
      unmount();
    }
  });

  it('keeps the mobile administration menu collapsed above the page content', () => {
    shell();

    const disclosure = screen.getByLabelText(/workspace administration, current page: overview/i);
    const details = disclosure.closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(disclosure.className).toContain('min-h-11');

    disclosure.focus();
    fireEvent.click(disclosure);

    expect(details).toHaveAttribute('open');
    expect(document.activeElement).toBe(disclosure);
  });

  it('names the current nested page in the mobile control', () => {
    navigationState.pathname = '/workspace/people';
    shell();

    expect(
      screen.getByLabelText(/workspace administration, current page: members/i),
    ).toBeInTheDocument();
  });

  it('collapses the mobile menu and restores visible focus when the route changes', () => {
    const { rerender } = shell();
    const disclosure = screen.getByLabelText(/workspace administration, current page: overview/i);
    const details = disclosure.closest('details');

    fireEvent.click(disclosure);
    expect(details).toHaveAttribute('open');

    navigationState.pathname = '/workspace/billing';
    rerender(
      <WorkspaceConsoleShell role="owner" organizationId={ORG} membershipUnavailable={false}>
        <p>console body</p>
      </WorkspaceConsoleShell>,
    );

    const updatedDisclosure = screen.getByLabelText(
      /workspace administration, current page: billing/i,
    );
    expect(details).not.toHaveAttribute('open');
    expect(document.activeElement).toBe(updatedDisclosure);
  });

  it('preserves the desktop sidebar width and row layout', () => {
    const { container } = shell();

    const frame = container.firstElementChild;
    const aside = container.querySelector('aside');
    expect(frame?.className).toContain('md:flex-row');
    expect(aside?.className).toContain('md:w-60');
  });
});
