/**
 * Exact connector IDs govern selective authorization and execution. Coarse
 * availability only enables discovery; it does not release other connectors.
 *
 * @module connector-release
 */

import type { CapabilityDenialReason } from './reason-codes';

export const CONNECTOR_RELEASE_STATES = ['released', 'coming_soon'] as const;

export type ConnectorReleaseState = (typeof CONNECTOR_RELEASE_STATES)[number];

export const CONNECTOR_RELEASE_STATE: ConnectorReleaseState = 'coming_soon';

export const SELECTIVELY_RELEASED_CONNECTOR_IDS = Object.freeze([
  'airtable',
  'canva',
  'clickup',
  'cloudflare',
  'confluence',
  'datadog',
  'jira',
  'linear',
  'monday',
  'notion',
  'posthog',
  'sentry',
  'todoist',
] as const);

const selectivelyReleasedConnectorIds: ReadonlySet<string> = new Set(
  SELECTIVELY_RELEASED_CONNECTOR_IDS,
);

export const CONNECTORS_COMING_SOON_REASON =
  'feature_coming_soon' as const satisfies CapabilityDenialReason;

export const CONNECTORS_COMING_SOON_LABEL = 'Coming soon';

export const CONNECTORS_COMING_SOON_MESSAGE = 'Connectors are coming soon.';

export const CONNECTORS_COMING_SOON_DETAIL =
  'Connecting Gmail, Google Drive, Calendar and other apps is coming soon.';

export function connectorsReleased(
  state: ConnectorReleaseState = CONNECTOR_RELEASE_STATE,
): boolean {
  return state === 'released';
}

export function connectorReleased(connectorId: unknown): boolean {
  return (
    typeof connectorId === 'string' &&
    connectorId.length > 0 &&
    (connectorsReleased() || selectivelyReleasedConnectorIds.has(connectorId))
  );
}

export function hasReleasedConnectors(): boolean {
  return connectorsReleased() || selectivelyReleasedConnectorIds.size > 0;
}
