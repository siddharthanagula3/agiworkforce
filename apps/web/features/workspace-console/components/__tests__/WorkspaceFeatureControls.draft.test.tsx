import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKSPACE_CONTROLS } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({ policy: vi.fn() }));

vi.mock('@/features/settings/hooks/use-settings-queries', () => ({
  useWorkspacePolicy: () => mocks.policy(),
  useUpdateWorkspacePolicy: () => ({ mutate: vi.fn(), isPending: false }),
  useTeamMembers: () => ({ data: [] }),
}));

vi.mock('../../hooks/use-model-policy', () => ({
  useModelPolicy: () => ({ data: { catalog: { models: [], providers: [] } } }),
}));

vi.mock('../../hooks/use-workspace-roles', () => ({
  usePolicyOverrides: () => ({ data: { overrides: [] } }),
  useWorkspaceRoles: () => ({ data: { roles: [] } }),
  useWorkspaceGroups: () => ({ data: { groups: [] } }),
  useUpsertPolicyOverride: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeletePolicyOverride: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  usePolicyDiagnosis: () => ({ data: undefined, error: null, isFetching: false }),
}));

import { WorkspaceFeatureControls } from '../WorkspaceFeatureControls';

function serverCountries(allowedCountries: string[]) {
  mocks.policy.mockReturnValue({
    data: {
      organizationId: 'org-1',
      configured: true,
      canManagePolicy: true,
      currentUserRole: 'admin',
      policy: { controls: { ...DEFAULT_WORKSPACE_CONTROLS, allowedCountries } },
    },
  });
}

const countriesInput = () => screen.getByLabelText(/Allowed countries, as two-letter codes/);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceFeatureControls draft lifecycle', () => {
  it('keeps unsaved country codes when the saved policy changes underneath them', () => {
    serverCountries(['DE']);
    const { rerender } = render(<WorkspaceFeatureControls />);

    fireEvent.change(countriesInput(), { target: { value: 'FR' } });

    serverCountries(['DE', 'IT']);
    rerender(<WorkspaceFeatureControls />);

    expect(countriesInput()).toHaveValue('FR');
  });

  it('adopts the saved countries when nothing is unsaved', () => {
    serverCountries(['DE']);
    const { rerender } = render(<WorkspaceFeatureControls />);

    serverCountries(['DE', 'IT']);
    rerender(<WorkspaceFeatureControls />);

    expect(countriesInput()).toHaveValue('DE, IT');
  });
});
