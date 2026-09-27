import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { CloudCodeApi } from '@agiworkforce/cloud-contracts';
import {
  CLOUD_CODE_STOP_REASON_LABELS,
  cloudCodeStopReasonIsFailure,
  modelDisplayNameById,
} from '@agiworkforce/types';
import type { WorkspaceCloudSource } from '../context-handoff';
import { describeCloudRunFailure } from './cloudRunApproval';
import { OPEN_CLOUD_CODE_SESSION_COMMAND } from './cloudCodeSessions';

export const CONTINUE_IN_CLOUD_COMMAND = 'agi-workforce.continueInCloud';

const CONTINUE_IN_CLOUD = 'Continue in the cloud';
const OPEN_SESSION = 'Open session';

export function describeCloudSourceRefusal(source: WorkspaceCloudSource | null): string | null {
  if (source === null) {
    return 'Open a folder whose git remote is on GitHub. The cloud session clones the repository from there.';
  }
  if (source.branch === null) {
    return 'Check out a branch first. The cloud session starts from a branch, not a detached commit.';
  }
  if (source.upstream === null) {
    return `Push ${source.branch} to GitHub first. The cloud session clones it from there.`;
  }
  return null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function describeCloudContinuationReview(
  source: WorkspaceCloudSource & { branch: string },
  modelId: string,
): { message: string; detail: string } {
  const lines = [
    `Repository: ${source.repository}`,
    `Branch: ${source.branch}, as pushed to ${source.upstream ?? 'GitHub'}`,
    `Model: ${modelDisplayNameById(modelId) ?? modelId}`,
    'Network: Trusted hosts, package registries and code hosts only',
    '',
    'What moves: the task you typed and the pushed branch.',
    'What stays here: this chat’s conversation, local tools and servers, and anything not pushed.',
  ];
  if (source.unpushedCommits > 0) {
    lines.push(
      `${plural(source.unpushedCommits, 'commit', 'commits')} on ${source.branch} ${source.unpushedCommits === 1 ? 'is' : 'are'} not pushed and will not be in the cloud.`,
    );
  }
  if (source.dirtyPaths.length > 0) {
    lines.push(
      `${plural(source.dirtyPaths.length, 'file has', 'files have')} uncommitted changes that will not be in the cloud.`,
    );
  }
  return {
    message: `Continue this work in the cloud on ${source.repository}?`,
    detail: lines.join('\n'),
  };
}

export interface ContinueInCloudHost {
  readSource: () => Promise<WorkspaceCloudSource | null>;
  resolveApi: () => Promise<CloudCodeApi | null>;
  modelId: () => string;
  titleFor: (goal: string) => string;
}

export async function continueInCloud(host: ContinueInCloudHost): Promise<void> {
  const source = await host.readSource();
  const refusal = describeCloudSourceRefusal(source);
  if (source === null || source.branch === null || refusal !== null) {
    void vscode.window.showWarningMessage(`AGI Workforce: ${refusal}`);
    return;
  }
  const api = await host.resolveApi();
  if (api === null) {
    void vscode.window.showWarningMessage(
      'AGI Workforce: sign in to AGI Cloud to continue work in the cloud.',
    );
    return;
  }

  const goal = (
    await vscode.window.showInputBox({
      title: CONTINUE_IN_CLOUD,
      prompt: `What should the cloud session do on ${source.branch}?`,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() === '' ? 'Describe the task to run.' : null),
    })
  )?.trim();
  if (!goal) return;

  const modelId = host.modelId();
  const review = describeCloudContinuationReview({ ...source, branch: source.branch }, modelId);
  const choice = await vscode.window.showInformationMessage(
    review.message,
    { modal: true, detail: review.detail },
    CONTINUE_IN_CLOUD,
  );
  if (choice !== CONTINUE_IN_CLOUD) return;

  let sessionId: string;
  try {
    const created = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AGI Workforce: starting a cloud session',
      },
      () =>
        api.create({
          requestId: randomUUID(),
          title: host.titleFor(goal),
          repositoryUrl: source.repositoryUrl,
          repositoryBranch: source.branch,
          networkAccess: 'trusted',
        }),
    );
    sessionId = created.session.id;
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: the cloud session could not start, ${describeCloudRunFailure(error)}`,
    );
    return;
  }

  try {
    const turn = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AGI Workforce: the cloud session is working',
      },
      () => api.startAgentTurn(sessionId, { goal, model: modelId, idempotencyKey: randomUUID() }),
    );
    const label = CLOUD_CODE_STOP_REASON_LABELS[turn.stopReason];
    const shown = cloudCodeStopReasonIsFailure(turn.stopReason)
      ? vscode.window.showWarningMessage(`AGI Workforce: ${label}`, OPEN_SESSION)
      : vscode.window.showInformationMessage(`AGI Workforce: ${label}`, OPEN_SESSION);
    if ((await shown) === OPEN_SESSION) {
      await vscode.commands.executeCommand(OPEN_CLOUD_CODE_SESSION_COMMAND, sessionId);
    }
  } catch (error) {
    const choice = await vscode.window.showErrorMessage(
      `AGI Workforce: the cloud session started but its task did not, ${describeCloudRunFailure(error)}`,
      OPEN_SESSION,
    );
    if (choice === OPEN_SESSION) {
      await vscode.commands.executeCommand(OPEN_CLOUD_CODE_SESSION_COMMAND, sessionId);
    }
  }
}
