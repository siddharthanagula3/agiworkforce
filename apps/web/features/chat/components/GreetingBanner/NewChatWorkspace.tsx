'use client';

import { Building2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceSummary } from '@agiworkforce/types';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';

export function NewChatWorkspace() {
  const { t } = useTranslation('common');
  const { data } = useAccountWorkspaces();
  const organizations = (data?.workspaces ?? []).filter(
    (workspace: WorkspaceSummary) => workspace.kind === 'organization',
  );
  if (!data || organizations.length === 0) return null;

  const activeOrganization =
    data.scope === 'organization'
      ? organizations.find((workspace) => workspace.id === data.activeWorkspaceId)
      : undefined;
  if (data.scope === 'organization' && !activeOrganization) return null;

  const name = activeOrganization?.name ?? t('navPersonalWorkspace', { defaultValue: 'Personal' });
  const WorkspaceIcon = activeOrganization ? Building2 : UserRound;

  return (
    <p className="flex max-w-full items-center justify-center gap-1.5 px-4 text-sm text-muted-foreground">
      <WorkspaceIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{t('newChat.workspace', { name })}</span>
    </p>
  );
}
