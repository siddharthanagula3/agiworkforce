import * as vscode from 'vscode';
import type { ManagedCloudProject } from '@agiworkforce/cloud-contracts';
import {
  describeProjectFailure,
  projectContextValue,
  projectDescription,
  projectIcon,
  projectTitle,
  projectTooltipLines,
} from './projectPresentation';

export const PROJECTS_VIEW_ID = 'agi-workforce.projects';
export const PROJECTS_REFRESH_INTERVAL_MS = 60_000;
const PROJECTS_PAGE_LIMIT = 50;

export const OPEN_PROJECT_COMMAND = 'agi-workforce.openProject';
export const REFRESH_PROJECTS_COMMAND = 'agi-workforce.refreshProjects';

export interface ProjectListClient {
  listProjects(query?: { limit?: number; offset?: number }): Promise<ManagedCloudProject[]>;
}

export type ProjectListClientResolution =
  | { status: 'ready'; client: ProjectListClient }
  | { status: 'signed-out' };

export class ProjectTreeItem extends vscode.TreeItem {
  constructor(readonly project: ManagedCloudProject) {
    super(projectTitle(project), vscode.TreeItemCollapsibleState.None);
    this.id = project.id;
    this.description = projectDescription(project);
    this.tooltip = projectTooltipLines(project).join('\n');
    this.iconPath = new vscode.ThemeIcon(projectIcon(project));
    this.contextValue = projectContextValue(project);
    this.accessibilityInformation = {
      label: `${projectTitle(project)}, ${projectDescription(project)}`,
      role: 'treeitem',
    };
    this.command = {
      command: OPEN_PROJECT_COMMAND,
      title: 'Open Project',
      arguments: [project.id],
    };
  }
}

class ProjectNoticeItem extends vscode.TreeItem {
  constructor(label: string, tooltip: string, icon: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'projectNotice';
    this.accessibilityInformation = { label: `${label}, ${tooltip}`, role: 'treeitem' };
    if (command !== undefined) this.command = command;
  }
}

export class ProjectsTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly resolveClient: () => Promise<ProjectListClientResolution>) {}

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
    this.timer = setInterval(() => this.refresh(), PROJECTS_REFRESH_INTERVAL_MS);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element !== undefined) return [];
    const resolution = await this.resolveClient();
    if (resolution.status === 'signed-out') {
      return [
        new ProjectNoticeItem(
          'Sign in to see your projects',
          'Projects belong to your AGI Cloud account and are shared with the web app, the CLI and mobile. Select this item to sign in.',
          'sign-in',
          { command: 'agi-workforce.signIn', title: 'Sign in to AGI Cloud' },
        ),
      ];
    }

    let projects: ManagedCloudProject[];
    try {
      projects = await resolution.client.listProjects({ limit: PROJECTS_PAGE_LIMIT, offset: 0 });
    } catch (error) {
      return [
        new ProjectNoticeItem(
          'Projects could not be loaded',
          describeProjectFailure(error),
          'warning',
          { command: REFRESH_PROJECTS_COMMAND, title: 'Retry' },
        ),
      ];
    }

    if (projects.length === 0) {
      return [
        new ProjectNoticeItem(
          'No projects yet',
          'A project keeps instructions, knowledge files and chats together. Select this item to create one.',
          'new-folder',
          { command: 'agi-workforce.createProject', title: 'Create Project' },
        ),
      ];
    }

    return projects.map((project) => new ProjectTreeItem(project));
  }

  dispose(): void {
    this.setAutoRefreshEnabled(false);
    this._onDidChangeTreeData.dispose();
  }
}

export function readProjectCommandArgument(argument: unknown): ManagedCloudProject | undefined {
  if (argument === null || typeof argument !== 'object') return undefined;
  const project = (argument as { project?: unknown }).project;
  if (project === null || typeof project !== 'object') return undefined;
  const candidate = project as ManagedCloudProject;
  return typeof candidate.id === 'string' && candidate.id !== '' ? candidate : undefined;
}
