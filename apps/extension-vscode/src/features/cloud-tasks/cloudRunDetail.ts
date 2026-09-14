import * as vscode from 'vscode';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  cloudRunAgeLabel,
  cloudRunDeviceWaitLabel,
  cloudRunLatestError,
  cloudRunOriginLabel,
  cloudRunQuietLabel,
  cloudRunStateLabel,
  cloudRunStepIcon,
  cloudRunTitle,
  isCloudRunSettled,
  readCloudRunSteps,
} from './cloudRunPresentation';
import { decideCloudRunApprovalInteractively, describeCloudRunFailure } from './cloudRunApproval';

export {
  decideCloudRunApproval,
  describeCloudRunFailure,
  type CloudRunApprovalOptions,
} from './cloudRunApproval';

export type CloudRunDetailClient = Pick<
  ManagedCloudAgentRunClient,
  'getRun' | 'resumeRun' | 'cancelRun'
>;

export type CloudRunAction = 'approve' | 'reject' | 'cancel' | 'open-web';

export interface CloudRunDetailItem extends vscode.QuickPickItem {
  action?: CloudRunAction;
}

const STOP_CONFIRMATION = 'Stop this task';

export function cloudRunWebUrl(run: CloudAgentRun, webOrigin: string): string {
  const path =
    run.conversationId === null ? '/tasks' : `/chat/${encodeURIComponent(run.conversationId)}`;
  return `${webOrigin}${path}?from=vscode-extension`;
}

export function buildCloudRunDetailItems(
  run: CloudAgentRun,
  events: readonly AgentEventEnvelope[],
): CloudRunDetailItem[] {
  const items: CloudRunDetailItem[] = [];
  const steps = readCloudRunSteps(events);
  if (steps.length > 0) {
    items.push({ label: 'Progress', kind: vscode.QuickPickItemKind.Separator });
    for (const step of steps) {
      items.push({
        label: `$(${cloudRunStepIcon(step.status)}) ${step.summary}`,
        ...(step.detail === undefined ? {} : { detail: step.detail }),
      });
    }
  }

  const failure = cloudRunLatestError(events);
  if (failure !== undefined) {
    items.push({ label: 'Error', kind: vscode.QuickPickItemKind.Separator });
    items.push({ label: `$(error) ${failure}` });
  }

  const deviceWait = cloudRunDeviceWaitLabel(run);
  if (deviceWait !== undefined) {
    items.push({ label: 'Device', kind: vscode.QuickPickItemKind.Separator });
    items.push({ label: `$(device-desktop) ${deviceWait}` });
  }

  items.push({ label: 'Actions', kind: vscode.QuickPickItemKind.Separator });
  const pendingTools = run.pendingApproval?.toolCalls ?? [];
  if (pendingTools.length > 0) {
    const names = pendingTools.map((call) => call.name).join(', ');
    items.push(
      {
        label: '$(check) Approve',
        description: names,
        detail: pendingTools.map((call) => call.argsPreview).join('\n'),
        action: 'approve',
      },
      { label: '$(x) Reject', description: names, action: 'reject' },
    );
  }
  if (!isCloudRunSettled(run.state)) {
    items.push({
      label: '$(stop-circle) Stop this task',
      description: 'Asks the cloud executor to cancel the run',
      action: 'cancel',
    });
  }
  items.push({
    label: '$(link-external) Open on web',
    description: run.conversationId === null ? 'Task list' : 'Conversation',
    action: 'open-web',
  });
  return items;
}

export function cloudRunDetailPlaceholder(run: CloudAgentRun): string {
  return [
    cloudRunStateLabel(run.state),
    `started on ${cloudRunOriginLabel(run.originSurface)}`,
    cloudRunAgeLabel(run),
    cloudRunQuietLabel(run),
  ]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' · ');
}

export interface CloudRunDetailHost {
  webOrigin: string;
  onChanged: () => void;
}

export async function showCloudRunDetail(
  client: CloudRunDetailClient,
  runId: string,
  host: CloudRunDetailHost,
): Promise<void> {
  let snapshot;
  try {
    snapshot = await client.getRun(runId);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: this cloud task could not be opened, ${describeCloudRunFailure(error)}`,
    );
    return;
  }

  const run = snapshot.run;
  const picked = await vscode.window.showQuickPick(buildCloudRunDetailItems(run, snapshot.events), {
    title: cloudRunTitle(run),
    placeHolder: cloudRunDetailPlaceholder(run),
  });
  if (picked?.action === undefined) return;

  if (picked.action === 'open-web') {
    await vscode.env.openExternal(vscode.Uri.parse(cloudRunWebUrl(run, host.webOrigin)));
    return;
  }

  if (picked.action === 'cancel') {
    const confirmed = await vscode.window.showWarningMessage(
      `Stop "${cloudRunTitle(run)}"?`,
      {
        modal: true,
        detail:
          'The cloud executor stops where it is. Work already done stays in the conversation, ' +
          'unfinished steps are lost, and the task cannot be resumed from here.',
      },
      STOP_CONFIRMATION,
    );
    if (confirmed !== STOP_CONFIRMATION) return;
    await runCloudRunMutation(
      () => client.cancelRun(run.id),
      'This task was asked to stop.',
      'this task could not be stopped',
      host,
    );
    return;
  }

  await decideCloudRunApprovalInteractively(
    client,
    run,
    picked.action === 'approve' ? 'approved' : 'rejected',
    host,
  );
}

async function runCloudRunMutation(
  mutate: () => Promise<unknown>,
  success: string,
  failure: string,
  host: CloudRunDetailHost,
): Promise<void> {
  try {
    await mutate();
    void vscode.window.showInformationMessage(`AGI Workforce: ${success}`);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: ${failure}, ${describeCloudRunFailure(error)}`,
    );
  } finally {
    host.onChanged();
  }
}
