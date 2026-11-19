import { connectorReleased } from '@agiworkforce/types';
import type { ConnectorDirectoryCategory } from '@agiworkforce/cloud-contracts';

import type { ConnectedConnector, ConnectorListing } from '@/services/connectors';
import { connectionStatus } from '@/src/features/settings/cloud-connectors/connectorStatus';
import {
  isAuthoredSkill,
  isPluginOwnedSkill,
  isSkillInstalled,
  type ManagedSkillSummary,
} from '@/src/features/skills/service';

export const DISCOVER_GROUP_LIMIT = 5;
const EVERYDAY_CONNECTOR_LIMIT = 3;

export const DISCOVER_WORK_CATEGORIES: readonly ConnectorDirectoryCategory[] = [
  'Productivity',
  'Sales and marketing',
  'Data',
  'Financial services',
  'Legal',
];

const CONNECTABLE_NOW: ReadonlySet<ConnectorListing['connectable']> = new Set([
  'connect',
  'api-key-form',
]);

export type DiscoverRowState = 'add' | 'added';

export interface DiscoverRow {
  key: string;
  kind: 'skill' | 'connector';
  routeId: string;
  title: string;
  description: string;
  state: DiscoverRowState;
}

export interface DiscoverSources {
  listings: readonly ConnectorListing[] | null;
  connections: readonly ConnectedConnector[] | null;
  workCategories: readonly string[];
  skills: readonly ManagedSkillSummary[] | null;
  installed: ReadonlySet<string>;
}

export interface DiscoverGroups {
  everyday: DiscoverRow[];
  business: DiscoverRow[];
}

function connectionFor(
  listing: ConnectorListing,
  connections: readonly ConnectedConnector[],
): ConnectedConnector | null {
  return (
    connections.find(
      (connection) =>
        connection.connectorId === listing.id || connection.directoryId === listing.id,
    ) ?? null
  );
}

function connectorRow(
  listing: ConnectorListing,
  connections: readonly ConnectedConnector[],
): DiscoverRow | null {
  if (!connectorReleased(listing.id)) return null;
  const connection = connectionFor(listing, connections);
  const connected = connection !== null && connectionStatus(connection) === 'connected';
  if (!connected && !CONNECTABLE_NOW.has(listing.connectable)) return null;
  return {
    key: `connector:${listing.id}`,
    kind: 'connector',
    routeId: connection?.connectorId ?? listing.id,
    title: listing.name,
    description: listing.description,
    state: connected ? 'added' : 'add',
  };
}

function skillRows(
  skills: readonly ManagedSkillSummary[],
  installed: ReadonlySet<string>,
): DiscoverRow[] {
  return skills
    .filter(
      (skill) =>
        skill.lifecycle === 'included' &&
        !isAuthoredSkill(skill) &&
        !isPluginOwnedSkill(skill) &&
        skill.installs !== undefined,
    )
    .sort((a, b) => (b.installs ?? 0) - (a.installs ?? 0) || a.name.localeCompare(b.name))
    .map((skill): DiscoverRow => ({
      key: `skill:${skill.name}`,
      kind: 'skill',
      routeId: skill.name,
      title: skill.title ?? skill.name,
      description: skill.description,
      state: isSkillInstalled(skill, installed) ? 'added' : 'add',
    }));
}

export function buildDiscoverGroups(sources: DiscoverSources): DiscoverGroups {
  const connections = sources.connections ?? [];
  const connectorEntries =
    sources.listings && sources.connections
      ? sources.listings.flatMap((listing) => {
          const row = connectorRow(listing, connections);
          return row ? [{ listing, row }] : [];
        })
      : [];

  const everydayConnectors = connectorEntries.filter(
    ({ listing }) => Boolean(listing.personalSources?.length) || listing.featured === true,
  );
  const connectorSlots = Math.min(everydayConnectors.length, EVERYDAY_CONNECTOR_LIMIT);
  const skills = skillRows(sources.skills ?? [], sources.installed).slice(
    0,
    DISCOVER_GROUP_LIMIT - connectorSlots,
  );
  const everydayEntries = everydayConnectors.slice(0, DISCOVER_GROUP_LIMIT - skills.length);
  const taken = new Set(everydayEntries.map(({ listing }) => listing.id));

  const business = connectorEntries
    .filter(
      ({ listing }) =>
        !taken.has(listing.id) &&
        listing.categories.some((category) => sources.workCategories.includes(category)),
    )
    .slice(0, DISCOVER_GROUP_LIMIT)
    .map(({ row }) => row);

  return {
    everyday: [...everydayEntries.map(({ row }) => row), ...skills],
    business,
  };
}

export function workCategoriesFrom(returned: readonly string[]): string[] {
  return DISCOVER_WORK_CATEGORIES.filter((category) => returned.includes(category));
}
