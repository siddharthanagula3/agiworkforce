import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import type {
  ManagedCloudScheduleRun,
  ManagedCloudSchedulesClient,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import {
  describeScheduleFailure,
  isRecoverableScheduleFailure,
  scheduleCadence,
  scheduleRunDetail,
  scheduleRunLabel,
  scheduleRunStatusIcon,
  scheduleTitle,
} from './schedulePresentation';

export const PAUSE_SCHEDULE_COMMAND = 'agi-workforce.pauseSchedule';
export const RESUME_SCHEDULE_COMMAND = 'agi-workforce.resumeSchedule';
export const RUN_SCHEDULE_NOW_COMMAND = 'agi-workforce.runScheduleNow';
export const SHOW_SCHEDULE_RUNS_COMMAND = 'agi-workforce.showScheduleRuns';

const RETRY_ACTION = 'Retry';
const RUN_NOW_CONFIRMATION = 'Run it now';
const SCHEDULE_RUNS_PAGE_LIMIT = 20;

export type ScheduleEnablementClient = Pick<ManagedCloudSchedulesClient, 'setScheduleEnabled'>;
export type ScheduleRunNowClient = Pick<ManagedCloudSchedulesClient, 'runNow'>;
export type ScheduleRunHistoryClient = Pick<ManagedCloudSchedulesClient, 'listRuns'>;

export interface ScheduleActionHost {
  onChanged: () => void;
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
): vscode.QuickPickItem[] {
  return runs.map((run) => ({
    label: `$(${scheduleRunStatusIcon(run.status)}) ${scheduleRunLabel(run)}`,
    detail: scheduleRunDetail(run),
  }));
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

export async function showScheduleRuns(
  client: ScheduleRunHistoryClient,
  task: ManagedCloudScheduleTask,
  host: ScheduleActionHost,
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

  await vscode.window.showQuickPick(scheduleRunQuickPickItems(runs), {
    title: `Runs of "${scheduleTitle(task)}"`,
    placeHolder: 'Newest first. Editing a schedule happens on the web.',
  });
}
