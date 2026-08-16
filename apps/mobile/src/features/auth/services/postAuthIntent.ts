
export const POST_AUTH_INTENT_PARAM = 'postAuthIntent' as const;
export const CLOUD_CHAT_POST_AUTH_INTENT = 'cloud-chat' as const;

export type PostAuthIntent = typeof CLOUD_CHAT_POST_AUTH_INTENT;

let pendingPostAuthIntent: PostAuthIntent | null = null;

export function parsePostAuthIntent(value: unknown): PostAuthIntent | null {
  return value === CLOUD_CHAT_POST_AUTH_INTENT ? CLOUD_CHAT_POST_AUTH_INTENT : null;
}

export function stagePostAuthIntent(value: unknown): PostAuthIntent | null {
  pendingPostAuthIntent = parsePostAuthIntent(value);
  return pendingPostAuthIntent;
}

export function beginCloudPostAuthIntent() {
  stagePostAuthIntent(CLOUD_CHAT_POST_AUTH_INTENT);
  return {
    pathname: '/(auth)/login' as const,
    params: { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT },
  };
}

export function consumePostAuthIntent(): PostAuthIntent | null {
  const intent = pendingPostAuthIntent;
  pendingPostAuthIntent = null;
  return intent;
}

export function clearPostAuthIntent(): boolean {
  const hadPendingIntent = pendingPostAuthIntent !== null;
  pendingPostAuthIntent = null;
  return hadPendingIntent;
}

export function peekPostAuthIntent(): PostAuthIntent | null {
  return pendingPostAuthIntent;
}
