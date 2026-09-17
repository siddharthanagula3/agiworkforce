import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKSPACE_CONTROLS } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  updatePolicy: vi.fn(),
  upsertOverride: vi.fn(),
  deleteOverride: vi.fn(),
  overrides: vi.fn(),
}));

vi.mock('@/features/settings/hooks/use-settings-queries', () => ({
  useWorkspacePolicy: () => mocks.policy(),
  useUpdateWorkspacePolicy: () => ({ mutate: mocks.updatePolicy, isPending: false }),
  useTeamMembers: () => ({
    data: [{ userId: 'user-9', name: 'Casey Contractor', email: 'casey@acme.test' }],
  }),
}));

vi.mock('../../hooks/use-model-policy', () => ({
  useModelPolicy: () => ({ data: { catalog: { models: [], providers: [] } } }),
}));

vi.mock('../../hooks/use-workspace-roles', () => ({
  usePolicyOverrides: () => mocks.overrides(),
  useWorkspaceRoles: () => ({ data: { roles: [] } }),
  useWorkspaceGroups: () => ({ data: { groups: [] } }),
  useUpsertPolicyOverride: () => ({ mutate: mocks.upsertOverride, isPending: false, error: null }),
  useDeletePolicyOverride: () => ({ mutate: mocks.deleteOverride, isPending: false, error: null }),
}));

import { WorkspaceFeatureControls } from '../WorkspaceFeatureControls';

function withPolicy(configured = true, canManagePolicy = true) {
  mocks.policy.mockReturnValue({
    data: {
      organizationId: 'org-1',
      configured,
      canManagePolicy,
      currentUserRole: canManagePolicy ? 'admin' : 'viewer',
      policy: { controls: DEFAULT_WORKSPACE_CONTROLS },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.overrides.mockReturnValue({
    data: {
      overrides: [
        {
          id: 'override-1',
          organizationId: 'org-1',
          subjectType: 'user',
          subjectId: 'user-9',
          layer: { featureAccess: { code: false } },
          updatedAt: '2026-09-17T00:00:00.000Z',
        },
      ],
    },
  });
});

describe('WorkspaceFeatureControls', () => {
  it('saves a switched-off feature as a controls patch on the workspace policy', () => {
    withPolicy();
    render(<WorkspaceFeatureControls />);

    fireEvent.click(screen.getByRole('switch', { name: 'Allow Code' }));
    fireEvent.change(screen.getAllByLabelText('Highest reasoning level')[0]!, {
      target: { value: 'medium' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save features and defaults' }));

    const [patch] = mocks.updatePolicy.mock.calls[0] as [
      { controls: typeof DEFAULT_WORKSPACE_CONTROLS },
    ];
    expect(patch.controls.featureAccess.code).toBe(false);
    expect(patch.controls.featureAccess.work).toBe(true);
    expect(patch.controls.maxReasoningEffort).toBe('medium');
  });

  it('refuses to save from here before a workspace policy exists', () => {
    withPolicy(false);
    render(<WorkspaceFeatureControls />);

    expect(screen.getByRole('switch', { name: 'Allow Code' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save features and defaults' })).toBeNull();
    expect(screen.getByText(/Save the workspace policy above first/)).toBeInTheDocument();
    expect(screen.queryByText('Exceptions')).toBeNull();
  });

  it('shows the switches read-only to someone who cannot manage policy', () => {
    withPolicy(true, false);
    render(<WorkspaceFeatureControls />);

    expect(screen.getByRole('switch', { name: 'Allow Research' })).toBeDisabled();
    expect(screen.queryByText('Exceptions')).toBeNull();
  });

  it('writes a person exception with only the controls that differ from the defaults', () => {
    withPolicy();
    render(<WorkspaceFeatureControls />);

    fireEvent.change(screen.getByLabelText('Who the exception applies to'), {
      target: { value: 'user-9' },
    });
    const researchRow = screen.getAllByText('Research').at(-1)!.closest('label') as HTMLElement;
    fireEvent.change(within(researchRow).getByRole('combobox'), { target: { value: 'off' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save exception' }));

    expect(mocks.upsertOverride).toHaveBeenCalledWith(
      { subjectType: 'user', subjectId: 'user-9', layer: { featureAccess: { research: false } } },
      expect.anything(),
    );
  });

  it('asks before removing an exception and says what the person loses', () => {
    withPolicy();
    render(<WorkspaceFeatureControls />);

    expect(screen.getByText('Person: Casey Contractor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.deleteOverride).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('goes back to the workspace defaults');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove exception' }));
    expect(mocks.deleteOverride).toHaveBeenCalledWith('override-1');
  });
});
