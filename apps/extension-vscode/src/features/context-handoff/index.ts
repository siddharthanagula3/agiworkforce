import * as vscode from 'vscode';
import {
  parseCloudTaskHandoffQuery,
  parseDeveloperSessionHandoffQuery,
  parseLocalContextHandoffQuery,
  VSCODE_CLOUD_TASK_HANDOFF_PATH,
  VSCODE_DEVELOPER_SESSION_HANDOFF_PATH,
  VSCODE_CONTEXT_HANDOFF_PATH,
  type CloudTaskHandoff,
  type DeveloperSessionHandoffLink,
  type LocalContextHandoff,
  PRODUCT_NAMES,
} from '@agiworkforce/types';

import { t, tPlural } from '../../l10n';

export { openDeveloperSessionLink, resumePendingDeveloperSession } from './developerSessionLink';
export {
  parseCloudTaskHandoffQuery,
  VSCODE_CLOUD_TASK_HANDOFF_PATH,
  type CloudTaskHandoff,
} from '@agiworkforce/types';

export interface ContextHandoffTarget {
  prefillComposer: (text: string) => void;
  reveal: () => Promise<void>;
}

export function buildContextHandoffDraft(handoff: LocalContextHandoff): string {
  return `Selected in the browser, from ${handoff.sourceUrl}\n\n${handoff.selectedText}\n\n`;
}

export const PULL_CLOUD_TASK_COMMAND = 'agi-workforce.pullCloudTaskIntoWorkspace';

export function buildCloudTaskHandoffDraft(handoff: CloudTaskHandoff): string {
  const lines = [`Continuing cloud task ${handoff.runId} here.`];
  if (handoff.goal !== '') lines.push('', `Goal: ${handoff.goal}`);
  if (handoff.repository !== null) lines.push('', `Repository: ${handoff.repository}`);
  if (handoff.branch !== null) lines.push('', `Cloud branch: ${handoff.branch}`);
  if (handoff.plan.length > 0) {
    lines.push('', 'Plan so far:', ...handoff.plan.map((step) => `- ${step}`));
  }
  return `${lines.join('\n')}\n\n`;
}

export interface LocalCheckoutRepository {
  repository: string;
  rootPath: string;
  /** Paths the working tree or index has changed and no commit holds yet. */
  dirtyPaths: string[];
  fetch: () => Promise<void>;
  checkout: (branch: string) => Promise<void>;
}

export type LocalRepositoryLookup =
  | { status: 'found'; repository: LocalCheckoutRepository }
  | { status: 'missing' }
  | { status: 'ambiguous'; rootPaths: string[] };

export interface CloudResultPullHost {
  findRepository: (repository: string) => Promise<LocalRepositoryLookup>;
  /** Must name what is lost. Returning false leaves the checkout untouched. */
  confirmOverwrite: (
    dirtyPaths: readonly string[],
    branch: string,
    rootPath: string,
  ) => Promise<boolean>;
  report: (message: string) => void;
}

export type CloudResultPullOutcome =
  | { status: 'pulled'; branch: string }
  | { status: 'cancelled' }
  | { status: 'no-repository' }
  | { status: 'unknown-repository' }
  | { status: 'ambiguous-repository' }
  | { status: 'no-branch' }
  | { status: 'failed'; reason: string };

/**
 * Brings a cloud task's branch into the local checkout.
 *
 * A checkout with uncommitted work is the failure this guard exists for: the
 * branch switch would take that work with it or refuse halfway, so nothing
 * runs until the reader has seen the exact files at stake and said yes.
 */
export async function pullCloudResultIntoCheckout(
  handoff: CloudTaskHandoff,
  host: CloudResultPullHost,
): Promise<CloudResultPullOutcome> {
  if (handoff.branch === null) {
    host.report('That cloud task carries no branch to bring into this workspace.');
    return { status: 'no-branch' };
  }
  if (handoff.repository === null) {
    host.report(
      'That cloud task does not say which repository it ran on, so its branch was not checked out.',
    );
    return { status: 'unknown-repository' };
  }
  const lookup = await host.findRepository(handoff.repository);
  if (lookup.status === 'missing') {
    host.report(
      `Open a clone of ${handoff.repository} before pulling this cloud task's result in.`,
    );
    return { status: 'no-repository' };
  }
  if (lookup.status === 'ambiguous') {
    host.report(
      `More than one open folder is a clone of ${handoff.repository} (${lookup.rootPaths.join(', ')}). Keep one open and try again.`,
    );
    return { status: 'ambiguous-repository' };
  }
  const repository = lookup.repository;
  if (repository.dirtyPaths.length > 0) {
    const confirmed = await host.confirmOverwrite(
      repository.dirtyPaths,
      handoff.branch,
      repository.rootPath,
    );
    if (!confirmed) return { status: 'cancelled' };
  }
  try {
    await repository.fetch();
    await repository.checkout(handoff.branch);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    host.report(`The cloud branch could not be checked out, ${reason}`);
    return { status: 'failed', reason };
  }
  host.report(`${repository.rootPath} (${repository.repository}) is now on ${handoff.branch}.`);
  return { status: 'pulled', branch: handoff.branch };
}

export function describeDirtyOverwrite(
  dirtyPaths: readonly string[],
  branch: string,
): { message: string; detail: string } {
  const shown = dirtyPaths.slice(0, 10);
  const rest = dirtyPaths.length - shown.length;
  return {
    message: t('handoff.switchBranch', { branch }),
    detail: [
      tPlural('handoff.uncommittedFiles', dirtyPaths.length, { branch }),
      '',
      ...shown,
      ...(rest > 0 ? [tPlural('handoff.andMore', rest)] : []),
    ].join('\n'),
  };
}

interface GitRepositoryApi {
  rootUri: vscode.Uri;
  state: {
    workingTreeChanges: Array<{ uri: vscode.Uri }>;
    indexChanges: Array<{ uri: vscode.Uri }>;
    remotes: Array<{ name: string; fetchUrl?: string }>;
    HEAD?: { name?: string; upstream?: { remote: string; name: string }; ahead?: number };
  };
  fetch: () => Promise<void>;
  checkout: (branch: string) => Promise<void>;
}

async function openGitRepositories(): Promise<GitRepositoryApi[] | null> {
  if (vscode.workspace.workspaceFolders?.[0] === undefined) return null;
  const extension = vscode.extensions.getExtension('vscode.git');
  if (extension === undefined) return null;
  if (!extension.isActive) await extension.activate();
  return (
    extension.exports as { getAPI: (version: number) => { repositories: GitRepositoryApi[] } }
  ).getAPI(1).repositories;
}

async function workspaceGitRepository(): Promise<GitRepositoryApi | null> {
  const repositories = await openGitRepositories();
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (repositories === null || folder === undefined) return null;
  return (
    repositories.find((candidate) => candidate.rootUri.fsPath === folder.uri.fsPath) ??
    repositories[0] ??
    null
  );
}

function repositoryRemoteNames(repository: GitRepositoryApi): string[] {
  return repository.state.remotes
    .map((remote) => (remote.fetchUrl ? githubRepositoryName(remote.fetchUrl) : null))
    .filter((name): name is string => name !== null);
}

function checkoutRepository(repository: string, git: GitRepositoryApi): LocalCheckoutRepository {
  return {
    repository,
    rootPath: git.rootUri.fsPath,
    dirtyPaths: [...git.state.workingTreeChanges, ...git.state.indexChanges].map((change) =>
      vscode.workspace.asRelativePath(change.uri),
    ),
    fetch: () => git.fetch(),
    checkout: (branch: string) => git.checkout(branch),
  };
}

async function findGitRepositoryByName(repository: string): Promise<LocalRepositoryLookup> {
  const repositories = await openGitRepositories();
  const matches = (repositories ?? []).filter((candidate) =>
    repositoryRemoteNames(candidate).includes(repository),
  );
  const [only, ...others] = matches;
  if (only === undefined) return { status: 'missing' };
  if (others.length > 0) {
    return {
      status: 'ambiguous',
      rootPaths: matches.map((candidate) => candidate.rootUri.fsPath),
    };
  }
  return { status: 'found', repository: checkoutRepository(repository, only) };
}

const GITHUB_REMOTE_RE = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

export function githubRepositoryName(remoteUrl: string): string | null {
  const match = GITHUB_REMOTE_RE.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

export async function workspaceGitHubRepositories(): Promise<string[]> {
  const repository = await workspaceGitRepository().catch(() => null);
  if (repository === null) return [];
  return repositoryRemoteNames(repository);
}

export interface WorkspaceCloudSource {
  repository: string;
  repositoryUrl: string;
  branch: string | null;
  upstream: string | null;
  unpushedCommits: number;
  dirtyPaths: string[];
}

export async function readWorkspaceCloudSource(): Promise<WorkspaceCloudSource | null> {
  const repository = await workspaceGitRepository();
  if (repository === null) return null;
  const head = repository.state.HEAD;
  const remotes = repository.state.remotes;
  const preferred =
    remotes.find((remote) => remote.name === head?.upstream?.remote) ??
    remotes.find((remote) => remote.name === 'origin') ??
    remotes[0];
  const name = preferred?.fetchUrl ? githubRepositoryName(preferred.fetchUrl) : null;
  if (name === null) return null;
  return {
    repository: name,
    repositoryUrl: `https://github.com/${name}`,
    branch: head?.name ?? null,
    upstream: head?.upstream ? `${head.upstream.remote}/${head.upstream.name}` : null,
    unpushedCommits: head?.ahead ?? 0,
    dirtyPaths: [...repository.state.workingTreeChanges, ...repository.state.indexChanges].map(
      (change) => vscode.workspace.asRelativePath(change.uri),
    ),
  };
}

/** The workspace's own git repository, through the editor's git extension. */
export async function resolveGitCheckoutHost(): Promise<CloudResultPullHost> {
  return {
    findRepository: findGitRepositoryByName,
    confirmOverwrite: async (dirtyPaths, branch, rootPath) => {
      const { message, detail } = describeDirtyOverwrite(dirtyPaths, branch);
      const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail: `${rootPath}\n\n${detail}` },
        'Switch anyway',
      );
      return choice === 'Switch anyway';
    },
    report: (message: string) => {
      void vscode.window.showInformationMessage(`${PRODUCT_NAMES.code}: ${message}`);
    },
  };
}

export async function handleContextHandoffUri(
  uri: vscode.Uri,
  target: ContextHandoffTarget | undefined,
  resolvePullHost?: () => Promise<CloudResultPullHost>,
  openDeveloperSession?: (link: DeveloperSessionHandoffLink) => Promise<void>,
): Promise<boolean> {
  if (uri.path === VSCODE_CLOUD_TASK_HANDOFF_PATH) {
    return handleCloudTaskHandoffUri(uri, target, resolvePullHost);
  }
  if (uri.path === VSCODE_DEVELOPER_SESSION_HANDOFF_PATH && openDeveloperSession !== undefined) {
    const link = parseDeveloperSessionHandoffQuery(uri.query);
    if (link === null) {
      void vscode.window.showWarningMessage(
        `${PRODUCT_NAMES.code}: that session link names no session or folder. Send it again from the desktop app.`,
      );
      return false;
    }
    await openDeveloperSession(link);
    return true;
  }
  if (uri.path !== VSCODE_CONTEXT_HANDOFF_PATH) {
    void vscode.window.showWarningMessage(
      `${PRODUCT_NAMES.code}: this link asks for "${uri.path}", which this extension does not handle.`,
    );
    return false;
  }
  const handoff = parseLocalContextHandoffQuery(uri.query);
  if (handoff === null) {
    void vscode.window.showWarningMessage(
      `${PRODUCT_NAMES.code}: that browser handoff link is expired or malformed. Select the text again in Chrome.`,
    );
    return false;
  }
  if (target === undefined) {
    void vscode.window.showWarningMessage(
      `${PRODUCT_NAMES.code}: the chat view is not available, so the browser selection was not placed. Reload the window and send it again.`,
    );
    return false;
  }
  target.prefillComposer(buildContextHandoffDraft(handoff));
  await target.reveal();
  return true;
}

export const BRING_CLOUD_BRANCH_IN = 'Bring the branch in';

export async function handleCloudTaskHandoffUri(
  uri: vscode.Uri,
  target: ContextHandoffTarget | undefined,
  resolvePullHost?: () => Promise<CloudResultPullHost>,
): Promise<boolean> {
  const handoff = parseCloudTaskHandoffQuery(uri.query);
  if (handoff === null) {
    void vscode.window.showWarningMessage(
      `${PRODUCT_NAMES.code}: that cloud task link names no task. Open the task in the browser and send it again.`,
    );
    return false;
  }
  if (target === undefined) {
    void vscode.window.showWarningMessage(
      `${PRODUCT_NAMES.code}: the chat view is not available, so the cloud task context was not placed. Reload the window and send it again.`,
    );
    return false;
  }
  await continueCloudWorkHere(
    buildCloudTaskHandoffDraft(handoff),
    handoff,
    target,
    resolvePullHost,
  );
  return true;
}

export async function continueCloudWorkHere(
  draft: string,
  handoff: CloudTaskHandoff,
  target: ContextHandoffTarget,
  resolvePullHost?: () => Promise<CloudResultPullHost>,
): Promise<void> {
  target.prefillComposer(draft);
  await target.reveal();
  // Opening a link must never move the checkout on its own. The branch comes
  // in only when the reader asks, and the dirty-tree guard still runs after.
  if (handoff.branch !== null && handoff.repository !== null && resolvePullHost !== undefined) {
    const choice = await vscode.window.showInformationMessage(
      `${PRODUCT_NAMES.code}: this cloud task works on ${handoff.branch} in ${handoff.repository}.`,
      BRING_CLOUD_BRANCH_IN,
    );
    if (choice === BRING_CLOUD_BRANCH_IN) {
      await pullCloudResultIntoCheckout(handoff, await resolvePullHost());
    }
  }
}

export function registerContextHandoffUriHandler(
  resolveTarget: () => ContextHandoffTarget | undefined,
  resolvePullHost: () => Promise<CloudResultPullHost> = resolveGitCheckoutHost,
  openDeveloperSession?: (link: DeveloperSessionHandoffLink) => Promise<void>,
): vscode.Disposable {
  return vscode.window.registerUriHandler({
    handleUri: (uri) => {
      void handleContextHandoffUri(uri, resolveTarget(), resolvePullHost, openDeveloperSession);
    },
  });
}
