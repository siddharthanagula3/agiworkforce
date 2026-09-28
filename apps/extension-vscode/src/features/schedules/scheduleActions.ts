import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import type {
  ManagedCloudScheduleRun,
  ManagedCloudSchedulesClient,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import {
  describeScheduleFailure,
  isRecoverableScheduleFailure,
  scheduleApprovalDetail,
  scheduleCadence,
  scheduleRunDetail,
  scheduleRunLabel,
  scheduleRunOutput,
  scheduleRunOutputPreview,
  scheduleRunStatusIcon,
  scheduleTitle,
} from './schedulePresentation';
import type { ScheduleRunOutputProvider } from './scheduleRunOutput';

export const PAUSE_SCHEDULE_COMMAND = 'agi-workforce.pauseSchedule';
export const RESUME_SCHEDULE_COMMAND = 'agi-workforce.resumeSchedule';
export const RUN_SCHEDULE_NOW_COMMAND = 'agi-workforce.runScheduleNow';
export const SHOW_SCHEDULE_RUNS_COMMAND = 'agi-workforce.showScheduleRuns';

const RETRY_ACTION = 'Retry';
const RUN_NOW_CONFIRMATION = 'Run it now';
const SCHEDULE_RUNS_PAGE_LIMIT = 20;

export type ScheduleEnablementClient = Pick<ManagedCloudSchedulesClient, 'setScheduleEnabled'>;
export type ScheduleRunNowClient = Pick<ManagedCloudSchedulesClient, 'runNow'>;
export type ScheduleApprovalClient = Pick<ManagedCloudSchedulesClient, 'resolveRunApproval'>;
export type ScheduleRunHistoryClient = Pick<ManagedCloudSchedulesClient, 'listRuns'> &
  ScheduleApprovalClient;

interface ScheduleRunQuickPickItem extends vscode.QuickPickItem {
  run: ManagedCloudScheduleRun;
}

export interface ScheduleActionHost {
  onChanged: () => void;
}

export interface ScheduleRunsHost extends ScheduleActionHost {
  outputs: Pick<ScheduleRunOutputProvider, 'show'>;
}

export function schedulesWebUrl(webOrigin: string): string {
  return `${webOrigin}/chat/schedules?from=vscode-extension`;
}

export function scheduleRunNowConsequence(task: ManagedCloudScheduleTask): string {
  return [
    `AGI Cloud runs "${scheduleTitle(task)}" straight away, as your account and on its usage allowance.`,
    'It does not replace the next scheduled run.',
    task.prompt?.trim() ?? '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function scheduleRunQuickPickItems(
  runs: readonly ManagedCloudScheduleRun[],
): ScheduleRunQuickPickItem[] {
  return runs.map((run) => {
    const preview = scheduleRunOutputPreview(run);
    return {
      label: `$(${scheduleRunStatusIcon(run.status)}) ${scheduleRunLabel(run)}`,
      detail:
        preview === undefined ? scheduleRunDetail(run) : `${scheduleRunDetail(run)} · ${preview}`,
      run,
    };
  });
}

async function withScheduleRetry(
  title: string,
  attempt: () => Promise<void>,
  host: ScheduleActionHost,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title },
      attempt,
    );
  } catch (error) {
    const message = `AGI Workforce: ${describeScheduleFailure(error)}`;
    const answer = isRecoverableScheduleFailure(error)
      ? await vscode.window.showErrorMessage(message, RETRY_ACTION)
      : await vscode.window.showErrorMessage(message);
    if (answer === RETRY_ACTION) {
      await withScheduleRetry(title, attempt, host);
      return;
    }
  } finally {
    host.onChanged();
  }
}

export async function setScheduleEnabledInteractively(
  client: ScheduleEnablementClient,
  task: ManagedCloudScheduleTask,
  isActive: boolean,
  host: ScheduleActionHost,
): Promise<void> {
  await withScheduleRetry(
    isActive
      ? `AGI Workforce: resuming "${scheduleTitle(task)}"…`
      : `AGI Workforce: pausing "${scheduleTitle(task)}"…`,
    async () => {
      await client.setScheduleEnabled(task.id, isActive);
    },
    host,
  );
}

export async function runScheduleNowInteractively(
  client: ScheduleRunNowClient,
  task: ManagedCloudScheduleTask,
  host: ScheduleActionHost,
): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    `Run "${scheduleTitle(task)}" now?`,
    { modal: true, detail: scheduleRunNowConsequence(task) },
    RUN_NOW_CONFIRMATION,
  );
  if (answer !== RUN_NOW_CONFIRMATION) return;

  const idempotencyKey = `agi.vscode.schedule.${randomUUID()}`;
  await withScheduleRetry(
    `AGI Workforce: running "${scheduleTitle(task)}"…`,
    async () => {
      const { run, replay } = await client.runNow(task.id, idempotencyKey);
      void vscode.window.showInformationMessage(
        replay
          ? `AGI Workforce: this run already happened, it ${scheduleRunLabel(run).toLowerCase()}.`
          : `AGI Workforce: ${scheduleRunLabel(run).toLowerCase()}.`,
      );
    },
    host,
  );
}

export async function resolveScheduleApprovalInteractively(
  client: ScheduleApprovalClient,
  task: ManagedCloudScheduleTask,
  run: ManagedCloudScheduleRun,
  host: ScheduleActionHost,
): Promise<void> {
  const pending = run.pendingApproval;
  if (!pending) return;
  const answer = await vscode.window.showWarningMessage(
    `"${scheduleTitle(task)}" is waiting for your approval`,
    { modal: true, detail: scheduleApprovalDetail(pending) },
    TOOL_APPROVAL_ACTION_LABELS.approve,
    TOOL_APPROVAL_ACTION_LABELS.deny,
  );
  if (
    answer !== TOOL_APPROVAL_ACTION_LABELS.approve &&
    answer !== TOOL_APPROVAL_ACTION_LABELS.deny
  ) {
    return;
  }
  const decision = answer === TOOL_APPROVAL_ACTION_LABELS.approve ? 'approved' : 'rejected';
  await withScheduleRetry(
    decision === 'approved'
      ? `AGI Workforce: approving the step "${scheduleTitle(task)}" is waiting on…`
      : `AGI Workforce: denying the step "${scheduleTitle(task)}" is waiting on…`,
    async () => {
      const resolved = await client.resolveRunApproval(task.id, run.id, {
        decision,
        toolCallIds: pending.toolCalls.map((call) => call.id),
      });
      void vscode.window.showInformationMessage(
        `AGI Workforce: ${scheduleRunLabel(resolved).toLowerCase()}.`,
      );
    },
    host,
  );
}

export async function showScheduleRuns(
  client: ScheduleRunHistoryClient,
  task: ManagedCloudScheduleTask,
  host: ScheduleRunsHost,
): Promise<void> {
  let runs: ManagedCloudScheduleRun[];
  try {
    const page = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `AGI Workforce: reading runs of "${scheduleTitle(task)}"…`,
      },
      () => client.listRuns(task.id, { limit: SCHEDULE_RUNS_PAGE_LIMIT, offset: 0 }),
    );
    runs = page.runs;
  } catch (error) {
    const message = `AGI Workforce: the run history could not be read, ${describeScheduleFailure(error)}`;
    const answer = isRecoverableScheduleFailure(error)
      ? await vscode.window.showErrorMessage(message, RETRY_ACTION)
      : await vscode.window.showErrorMessage(message);
    if (answer === RETRY_ACTION) await showScheduleRuns(client, task, host);
    return;
  }

  if (runs.length === 0) {
    void vscode.window.showInformationMessage(
      `AGI Workforce: "${scheduleTitle(task)}" has not run yet. It is set to ${scheduleCadence(task)}.`,
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(scheduleRunQuickPickItems(runs), {
    title: `Runs of "${scheduleTitle(task)}"`,
    placeHolder:
      'Newest first. Pick a run to read its answer, or one waiting for approval to approve or deny it. Editing a schedule happens on the web.',
    matchOnDetail: true,
  });
  if (picked === undefined) return;
  if (picked.run.status === 'awaiting_approval') {
    await resolveScheduleApprovalInteractively(client, task, picked.run, host);
    return;
  }
  if (scheduleRunOutput(picked.run) !== undefined) await host.outputs.show(task, picked.run);
}
