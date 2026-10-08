/**
 * Whether connected apps are open to anyone yet. This is the one switch: every
 * server path that connects, lists, dials or calls a connector reads it, and
 * every surface that offers one shows the locked state while it is unreleased.
 * It is not the `canUseConnectors` kill switch, which means a released feature
 * is temporarily broken.
 *
 * @module connector-release
 */

import type { CapabilityDenialReason } from './reason-codes';

export const CONNECTOR_RELEASE_STATES = ['released', 'coming_soon'] as const;

export type ConnectorReleaseState = (typeof CONNECTOR_RELEASE_STATES)[number];

export const CONNECTOR_RELEASE_STATE: ConnectorReleaseState = 'coming_soon';

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
