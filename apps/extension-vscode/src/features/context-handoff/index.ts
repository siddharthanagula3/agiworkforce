import * as vscode from 'vscode';
import {
  parseCloudTaskHandoffQuery,
  parseLocalContextHandoffQuery,
  VSCODE_CLOUD_TASK_HANDOFF_PATH,
  VSCODE_CONTEXT_HANDOFF_PATH,
  type CloudTaskHandoff,
  type LocalContextHandoff,
} from '@agiworkforce/types';

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

export function readContextHandoffUri(uri: vscode.Uri): LocalContextHandoff | null {
  if (uri.path !== VSCODE_CONTEXT_HANDOFF_PATH) return null;
  return parseLocalContextHandoffQuery(uri.query);
}

export const PULL_CLOUD_TASK_COMMAND = 'agi-workforce.pullCloudTaskIntoWorkspace';

export function buildCloudTaskHandoffDraft(handoff: CloudTaskHandoff): string {
  const lines = [`Continuing cloud task ${handoff.runId} here.`];
  if (handoff.goal !== '') lines.push('', `Goal: ${handoff.goal}`);
  if (handoff.branch !== null) lines.push('', `Cloud branch: ${handoff.branch}`);
  if (handoff.plan.length > 0) {
    lines.push('', 'Plan so far:', ...handoff.plan.map((step) => `- ${step}`));
  }
  return `${lines.join('\n')}\n\n`;
}

export interface LocalCheckoutRepository {
  rootPath: string;
  /** Paths the working tree or index has changed and no commit holds yet. */
  dirtyPaths: string[];
  fetch: () => Promise<void>;
  checkout: (branch: string) => Promise<void>;
}

export interface CloudResultPullHost {
  findRepository: () => Promise<LocalCheckoutRepository | null>;
  /** Must name what is lost. Returning false leaves the checkout untouched. */
  confirmOverwrite: (dirtyPaths: readonly string[], branch: string) => Promise<boolean>;
  report: (message: string) => void;
}

export type CloudResultPullOutcome =
  | { status: 'pulled'; branch: string }
  | { status: 'cancelled' }
  | { status: 'no-repository' }
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
  const repository = await host.findRepository();
  if (repository === null) {
    host.report('Open the repository this cloud task ran on before pulling its result in.');
    return { status: 'no-repository' };
  }
  if (repository.dirtyPaths.length > 0) {
    const confirmed = await host.confirmOverwrite(repository.dirtyPaths, handoff.branch);
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
  host.report(`This workspace is now on ${handoff.branch}.`);
  return { status: 'pulled', branch: handoff.branch };
}

export function describeDirtyOverwrite(
  dirtyPaths: readonly string[],
  branch: string,
): { message: string; detail: string } {
  const shown = dirtyPaths.slice(0, 10);
  const rest = dirtyPaths.length - shown.length;
  return {
    message: `Switch this workspace to ${branch} and risk losing uncommitted changes?`,
    detail: [
      `${dirtyPaths.length} file${dirtyPaths.length === 1 ? '' : 's'} here have changes no commit holds. Checking out ${branch} can discard them, and that cannot be undone.`,
      '',
      ...shown,
      ...(rest > 0 ? [`and ${rest} more`] : []),
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

async function workspaceGitRepository(): Promise<GitRepositoryApi | null> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) return null;
  const extension = vscode.extensions.getExtension('vscode.git');
  if (extension === undefined) return null;
  if (!extension.isActive) await extension.activate();
  const api = (
    extension.exports as { getAPI: (version: number) => { repositories: GitRepositoryApi[] } }
  ).getAPI(1);
  return (
    api.repositories.find((candidate) => candidate.rootUri.fsPath === folder.uri.fsPath) ??
    api.repositories[0] ??
    null
  );
}

const GITHUB_REMOTE_RE = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

export function githubRepositoryName(remoteUrl: string): string | null {
  const match = GITHUB_REMOTE_RE.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

export async function workspaceGitHubRepositories(): Promise<string[]> {
  const repository = await workspaceGitRepository().catch(() => null);
  if (repository === null) return [];
  return repository.state.remotes
    .map((remote) => (remote.fetchUrl ? githubRepositoryName(remote.fetchUrl) : null))
    .filter((name): name is string => name !== null);
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
    findRepository: async () => {
      const repository = await workspaceGitRepository();
      if (repository === null) return null;
      return {
        rootPath: repository.rootUri.fsPath,
        dirtyPaths: [...repository.state.workingTreeChanges, ...repository.state.indexChanges].map(
          (change) => vscode.workspace.asRelativePath(change.uri),
        ),
        fetch: () => repository.fetch(),
        checkout: (branch: string) => repository.checkout(branch),
      };
    },
    confirmOverwrite: async (dirtyPaths, branch) => {
      const { message, detail } = describeDirtyOverwrite(dirtyPaths, branch);
      const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail },
        'Switch anyway',
      );
      return choice === 'Switch anyway';
    },
    report: (message: string) => {
      void vscode.window.showInformationMessage(`AGI Workforce: ${message}`);
    },
  };
}

export async function handleContextHandoffUri(
  uri: vscode.Uri,
  target: ContextHandoffTarget | undefined,
  resolvePullHost?: () => Promise<CloudResultPullHost>,
): Promise<boolean> {
  if (uri.path === VSCODE_CLOUD_TASK_HANDOFF_PATH) {
    return handleCloudTaskHandoffUri(uri, target, resolvePullHost);
  }
  if (uri.path !== VSCODE_CONTEXT_HANDOFF_PATH) {
    void vscode.window.showWarningMessage(
      `AGI Workforce: this link asks for "${uri.path}", which this extension does not handle.`,
    );
    return false;
  }
  const handoff = parseLocalContextHandoffQuery(uri.query);
  if (handoff === null) {
    void vscode.window.showWarningMessage(
      'AGI Workforce: that browser handoff link is expired or malformed. Select the text again in Chrome.',
    );
    return false;
  }
  if (target === undefined) {
    void vscode.window.showWarningMessage(
      'AGI Workforce: the chat view is not available, so the browser selection was not placed. Reload the window and send it again.',
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
      'AGI Workforce: that cloud task link names no task. Open the task in the browser and send it again.',
    );
    return false;
  }
  if (target === undefined) {
    void vscode.window.showWarningMessage(
      'AGI Workforce: the chat view is not available, so the cloud task context was not placed. Reload the window and send it again.',
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
  if (handoff.branch !== null && resolvePullHost !== undefined) {
    const choice = await vscode.window.showInformationMessage(
      `AGI Workforce: this cloud task works on ${handoff.branch}.`,
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
): vscode.Disposable {
  return vscode.window.registerUriHandler({
    handleUri: (uri) => {
      void handleContextHandoffUri(uri, resolveTarget(), resolvePullHost);
    },
  });
}
