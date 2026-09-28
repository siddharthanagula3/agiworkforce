import * as path from 'path';
import * as vscode from 'vscode';
import type {
  DeveloperSessionApproval,
  DeveloperSessionFileChange,
} from '@agiworkforce/types/protocol';

export const SHOW_SESSION_ACTIVITY_COMMAND = 'agi-workforce.showSessionActivity';

export interface SessionReceipt {
  title: string;
  cwd: string;
  approvals: readonly Pick<
    DeveloperSessionApproval,
    'kind' | 'summary' | 'outcome' | 'decidedAt'
  >[];
  fileChanges: readonly Pick<
    DeveloperSessionFileChange,
    'path' | 'kind' | 'tool' | 'changedAt' | 'reason'
  >[];
}

const OUTCOME_LABELS: Record<DeveloperSessionApproval['outcome'], string> = {
  allow_once: 'Allowed once',
  allow_session: 'Allowed for the session',
  always_allow: 'Always allowed',
  deny: 'Denied',
  cancel: 'Cancelled',
  timeout: 'Timed out',
};

interface ReceiptItem extends vscode.QuickPickItem {
  file?: string;
}

function when(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : new Date(parsed).toLocaleString();
}

export function buildSessionReceiptItems(receipt: SessionReceipt): ReceiptItem[] {
  const items: ReceiptItem[] = [
    { label: 'Files changed', kind: vscode.QuickPickItemKind.Separator },
  ];
  if (receipt.fileChanges.length === 0) {
    items.push({ label: '$(circle-slash) No files changed in this session' });
  }
  for (const change of receipt.fileChanges) {
    items.push({
      label: `$(${change.kind === 'created' ? 'new-file' : 'edit'}) ${change.path}`,
      description: `${change.kind === 'created' ? 'Created' : 'Modified'} by ${change.tool} · ${when(change.changedAt)}`,
      ...(change.reason === undefined ? {} : { detail: change.reason }),
      file: path.isAbsolute(change.path) ? change.path : path.join(receipt.cwd, change.path),
    });
  }
  items.push({ label: 'Approvals', kind: vscode.QuickPickItemKind.Separator });
  if (receipt.approvals.length === 0) {
    items.push({ label: '$(circle-slash) No approvals were asked in this session' });
  }
  for (const approval of receipt.approvals) {
    items.push({
      label: `$(${approval.outcome === 'deny' ? 'x' : approval.outcome === 'cancel' || approval.outcome === 'timeout' ? 'circle-slash' : 'check'}) ${approval.summary}`,
      description: `${OUTCOME_LABELS[approval.outcome]} · ${approval.kind} · ${when(approval.decidedAt)}`,
    });
  }
  return items;
}

export async function showSessionReceipt(receipt: SessionReceipt | undefined): Promise<void> {
  if (receipt === undefined) {
    void vscode.window.showInformationMessage(
      'AGI Workforce: open or start a session first, then its activity can be shown.',
    );
    return;
  }
  const picked = await vscode.window.showQuickPick(buildSessionReceiptItems(receipt), {
    title: `AGI Workforce, Session activity: ${receipt.title}`,
    placeHolder: 'Every file this session wrote and every approval it asked for',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked?.file !== undefined) {
    await vscode.window.showTextDocument(vscode.Uri.file(picked.file));
  }
}
