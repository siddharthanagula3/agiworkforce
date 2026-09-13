import * as vscode from 'vscode';
import type { CloudAgentRun, CloudAgentRunListPage } from '@agiworkforce/cloud-contracts';
import {
  cloudRunDescription,
  cloudRunStateIcon,
  cloudRunTitle,
  cloudRunTooltipLines,
} from './cloudRunPresentation';

export const CLOUD_TASKS_VIEW_ID = 'agi-workforce.cloudTasks';
export const CLOUD_TASKS_REFRESH_INTERVAL_MS = 15_000;
const CLOUD_TASKS_PAGE_LIMIT = 25;

export const OPEN_CLOUD_TASK_COMMAND = 'agi-workforce.openCloudTask';

export interface CloudRunListClient {
  listRuns(options?: {
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<CloudAgentRunListPage>;
}

export type CloudRunClientResolution =
  | { status: 'ready'; client: CloudRunListClient }
  | { status: 'signed-out' };

export class CloudRunTreeItem extends vscode.TreeItem {
  constructor(readonly run: CloudAgentRun) {
    super(cloudRunTitle(run), vscode.TreeItemCollapsibleState.None);
    this.id = run.id;
    this.description = cloudRunDescription(run);
    this.tooltip = cloudRunTooltipLines(run).join('\n');
    this.iconPath = new vscode.ThemeIcon(cloudRunStateIcon(run.state));
    this.contextValue = run.pendingApproval === undefined ? 'cloudRun' : 'cloudRunPendingApproval';
    this.accessibilityInformation = {
      label: `${cloudRunTitle(run)}, ${cloudRunDescription(run)}`,
      role: 'treeitem',
    };
    this.command = {
      command: OPEN_CLOUD_TASK_COMMAND,
      title: 'Open Cloud Task',
      arguments: [run.id],
    };
  }
}

class CloudTasksNoticeItem extends vscode.TreeItem {
  constructor(label: string, tooltip: string, icon: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'cloudTasksNotice';
    this.accessibilityInformation = { label: `${label}, ${tooltip}`, role: 'treeitem' };
    if (command !== undefined) this.command = command;
  }
}

export class CloudTasksTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly resolveClient: () => Promise<CloudRunClientResolution>) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setAutoRefreshEnabled(enabled: boolean): void {
    if (enabled === (this.timer !== undefined)) return;
    if (!enabled) {
      if (this.timer !== undefined) clearInterval(this.timer);
      this.timer = undefined;
      return;
    }
    this.timer = setInterval(() => this.refresh(), CLOUD_TASKS_REFRESH_INTERVAL_MS);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element !== undefined) return [];
    const resolution = await this.resolveClient();
    if (resolution.status === 'signed-out') {
      return [
        new CloudTasksNoticeItem(
          'Sign in to see your cloud tasks',
          'Cloud tasks belong to your AGI Cloud account. Select this item to sign in.',
          'sign-in',
          { command: 'agi-workforce.signIn', title: 'Sign in to AGI Cloud' },
        ),
      ];
    }

    try {
      const page = await resolution.client.listRuns({ limit: CLOUD_TASKS_PAGE_LIMIT });
      return page.runs.map((run) => new CloudRunTreeItem(run));
    } catch (error) {
      return [
        new CloudTasksNoticeItem(
          'Cloud tasks could not be loaded',
          describeCloudTaskFailure(error),
          'warning',
          { command: 'agi-workforce.refreshCloudTasks', title: 'Retry' },
        ),
      ];
    }
  }

  dispose(): void {
    this.setAutoRefreshEnabled(false);
    this._onDidChangeTreeData.dispose();
  }
}

const CLOUD_TASK_FAILURE_REASON_MAX_LENGTH = 240;

export function describeCloudTaskFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : String(error).trim();
  if (raw === '') return 'AGI Cloud did not report why the listing failed.';
  return raw.length <= CLOUD_TASK_FAILURE_REASON_MAX_LENGTH
    ? raw
    : `${raw.slice(0, CLOUD_TASK_FAILURE_REASON_MAX_LENGTH - 1)}…`;
}
