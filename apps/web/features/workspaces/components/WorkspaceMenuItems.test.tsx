import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSummary } from '@agiworkforce/types';

const state = vi.hoisted(() => ({
  activeWorkspaceId: null as string | null,
  scope: 'personal' as 'personal' | 'organization',
  workspaces: [] as WorkspaceSummary[],
  isLoading: false,
  isError: false,
  mutate: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/features/workspaces/hooks/use-workspaces', () => ({
  useAccountWorkspaces: () => ({
    data:
      state.isLoading || state.isError
        ? undefined
        : {
            workspaces: state.workspaces,
            activeWorkspaceId: state.activeWorkspaceId,
            activeOrganizationId: state.activeWorkspaceId,
            scope: state.scope,
          },
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: state.refetch,
  }),
  useSelectWorkspace: () => ({ mutate: state.mutate, isPending: false }),
}));

vi.mock('@agiworkforce/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Spinner: () => <span role="status">Loading</span>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: (event: { preventDefault: () => void }) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect?.({ preventDefault: vi.fn() })}
    >
      {children}
    </button>
  ),
}));

import { WorkspaceMenuItems } from './WorkspaceMenuItems';

const ORG_ONE = '11111111-1111-4111-8111-111111111111';
const ORG_TWO = '22222222-2222-4222-8222-222222222222';

function organizationWorkspace(id: string, name: string, role: string): WorkspaceSummary {
  return {
    id,
    kind: 'organization',
    organizationId: id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    isPrimary: true,
    role,
  };
}

describe('WorkspaceMenuItems', () => {
  beforeEach(() => {
    state.activeWorkspaceId = null;
    state.scope = 'personal';
    state.workspaces = [];
    state.isLoading = false;
    state.isError = false;
    vi.clearAllMocks();
  });

  it('shows Personal as the selected durable scope and opens management', () => {
    const onManage = vi.fn();
    render(<WorkspaceMenuItems onManage={onManage} />);

    expect(screen.getByRole('button', { name: /Personal Only you Selected/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Manage workspaces' }));
    expect(onManage).toHaveBeenCalledOnce();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('separates personal from enterprise scope and names the role in each', () => {
    state.scope = 'organization';
    state.activeWorkspaceId = ORG_ONE;
    state.workspaces = [
      organizationWorkspace(ORG_ONE, 'Current Team', 'owner'),
      organizationWorkspace(ORG_TWO, 'Invited Team', 'member'),
    ];

    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    expect(screen.getByText('Enterprise')).toBeVisible();
    expect(screen.getByRole('button', { name: /Current Team owner Selected/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Personal Only you$/i })).toBeVisible();
  });

  it('switches only when the target is a different workspace', () => {
    state.scope = 'organization';
    state.activeWorkspaceId = ORG_ONE;
    state.workspaces = [
      organizationWorkspace(ORG_ONE, 'Current Team', 'owner'),
      organizationWorkspace(ORG_TWO, 'Invited Team', 'member'),
    ];

    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Current Team owner Selected/i }));
    expect(state.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Invited Team member/i }));
    expect(state.mutate).toHaveBeenCalledWith(ORG_TWO);

    fireEvent.click(screen.getByRole('button', { name: /Personal Only you/i }));
    expect(state.mutate).toHaveBeenCalledWith(null);
  });

  it('offers a retry rather than an empty list when the workspaces cannot be read', () => {
    state.isError = true;
    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Personal/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try loading workspaces again' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it('announces loading to a screen reader instead of spinning silently', () => {
    state.isLoading = true;
    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    expect(screen.getByRole('status')).toBeVisible();
  });
});
