import * as vscode from 'vscode';
import type { ManagedCloudScheduleTask } from '@agiworkforce/cloud-contracts';
import {
  describeScheduleFailure,
  scheduleContextValue,
  scheduleDescription,
  scheduleStatusIcon,
  scheduleTitle,
  scheduleTooltipLines,
} from './schedulePresentation';

export const SCHEDULES_VIEW_ID = 'agi-workforce.schedules';
export const SCHEDULES_REFRESH_INTERVAL_MS = 30_000;
const SCHEDULES_PAGE_LIMIT = 25;

export const OPEN_SCHEDULE_COMMAND = 'agi-workforce.openSchedule';
export const REFRESH_SCHEDULES_COMMAND = 'agi-workforce.refreshSchedules';

export interface ScheduleListClient {
  listSchedules(input: {
    limit: number;
    offset: number;
    signal?: AbortSignal;
  }): Promise<{ schedules: ManagedCloudScheduleTask[] }>;
}

export type ScheduleListClientResolution =
  | { status: 'ready'; client: ScheduleListClient }
  | { status: 'signed-out' };

export class ScheduleTreeItem extends vscode.TreeItem {
  constructor(readonly task: ManagedCloudScheduleTask) {
    super(scheduleTitle(task), vscode.TreeItemCollapsibleState.None);
    this.id = task.id;
    this.description = scheduleDescription(task);
    this.tooltip = scheduleTooltipLines(task).join('\n');
    this.iconPath = new vscode.ThemeIcon(scheduleStatusIcon(task.status));
    this.contextValue = scheduleContextValue(task);
    this.accessibilityInformation = {
      label: `${scheduleTitle(task)}, ${scheduleDescription(task)}`,
      role: 'treeitem',
    };
    this.command = {
      command: OPEN_SCHEDULE_COMMAND,
      title: 'Open Schedule',
      arguments: [task.id],
    };
  }
}

class ScheduleNoticeItem extends vscode.TreeItem {
  constructor(label: string, tooltip: string, icon: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'scheduleNotice';
    this.accessibilityInformation = { label: `${label}, ${tooltip}`, role: 'treeitem' };
    if (command !== undefined) this.command = command;
  }
}

export class SchedulesTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly resolveClient: () => Promise<ScheduleListClientResolution>) {}

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
    this.timer = setInterval(() => this.refresh(), SCHEDULES_REFRESH_INTERVAL_MS);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element !== undefined) return [];
    const resolution = await this.resolveClient();
    if (resolution.status === 'signed-out') {
      return [
        new ScheduleNoticeItem(
          'Sign in to see your schedules',
          'Schedules belong to your AGI Cloud account and run there. Select this item to sign in.',
          'sign-in',
          { command: 'agi-workforce.signIn', title: 'Sign in to AGI Cloud' },
        ),
      ];
    }

    try {
      const page = await resolution.client.listSchedules({
        limit: SCHEDULES_PAGE_LIMIT,
        offset: 0,
      });
      return page.schedules.map((task) => new ScheduleTreeItem(task));
    } catch (error) {
      return [
        new ScheduleNoticeItem(
          'Schedules could not be loaded',
          describeScheduleFailure(error),
          'warning',
          { command: REFRESH_SCHEDULES_COMMAND, title: 'Retry' },
        ),
      ];
    }
  }

  dispose(): void {
    this.setAutoRefreshEnabled(false);
    this._onDidChangeTreeData.dispose();
  }
}

export function readScheduleCommandArgument(
  argument: unknown,
): ManagedCloudScheduleTask | undefined {
  if (argument === null || typeof argument !== 'object') return undefined;
  const task = (argument as { task?: unknown }).task;
  if (task === null || typeof task !== 'object') return undefined;
  const candidate = task as ManagedCloudScheduleTask;
  return typeof candidate.id === 'string' && candidate.id !== '' ? candidate : undefined;
}
