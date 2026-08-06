/**
 * Non-secret identity for one authenticated Managed Cloud incarnation.
 *
 * `accountId` prevents data from crossing users. `authIncarnation` prevents a
 * durable run or delayed callback from surviving sign-out/sign-in even when
 * the same account signs back in. Neither field contains a bearer token.
 */
export interface ManagedCloudOwner {
  accountId: string;
  authIncarnation: string;
}

export interface ManagedCloudCredential {
  owner: ManagedCloudOwner;
  token: string;
}

const MAX_OWNER_COMPONENT_CHARS = 200;

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function normalizeComponent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_OWNER_COMPONENT_CHARS ||
    containsControlCharacter(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

/** Runtime-validate identity crossing storage or extension-message boundaries. */
export function normalizeManagedCloudOwner(value: unknown): ManagedCloudOwner | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const accountId = normalizeComponent(record['accountId']);
  const authIncarnation = normalizeComponent(record['authIncarnation']);
  if (!accountId || !authIncarnation) return null;
  return { accountId, authIncarnation };
}

function decodeBase64UrlSegment(segment: string): string | null {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  if (padding === 3) return null;
  try {
    return atob(base64 + '='.repeat(padding));
  } catch {
    return null;
  }
}

/**
 * Derive owner identity from a Clerk session JWT's own claims.
 *
 * The MV3 background Clerk client loads with `standardBrowser: false` and does
 * not reliably hydrate `clerk.user` / `session.user`, so reading identity off
 * the resource objects alone can leave a perfectly valid, token-bearing session
 * "unowned" and lock the side panel out of Managed Cloud entirely. The bearer
 * always carries `sub` (account) and `sid` (session incarnation), which is the
 * same pair the server authenticates, so the claims are the correct fallback.
 *
 * The signature is deliberately NOT verified here: this token was just minted
 * by our own Clerk client inside our own extension, and the derived value is
 * only ever used to partition local state. Every authority decision that
 * matters still happens server-side against the full token.
 */
export function managedCloudOwnerFromSessionToken(token: unknown): ManagedCloudOwner | null {
  if (typeof token !== 'string') return null;
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const payload = segments[1];
  if (!payload) return null;

  const decoded = decodeBase64UrlSegment(payload);
  if (decoded === null) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;

  const record = claims as Record<string, unknown>;
  return normalizeManagedCloudOwner({
    accountId: record['sub'],
    authIncarnation: record['sid'],
  });
}

export function sameManagedCloudOwner(
  left: ManagedCloudOwner | null | undefined,
  right: ManagedCloudOwner | null | undefined,
): boolean {
  return (
    left != null &&
    right != null &&
    left.accountId === right.accountId &&
    left.authIncarnation === right.authIncarnation
  );
}

/**
 * Exact credential equality for compare-and-clear auth transitions.
 *
 * Owner equality alone is insufficient: Clerk may rotate a bearer while the
 * same account/session remains current. A delayed 401 for the retired bearer
 * must not sign out that still-valid session.
 */
export function sameManagedCloudCredential(
  left: ManagedCloudCredential | null | undefined,
  right: ManagedCloudCredential | null | undefined,
): boolean {
  return (
    left != null &&
    right != null &&
    left.token === right.token &&
    sameManagedCloudOwner(left.owner, right.owner)
  );
}

/** Stable, non-secret comparison key for in-memory maps only. */
export function managedCloudOwnerKey(owner: ManagedCloudOwner): string {
  return JSON.stringify([owner.accountId, owner.authIncarnation]);
}

/**
 * Choose a cancellation credential without ever substituting another account's
 * ambient session for an admitted run's captured credential.
 */
export function selectManagedCloudCancellationCredential(
  expectedOwner: ManagedCloudOwner,
  activeCredential: ManagedCloudCredential | null | undefined,
  currentCredential: ManagedCloudCredential | null | undefined,
): ManagedCloudCredential | null {
  if (activeCredential) {
    return sameManagedCloudOwner(activeCredential.owner, expectedOwner) ? activeCredential : null;
  }
  return currentCredential && sameManagedCloudOwner(currentCredential.owner, expectedOwner)
    ? currentCredential
    : null;
}

/** Identity check used before publishing any delayed operation callback. */
export function isCurrentManagedCloudOperation<T extends object>(
  registered: T | undefined,
  operation: T,
): boolean {
  return registered === operation;
}

/** Renderer gate for delayed stream broadcasts after account/session changes. */
export function isManagedCloudBroadcastOwnedBy(
  currentOwner: ManagedCloudOwner | null | undefined,
  admittedOwner: ManagedCloudOwner | null | undefined,
  broadcastOwner: ManagedCloudOwner | null | undefined,
): boolean {
  return (
    sameManagedCloudOwner(currentOwner, broadcastOwner) &&
    sameManagedCloudOwner(admittedOwner, broadcastOwner)
  );
}
