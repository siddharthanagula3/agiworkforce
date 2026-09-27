import {
  cloudCodeRepositoryLabel,
  type CloudCodeSession,
  type CloudCodeSessionState,
} from '@agiworkforce/types';

export const CLOUD_CODE_SCREEN_TITLE = 'AGI Code';

type CloudCodeBadgeColor = 'gray' | 'blue' | 'red';

export const CLOUD_CODE_STATE_BADGE_COLORS: Readonly<
  Record<CloudCodeSessionState, CloudCodeBadgeColor>
> = {
  provisioning: 'blue',
  ready: 'gray',
  running: 'blue',
  failed: 'red',
  closed: 'gray',
};

export function cloudCodeWorkspaceLabel(
  session: Pick<CloudCodeSession, 'repositoryUrl' | 'workingBranch'>,
): string | null {
  const parts = [
    session.repositoryUrl ? cloudCodeRepositoryLabel(session.repositoryUrl) : null,
    session.workingBranch,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}
