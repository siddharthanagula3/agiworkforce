import * as vscode from 'vscode';
import { getCloudWebOrigin } from '../../utils/api';

export const SHOW_HELP_COMMAND = 'agi-workforce.showHelp';

interface HelpItem extends vscode.QuickPickItem {
  url?: string;
  command?: string;
  args?: unknown[];
}

export async function showHelpMenu(): Promise<void> {
  const origin = getCloudWebOrigin();
  const items: HelpItem[] = [
    {
      label: '$(book) Documentation',
      description: 'Guides for VS Code, the CLI and the web app',
      url: `${origin}/docs?from=vscode-extension`,
    },
    {
      label: '$(question) Help center',
      description: 'Answers about accounts, plans and billing',
      url: `${origin}/help?from=vscode-extension`,
    },
    {
      label: '$(keyboard) Keyboard shortcuts',
      command: 'workbench.action.openGlobalKeybindings',
      args: ['AGI Workforce'],
    },
    {
      label: '$(pulse) Service status',
      description: 'Whether AGI Cloud is up right now',
      url: `${origin}/status?from=vscode-extension`,
    },
    {
      label: '$(megaphone) What’s new',
      url: `${origin}/release-notes?from=vscode-extension`,
    },
    { label: '$(feedback) Send feedback', command: 'agi-workforce.sendFeedback' },
    {
      label: '$(bug) Export diagnostics',
      description: 'A redacted report to attach when you contact support',
      command: 'agi-workforce.exportDiagnostics',
    },
    {
      label: '$(comment-discussion) Contact support',
      url: `${origin}/support?from=vscode-extension`,
    },
  ];
  const picked = await vscode.window.showQuickPick(items, { title: 'AGI Workforce, Help' });
  if (picked === undefined) return;
  if (picked.url !== undefined) {
    await vscode.env.openExternal(vscode.Uri.parse(picked.url));
    return;
  }
  if (picked.command !== undefined) {
    await vscode.commands.executeCommand(picked.command, ...(picked.args ?? []));
  }
}
