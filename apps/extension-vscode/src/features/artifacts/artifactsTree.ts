import * as vscode from 'vscode';
import type {
  ManagedCloudArtifactIndexEntry,
  ManagedCloudPublishedArtifact,
} from '@agiworkforce/cloud-contracts';
import {
  artifactContextValue,
  artifactDescription,
  artifactIcon,
  artifactTitle,
  artifactTooltipLines,
  describeArtifactFailure,
} from './artifactPresentation';

export const ARTIFACTS_VIEW_ID = 'agi-workforce.artifacts';
export const ARTIFACTS_REFRESH_INTERVAL_MS = 60_000;
const ARTIFACTS_PAGE_LIMIT = 100;

export const OPEN_ARTIFACT_COMMAND = 'agi-workforce.openArtifact';
export const REFRESH_ARTIFACTS_COMMAND = 'agi-workforce.refreshArtifacts';

export interface ArtifactListClient {
  listArtifacts(query?: {
    limit?: number;
    projectId?: string;
  }): Promise<ManagedCloudArtifactIndexEntry[]>;
  listPublishedArtifacts(): Promise<ManagedCloudPublishedArtifact[]>;
}

export type ArtifactListClientResolution =
  | { status: 'ready'; client: ArtifactListClient }
  | { status: 'signed-out' };

export class ArtifactTreeItem extends vscode.TreeItem {
  constructor(
    readonly artifact: ManagedCloudArtifactIndexEntry,
    readonly published: ManagedCloudPublishedArtifact | undefined,
  ) {
    super(artifactTitle(artifact), vscode.TreeItemCollapsibleState.None);
    const isPublished = published !== undefined;
    this.id = artifact.id;
    this.description = artifactDescription(artifact, isPublished);
    this.tooltip = artifactTooltipLines(artifact, isPublished).join('\n');
    this.iconPath = new vscode.ThemeIcon(artifactIcon(artifact));
    this.contextValue = artifactContextValue(isPublished);
    this.accessibilityInformation = {
      label: `${artifactTitle(artifact)}, ${artifactDescription(artifact, isPublished)}`,
      role: 'treeitem',
    };
    this.command = {
      command: OPEN_ARTIFACT_COMMAND,
      title: 'Open Artifact',
      arguments: [artifact.id],
    };
  }
}

class ArtifactNoticeItem extends vscode.TreeItem {
  constructor(label: string, tooltip: string, icon: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'artifactNotice';
    this.accessibilityInformation = { label: `${label}, ${tooltip}`, role: 'treeitem' };
    if (command !== undefined) this.command = command;
  }
}

export class ArtifactsTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly resolveClient: () => Promise<ArtifactListClientResolution>) {}

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
    this.timer = setInterval(() => this.refresh(), ARTIFACTS_REFRESH_INTERVAL_MS);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element !== undefined) return [];
    const resolution = await this.resolveClient();
    if (resolution.status === 'signed-out') {
      return [
        new ArtifactNoticeItem(
          'Sign in to see your artifacts',
          'Artifacts belong to your AGI Cloud account. Select this item to sign in.',
          'sign-in',
          { command: 'agi-workforce.signIn', title: 'Sign in to AGI Cloud' },
        ),
      ];
    }

    let artifacts: ManagedCloudArtifactIndexEntry[];
    try {
      artifacts = await resolution.client.listArtifacts({ limit: ARTIFACTS_PAGE_LIMIT });
    } catch (error) {
      return [
        new ArtifactNoticeItem(
          'Artifacts could not be loaded',
          describeArtifactFailure(error),
          'warning',
          { command: REFRESH_ARTIFACTS_COMMAND, title: 'Retry' },
        ),
      ];
    }

    if (artifacts.length === 0) {
      return [
        new ArtifactNoticeItem(
          'No artifacts yet',
          'An artifact is a renderable block a chat produced, a page, a diagram or a component. They appear here once a chat makes one.',
          'circle-slash',
        ),
      ];
    }

    /*
     * Publishing is optional and its table can be absent in an environment that
     * never enabled it, so a failed read demotes every row to unpublished
     * rather than emptying a view whose primary listing succeeded.
     */
    const published = await resolution.client
      .listPublishedArtifacts()
      .catch((): ManagedCloudPublishedArtifact[] => []);
    const publishedByArtifactId = new Map(published.map((entry) => [entry.artifactId, entry]));

    return artifacts.map(
      (artifact) => new ArtifactTreeItem(artifact, publishedByArtifactId.get(artifact.id)),
    );
  }

  dispose(): void {
    this.setAutoRefreshEnabled(false);
    this._onDidChangeTreeData.dispose();
  }
}

export function readArtifactCommandArgument(
  argument: unknown,
): ManagedCloudArtifactIndexEntry | undefined {
  if (argument === null || typeof argument !== 'object') return undefined;
  const artifact = (argument as { artifact?: unknown }).artifact;
  if (artifact === null || typeof artifact !== 'object') return undefined;
  const candidate = artifact as ManagedCloudArtifactIndexEntry;
  return typeof candidate.id === 'string' && candidate.id !== '' ? candidate : undefined;
}

export function readPublishedCommandArgument(
  argument: unknown,
): ManagedCloudPublishedArtifact | undefined {
  if (argument === null || typeof argument !== 'object') return undefined;
  const published = (argument as { published?: unknown }).published;
  if (published === null || typeof published !== 'object') return undefined;
  const candidate = published as ManagedCloudPublishedArtifact;
  return typeof candidate.shareUrl === 'string' && candidate.shareUrl !== ''
    ? candidate
    : undefined;
}
