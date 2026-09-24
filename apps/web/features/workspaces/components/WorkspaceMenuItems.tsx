'use client';

import { useId, useState } from 'react';
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
import { useWorkspaceSwitchInterruptions } from '@/features/workspaces/lib/workspace-switch-interruptions';

export interface WorkspaceMenuItemsProps {
  onManage: () => void;
}

interface SwitchTarget {
  id: string | null;
  name: string;
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
      onSelect={(event) => {
        // The switch reports progress and failure in this panel, so it has to
        // outlive the click that started it.
        event.preventDefault();
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
  const interruptions = useWorkspaceSwitchInterruptions();
  const [confirming, setConfirming] = useState<SwitchTarget | null>(null);
  const confirmDescriptionId = useId();
  const activeId = workspaces.data?.activeWorkspaceId ?? null;
  const personalSelected = workspaces.data?.scope !== 'organization';
  const organizations = (workspaces.data?.workspaces ?? []).filter(
    (workspace: WorkspaceSummary) => workspace.kind === 'organization',
  );

  const startSwitch = (target: SwitchTarget) => {
    selectWorkspace.reset();
    if (interruptions.length > 0) {
      setConfirming(target);
      return;
    }
    selectWorkspace.mutate(target.id);
  };

  const confirmSwitch = () => {
    if (!confirming) return;
    const { id } = confirming;
    setConfirming(null);
    selectWorkspace.mutate(id);
  };

  if (confirming) {
    return (
      <>
        <DropdownMenuLabel className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t('navWorkspaceSection', { defaultValue: 'Workspace' })}
        </DropdownMenuLabel>
        <div id={confirmDescriptionId} className="px-2 pb-1 text-sm">
          <p className="truncate font-medium text-popover-foreground">{confirming.name}</p>
          <p className="mt-1 text-muted-foreground">
            {t('navWorkspaceSwitchConfirmBody', {
              defaultValue:
                'Switching reloads the app in this workspace. This work does not come with you:',
            })}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {interruptions.map((interruption) => (
              <li key={interruption.kind}>{interruption.description}</li>
            ))}
          </ul>
        </div>
        <DropdownMenuItem
          aria-describedby={confirmDescriptionId}
          onSelect={(event) => {
            event.preventDefault();
            confirmSwitch();
          }}
        >
          {t('navWorkspaceSwitchConfirm', { defaultValue: 'Switch anyway' })}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setConfirming(null);
          }}
        >
          {t('navWorkspaceSwitchCancel', { defaultValue: 'Stay in this workspace' })}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    );
  }

  return (
    <>
      <DropdownMenuLabel className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
            onSelect={() =>
              startSwitch({
                id: null,
                name: t('navPersonalWorkspace', { defaultValue: 'Personal' }),
              })
            }
          />
          {organizations.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
                  onSelect={() => startSwitch({ id: workspace.id, name: workspace.name })}
                />
              ))}
            </>
          ) : null}
        </>
      )}
      {selectWorkspace.isPending ? (
        <DropdownMenuItem disabled className="gap-2">
          <Spinner size="sm" />
          {t('navSwitchingWorkspace', { defaultValue: 'Switching workspace' })}
        </DropdownMenuItem>
      ) : null}
      {selectWorkspace.isError ? (
        <>
          <p role="alert" className="px-2 py-1 text-sm text-danger">
            {selectWorkspace.error.message}
          </p>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              selectWorkspace.mutate(selectWorkspace.variables ?? null);
            }}
          >
            {t('navRetryWorkspaceSwitch', { defaultValue: 'Try switching again' })}
          </DropdownMenuItem>
        </>
      ) : null}
      <DropdownMenuItem onSelect={onManage}>
        <Users className="mr-2 h-4 w-4" aria-hidden="true" />
        {t('navManageWorkspaces', { defaultValue: 'Manage workspaces' })}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}
