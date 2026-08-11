import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  activeOrganizationId: null as string | null,
  workspaces: [] as Array<{
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    joinedAt: string;
  }>,
  mutate: vi.fn(),
}));

vi.mock('@/features/settings/hooks/use-settings-queries', () => ({
  useOrganizationOverview: () => ({
    data: {
      organization: null,
      activeOrganizationId: state.activeOrganizationId,
      workspaces: state.workspaces,
      access: {},
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSwitchWorkspace: () => ({ mutate: state.mutate, isPending: false }),
}));

vi.mock('@agiworkforce/ui', () => ({
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

describe('WorkspaceMenuItems', () => {
  beforeEach(() => {
    state.activeOrganizationId = null;
    state.workspaces = [];
    vi.clearAllMocks();
  });

  it('shows Personal as the selected durable scope and opens management', () => {
    const onManage = vi.fn();
    render(<WorkspaceMenuItems onManage={onManage} />);

    expect(screen.getByRole('button', { name: /Personal Selected/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Manage workspaces' }));
    expect(onManage).toHaveBeenCalledOnce();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('lists every membership and switches only when the target is different', () => {
    state.activeOrganizationId = '11111111-1111-4111-8111-111111111111';
    state.workspaces = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Current Team',
        slug: 'current-team',
        role: 'owner',
        joinedAt: '2026-08-11T00:00:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Invited Team',
        slug: 'invited-team',
        role: 'member',
        joinedAt: '2026-08-11T00:00:00.000Z',
      },
    ];

    render(<WorkspaceMenuItems onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Current Team Selected/i }));
    expect(state.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Invited Team' }));
    expect(state.mutate).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');

    fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
    expect(state.mutate).toHaveBeenCalledWith(null);
  });
});
