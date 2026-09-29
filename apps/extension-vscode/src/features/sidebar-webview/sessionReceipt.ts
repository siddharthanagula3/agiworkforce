import * as path from 'path';
import * as vscode from 'vscode';
import { buildVsCodeDeveloperSessionHandoffUri } from '@agiworkforce/types';
import type {
  DeveloperSessionApproval,
  DeveloperSessionFileChange,
} from '@agiworkforce/types/protocol';
import { modelDisplayLabel } from '../model-picker/modelConstants';

export const SHOW_SESSION_ACTIVITY_COMMAND = 'agi-workforce.showSessionActivity';

export interface SessionReceipt {
  id: string;
  title: string;
  cwd: string;
  model: string;
  trustMode: string;
  branch?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
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

const FILE_CHANGE_LABELS: Record<
  DeveloperSessionFileChange['kind'],
  { icon: string; verb: string }
> = {
  created: { icon: 'new-file', verb: 'Created' },
  modified: { icon: 'edit', verb: 'Modified' },
  deleted: { icon: 'trash', verb: 'Deleted' },
};

interface ReceiptItem extends vscode.QuickPickItem {
  file?: string;
  copyLink?: string;
}

function when(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : new Date(parsed).toLocaleString();
}

export function buildSessionReceiptItems(receipt: SessionReceipt): ReceiptItem[] {
  let link: string | undefined;
  try {
    link = buildVsCodeDeveloperSessionHandoffUri({ threadId: receipt.id, cwd: receipt.cwd });
  } catch {
    link = undefined;
  }
  const items: ReceiptItem[] = [
    { label: 'Details', kind: vscode.QuickPickItemKind.Separator },
    { label: `$(symbol-namespace) ${modelDisplayLabel(receipt.model)}`, description: 'Model' },
    { label: `$(folder) ${receipt.cwd}`, description: 'Folder' },
    ...(receipt.branch === undefined
      ? []
      : [{ label: `$(git-branch) ${receipt.branch}`, description: 'Branch' }]),
    { label: `$(shield) ${receipt.trustMode}`, description: 'Trust mode' },
    {
      label: `$(calendar) ${when(receipt.createdAt)}`,
      description: `Started from ${receipt.createdBy}, last active ${when(receipt.updatedAt)}`,
    },
    ...(link === undefined
      ? []
      : [
          {
            label: '$(link) Copy a link to this session',
            description: 'Opens it in VS Code on this machine',
            copyLink: link,
          },
        ]),
    { label: 'Files changed', kind: vscode.QuickPickItemKind.Separator },
  ];
  if (receipt.fileChanges.length === 0) {
    items.push({ label: '$(circle-slash) No files changed in this session' });
  }
  for (const change of receipt.fileChanges) {
    const shown = FILE_CHANGE_LABELS[change.kind];
    items.push({
      label: `$(${shown.icon}) ${change.path}`,
      description: `${shown.verb} by ${change.tool} · ${when(change.changedAt)}`,
      ...(change.reason === undefined ? {} : { detail: change.reason }),
      ...(change.kind === 'deleted'
        ? {}
        : {
            file: path.isAbsolute(change.path) ? change.path : path.join(receipt.cwd, change.path),
          }),
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
    title: `AGI Workforce, Session: ${receipt.title}`,
    placeHolder: 'Details, every file this session wrote and every approval it asked for',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked?.copyLink !== undefined) {
    await vscode.env.clipboard.writeText(picked.copyLink);
    void vscode.window.showInformationMessage('AGI Workforce: copied a link to this session.');
    return;
  }
  if (picked?.file !== undefined) {
    await vscode.window.showTextDocument(vscode.Uri.file(picked.file));
  }
}
