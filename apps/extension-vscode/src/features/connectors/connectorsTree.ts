import * as vscode from 'vscode';
import type { ConnectorConnection, ListConnectorsResponse } from '@agiworkforce/cloud-contracts';
import {
  connectorContextValue,
  connectorDescription,
  connectorIcon,
  connectorTitle,
  connectorTooltipLines,
  describeConnectorFailure,
  pendingConnectorDescription,
} from './connectorPresentation';

export const CONNECTORS_VIEW_ID = 'agi-workforce.connectors';
export const CONNECTORS_REFRESH_INTERVAL_MS = 120_000;

export const MANAGE_CONNECTORS_COMMAND = 'agi-workforce.manageConnectors';
export const REFRESH_CONNECTORS_COMMAND = 'agi-workforce.refreshConnectors';

export interface ConnectorListClient {
  listConnectors(): Promise<ListConnectorsResponse>;
}

export type ConnectorListClientResolution =
  | { status: 'ready'; client: ConnectorListClient }
  | { status: 'signed-out' };

export function connectorsWebUrl(webOrigin: string): string {
  return `${webOrigin}/settings/connectors?from=vscode-extension`;
}

export class ConnectorTreeItem extends vscode.TreeItem {
  constructor(readonly connector: ConnectorConnection) {
    super(connectorTitle(connector), vscode.TreeItemCollapsibleState.None);
    this.id = connector.id;
    this.description = connectorDescription(connector);
    this.tooltip = connectorTooltipLines(connector).join('\n');
    this.iconPath = new vscode.ThemeIcon(connectorIcon(connector));
    this.contextValue = connectorContextValue(connector);
    this.accessibilityInformation = {
      label: `${connectorTitle(connector)}, ${connectorDescription(connector)}`,
      role: 'treeitem',
    };
    this.command = {
      command: MANAGE_CONNECTORS_COMMAND,
      title: 'Manage Connectors',
    };
  }
}

class ConnectorNoticeItem extends vscode.TreeItem {
  constructor(label: string, tooltip: string, icon: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'connectorNotice';
    this.accessibilityInformation = { label: `${label}, ${tooltip}`, role: 'treeitem' };
    if (command !== undefined) this.command = command;
  }
}

export class ConnectorsTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly resolveClient: () => Promise<ConnectorListClientResolution>) {}

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
    this.timer = setInterval(() => this.refresh(), CONNECTORS_REFRESH_INTERVAL_MS);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element !== undefined) return [];
    const resolution = await this.resolveClient();
    if (resolution.status === 'signed-out') {
      return [
        new ConnectorNoticeItem(
          'Sign in to see your connectors',
          'Connectors belong to your AGI Cloud account. Select this item to sign in.',
          'sign-in',
          { command: 'agi-workforce.signIn', title: 'Sign in to AGI Cloud' },
        ),
      ];
    }

    let directory: ListConnectorsResponse;
    try {
      directory = await resolution.client.listConnectors();
    } catch (error) {
      return [
        new ConnectorNoticeItem(
          'Connectors could not be loaded',
          describeConnectorFailure(error),
          'warning',
          { command: REFRESH_CONNECTORS_COMMAND, title: 'Retry' },
        ),
      ];
    }

    const items: vscode.TreeItem[] = directory.connectors.map(
      (connector) => new ConnectorTreeItem(connector),
    );

    for (const connectorId of directory.pending ?? []) {
      items.push(
        new ConnectorNoticeItem(connectorId, pendingConnectorDescription(), 'debug-pause', {
          command: MANAGE_CONNECTORS_COMMAND,
          title: 'Manage Connectors',
        }),
      );
    }

    if (items.length === 0) {
      return [
        new ConnectorNoticeItem(
          'No connectors yet',
          'Connectors authorize in a browser, so they are added on the web app. Select this item to open it.',
          'plug',
          { command: MANAGE_CONNECTORS_COMMAND, title: 'Manage Connectors' },
        ),
      ];
    }

    return items;
  }

  dispose(): void {
    this.setAutoRefreshEnabled(false);
    this._onDidChangeTreeData.dispose();
  }
}
