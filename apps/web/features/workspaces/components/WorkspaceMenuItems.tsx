'use client';

import { Building2, Check, UserRound, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceSummary } from '@agiworkforce/types';
import {
  Badge,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Spinner,
} from '@agiworkforce/ui';
import {
  useAccountWorkspaces,
  useSelectWorkspace,
} from '@/features/workspaces/hooks/use-workspaces';

export interface WorkspaceMenuItemsProps {
  onManage: () => void;
}

function WorkspaceRow({
  icon,
  label,
  detail,
  selected,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() => {
        if (!selected) onSelect();
      }}
      className="gap-2"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <Badge variant="outline" className="shrink-0 capitalize">
          {detail}
        </Badge>
      ) : null}
      {selected ? <Check className="h-4 w-4 shrink-0" aria-label="Selected" /> : null}
    </DropdownMenuItem>
  );
}

/**
 * The workspace switcher. Personal and enterprise scope are separated into
 * labelled groups because they differ in who can read the content in them, and
 * a list that only changes an icon lets somebody paste into the wrong one.
 */
export function WorkspaceMenuItems({ onManage }: WorkspaceMenuItemsProps) {
  const { t } = useTranslation('common');
  const workspaces = useAccountWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const activeId = workspaces.data?.activeWorkspaceId ?? null;
  const personalSelected = workspaces.data?.scope !== 'organization';
  const organizations = (workspaces.data?.workspaces ?? []).filter(
    (workspace: WorkspaceSummary) => workspace.kind === 'organization',
  );

  return (
    <>
      <DropdownMenuLabel className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t('navWorkspaceSection', { defaultValue: 'Workspace' })}
      </DropdownMenuLabel>
      {workspaces.isLoading ? (
        <DropdownMenuItem disabled className="gap-2">
          <Spinner size="sm" />
          {t('navLoadingWorkspaces', { defaultValue: 'Loading workspaces' })}
        </DropdownMenuItem>
      ) : workspaces.isError ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void workspaces.refetch();
          }}
        >
          {t('navRetryWorkspaces', { defaultValue: 'Try loading workspaces again' })}
        </DropdownMenuItem>
      ) : (
        <>
          <WorkspaceRow
            icon={<UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />}
            label={t('navPersonalWorkspace', { defaultValue: 'Personal' })}
            detail={t('navPersonalScope', { defaultValue: 'Only you' })}
            selected={personalSelected}
            disabled={selectWorkspace.isPending}
            onSelect={() => selectWorkspace.mutate(null)}
          />
          {organizations.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('navEnterpriseWorkspaces', { defaultValue: 'Enterprise' })}
              </DropdownMenuLabel>
              {organizations.map((workspace: WorkspaceSummary) => (
                <WorkspaceRow
                  key={workspace.id}
                  icon={<Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  label={workspace.name}
                  detail={workspace.role}
                  selected={!personalSelected && activeId === workspace.id}
                  disabled={selectWorkspace.isPending}
                  onSelect={() => selectWorkspace.mutate(workspace.id)}
                />
              ))}
            </>
          ) : null}
        </>
      )}
      <DropdownMenuItem onSelect={onManage}>
        <Users className="mr-2 h-4 w-4" aria-hidden="true" />
        {t('navManageWorkspaces', { defaultValue: 'Manage workspaces' })}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}
