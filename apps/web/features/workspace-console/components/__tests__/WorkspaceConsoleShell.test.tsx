import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/workspace' }));

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
  it('renders the console for an owner', () => {
    shell({ role: 'owner' });

    expect(screen.getByText('console body')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: /workspace administration/i }),
    ).toBeInTheDocument();
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
});
