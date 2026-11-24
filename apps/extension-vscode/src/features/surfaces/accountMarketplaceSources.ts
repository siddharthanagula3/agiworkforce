import * as vscode from 'vscode';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import {
  PLUGIN_MARKETPLACES_PATH,
  PluginMarketplaceSourceReceiptSchema,
  PluginMarketplaceSourcesSchema,
  RegisterMarketplaceBodySchema,
  parseGithubRepositoryUrl,
  pluginMarketplaceRefreshPath,
  pluginMarketplaceSourcePath,
  type PluginMarketplaceSource,
} from '@agiworkforce/cloud-contracts';
import { boundedRefusalText } from '../../utils/accountRefusal';

export type MarketplaceRequest = (
  path: string,
  mutation?: { method: 'POST' | 'DELETE'; body?: object },
) => Promise<unknown>;

const TITLE = `${PRODUCT_NAMES.code}, Marketplace Sources`;

async function addSource(request: MarketplaceRequest): Promise<boolean> {
  const repositoryUrl = await vscode.window.showInputBox({
    title: TITLE,
    prompt: 'Public GitHub repository URL',
    ignoreFocusOut: true,
    validateInput: (value) =>
      parseGithubRepositoryUrl(value) === null
        ? 'Enter a public GitHub repository URL.'
        : undefined,
  });
  if (repositoryUrl === undefined) return false;
  const ref = await vscode.window.showInputBox({
    title: TITLE,
    prompt: 'Branch, tag, or commit',
    placeHolder: 'Leave blank for the default branch',
    ignoreFocusOut: true,
    validateInput: (value) =>
      RegisterMarketplaceBodySchema.shape.ref.safeParse(value.trim() || undefined).success
        ? undefined
        : 'Enter a shorter git reference.',
  });
  if (ref === undefined) return false;
  const body = RegisterMarketplaceBodySchema.parse({ repositoryUrl, ref: ref.trim() || undefined });
  const add = 'Add source';
  const confirmation = await vscode.window.showWarningMessage(
    'Add this marketplace source to AGI Cloud?',
    {
      modal: true,
      detail: `${body.repositoryUrl}${body.ref === undefined ? '' : ` · ${body.ref}`}\n\nAdding an existing repository updates its catalog. Entries removed by the publisher can also remove their installations.`,
    },
    add,
  );
  if (confirmation !== add) return false;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Adding marketplace source' },
    async () =>
      PluginMarketplaceSourceReceiptSchema.parse(
        await request(PLUGIN_MARKETPLACES_PATH, { method: 'POST', body }),
      ),
  );
  return true;
}

async function changeSource(
  request: MarketplaceRequest,
  source: PluginMarketplaceSource,
): Promise<boolean> {
  const name = boundedRefusalText(source.name) ?? 'Marketplace source';
  const action = await vscode.window.showQuickPick(
    [...(source.repositoryUrl ? ['Refresh source'] : []), 'Remove source'],
    { title: `${TITLE}, ${name}`, placeHolder: 'Choose a source action' },
  );
  if (action === undefined) return false;
  const refresh = action === 'Refresh source';
  const confirmation = await vscode.window.showWarningMessage(
    `${refresh ? 'Refresh' : 'Remove'} “${name}”?`,
    {
      modal: true,
      detail: refresh
        ? 'AGI Cloud will fetch the latest catalog. Entries removed by the publisher can also remove their installations.'
        : 'This removes the source and the plugins installed from it in your AGI Cloud account.',
    },
    action,
  );
  if (confirmation !== action) return false;

  if (refresh) {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Refreshing marketplace source' },
      async () =>
        PluginMarketplaceSourceReceiptSchema.parse(
          await request(pluginMarketplaceRefreshPath(source.id), { method: 'POST' }),
        ),
    );
    if (result.source.status === 'error') {
      void vscode.window.showWarningMessage(
        boundedRefusalText(result.source.lastError ?? '') ?? 'Marketplace refresh failed.',
      );
    }
  } else {
    await request(pluginMarketplaceSourcePath(source.id), { method: 'DELETE' });
  }
  return true;
}

export async function manageMarketplaceSources(
  request: MarketplaceRequest,
  sources: readonly PluginMarketplaceSource[],
): Promise<boolean> {
  let changed = false;
  for (;;) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(add) Add GitHub source' },
        ...sources.map((source) => ({
          label: boundedRefusalText(source.name) ?? 'Marketplace source',
          description:
            source.status === 'error'
              ? 'Refresh failed'
              : source.entryCount === 1
                ? '1 plugin'
                : `${source.entryCount} plugins`,
          detail: boundedRefusalText(source.lastError ?? source.repositoryUrl ?? ''),
          source,
        })),
      ],
      { title: TITLE, placeHolder: 'Add or select a marketplace source', matchOnDetail: true },
    );
    if (choice === undefined) return changed;

    const updated =
      'source' in choice ? await changeSource(request, choice.source) : await addSource(request);
    if (updated) {
      changed = true;
      sources = PluginMarketplaceSourcesSchema.parse(
        await request(PLUGIN_MARKETPLACES_PATH),
      ).sources;
    }
  }
}
