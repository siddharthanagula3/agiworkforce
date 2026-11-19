import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useOrganizationOverview: vi.fn(),
}));

vi.mock('@/features/settings/hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  useOrganizationOverview: mocks.useOrganizationOverview,
}));
vi.mock('@/features/settings/sections/team/SSOPanel', () => ({
  SSOPanel: () => <div data-testid="sso-panel" />,
}));
vi.mock('@/features/admin/pages/DirectorySyncAdminPage', () => ({
  default: () => <div data-testid="directory-sync" />,
}));
vi.mock('../WorkspaceServicePrincipals', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  WorkspaceServicePrincipals: () => <div data-testid="service-principals" />,
}));

import { WorkspaceIdentityPanels } from '../WorkspaceIdentityPanels';

describe('WorkspaceIdentityPanels', () => {
  it('does not claim directory groups lack policy scope', () => {
    mocks.useOrganizationOverview.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: { organization: { id: 'org-1' }, currentUserRole: 'owner' },
    });
    const { container } = render(<WorkspaceIdentityPanels />);
    const text = container.textContent ?? '';
    expect(text).toContain('policy exceptions for a group are set in Roles and Policy');
    expect(text).not.toMatch(/do not yet carry[^.]*policy scope/i);
    expect(screen.getByText('Not yet available')).toBeTruthy();
  });
});

type ImportedModule1 = typeof import('@/features/settings/hooks/use-settings-queries');
type ImportedModule0 = typeof import('../WorkspaceServicePrincipals');
