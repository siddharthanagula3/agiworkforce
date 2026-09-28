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
  { status: 'ready'; client: CloudRunListClient } | { status: 'signed-out' };

type CloudRunStage = 'needs-you' | 'working' | 'review' | 'done' | 'stopped';

const RUN_STAGES: Record<CloudAgentRun['state'], CloudRunStage> = {
  awaiting_input: 'needs-you',
  awaiting_approval: 'needs-you',
  paused: 'needs-you',
  queued: 'working',
  planning: 'working',
  running: 'working',
  resuming: 'working',
  ready_for_review: 'review',
  completed: 'done',
  archived: 'done',
  partial: 'stopped',
  failed: 'stopped',
  cancelled: 'stopped',
  timed_out: 'stopped',
};

const STAGE_GROUPS: readonly { stage: CloudRunStage; label: string; icon: string }[] = [
  { stage: 'needs-you', label: 'Needs you', icon: 'bell-dot' },
  { stage: 'working', label: 'Working', icon: 'sync' },
  { stage: 'review', label: 'Ready for review', icon: 'eye' },
  { stage: 'done', label: 'Done', icon: 'pass' },
  { stage: 'stopped', label: 'Stopped', icon: 'circle-slash' },
];

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

export class CloudTasksGroupItem extends vscode.TreeItem {
  constructor(
    label: string,
    readonly runs: readonly CloudAgentRun[],
    icon: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.id = `cloud-tasks-group:${label}`;
    this.description = String(runs.length);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'cloudTasksGroup';
    this.accessibilityInformation = { label: `${label}, ${runs.length}`, role: 'treeitem' };
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
    if (element instanceof CloudTasksGroupItem) {
      return element.runs.map((run) => new CloudRunTreeItem(run));
    }
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
      const stageOf = (run: CloudAgentRun): CloudRunStage =>
        run.pendingApproval === undefined ? RUN_STAGES[run.workState ?? run.state] : 'needs-you';
      return STAGE_GROUPS.flatMap(({ stage, label, icon }) => {
        const runs = page.runs.filter((run) => stageOf(run) === stage);
        return runs.length === 0 ? [] : [new CloudTasksGroupItem(label, runs, icon)];
      });
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
