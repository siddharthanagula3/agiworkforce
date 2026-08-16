'use client';

import { Building2, Check, Loader2, UserRound, Users } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@agiworkforce/ui';
import {
  useOrganizationOverview,
  useSwitchWorkspace,
} from '@/features/settings/hooks/use-settings-queries';

export interface WorkspaceMenuItemsProps {
  onManage: () => void;
}

export function WorkspaceMenuItems({ onManage }: WorkspaceMenuItemsProps) {
  const overview = useOrganizationOverview();
  const switchWorkspace = useSwitchWorkspace();
  const selectedId = overview.data?.activeOrganizationId ?? null;

  return (
    <>
      <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Workspace
      </DropdownMenuLabel>
      {overview.isLoading ? (
        <DropdownMenuItem disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading workspaces…
        </DropdownMenuItem>
      ) : overview.isError ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void overview.refetch();
          }}
        >
          Try loading workspaces again
        </DropdownMenuItem>
      ) : (
        <>
          <DropdownMenuItem
            disabled={switchWorkspace.isPending}
            onSelect={() => {
              if (selectedId !== null) switchWorkspace.mutate(null);
            }}
            className="gap-2"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Personal</span>
            {selectedId === null ? <Check className="h-4 w-4" aria-label="Selected" /> : null}
          </DropdownMenuItem>
          {(overview.data?.workspaces ?? []).map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              disabled={switchWorkspace.isPending}
              onSelect={() => {
                if (selectedId !== workspace.id) switchWorkspace.mutate(workspace.id);
              }}
              className="gap-2"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              {selectedId === workspace.id ? (
                <Check className="h-4 w-4" aria-label="Selected" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </>
      )}
      <DropdownMenuItem onSelect={onManage}>
        <Users className="mr-2 h-4 w-4" aria-hidden="true" />
        Manage workspaces
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}
