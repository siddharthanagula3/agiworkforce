import * as vscode from 'vscode';
import {
  buildCodeTranscript,
  createManagedCloudCodeApi,
  toCodeTurnRecord,
  type CloudCodeAgentApproval,
  type CloudCodeApi,
  type CodeTranscriptItem,
} from '@agiworkforce/cloud-contracts';
import {
  CLOUD_CODE_SESSION_COPY,
  CLOUD_CODE_SESSION_STATE_LABELS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
  CLOUD_CODE_STOP_REASON_LABELS,
  cloudCodeCommandRanLabel,
  cloudCodeRepositoryLabel,
  cloudCodeStopReasonIsFailure,
  encodeCloudTaskHandoffQuery,
  REMOTE_CODE_LIMITS,
  type CloudCodeAgentTurnRecord,
  type CloudCodeSession,
  type CloudCodeTerminalEntry,
  type CloudTaskHandoff,
} from '@agiworkforce/types';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';
import { BRING_CLOUD_BRANCH_IN } from '../context-handoff';
import { describeCloudRunFailure } from './cloudRunApproval';

export const OPEN_CLOUD_CODE_SESSION_COMMAND = 'agi-workforce.openCloudCodeSession';

const EXIT_CODE_OK = 0;

export type CloudCodeApiResolution =
  { status: 'ready'; api: CloudCodeApi } | { status: 'signed-out' };

export function createExtensionCloudCodeApi(token: string): CloudCodeApi {
  const origin = getCloudWebOrigin();
  return createManagedCloudCodeApi({
    fetchImpl: (path, init) =>
      fetch(`${origin}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
          ...platformRequestHeaders(),
        },
      }),
  });
}

export async function resolveCloudCodeApi(
  secrets: vscode.SecretStorage,
): Promise<CloudCodeApiResolution> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  return { status: 'ready', api: createExtensionCloudCodeApi(token) };
}

export function cloudCodeSessionWebUrl(sessionId: string, webOrigin: string): string {
  return `${webOrigin}/code/${encodeURIComponent(sessionId)}?from=vscode-extension`;
}

export function cloudCodeSessionSummary(session: CloudCodeSession): string {
  const state =
    session.archivedAt === null
      ? CLOUD_CODE_SESSION_STATE_LABELS[session.state]
      : CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.archived;
  return [
    state,
    session.repositoryUrl ? cloudCodeRepositoryLabel(session.repositoryUrl) : null,
    session.workingBranch,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

type CloudCodeSessionAction =
  'approve' | 'reject' | 'stop' | 'continue-here' | 'bring-branch-in' | 'open-web';

export const CONTINUE_CLOUD_CODE_SESSION_HERE = 'Continue here';

export interface CloudCodeSessionItem extends vscode.QuickPickItem {
  action?: CloudCodeSessionAction;
  approval?: CloudCodeAgentApproval;
}

interface CloudCodeSessionDetail {
  session: CloudCodeSession;
  terminalEntries: CloudCodeTerminalEntry[];
  turns: CloudCodeAgentTurnRecord[];
}

function firstLine(text: string): string {
  return text.split('\n')[0]?.trim() ?? '';
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > REMOTE_CODE_LIMITS.messageLength
    ? `${trimmed.slice(0, REMOTE_CODE_LIMITS.messageLength)}…`
    : trimmed;
}

export function buildCloudCodeContinuationDraft(detail: CloudCodeSessionDetail): string {
  const { session, turns } = detail;
  const lines = [`Continuing AGI Code session “${session.title}” here.`];
  if (session.repositoryUrl) {
    lines.push('', `Repository: ${cloudCodeRepositoryLabel(session.repositoryUrl)}`);
  }
  if (session.workingBranch !== null) lines.push('', `Cloud branch: ${session.workingBranch}`);
  const recent = turns.slice(-REMOTE_CODE_LIMITS.transcriptMessages);
  if (recent.length > 0) {
    lines.push('', 'Conversation so far:');
    for (const turn of recent) {
      lines.push('', `You: ${clip(turn.goal)}`);
      const reply = clip(turn.finalMessage) || clip(turn.errorMessage ?? '');
      if (reply !== '') lines.push(`Agent: ${reply}`);
    }
  }
  return `${lines.join('\n')}\n\n`;
}

function cloudCodeHandoff(session: CloudCodeSession): CloudTaskHandoff {
  return {
    runId: session.id,
    goal: session.title,
    plan: [],
    branch: session.workingBranch,
  };
}

function transcriptItems(transcript: readonly CodeTranscriptItem[]): CloudCodeSessionItem[] {
  return transcript.flatMap((item): CloudCodeSessionItem[] => {
    if (item.kind === 'task') return [{ label: `$(comment) ${firstLine(item.text)}` }];
    if (item.kind === 'steps') {
      return item.steps.map((step) => {
        const summary = firstLine(step.output);
        return {
          label: `$(${step.isError ? 'error' : 'tools'}) ${step.label ?? step.toolName}`,
          ...(summary ? { detail: summary } : {}),
        };
      });
    }
    if (item.kind === 'commands') {
      const failed = item.entries.filter((entry) => entry.exitCode !== EXIT_CODE_OK);
      return [
        {
          label: `$(terminal) ${cloudCodeCommandRanLabel(item.entries.length)}`,
          ...(failed.length > 0
            ? {
                detail: failed
                  .map((entry) => `${entry.command} exited ${entry.exitCode}`)
                  .join(', '),
              }
            : {}),
        },
      ];
    }
    const failure = item.stopReason !== null && cloudCodeStopReasonIsFailure(item.stopReason);
    const reason = item.stopReason === null ? '' : CLOUD_CODE_STOP_REASON_LABELS[item.stopReason];
    return [
      {
        label: `$(${failure ? 'error' : 'sparkle'}) ${firstLine(item.text) || reason}`,
        ...(reason ? { description: reason } : {}),
      },
    ];
  });
}

export function buildCloudCodeSessionItems(
  detail: CloudCodeSessionDetail,
  approvals: readonly CloudCodeAgentApproval[],
): CloudCodeSessionItem[] {
  const items: CloudCodeSessionItem[] = [];
  const transcript = buildCodeTranscript(
    detail.terminalEntries,
    detail.turns.map(toCodeTurnRecord),
  );
  if (transcript.length > 0) {
    items.push({ label: 'Transcript', kind: vscode.QuickPickItemKind.Separator });
    items.push(...transcriptItems(transcript));
  }

  if (approvals.length > 0) {
    items.push({
      label: CLOUD_CODE_SESSION_COPY.approvalHeading,
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const approval of approvals) {
      items.push(
        {
          label: `$(check) ${CLOUD_CODE_SESSION_COPY.approve}`,
          description: approval.command,
          detail: approval.reason,
          action: 'approve',
          approval,
        },
        {
          label: `$(x) ${CLOUD_CODE_SESSION_COPY.reject}`,
          description: approval.command,
          action: 'reject',
          approval,
        },
      );
    }
  }

  items.push({ label: 'Actions', kind: vscode.QuickPickItemKind.Separator });
  const latest = detail.turns[detail.turns.length - 1];
  if (latest !== undefined && latest.stopReason === null) {
    items.push({ label: `$(debug-stop) ${CLOUD_CODE_SESSION_COPY.stopTurn}`, action: 'stop' });
  }
  items.push({
    label: `$(arrow-right) ${CONTINUE_CLOUD_CODE_SESSION_HERE}`,
    detail: 'Start a chat in this window from this session’s conversation',
    action: 'continue-here',
  });
  if (detail.session.workingBranch !== null) {
    items.push({
      label: `$(git-branch) ${BRING_CLOUD_BRANCH_IN}`,
      description: detail.session.workingBranch,
      detail: 'Check out this session’s branch in the folder open in this window',
      action: 'bring-branch-in',
    });
  }
  items.push({ label: '$(link-external) Open on web', action: 'open-web' });
  return items;
}

export interface CloudCodeSessionHost {
  webOrigin: string;
  bringBranchIn: (handoffQuery: string) => Promise<void>;
  continueHere: (draft: string, handoff: CloudTaskHandoff) => Promise<void>;
}

async function decide(
  api: CloudCodeApi,
  sessionId: string,
  approval: CloudCodeAgentApproval,
  decision: 'approve' | 'reject',
): Promise<void> {
  try {
    const turn = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `AGI Workforce: ${CLOUD_CODE_SESSION_COPY.agentWorking}`,
      },
      () =>
        api.decideApproval(sessionId, {
          turnId: approval.turnId,
          stepIndex: approval.stepIndex,
          decision,
        }),
    );
    void vscode.window.showInformationMessage(
      `AGI Workforce: ${CLOUD_CODE_STOP_REASON_LABELS[turn.stopReason]}`,
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: the decision could not be sent, ${describeCloudRunFailure(error)}`,
    );
  }
}

export async function showCloudCodeSession(
  api: CloudCodeApi,
  sessionId: string,
  host: CloudCodeSessionHost,
): Promise<void> {
  let detail: CloudCodeSessionDetail;
  let approvals: CloudCodeAgentApproval[];
  try {
    [detail, approvals] = await Promise.all([api.get(sessionId), api.listApprovals(sessionId)]);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: this AGI Code session could not be opened, ${describeCloudRunFailure(error)}`,
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(buildCloudCodeSessionItems(detail, approvals), {
    title: detail.session.title,
    placeHolder: cloudCodeSessionSummary(detail.session),
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked?.action === undefined) return;

  if (picked.action === 'open-web') {
    await vscode.env.openExternal(
      vscode.Uri.parse(cloudCodeSessionWebUrl(sessionId, host.webOrigin)),
    );
    return;
  }

  if (picked.action === 'continue-here') {
    await host.continueHere(
      buildCloudCodeContinuationDraft(detail),
      cloudCodeHandoff(detail.session),
    );
    return;
  }

  if (picked.action === 'bring-branch-in') {
    let query: string;
    try {
      query = encodeCloudTaskHandoffQuery(cloudCodeHandoff(detail.session));
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: this session's branch cannot be brought in, ${describeCloudRunFailure(error)}`,
      );
      return;
    }
    await host.bringBranchIn(query);
    return;
  }

  if (picked.action === 'stop') {
    const running = detail.turns[detail.turns.length - 1];
    try {
      await api.cancelAgentTurn(sessionId, running?.turnId);
      void vscode.window.showInformationMessage(
        `AGI Workforce: ${CLOUD_CODE_SESSION_COPY.stoppingTurn}.`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: the task could not be stopped, ${describeCloudRunFailure(error)}`,
      );
    }
    return;
  }

  if (picked.approval !== undefined) {
    await decide(api, sessionId, picked.approval, picked.action);
  }
}
