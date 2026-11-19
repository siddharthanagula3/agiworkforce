import type { InAppConnectorAuthorization } from '@/services/connectors';

export interface ConnectorAuthorizationNotice {
  title: string;
  body: string;
}

export function connectorAuthorizationNotice(
  name: string,
  outcome: InAppConnectorAuthorization,
): ConnectorAuthorizationNotice | null {
  switch (outcome) {
    case 'connected':
    case 'dismissed':
      return null;
    case 'denied':
      return {
        title: `${name} was not connected`,
        body: 'The authorization was declined. Nothing was connected.',
      };
    case 'invalid_state':
      return {
        title: `Could not connect ${name}`,
        body: 'The sign-in link expired before it finished. Nothing was connected. Start connecting again.',
      };
    case 'reauthorize':
      return {
        title: `${name} needs you to sign in again`,
        body: 'The provider asked for a fresh sign-in. Nothing was connected. Start connecting again.',
      };
    case 'unavailable':
      return {
        title: `${name} is unavailable`,
        body: 'The provider could not be reached. Nothing was connected. Try again later.',
      };
    case 'registration_rejected':
      return {
        title: `${name} refused this app`,
        body: `${name} did not accept the app registration, so it cannot be connected from here. Nothing was connected.`,
      };
    case 'failed':
      return {
        title: `Could not connect ${name}`,
        body: 'The authorization did not finish. Nothing was connected. Try again in a moment.',
      };
  }
}
