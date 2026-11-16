import { CONNECTORS_COMING_SOON_LABEL, connectorReleased } from '@agiworkforce/types';
import type { LucideIcon } from 'lucide-react-native';
import {
  BANK_ACCOUNTS_CONNECTOR_ID,
  type ManagedCloudAgent,
  type PluginDirectoryEntryWire,
} from '@agiworkforce/cloud-contracts';

import type { ConnectedConnector, ConnectorListing } from '@/services/connectors';
import type { ManagedSkillSummary } from '@/src/features/skills/service';

export const CUSTOMIZE_SEARCH_GROUP_ROWS = 5;
export const CUSTOMIZE_SEARCH_PLUGIN_LIMIT = 20;
export const CUSTOMIZE_SEARCH_LOCAL_NOTE = 'Skills, connectors and agents need AGI Cloud';

export type CustomizeSearchGroupKey = 'skills' | 'connectors' | 'agents' | 'plugins';

export const CUSTOMIZE_SEARCH_GROUP_TITLES: Record<CustomizeSearchGroupKey, string> = {
  skills: 'Skills',
  connectors: 'Connectors',
  agents: 'Agents',
  plugins: 'Plugins',
};

export const CUSTOMIZE_SEARCH_GROUP_ORDER: readonly CustomizeSearchGroupKey[] = [
  'skills',
  'connectors',
  'agents',
  'plugins',
];

export interface CustomizeSearchRow {
  key: string;
  group: CustomizeSearchGroupKey;
  routeId: string;
  title: string;
  description: string;
}

export interface CustomizeSearchDestination {
  key: string;
  title: string;
  body: string;
  route: string;
  Icon: LucideIcon;
}

export function customizeSearchTerm(query: string): string {
  return query.trim();
}

function matches(term: string, ...fields: readonly (string | null | undefined)[]): boolean {
  const needle = term.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

export function skillSearchRows(
  skills: readonly ManagedSkillSummary[],
  term: string,
): CustomizeSearchRow[] {
  return skills
    .filter(
      (skill) =>
        skill.lifecycle === 'included' && matches(term, skill.name, skill.title, skill.description),
    )
    .map((skill) => ({
      key: `skill:${skill.name}`,
      group: 'skills',
      routeId: skill.name,
      title: skill.title ?? skill.name,
      description: skill.description,
    }));
}

export function agentSearchRows(
  agents: readonly ManagedCloudAgent[],
  term: string,
): CustomizeSearchRow[] {
  return agents
    .filter((agent) => matches(term, agent.name, agent.description))
    .map((agent) => ({
      key: `agent:${agent.id}`,
      group: 'agents',
      routeId: agent.id,
      title: agent.name,
      description: agent.description,
    }));
}

export function pluginSearchRows(
  entries: readonly PluginDirectoryEntryWire[],
): CustomizeSearchRow[] {
  return entries.map((entry) => ({
    key: `plugin:${entry.id}`,
    group: 'plugins',
    routeId: entry.id,
    title: entry.name,
    description: entry.description,
  }));
}

export function connectorSearchRows(input: {
  listings: readonly ConnectorListing[];
  connections: readonly ConnectedConnector[];
  term: string;
  bankLinking: boolean;
}): CustomizeSearchRow[] {
  const { listings, connections, term, bankLinking } = input;
  const visible = (connectorId: string) =>
    bankLinking || connectorId !== BANK_ACCOUNTS_CONNECTOR_ID;
  const connectionFor = (listing: ConnectorListing) =>
    connections.find(
      (connection) =>
        connection.connectorId === listing.id || connection.directoryId === listing.id,
    );

  const rows: CustomizeSearchRow[] = [];
  const claimed = new Set<string>();
  for (const listing of listings) {
    const connection = connectionFor(listing);
    if (!visible(listing.id)) continue;
    const comingSoon = !connection && !connectorReleased(listing.id);
    const routeId = connection?.connectorId ?? listing.id;
    claimed.add(routeId);
    rows.push({
      key: `connector:${routeId}`,
      group: 'connectors',
      routeId,
      title: listing.name,
      description: comingSoon ? CONNECTORS_COMING_SOON_LABEL : listing.description,
    });
  }
  for (const connection of connections) {
    if (claimed.has(connection.connectorId) || !visible(connection.connectorId)) continue;
    if (!matches(term, connection.name, connection.connectorId)) continue;
    rows.push({
      key: `connector:${connection.connectorId}`,
      group: 'connectors',
      routeId: connection.connectorId,
      title: connection.name || connection.connectorId,
      description: '',
    });
  }
  return rows;
}

export function destinationSearchRows<T extends CustomizeSearchDestination>(
  destinations: readonly T[],
  term: string,
): T[] {
  return destinations.filter((destination) => matches(term, destination.title, destination.body));
}
