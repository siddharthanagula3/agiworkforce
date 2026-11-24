import * as vscode from 'vscode';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import {
  PLUGIN_MARKETPLACES_PATH,
  PLUGIN_MARKETPLACE_ENTRIES_PATH,
  PLUGIN_MARKETPLACE_INSTALLATIONS_PATH,
  PluginMarketplaceBrowseSchema,
  PluginMarketplaceInstalledEntriesSchema,
  PluginMarketplaceInstallReceiptSchema,
  PluginMarketplaceSourcesSchema,
} from '@agiworkforce/cloud-contracts';
import { accountRequestHeaders } from '../../platform/accountHeaders';
import { boundedRefusalText, readAccountRefusal } from '../../utils/accountRefusal';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { manageMarketplaceSources, type MarketplaceRequest } from './accountMarketplaceSources';

const TITLE = `${PRODUCT_NAMES.code}, AGI Cloud Marketplace`;
const INSTALL = 'Install in AGI Cloud';

export async function browseAccountMarketplace(secrets: vscode.SecretStorage): Promise<void> {
  try {
    const token = await getAccountToken(secrets);
    if (token === undefined || token === '') {
      const action = 'Sign in';
      if (
        (await vscode.window.showInformationMessage(
          'Sign in to browse your AGI Cloud marketplace.',
          action,
        )) === action
      ) {
        await vscode.commands.executeCommand('agi-workforce.signIn');
      }
      return;
    }

    const origin = getCloudWebOrigin();
    const request: MarketplaceRequest = async (path, mutation) => {
      if (
        mutation !== undefined &&
        ((await getAccountToken(secrets, { renew: false })) !== token ||
          getCloudWebOrigin() !== origin)
      ) {
        throw new Error(
          'Your AGI Cloud session changed. Reopen the marketplace before making changes.',
        );
      }
      const response = await fetch(`${origin}${path}`, {
        headers: { ...accountRequestHeaders(token), 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        method: mutation?.method ?? 'GET',
        ...(mutation?.body === undefined ? {} : { body: JSON.stringify(mutation.body) }),
      });
      if (!response.ok) {
        const refusal = await readAccountRefusal(response);
        throw new Error(
          refusal?.message ?? `AGI Cloud marketplace returned HTTP ${response.status}.`,
        );
      }
      return response.status === 204 ? undefined : response.json();
    };

    const loadCatalogue = () =>
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Loading your AGI Cloud marketplace',
        },
        () =>
          Promise.all([
            request(PLUGIN_MARKETPLACE_ENTRIES_PATH).then((value) =>
              PluginMarketplaceBrowseSchema.parse(value),
            ),
            request(PLUGIN_MARKETPLACES_PATH).then((value) =>
              PluginMarketplaceSourcesSchema.parse(value),
            ),
            request(PLUGIN_MARKETPLACE_INSTALLATIONS_PATH).then((value) =>
              PluginMarketplaceInstalledEntriesSchema.parse(value),
            ),
          ]),
      );
    let [catalogue, registeredSources, existing] = await loadCatalogue();
    let installed = new Set(existing.installations.map((installation) => installation.entryId));
    for (;;) {
      const sources = new Map(registeredSources.sources.map((source) => [source.id, source.name]));
      const picked = await vscode.window.showQuickPick(
        [
          ...catalogue.entries.map((entry) => ({
            label: boundedRefusalText(entry.name) ?? 'Marketplace plugin',
            description: [
              boundedRefusalText(sources.get(entry.sourceId) ?? ''),
              boundedRefusalText(entry.version),
              ...(installed.has(entry.id) ? ['Installed'] : []),
            ]
              .filter(Boolean)
              .join(' · '),
            detail: boundedRefusalText(entry.description),
            entry,
          })),
          { label: '$(settings-gear) Manage marketplace sources', manageSources: true },
        ],
        {
          title: TITLE,
          placeHolder: 'Search plugins by name, description, or source',
          matchOnDescription: true,
          matchOnDetail: true,
        },
      );
      if (picked === undefined) return;
      if ('manageSources' in picked) {
        if (await manageMarketplaceSources(request, registeredSources.sources)) {
          [catalogue, registeredSources, existing] = await loadCatalogue();
          installed = new Set(existing.installations.map((installation) => installation.entryId));
        }
        continue;
      }
      const { entry, label } = picked;
      const detail = [
        picked.detail,
        ...(
          [
            ['Permissions', entry.permissions],
            ['Connectors', entry.requiredConnectors],
            ['Skills', entry.declaredSkills],
            ['Agents', entry.agents],
          ] as const
        ).flatMap(([heading, values]) =>
          values.length === 0
            ? []
            : [`${heading}: ${values.map(boundedRefusalText).filter(Boolean).join(', ')}`],
        ),
      ]
        .filter(Boolean)
        .join('\n');
      if (installed.has(entry.id)) {
        await vscode.window.showInformationMessage(`${label} is installed in AGI Cloud.`, {
          modal: true,
          detail,
        });
        continue;
      }
      const confirmation = await vscode.window.showWarningMessage(
        `Install “${label}” in AGI Cloud?`,
        { modal: true, detail },
        INSTALL,
      );
      if (confirmation !== INSTALL) continue;
      const { installation } = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Installing plugin in AGI Cloud' },
        async () =>
          PluginMarketplaceInstallReceiptSchema.parse(
            await request(PLUGIN_MARKETPLACE_INSTALLATIONS_PATH, {
              method: 'POST',
              body: { entryId: entry.id },
            }),
          ),
      );
      if (installation.entryId !== entry.id) {
        throw new Error('AGI Cloud could not confirm installation of the selected plugin.');
      }
      installed.add(entry.id);
      void vscode.window.showInformationMessage(`Installed “${label}” in AGI Cloud.`);
    }
  } catch (error) {
    const message = error instanceof Error ? boundedRefusalText(error.message) : undefined;
    void vscode.window.showWarningMessage(message ?? 'Could not open the AGI Cloud marketplace.');
  }
}
