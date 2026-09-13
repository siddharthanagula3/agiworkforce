import * as vscode from 'vscode';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TOOL_APPROVAL_GUIDANCE_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { cloudRunTitle } from './cloudRunPresentation';

export type CloudRunApprovalClient = Pick<ManagedCloudAgentRunClient, 'resumeRun'>;

export interface CloudRunApprovalOptions {
  signal?: AbortSignal;
  guidance?: string;
}

export async function decideCloudRunApproval(
  client: CloudRunApprovalClient,
  run: CloudAgentRun,
  decision: CloudRunApprovalDecision,
  options: CloudRunApprovalOptions = {},
): Promise<boolean> {
  const toolCalls = run.pendingApproval?.toolCalls ?? [];
  if (toolCalls.length === 0) return false;
  await client.resumeRun(
    run.id,
    toolCalls.map((call) => ({ toolCallId: call.toolCallId, decision })),
    options,
  );
  return true;
}

export function describeCloudRunFailure(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 409) return 'another device already answered this one';
  if (status === 410) return 'the approval expired, so the task cannot continue from it';
  const message = error instanceof Error ? error.message.trim() : String(error).trim();
  return message === '' ? 'AGI Cloud gave no reason' : message;
}

export const APPROVE_CLOUD_TASK_COMMAND = 'agi-workforce.approveCloudTask';
export const REJECT_CLOUD_TASK_COMMAND = 'agi-workforce.rejectCloudTask';

const APPROVE_CONFIRMATION = 'Approve and continue';
const RETRY_ACTION = 'Retry';

export type CloudRunApprovalDecision = 'approved' | 'rejected';

export interface CloudRunApprovalHost {
  onChanged: () => void;
}

export function readCloudRunCommandArgument(argument: unknown): CloudAgentRun | undefined {
  if (argument === null || typeof argument !== 'object') return undefined;
  const run = (argument as { run?: unknown }).run;
  if (run === null || typeof run !== 'object') return undefined;
  const candidate = run as CloudAgentRun;
  return typeof candidate.id === 'string' && candidate.id !== '' ? candidate : undefined;
}

export function cloudRunPendingToolNames(run: CloudAgentRun): string {
  return (run.pendingApproval?.toolCalls ?? []).map((call) => call.name).join(', ');
}

export function cloudRunApprovalConsequence(run: CloudAgentRun): string {
  const calls = run.pendingApproval?.toolCalls ?? [];
  const previews = calls
    .map((call) => `${call.name}: ${call.argsPreview}`.trim())
    .filter((line) => line !== '');
  return [
    'AGI Cloud runs this as your account and the task continues from it.',
    'What the tool changes cannot be taken back from here.',
    ...previews,
  ].join('\n');
}

export function isRecoverableCloudRunFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status !== 409 && status !== 410;
}

async function confirmCloudRunApproval(run: CloudAgentRun): Promise<boolean> {
  const names = cloudRunPendingToolNames(run);
  const answer = await vscode.window.showWarningMessage(
    names === '' ? `Approve "${cloudRunTitle(run)}"?` : `Let this task run ${names}?`,
    { modal: true, detail: cloudRunApprovalConsequence(run) },
    APPROVE_CONFIRMATION,
  );
  return answer === APPROVE_CONFIRMATION;
}

async function askCloudRunRejectionReason(run: CloudAgentRun): Promise<string | undefined | null> {
  const names = cloudRunPendingToolNames(run);
  const reason = await vscode.window.showInputBox({
    title: names === '' ? `Reject "${cloudRunTitle(run)}"` : `Reject ${names}`,
    prompt: 'The task reads this instead of the tool result, and continues without it.',
    placeHolder: 'Optional reason, Enter to reject without one, Escape to keep waiting',
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.length > TOOL_APPROVAL_GUIDANCE_MAX_LENGTH
        ? `A reason is at most ${TOOL_APPROVAL_GUIDANCE_MAX_LENGTH} characters.`
        : undefined,
  });
  if (reason === undefined) return null;
  const trimmed = reason.trim();
  return trimmed === '' ? undefined : trimmed;
}

export async function decideCloudRunApprovalInteractively(
  client: CloudRunApprovalClient,
  run: CloudAgentRun,
  decision: CloudRunApprovalDecision,
  host: CloudRunApprovalHost,
): Promise<void> {
  if ((run.pendingApproval?.toolCalls ?? []).length === 0) {
    void vscode.window.showInformationMessage(
      'AGI Workforce: this task is no longer waiting on a decision.',
    );
    host.onChanged();
    return;
  }

  let guidance: string | undefined;
  if (decision === 'approved') {
    if (!(await confirmCloudRunApproval(run))) return;
  } else {
    const reason = await askCloudRunRejectionReason(run);
    if (reason === null) return;
    guidance = reason;
  }

  await sendCloudRunDecision(client, run, decision, guidance, host);
}

async function sendCloudRunDecision(
  client: CloudRunApprovalClient,
  run: CloudAgentRun,
  decision: CloudRunApprovalDecision,
  guidance: string | undefined,
  host: CloudRunApprovalHost,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title:
          decision === 'approved'
            ? `AGI Workforce: approving "${cloudRunTitle(run)}"…`
            : `AGI Workforce: rejecting "${cloudRunTitle(run)}"…`,
      },
      () =>
        decideCloudRunApproval(client, run, decision, guidance === undefined ? {} : { guidance }),
    );
    void vscode.window.showInformationMessage(
      decision === 'approved'
        ? 'AGI Workforce: approved, the task continues.'
        : 'AGI Workforce: rejected, the task will not run it.',
    );
  } catch (error) {
    const message = `AGI Workforce: your decision could not be sent, ${describeCloudRunFailure(error)}`;
    const answer = isRecoverableCloudRunFailure(error)
      ? await vscode.window.showErrorMessage(message, RETRY_ACTION)
      : await vscode.window.showErrorMessage(message);
    if (answer === RETRY_ACTION) {
      await sendCloudRunDecision(client, run, decision, guidance, host);
      return;
    }
  } finally {
    host.onChanged();
  }
}
