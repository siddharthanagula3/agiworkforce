import * as vscode from 'vscode';
import {
  MAX_CLOUD_AGENT_RUN_STEER_LENGTH,
  isCloudAgentRunSteerProgressId,
  isCloudAgentRunSteerable,
  type CloudAgentRun,
  type ManagedCloudArtifactIndexEntry,
  type ManagedCloudAgentRunClient,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  cloudRunAgeLabel,
  cloudRunDeviceWaitLabel,
  cloudRunLatestError,
  cloudRunOriginLabel,
  cloudRunOutcomeSummary,
  cloudRunResultText,
  cloudRunQuietLabel,
  cloudRunStateLabel,
  cloudRunStepIcon,
  cloudRunTitle,
  isCloudRunSettled,
  readCloudRunSteps,
} from './cloudRunPresentation';
import { decideCloudRunApprovalInteractively, describeCloudRunFailure } from './cloudRunApproval';
import { t } from '../../l10n';

export {
  decideCloudRunApproval,
  describeCloudRunFailure,
  type CloudRunApprovalOptions,
} from './cloudRunApproval';

export type CloudRunDetailClient = Pick<
  ManagedCloudAgentRunClient,
  'getRun' | 'resumeRun' | 'cancelRun' | 'steerRun'
>;

export type CloudRunAction =
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'steer'
  | 'rename'
  | 'open-web'
  | 'open-artifact'
  | 'copy-result';

const MAX_CLOUD_TASK_TITLE_LENGTH = 500;

export interface CloudRunDetailItem extends vscode.QuickPickItem {
  action?: CloudRunAction;
  artifactId?: string;
}

/**
 * A run's deliverables are the artifacts of the conversation it wrote into, the
 * same association the web outputs rail reads. The index derives the project
 * and conversation, so there is no second copy to drift.
 */
export function cloudRunArtifacts(
  run: CloudAgentRun,
  artifacts: readonly ManagedCloudArtifactIndexEntry[],
): ManagedCloudArtifactIndexEntry[] {
  if (run.conversationId === null) return [];
  return artifacts.filter((artifact) => artifact.conversationId === run.conversationId);
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
  artifacts: readonly ManagedCloudArtifactIndexEntry[] = [],
): CloudRunDetailItem[] {
  const items: CloudRunDetailItem[] = [];
  const steps = readCloudRunSteps(events);
  if (steps.length > 0) {
    items.push({ label: 'Progress', kind: vscode.QuickPickItemKind.Separator });
    for (const step of steps) {
      const steered = isCloudAgentRunSteerProgressId(step.id);
      items.push({
        label: steered
          ? `$(comment) ${step.summary}`
          : `$(${cloudRunStepIcon(step.status)}) ${step.summary}`,
        ...(steered ? { description: t('cloudSteer.delivered') } : {}),
        ...(step.detail === undefined ? {} : { detail: step.detail }),
      });
    }
  }

  const waiting = run.pendingSteers ?? [];
  if (waiting.length > 0) {
    const unread = isCloudRunSettled(run.state);
    items.push({ label: t('cloudSteer.waitingSection'), kind: vscode.QuickPickItemKind.Separator });
    for (const steer of waiting) {
      items.push({
        label: `$(clock) ${steer.text}`,
        description: unread ? t('cloudSteer.unread') : t('cloudSteer.queued'),
      });
    }
  }

  const outcome = cloudRunOutcomeSummary(run, steps);
  if (outcome !== undefined) {
    items.push({ label: 'Outcome', kind: vscode.QuickPickItemKind.Separator });
    items.push({ label: `$(pie-chart) ${outcome}` });
  }

  const result = cloudRunResultText(events);
  if (result !== '') {
    const [firstLine = '', ...rest] = result.split('\n');
    items.push({ label: 'Result', kind: vscode.QuickPickItemKind.Separator });
    items.push({
      label: `$(output) ${firstLine}`,
      ...(rest.length === 0 ? {} : { detail: rest.join(' ').trim() }),
      description: 'Select to copy the full result',
      action: 'copy-result',
    });
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

  const deliverables = cloudRunArtifacts(run, artifacts);
  if (deliverables.length > 0) {
    items.push({ label: 'Outputs', kind: vscode.QuickPickItemKind.Separator });
    for (const artifact of deliverables) {
      items.push({
        label: `$(file-code) ${artifact.title?.trim() || `Untitled ${artifact.type}`}`,
        description: artifact.language ?? artifact.type,
        action: 'open-artifact',
        artifactId: artifact.id,
      });
    }
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
  if (isCloudAgentRunSteerable(run)) {
    items.push({
      label: `$(comment-discussion) ${t('cloudSteer.action')}`,
      description: t('cloudSteer.actionDescription'),
      action: 'steer',
    });
  }
  if (!isCloudRunSettled(run.state)) {
    items.push({
      label: '$(stop-circle) Stop this task',
      description: 'Asks the cloud executor to cancel the run',
      action: 'cancel',
    });
  }
  if (run.conversationId !== null) {
    items.push({
      label: '$(edit) Rename task',
      description: cloudRunTitle(run),
      action: 'rename',
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
  renameConversation?: (conversationId: string, title: string) => Promise<void>;
  listArtifacts?: () => Promise<ManagedCloudArtifactIndexEntry[]>;
  openArtifact?: (artifactId: string) => Promise<void>;
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
  /*
   * Deliverables are a discovery aid layered on the run, so a failed or absent
   * index read hides the Outputs section rather than failing to open the run.
   */
  const artifacts =
    run.conversationId === null || host.listArtifacts === undefined
      ? []
      : await host.listArtifacts().catch((): ManagedCloudArtifactIndexEntry[] => []);
  const picked = await vscode.window.showQuickPick(
    buildCloudRunDetailItems(run, snapshot.events, artifacts),
    {
      title: cloudRunTitle(run),
      placeHolder: cloudRunDetailPlaceholder(run),
    },
  );
  if (picked?.action === undefined) return;

  if (picked.action === 'open-artifact') {
    if (picked.artifactId !== undefined) await host.openArtifact?.(picked.artifactId);
    return;
  }

  if (picked.action === 'open-web') {
    await vscode.env.openExternal(vscode.Uri.parse(cloudRunWebUrl(run, host.webOrigin)));
    return;
  }

  if (picked.action === 'copy-result') {
    await vscode.env.clipboard.writeText(cloudRunResultText(snapshot.events));
    void vscode.window.showInformationMessage('AGI Workforce: copied the task result.');
    return;
  }

  if (picked.action === 'steer') {
    const message = await vscode.window.showInputBox({
      title: t('cloudSteer.action'),
      prompt: t('cloudSteer.prompt'),
      placeHolder: t('cloudSteer.actionDescription'),
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim().length > MAX_CLOUD_AGENT_RUN_STEER_LENGTH
          ? t('cloudSteer.tooLong', { count: MAX_CLOUD_AGENT_RUN_STEER_LENGTH.toLocaleString() })
          : undefined,
    });
    const text = message?.trim() ?? '';
    if (text === '') return;
    await runCloudRunMutation(
      () => client.steerRun(run.id, text),
      t('cloudSteer.sent'),
      t('cloudSteer.failed'),
      host,
    );
    return;
  }

  if (picked.action === 'rename') {
    const conversationId = run.conversationId;
    const rename = host.renameConversation;
    if (conversationId === null || rename === undefined) return;
    const title = (
      await vscode.window.showInputBox({
        title: 'Rename task',
        value: cloudRunTitle(run),
        ignoreFocusOut: true,
        validateInput: (value) =>
          value.trim() === ''
            ? 'Enter a name.'
            : value.trim().length > MAX_CLOUD_TASK_TITLE_LENGTH
              ? `Keep the name under ${MAX_CLOUD_TASK_TITLE_LENGTH.toLocaleString()} characters.`
              : undefined,
      })
    )?.trim();
    if (title === undefined || title === '' || title === cloudRunTitle(run)) return;
    await runCloudRunMutation(
      () => rename(conversationId, title),
      'Renamed the task.',
      'this task could not be renamed',
      host,
    );
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
