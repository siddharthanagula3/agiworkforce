import * as vscode from 'vscode';
import type { PullRequestPlan, PullRequestResult } from '../../integrations/localRuntimeClient';
import { t } from '../../l10n';
import type { CliCapabilityAdapter } from './cliCapabilities';

export const CREATE_PULL_REQUEST_COMMAND = 'agi-workforce.createPullRequest';

const MAX_LISTED_COMMITS = 10;
const MAX_TITLE_CHARS = 256;

function reportFailure(reason: string): void {
  void vscode.window.showErrorMessage(t('pullRequest.failed', { reason }));
}

async function confirm(plan: PullRequestPlan, base: string): Promise<boolean> {
  const commits = plan.commits
    .slice(0, MAX_LISTED_COMMITS)
    .map((commit) => `${commit.commit.slice(0, 12)} ${commit.subject}`);
  const detail = [
    ...commits,
    ...(plan.commits.length > MAX_LISTED_COMMITS
      ? [`+${plan.commits.length - MAX_LISTED_COMMITS}`]
      : []),
    ...plan.notices,
  ].join('\n');
  const question = plan.needsPush
    ? t('pullRequest.confirmPush', {
        count: plan.commits.length,
        branch: plan.branch,
        remote: plan.remote,
        base,
      })
    : t('pullRequest.confirmOpen', { branch: plan.branch, base });
  const action = plan.needsPush ? t('pullRequest.confirmAction') : t('pullRequest.openAction');
  const choice = await vscode.window.showWarningMessage(
    question,
    { modal: true, ...(detail === '' ? {} : { detail }) },
    action,
  );
  return choice === action;
}

async function announce(result: PullRequestResult): Promise<void> {
  const view = t('pullRequest.view');
  const choice = result.created
    ? await vscode.window.showInformationMessage(t('pullRequest.created'), view)
    : await vscode.window.showWarningMessage(
        t('pullRequest.finishOnGitHub', { note: result.note ?? '' }),
        view,
      );
  if (choice === view) await vscode.env.openExternal(vscode.Uri.parse(result.url));
}

export async function createPullRequest(adapter: CliCapabilityAdapter): Promise<void> {
  const planned = await adapter.call<PullRequestPlan>('pullRequestPlan');
  if (planned.status !== 'ok') {
    reportFailure(planned.reason);
    return;
  }
  const plan = planned.value;
  if (plan.blocked !== undefined) {
    void vscode.window.showWarningMessage(t('pullRequest.blocked', { reason: plan.blocked }));
    return;
  }
  const title = await vscode.window.showInputBox({
    title: t('pullRequest.titlePrompt'),
    value: plan.commits[0]?.subject ?? plan.branch,
    validateInput: (value) =>
      value.trim() === '' || value.trim().length > MAX_TITLE_CHARS
        ? t('pullRequest.titlePrompt')
        : undefined,
  });
  if (title === undefined || title.trim() === '') return;
  const base = await vscode.window.showInputBox({
    title: t('pullRequest.basePrompt'),
    value: plan.base ?? '',
    validateInput: (value) =>
      value.trim() === '' || /\s/u.test(value.trim()) ? t('pullRequest.basePrompt') : undefined,
  });
  if (base === undefined || base.trim() === '') return;
  if (!(await confirm(plan, base.trim()))) return;

  const created = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t('pullRequest.openAction') },
    () =>
      adapter.call<PullRequestResult>('pullRequestCreate', {
        title: title.trim(),
        base: base.trim(),
        confirmedRemote: plan.remote,
        confirmedBranch: plan.branch,
        confirmedHead: plan.head,
        confirmedCommits: plan.commits.length,
      }),
  );
  if (created.status !== 'ok') {
    reportFailure(created.reason);
    return;
  }
  await announce(created.value);
}
