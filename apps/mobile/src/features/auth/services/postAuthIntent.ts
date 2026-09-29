export const POST_AUTH_INTENT_PARAM = 'postAuthIntent' as const;
export const CLOUD_CHAT_POST_AUTH_INTENT = 'cloud-chat' as const;

const CLOUD_DESTINATIONS = {
  'cloud-chat': '/(app)',
  'cloud-schedules': '/(app)/schedules',
  'cloud-tasks': '/(app)/tasks',
  'cloud-models': '/(app)/models',
  'cloud-compare': '/(app)/compare',
  'cloud-skills': '/(app)/skills',
  'cloud-account': '/(app)/settings/cloud-account',
  'cloud-account-security': '/(app)/settings/account-security',
  'cloud-billing': '/(app)/settings/cloud-billing',
  'cloud-shared-links': '/(app)/settings/shared-links',
  'cloud-workspace': '/(app)/settings/workspace',
  'cloud-reflect': '/(app)/settings/reflect',
  'cloud-archived-chats': '/(app)/settings/archived-chats',
  'cloud-privacy': '/(app)/settings/cloud-privacy',
  'cloud-usage': '/(app)/settings/cloud-usage',
  'cloud-connectors': '/(app)/settings/cloud-connectors',
} as const;

export type PostAuthIntent = keyof typeof CLOUD_DESTINATIONS;
export type PostAuthDestination = (typeof CLOUD_DESTINATIONS)[PostAuthIntent];

let pendingPostAuthIntent: PostAuthIntent | null = null;
let pendingPostAuthDestination: PostAuthDestination | null = null;

export function parsePostAuthIntent(value: unknown): PostAuthIntent | null {
  return typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(CLOUD_DESTINATIONS, value)
    ? (value as PostAuthIntent)
    : null;
}

export function stagePostAuthIntent(value: unknown): PostAuthIntent | null {
  pendingPostAuthIntent = parsePostAuthIntent(value);
  return pendingPostAuthIntent;
}

export function beginCloudPostAuthIntent(intent: PostAuthIntent = CLOUD_CHAT_POST_AUTH_INTENT) {
  stagePostAuthIntent(intent);
  return {
    pathname: '/(auth)/login' as const,
    params: { [POST_AUTH_INTENT_PARAM]: intent },
  };
}

export function beginCloudPostAuthIntentForDestination(destination: PostAuthDestination) {
  const entry = Object.entries(CLOUD_DESTINATIONS).find(([, path]) => path === destination);
  if (!entry) throw new Error('Unsupported Cloud destination');
  return beginCloudPostAuthIntent(entry[0] as PostAuthIntent);
}

export function consumePostAuthIntent(): PostAuthIntent | null {
  const intent = pendingPostAuthIntent;
  pendingPostAuthIntent = null;
  return intent;
}

export function clearPostAuthIntent(): boolean {
  const hadPendingIntent = pendingPostAuthIntent !== null;
  pendingPostAuthIntent = null;
  pendingPostAuthDestination = null;
  return hadPendingIntent;
}

export function stagePostAuthDestination(intent: PostAuthIntent): void {
  pendingPostAuthDestination = CLOUD_DESTINATIONS[intent];
}

export function consumePostAuthDestination(): PostAuthDestination | null {
  const destination = pendingPostAuthDestination;
  pendingPostAuthDestination = null;
  return destination;
}

export function peekPostAuthIntent(): PostAuthIntent | null {
  return pendingPostAuthIntent;
}
