import * as vscode from 'vscode';
import type {
  ManagedCloudScheduleRun,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import {
  scheduleRunDetail,
  scheduleRunLabel,
  scheduleRunOutput,
  scheduleTitle,
} from './schedulePresentation';

export const SCHEDULE_RUN_OUTPUT_SCHEME = 'agi-schedule-run';

const RELEASED_OUTPUT =
  "This run's answer is no longer held here. Open the schedule's runs again to read it.\n";

export class ScheduleRunOutputProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly contents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    const runId = new URLSearchParams(uri.query).get('run') ?? '';
    return this.contents.get(runId) ?? RELEASED_OUTPUT;
  }

  async show(task: ManagedCloudScheduleTask, run: ManagedCloudScheduleRun): Promise<void> {
    const output = scheduleRunOutput(run);
    if (output === undefined) return;
    this.contents.set(
      run.id,
      `# ${scheduleTitle(task)}\n\n${scheduleRunLabel(run)} · ${scheduleRunDetail(run)}\n\n${output}\n`,
    );
    const name = `${scheduleTitle(task)} ${run.startedAt.slice(0, 10)}`.replace(/[\\/]/gu, '-');
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.parse(
        `${SCHEDULE_RUN_OUTPUT_SCHEME}:/${encodeURIComponent(name)}.md?run=${encodeURIComponent(run.id)}`,
      ),
    );
    await vscode.window.showTextDocument(document, { preview: true });
  }

  dispose(): void {
    this.contents.clear();
  }
}
