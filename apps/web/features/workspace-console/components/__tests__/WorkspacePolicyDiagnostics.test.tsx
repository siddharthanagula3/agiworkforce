import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePolicyDiagnostics } from '../WorkspacePolicyDiagnostics';

const mocks = vi.hoisted(() => ({ diagnosis: vi.fn() }));

vi.mock('@/features/settings/hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  useTeamMembers: () => ({
    data: [{ userId: 'member-1', name: 'Member One', email: 'one@example.com' }],
  }),
}));
vi.mock('../../hooks/use-workspace-roles', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  useWorkspaceRoles: () => ({ data: { roles: [] } }),
  useWorkspaceGroups: () => ({ data: { groups: [] } }),
  usePolicyDiagnosis: mocks.diagnosis,
}));
vi.mock('../WorkspaceFeatureControls', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  GOVERNED_FEATURES: [],
}));

function diagnosisWith(decision: { allowed: boolean; reason: string } | null) {
  mocks.diagnosis.mockReturnValue({
    data: { effective: null, decision },
    error: null,
    isFetching: false,
  });
}

describe('WorkspacePolicyDiagnostics without a saved policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not assure that nothing is restricted next to a refusal', () => {
    diagnosisWith({ allowed: false, reason: 'Billing is past due, so managed usage is paused.' });
    render(<WorkspacePolicyDiagnostics organizationId="org-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Refused.');
    expect(screen.queryByText(/nothing is restricted/)).not.toBeInTheDocument();
    expect(screen.getByText('This workspace has no policy yet.')).toBeInTheDocument();
  });

  it('keeps the assurance when the ask is allowed or absent', () => {
    diagnosisWith({ allowed: true, reason: 'No workspace policy applies to this request.' });
    const { rerender } = render(<WorkspacePolicyDiagnostics organizationId="org-1" />);
    expect(screen.getByText(/nothing is restricted/)).toBeInTheDocument();

    diagnosisWith(null);
    rerender(<WorkspacePolicyDiagnostics organizationId="org-1" />);
    expect(screen.getByText(/nothing is restricted/)).toBeInTheDocument();
  });
});

type ImportedModule2 = typeof import('@/features/settings/hooks/use-settings-queries');
type ImportedModule1 = typeof import('../../hooks/use-workspace-roles');
type ImportedModule0 = typeof import('../WorkspaceFeatureControls');
