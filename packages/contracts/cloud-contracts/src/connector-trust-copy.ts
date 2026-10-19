import type { ConnectorCallHealth } from './connectors';

export interface ConnectorConsentPoint {
  title: string;
  body: string;
}

export const CONNECTOR_CONSENT_POINTS: readonly ConnectorConsentPoint[] = [
  {
    title: 'Tools AGI does not recognise ask before they act',
    body: 'A connector tool AGI does not recognise waits for your approval on every call until you set it to Allow. A tool AGI knows only reads data, such as a pull-request diff, follows your Tool approvals default, which runs it without asking unless you change it.',
  },
  {
    title: 'A Block is absolute',
    body: 'Blocking a tool is enforced on the server before it runs. A modified client or a direct API call cannot get past it.',
  },
  {
    title: 'Connecting is not the same as granting scopes',
    body: 'Where a provider sign-in is involved, the provider’s own consent screen is what states the permissions being granted. Read it there.',
  },
  {
    title: 'Its tools see the context you send them',
    body: 'A connector receives the conversation content passed to its tools. Only connect services you would hand that content to.',
  },
  {
    title: 'What it fetches stays with the chat',
    body: 'Anything a connector returns is kept as part of the chat it was used in and follows that chat’s retention, so deleting the chat deletes it. Disconnecting stops new fetches but does not remove what past chats already hold.',
  },
  {
    title: 'You can disconnect at any time',
    body: 'Disconnecting removes the connection and deletes every saved per-tool permission for it, so a past “Always allow” does not survive.',
  },
];

export const CONNECTOR_HEALTH_EXPLANATION =
  'Measured from this account’s own recent calls: how many ran, how many failed, and how long the provider took. A connector whose last calls all failed is paused with a backoff before it is called again.';

export const CONNECTOR_HEALTH_STATE_LABELS: Readonly<Record<ConnectorCallHealth['state'], string>> =
  {
    responding: 'Responding',
    degraded: 'Degraded',
    'not-responding': 'Not responding',
    unknown: 'Not called yet',
  };

const MS_PER_SECOND = 1000;

export function formatConnectorLatency(ms: number | null): string {
  if (ms === null) return 'no timing';
  return ms < MS_PER_SECOND ? `${Math.round(ms)} ms` : `${(ms / MS_PER_SECOND).toFixed(1)} s`;
}

export function connectorHealthCircuitSentence(entry: ConnectorCallHealth): string | null {
  if (entry.circuit === 'open') {
    const wait = Math.max(1, Math.ceil(entry.retryAfterMs / MS_PER_SECOND));
    return `Paused after ${entry.consecutiveFailures} failures in a row. The next call is allowed in ${wait}s.`;
  }
  if (entry.circuit === 'half-open') {
    return `Paused after ${entry.consecutiveFailures} failures in a row. The next call is a trial: one success closes the pause.`;
  }
  return null;
}

export function connectorHealthSummary(entry: ConnectorCallHealth): string {
  if (entry.calls === 0) return 'No calls in the last hour.';
  return `${entry.calls} ${entry.calls === 1 ? 'call' : 'calls'}, ${entry.failures} failed, typically ${formatConnectorLatency(entry.p50LatencyMs)}`;
}
