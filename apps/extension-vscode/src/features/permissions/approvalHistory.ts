import * as vscode from 'vscode';
import { z } from 'zod';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';

export const SHOW_APPROVAL_HISTORY_COMMAND = 'agi-workforce.showApprovalHistory';

const APPROVAL_HISTORY_PATH = '/api/settings/approvals';

const ApprovalHistorySchema = z.object({
  approvals: z.array(
    z.object({
      id: z.string(),
      toolName: z.string(),
      decision: z.enum(['approved', 'rejected']),
      conversationId: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

interface HistoryItem extends vscode.QuickPickItem {
  conversationId?: string;
}

function when(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : new Date(parsed).toLocaleString();
}

export async function showApprovalHistory(secrets: vscode.SecretStorage): Promise<void> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') {
    void vscode.window.showInformationMessage(
      'Sign in to AGI Cloud to see the approvals you decided on every device.',
    );
    return;
  }
  const origin = getCloudWebOrigin();
  let history: z.infer<typeof ApprovalHistorySchema>;
  try {
    const response = await fetch(`${origin}${APPROVAL_HISTORY_PATH}`, {
      headers: { Authorization: `Bearer ${token}`, ...platformRequestHeaders() },
    });
    if (!response.ok) throw new Error(`AGI Workforce answered HTTP ${response.status}`);
    history = ApprovalHistorySchema.parse(await response.json());
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: approval history could not be loaded, ${error instanceof Error ? error.message : String(error)}.`,
    );
    return;
  }

  const items: HistoryItem[] =
    history.approvals.length === 0
      ? [{ label: '$(circle-slash) No approvals decided yet' }]
      : history.approvals.map((entry) => ({
          label: `$(${entry.decision === 'approved' ? 'check' : 'x'}) ${entry.toolName}`,
          description: `${entry.decision === 'approved' ? 'Approved' : 'Denied'} · ${when(entry.createdAt)}`,
          ...(entry.conversationId === null
            ? {}
            : { detail: 'Open the conversation', conversationId: entry.conversationId }),
        }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'AGI Workforce, Approval history',
    placeHolder: 'Tool approvals you decided on every AGI client, newest first',
    matchOnDescription: true,
  });
  if (picked?.conversationId !== undefined) {
    await vscode.env.openExternal(
      vscode.Uri.parse(
        `${origin}/chat/${encodeURIComponent(picked.conversationId)}?from=vscode-extension`,
      ),
    );
  }
}
