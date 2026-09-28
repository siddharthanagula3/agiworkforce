'use client';

import { useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { toUserMessage } from '@agiworkforce/unified-chat/network-error';
import {
  useOrganizationSharedOverview,
  useShareProjectWithOrganization,
  useUnshareProjectFromOrganization,
  type ProjectShareAudience,
} from '@/features/settings/hooks/use-settings-queries';
import {
  ProjectAudienceSelect,
  SharedProjectAudienceControl,
  SharedProjectMemberAccessList,
} from './ProjectSharingControls';

export interface ProjectShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  isOwner: boolean;
}

async function copyProjectLink(projectId: string): Promise<void> {
  const url = `${window.location.origin}/chat/projects/${encodeURIComponent(projectId)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Project link copied. It opens only for people who have access.');
  } catch (error) {
    toast.error(toUserMessage(error, 'Could not copy the project link'));
  }
}

const noteStyle = { margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' } as const;

export function ProjectShareDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  isOwner,
}: ProjectShareDialogProps) {
  const overview = useOrganizationSharedOverview();
  const shareProject = useShareProjectWithOrganization();
  const unshareProject = useUnshareProjectFromOrganization();
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [audience, setAudience] = useState<ProjectShareAudience>('invited');

  const data = overview.data ?? null;
  const shared = data?.sharedProjects.find((project) => project.projectId === projectId) ?? null;
  const canManage =
    Boolean(data?.canManageSharing) || (Boolean(data?.canShareOwnProjects) && isOwner);

  let body: ReactNode;
  if (overview.isLoading) {
    body = <Spinner size="default" />;
  } else if (overview.isError) {
    body = (
      <p role="alert" style={noteStyle}>
        {toUserMessage(overview.error, 'Sharing could not be loaded. Try again.')}
      </p>
    );
  } else if (!data) {
    body = (
      <p style={noteStyle}>
        Only you can open this project. Switch to a team workspace to share projects with its
        members.
      </p>
    );
  } else if (!canManage && shared) {
    body = (
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <p style={noteStyle}>Only the project&rsquo;s owner changes who can open it.</p>
        <SharedProjectMemberAccessList project={shared} members={data.members} canManage={false} />
      </div>
    );
  } else if (!canManage) {
    body = (
      <p style={noteStyle}>
        This project is not shared. Only its owner can share it, when their workspace role lets them
        share their work.
      </p>
    );
  } else if (!shared && !isOwner) {
    body = <p style={noteStyle}>This project is not shared. Only its owner can share it.</p>;
  } else if (!shared) {
    body = (
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <p style={noteStyle}>
          Invite specific people or open it to everyone in the workspace. Its instructions and files
          are shared; each person&rsquo;s chats stay private.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <label htmlFor="project-share-audience" className="sr-only">
            Who can open it
          </label>
          <ProjectAudienceSelect
            id="project-share-audience"
            value={audience}
            onChange={setAudience}
          />
          <Button
            size="sm"
            disabled={shareProject.isPending}
            onClick={() => shareProject.mutate({ projectId, audience })}
          >
            {shareProject.isPending ? 'Sharing…' : 'Share'}
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <SharedProjectAudienceControl project={shared} />
        <SharedProjectMemberAccessList project={shared} members={data.members} canManage />
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={unshareProject.isPending}
            onClick={() =>
              confirm({
                title: `Stop sharing ${projectName}?`,
                description:
                  'Everyone you shared it with loses access to its instructions and files. You keep the project and can share it again.',
                confirmLabel: 'Stop sharing',
                onConfirm: () => unshareProject.mutate(projectId),
              })
            }
          >
            Stop sharing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share {projectName}</DialogTitle>
            <DialogDescription>
              Choose who can open this project and what they can do.
            </DialogDescription>
          </DialogHeader>
          <div
            data-testid="project-share-dialog"
            style={{ display: 'grid', gap: 'var(--space-4)' }}
          >
            {body}
            <div>
              <Button size="sm" variant="ghost" onClick={() => void copyProjectLink(projectId)}>
                <Link2 className="me-1.5 h-4 w-4" aria-hidden />
                Copy link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
