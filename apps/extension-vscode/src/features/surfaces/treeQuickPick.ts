import * as vscode from 'vscode';

export interface SurfaceRowAction {
  command: string;
  icon: string;
  tooltip: string;
  matches: (contextValue: string) => boolean;
}

export interface SurfaceTitleAction {
  command: string;
  icon: string;
  tooltip: string;
  closes?: boolean;
}

export type SurfaceTreeSource = Pick<vscode.TreeDataProvider<vscode.TreeItem>, 'getChildren'> & {
  onDidChangeTreeData?: vscode.Event<vscode.TreeItem | undefined | null | void>;
  setAutoRefreshEnabled?: (enabled: boolean) => void;
};

export interface SurfaceQuickPickOptions {
  title: string;
  placeholder: string;
  provider: SurfaceTreeSource;
  rowActions?: readonly SurfaceRowAction[];
  titleActions?: readonly SurfaceTitleAction[];
}

interface SurfaceQuickPickItem extends vscode.QuickPickItem {
  item: vscode.TreeItem;
}

export const SURFACE_SECTION_CONTEXT = 'surfaceSection';

export function surfaceSectionItem(label: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label);
  item.contextValue = SURFACE_SECTION_CONTEXT;
  return item;
}

const ROW_TYPES = new WeakMap<vscode.TreeItem, string>();

export function composeSurfaceSections(
  sections: readonly {
    label: string;
    rowType?: string;
    provider: Pick<vscode.TreeDataProvider<vscode.TreeItem>, 'getChildren'> & {
      onDidChangeTreeData?: vscode.Event<vscode.TreeItem | undefined | null | void>;
    };
  }[],
): Pick<vscode.TreeDataProvider<vscode.TreeItem>, 'getChildren'> {
  return {
    async getChildren(): Promise<vscode.TreeItem[]> {
      const groups = await Promise.all(
        sections.map(async (section) => {
          const children = (await section.provider.getChildren()) ?? [];
          if (section.rowType !== undefined) {
            for (const child of children) ROW_TYPES.set(child, section.rowType);
          }
          return [surfaceSectionItem(section.label), ...children];
        }),
      );
      return groups.flat();
    },
  };
}

export function treeItemLabel(item: vscode.TreeItem): string {
  const label = item.label;
  if (typeof label === 'string') return label;
  return label?.label ?? '';
}

export function treeItemDescription(item: vscode.TreeItem): string | undefined {
  return typeof item.description === 'string' ? item.description : undefined;
}

export function treeItemDetail(item: vscode.TreeItem): string | undefined {
  const tooltip = item.tooltip;
  const text = typeof tooltip === 'string' ? tooltip : tooltip?.value;
  if (text === undefined || text.trim() === '') return undefined;
  return text.replace(/\s*\n+\s*/gu, ' · ');
}

function iconName(item: vscode.TreeItem): string | undefined {
  const icon = item.iconPath;
  return icon instanceof vscode.ThemeIcon ? icon.id : undefined;
}

export function buildSurfaceRows(
  items: readonly vscode.TreeItem[],
  rowActions: readonly SurfaceRowAction[],
): SurfaceQuickPickItem[] {
  return items.map((item) => {
    if (item.contextValue === SURFACE_SECTION_CONTEXT) {
      return { label: treeItemLabel(item), kind: vscode.QuickPickItemKind.Separator, item };
    }
    const icon = iconName(item);
    const label = treeItemLabel(item);
    const rowType = ROW_TYPES.get(item);
    const ownDescription = treeItemDescription(item);
    const description =
      rowType === undefined
        ? ownDescription
        : ownDescription === undefined
          ? rowType
          : `${rowType} · ${ownDescription}`;
    const detail = treeItemDetail(item);
    const contextValue = item.contextValue ?? '';
    const buttons = rowActions
      .filter((action) => action.matches(contextValue))
      .map((action) => ({
        iconPath: new vscode.ThemeIcon(action.icon),
        tooltip: action.tooltip,
      }));
    return {
      label: icon === undefined ? label : `$(${icon}) ${label}`,
      ...(description === undefined ? {} : { description }),
      ...(detail === undefined ? {} : { detail }),
      ...(buttons.length === 0 ? {} : { buttons }),
      item,
    };
  });
}

export async function showSurfaceQuickPick(options: SurfaceQuickPickOptions): Promise<void> {
  const rowActions = options.rowActions ?? [];
  const titleActions = options.titleActions ?? [];
  const pick = vscode.window.createQuickPick<SurfaceQuickPickItem>();
  pick.title = options.title;
  pick.placeholder = options.placeholder;
  pick.matchOnDescription = true;
  pick.matchOnDetail = true;
  pick.buttons = titleActions.map((action) => ({
    iconPath: new vscode.ThemeIcon(action.icon),
    tooltip: action.tooltip,
  }));

  const load = async (): Promise<void> => {
    pick.busy = true;
    try {
      const children = (await options.provider.getChildren()) ?? [];
      const expanded = await Promise.all(
        children.map(async (child) =>
          child.collapsibleState === vscode.TreeItemCollapsibleState.Expanded
            ? [
                surfaceSectionItem(treeItemLabel(child)),
                ...((await options.provider.getChildren(child)) ?? []),
              ]
            : [child],
        ),
      );
      pick.items = buildSurfaceRows(expanded.flat(), rowActions);
    } finally {
      pick.busy = false;
    }
  };

  const changeListener = options.provider.onDidChangeTreeData?.(() => {
    void load();
  });
  options.provider.setAutoRefreshEnabled?.(true);

  return new Promise<void>((resolve) => {
    pick.onDidHide(() => {
      options.provider.setAutoRefreshEnabled?.(false);
      changeListener?.dispose();
      pick.dispose();
      resolve();
    });

    pick.onDidTriggerButton((button) => {
      const index = pick.buttons.indexOf(button);
      const action = titleActions[index];
      if (action === undefined) return;
      if (action.closes === true) pick.hide();
      void vscode.commands.executeCommand(action.command).then(
        () => (action.closes === true ? undefined : load()),
        () => undefined,
      );
    });

    pick.onDidTriggerItemButton((event) => {
      const contextValue = event.item.item.contextValue ?? '';
      const matching = rowActions.filter((action) => action.matches(contextValue));
      const index = (event.item.buttons ?? []).indexOf(event.button);
      const action = matching[index];
      if (action === undefined) return;
      pick.hide();
      void vscode.commands.executeCommand(action.command, event.item.item);
    });

    pick.onDidAccept(() => {
      const selected = pick.selectedItems[0];
      pick.hide();
      const command = selected?.item.command;
      if (command === undefined) return;
      void vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
    });

    pick.show();
    void load();
  });
}

export async function showCapabilityQuickPick(options: {
  title: string;
  placeholder: string;
  rows: readonly { label: string; description?: string; detail?: string }[];
  emptyLabel: string;
}): Promise<void> {
  const items: vscode.QuickPickItem[] =
    options.rows.length === 0
      ? [{ label: options.emptyLabel, alwaysShow: true }]
      : options.rows.map((row) => ({
          label: row.label,
          ...(row.description === undefined ? {} : { description: row.description }),
          ...(row.detail === undefined ? {} : { detail: row.detail }),
        }));
  await vscode.window.showQuickPick(items, {
    title: options.title,
    placeHolder: options.placeholder,
    matchOnDescription: true,
    matchOnDetail: true,
  });
}
