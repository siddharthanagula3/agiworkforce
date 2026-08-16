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

export function managedCloudOwnerKey(owner: ManagedCloudOwner): string {
  return JSON.stringify([owner.accountId, owner.authIncarnation]);
}

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

export function isCurrentManagedCloudOperation<T extends object>(
  registered: T | undefined,
  operation: T,
): boolean {
  return registered === operation;
}

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
