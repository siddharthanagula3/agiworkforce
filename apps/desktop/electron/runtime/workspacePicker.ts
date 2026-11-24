import type { WorkspaceRoot, WorkspaceRootKind } from '@agiworkforce/local-runtime-contract';
import { findRepositoryRoot } from './gitService';
import { WorkspaceGrantRefused, grantRoot } from './workspaceStore';

export const WORKSPACE_PICKER_COPY: Record<
  WorkspaceRootKind,
  { title: string; buttonLabel: string; cancelled: string }
> = {
  folder: {
    title: 'Choose a project folder',
    buttonLabel: 'Approve folder',
    cancelled: 'No folder was chosen.',
  },
  repository: {
    title: 'Choose a git repository',
    buttonLabel: 'Approve repository',
    cancelled: 'No repository was chosen.',
  },
};

const NOT_A_REPOSITORY =
  'That folder is not inside a git repository. Choose the repository itself, or add it as a folder instead.';

export async function grantPickedRoot(
  selected: string,
  kind: WorkspaceRootKind,
): Promise<WorkspaceRoot> {
  if (kind === 'folder') return grantRoot(selected);
  const repository = await findRepositoryRoot(selected);
  if (!repository) throw new WorkspaceGrantRefused(NOT_A_REPOSITORY);
  return grantRoot(repository, 'repository');
}
