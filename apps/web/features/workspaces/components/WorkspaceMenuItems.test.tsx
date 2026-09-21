import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSummary } from '@agiworkforce/types';

const state = vi.hoisted(() => ({
  activeWorkspaceId: null as string | null,
  scope: 'personal' as 'personal' | 'organization',
  workspaces: [] as WorkspaceSummary[],
  isLoading: false,
  isError: false,
  switchPending: false,
  switchError: null as Error | null,
  switchVariables: undefined as string | null | undefined,
  interruptions: [] as { kind: string; description: string }[],
  mutate: vi.fn(),
  reset: vi.fn(),
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
  useSelectWorkspace: () => ({
    mutate: state.mutate,
    reset: state.reset,
    isPending: state.switchPending,
    isError: state.switchError !== null,
    error: state.switchError,
    variables: state.switchVariables,
  }),
}));

vi.mock('@/features/workspaces/lib/workspace-switch-interruptions', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/workspaces/lib/workspace-switch-interruptions')
  >()),
  useWorkspaceSwitchInterruptions: () => state.interruptions,
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
    state.switchPending = false;
    state.switchError = null;
    state.switchVariables = undefined;
    state.interruptions = [];
    vi.clearAllMocks();
  });

  function twoWorkspaces() {
    state.scope = 'organization';
    state.activeWorkspaceId = ORG_ONE;
    state.workspaces = [
      organizationWorkspace(ORG_ONE, 'Current Team', 'owner'),
      organizationWorkspace(ORG_TWO, 'Invited Team', 'member'),
    ];
  }

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

  it('switches without a confirmation when nothing would be interrupted', () => {
    twoWorkspaces();
    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Invited Team member/i }));

    expect(state.mutate).toHaveBeenCalledWith(ORG_TWO);
    expect(screen.queryByRole('button', { name: 'Switch anyway' })).toBeNull();
  });

  it('names the work a switch would end before it ends it', () => {
    twoWorkspaces();
    state.interruptions = [
      { kind: 'draft', description: 'You have an unsent message.' },
      { kind: 'upload', description: 'A file is still uploading.' },
    ];
    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Invited Team member/i }));

    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Invited Team')).toBeVisible();
    expect(screen.getByText('You have an unsent message.')).toBeVisible();
    expect(screen.getByText('A file is still uploading.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Switch anyway' }));
    expect(state.mutate).toHaveBeenCalledWith(ORG_TWO);
  });

  it('leaves the workspace unchanged when the interruption warning is declined', () => {
    twoWorkspaces();
    state.interruptions = [{ kind: 'reply', description: 'A reply is still being written.' }];
    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Invited Team member/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Stay in this workspace' }));

    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Invited Team member/i })).toBeVisible();
  });

  it('shows the switch in progress rather than closing onto the old workspace', () => {
    twoWorkspaces();
    state.switchPending = true;
    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    expect(screen.getByText('Switching workspace')).toBeVisible();
    expect(screen.getByRole('button', { name: /Invited Team member/i })).toBeDisabled();
  });

  it('reports a failed switch instead of leaving the user in the old workspace silently', () => {
    twoWorkspaces();
    state.switchError = new Error('We could not switch workspaces. Try again.');
    state.switchVariables = ORG_TWO;
    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('We could not switch workspaces.');

    fireEvent.click(screen.getByRole('button', { name: 'Try switching again' }));
    expect(state.mutate).toHaveBeenCalledWith(ORG_TWO);
  });
});
