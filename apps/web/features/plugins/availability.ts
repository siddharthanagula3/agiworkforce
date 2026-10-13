import {
  CONNECTOR_RELEASE_STATE,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
  isPluginEntryInstallable,
  isPluginEntryWebInstallable,
  type ConnectorReleaseState,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import { PLUGIN_STATE_DESKTOP_AND_CLI } from '@/features/directory/constants';
import {
  SURFACE_NAMES,
  SURFACE_STATUS,
  cliAvailabilityNote,
  isReleased,
  joinSurfaceNames,
  type SurfaceId,
  type SurfaceStatusMap,
} from '@/lib/surface-status';
import type { PluginCatalogResult } from './server/registry-source';

function isCliPublished(entry: PluginRegistryEntry): boolean {
  return isPluginEntryInstallable(entry) && !isPluginEntryWebInstallable(entry);
}

function webSentence(web: number, total: number): string {
  if (web === 0) return 'No pack installs on the web yet.';
  if (web === total) {
    return total === 1
      ? 'The 1 pack in the registry installs on the web, from the plugins section of Settings.'
      : `All ${total} packs in the registry install on the web, from the plugins section of Settings.`;
  }
  return `${web} of ${total} packs install on the web, from the plugins section of Settings.`;
}

function cliSentence(cli: number, web: number, statuses: SurfaceStatusMap): string {
  const subject = web > 0 ? `${cli} more` : `${cli}`;
  const verb = cli === 1 ? 'is' : 'are';
  const clause = isReleased('cli', statuses) ? '' : `, which is ${statuses.cli.toLowerCase()}`;
  return `${subject} ${verb} published for the CLI${clause}.`;
}

function remainderSentence(remaining: number, declared: number): string {
  const single = remaining === 1;
  if (declared === remaining) {
    return single
      ? 'The other one is declared and not yet published.'
      : `The other ${remaining} are declared and not yet published.`;
  }
  return single
    ? 'The other one is not installable.'
    : `The other ${remaining} are not installable.`;
}

// Every page that states a plugin launch status reads it from here, so
// /plugins and /features/plugins cannot drift into contradicting each other.
export function pluginAvailabilityClaim(
  catalog: PluginCatalogResult,
  statuses: SurfaceStatusMap = SURFACE_STATUS,
): string {
  if (catalog.status !== 'ok') {
    return 'The registry is unreachable right now, so this page cannot say which packs are installable.';
  }
  const entries = catalog.entries;
  if (entries.length === 0) {
    return 'The registry holds no packs yet.';
  }
  const web = entries.filter(isPluginEntryWebInstallable).length;
  const cli = entries.filter(isCliPublished).length;
  if (web + cli === 0) {
    return 'No pack is installable in this environment yet.';
  }
  const total = entries.length;
  const remaining = total - web - cli;
  const declared = entries.filter(
    (entry) =>
      !isPluginEntryWebInstallable(entry) && !isCliPublished(entry) && entry.status === 'preview',
  ).length;
  const sentences = [webSentence(web, total)];
  if (cli > 0) sentences.push(cliSentence(cli, web, statuses));
  if (remaining > 0) sentences.push(remainderSentence(remaining, declared));
  return sentences.join(' ');
}

const DIRECTORY_PACK_SURFACES = ['desktop', 'cli'] as const satisfies readonly SurfaceId[];

function pendingDirectoryPackSurfaces(statuses: SurfaceStatusMap): SurfaceId[] {
  return DIRECTORY_PACK_SURFACES.filter((surface) => !isReleased(surface, statuses));
}

function directoryPackLabel(statuses: SurfaceStatusMap): string {
  const pending = pendingDirectoryPackSurfaces(statuses);
  const first = pending[0];
  if (first === undefined) return PLUGIN_STATE_DESKTOP_AND_CLI;
  const status = statuses[first].toLowerCase();
  if (pending.length === DIRECTORY_PACK_SURFACES.length) {
    return `${PLUGIN_STATE_DESKTOP_AND_CLI}, ${status}`;
  }
  const names = joinSurfaceNames(pending.map((surface) => SURFACE_NAMES[surface]));
  return `${PLUGIN_STATE_DESKTOP_AND_CLI}, ${names} ${status}`;
}

export function pluginClientAvailabilityNote(statuses: SurfaceStatusMap = SURFACE_STATUS): string {
  const pending = pendingDirectoryPackSurfaces(statuses);
  const first = pending[0];
  if (first === undefined) return '';
  const names = joinSurfaceNames(pending.map((surface) => SURFACE_NAMES[surface]));
  return `${names} ${pending.length > 1 ? 'are' : 'is'} ${statuses[first].toLowerCase()}.`;
}

export function pluginStatusMeaningNote(statuses: SurfaceStatusMap = SURFACE_STATUS): string {
  return [
    'Website packs install only from reviewed embedded manifests.',
    'CLI and Desktop packs still require a separately published, integrity-pinned artifact.',
    pluginClientAvailabilityNote(statuses),
    'Until one of those paths exists, the entry remains declared and no control pretends to install it.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function pluginStatusLabel(
  entry: PluginRegistryEntry,
  {
    cliCommand = null,
    statuses = SURFACE_STATUS,
  }: { cliCommand?: string | null; statuses?: SurfaceStatusMap } = {},
): string {
  if (isPluginEntryWebInstallable(entry)) return 'Available on Web';
  if (isPluginEntryInstallable(entry)) {
    return isReleased('cli', statuses) ? 'Installable from the CLI' : 'Published for the CLI';
  }
  if (entry.status === 'deprecated') return 'Deprecated: do not install';
  if (entry.status === 'suspended') return 'Suspended: installs stopped';
  if (entry.status === 'draft' || entry.status === 'in_review') return 'Not offered yet';
  if (cliCommand !== null) return directoryPackLabel(statuses);
  return 'Declared: not installable yet';
}

export function pluginCliInstallNote(statuses: SurfaceStatusMap = SURFACE_STATUS): string {
  if (isReleased('cli', statuses)) return 'Install it with the AGI CLI, using the command below.';
  return `The command below is for the AGI CLI. ${cliAvailabilityNote(statuses)}`;
}

const CONNECTORS_DECLARED_SENTENCE = 'A plugin declares which connectors it needs.';

export function pluginModelHeading(state: ConnectorReleaseState = CONNECTOR_RELEASE_STATE): string {
  return connectorsReleased(state)
    ? 'Skills plus connectors, wired once.'
    : 'Skills, plus the connectors a pack declares.';
}

export function pluginConnectorWiringNote(
  state: ConnectorReleaseState = CONNECTOR_RELEASE_STATE,
): string {
  return connectorsReleased(state)
    ? `${CONNECTORS_DECLARED_SENTENCE} Connect once, and every skill in the pack can use it, inside the permission boundary you chose.`
    : `${CONNECTORS_DECLARED_SENTENCE} ${CONNECTORS_COMING_SOON_MESSAGE}`;
}

export function pluginRequiredConnectorsHeading(
  state: ConnectorReleaseState = CONNECTOR_RELEASE_STATE,
): string {
  return connectorsReleased(state)
    ? 'Connect once, use everywhere in the pack.'
    : 'The connectors this pack declares.';
}
