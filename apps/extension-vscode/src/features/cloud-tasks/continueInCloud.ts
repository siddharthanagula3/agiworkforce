import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { CloudCodeApi } from '@agiworkforce/cloud-contracts';
import {
  CLOUD_CODE_LIMITS,
  CLOUD_CODE_STOP_REASON_LABELS,
  cloudCodeStopReasonIsFailure,
  modelDisplayNameById,
} from '@agiworkforce/types';
import type { WorkspaceCloudSource } from '../context-handoff';
import { describeCloudRunFailure } from './cloudRunApproval';
import { OPEN_CLOUD_CODE_SESSION_COMMAND } from './cloudCodeSessions';
import { t, tPlural } from '../../l10n';

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

export function describeCloudContinuationReview(
  source: WorkspaceCloudSource & { branch: string },
  modelId: string,
): { message: string; detail: string } {
  const lines = [
    t('cloud.repository', { repository: source.repository }),
    t('cloud.branch', { branch: source.branch, upstream: source.upstream ?? 'GitHub' }),
    t('cloud.model', { model: modelDisplayNameById(modelId) ?? modelId }),
    t('cloud.network'),
    '',
    t('cloud.whatMoves'),
    t('cloud.whatStays'),
  ];
  if (source.unpushedCommits > 0) {
    lines.push(tPlural('cloud.unpushedCommits', source.unpushedCommits, { branch: source.branch }));
  }
  if (source.dirtyPaths.length > 0) {
    lines.push(tPlural('cloud.uncommittedFiles', source.dirtyPaths.length));
  }
  return {
    message: t('cloud.continueQuestion', { repository: source.repository }),
    detail: lines.join('\n'),
  };
}

export function cloudSessionTitle(goal: string): string {
  const firstLine = goal.split('\n')[0]?.trim() ?? '';
  return firstLine.length > CLOUD_CODE_LIMITS.title
    ? `${firstLine.slice(0, CLOUD_CODE_LIMITS.title - 1)}…`
    : firstLine;
}

function validateCloudTask(value: string): string | null {
  const task = value.trim();
  if (task === '') return 'Describe the task to run.';
  if (task.length > CLOUD_CODE_LIMITS.task) {
    return `Keep the task under ${CLOUD_CODE_LIMITS.task.toLocaleString()} characters.`;
  }
  return null;
}

export interface ContinueInCloudHost {
  readSource: () => Promise<WorkspaceCloudSource | null>;
  resolveApi: () => Promise<CloudCodeApi | null>;
  modelId: () => string;
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
      validateInput: validateCloudTask,
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
          title: cloudSessionTitle(goal),
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
