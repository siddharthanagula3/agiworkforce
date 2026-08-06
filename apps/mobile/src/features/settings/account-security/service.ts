import { api } from '@/services/api';
import { fetchAccountSettings, saveAccountSettings } from '@/services/preferences';

/** Same option set the web security section offers. */
export const SESSION_TIMEOUT_MINUTES = [15, 30, 60, 120, 480] as const;
export type SessionTimeoutMinutes = (typeof SESSION_TIMEOUT_MINUTES)[number];

/** Web's default when the account has never been told otherwise. */
export const DEFAULT_SESSION_TIMEOUT: SessionTimeoutMinutes = 60;

export interface AuditLogEntry {
  id: string;
  action: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface GroupedAuditEntry {
  id: string;
  action: string;
  createdAt: string;
  repeats: number;
}

/**
 * Collapse consecutive repeats of the same action.
 *
 * A retry burst against one rate-limited endpoint can fill the entire page
 * with identical rows — the live account returned twenty "Rate limit exceeded"
 * entries, six inside the same second — burying the sign-ins and account
 * changes this section exists to show. Nothing is dropped: the count is
 * displayed, and a different action always starts a new row.
 */
export function groupAuditEntries(entries: AuditLogEntry[]): GroupedAuditEntry[] {
  return entries.reduce<GroupedAuditEntry[]>((grouped, entry) => {
    const previous = grouped[grouped.length - 1];
    if (previous && previous.action === entry.action) {
      previous.repeats += 1;
      return grouped;
    }
    grouped.push({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt,
      repeats: 1,
    });
    return grouped;
  }, []);
}

export interface AccountSecurityStatus {
  twoFactorEnabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAccountSecurityStatus(value: unknown): AccountSecurityStatus {
  if (!isRecord(value) || typeof value['enabled'] !== 'boolean') {
    throw new Error('Account security returned an invalid response.');
  }

  const backupCodesRemaining = value['backup_codes_remaining'];
  if (
    typeof backupCodesRemaining !== 'number' ||
    !Number.isInteger(backupCodesRemaining) ||
    backupCodesRemaining < 0
  ) {
    throw new Error('Account security returned an invalid response.');
  }

  const rawEnabledAt = value['enabled_at'];
  const enabledAt =
    rawEnabledAt === undefined || rawEnabledAt === null
      ? null
      : typeof rawEnabledAt === 'string' && Number.isFinite(Date.parse(rawEnabledAt))
        ? rawEnabledAt
        : undefined;

  if (enabledAt === undefined) {
    throw new Error('Account security returned an invalid response.');
  }

  return {
    twoFactorEnabled: value['enabled'],
    enabledAt,
    backupCodesRemaining,
  };
}

export async function fetchAccountSecurityStatus(
  signal?: AbortSignal,
): Promise<AccountSecurityStatus> {
  const response = await api.get<unknown>('/api/settings/2fa', { signal });
  return parseAccountSecurityStatus(response);
}

function isSessionTimeout(value: unknown): value is SessionTimeoutMinutes {
  return SESSION_TIMEOUT_MINUTES.includes(value as SessionTimeoutMinutes);
}

/**
 * Session timeout lives in the account's un-namespaced settings document —
 * the same key and the same endpoint the web security section writes.
 */
export async function fetchSessionTimeout(): Promise<SessionTimeoutMinutes> {
  const settings = await fetchAccountSettings();
  const stored = settings['session_timeout'];
  return isSessionTimeout(stored) ? stored : DEFAULT_SESSION_TIMEOUT;
}

export async function saveSessionTimeout(minutes: SessionTimeoutMinutes): Promise<void> {
  await saveAccountSettings({ session_timeout: minutes });
}

/** One active account session, mirroring `serializeSession` in the web route. */
export interface AccountSessionRow {
  id: string;
  device: string;
  browser: string | null;
  location: string | null;
  lastActiveAt: string | null;
  /** True only when the server matched this row to THIS app's Clerk session. */
  isCurrent: boolean;
}

export interface AccountSessions {
  sessions: AccountSessionRow[];
  /**
   * Whether the server could identify the caller's own row. Mobile sends a Clerk
   * session JWT, so this is normally true; false means "no row is known to be
   * this device", never "this device is missing from the list".
   */
  currentSessionKnown: boolean;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseAccountSessionRow(value: unknown): AccountSessionRow | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  // A row with no id cannot be revoked, so it must not be offered as a device.
  if (typeof id !== 'string' || !id) return null;
  const device = value['device'];
  return {
    id,
    device: typeof device === 'string' && device ? device : 'Unknown device',
    browser: optionalString(value['browser']),
    location: optionalString(value['location']),
    lastActiveAt: optionalString(value['lastActiveAt']),
    isCurrent: value['isCurrent'] === true,
  };
}

export function parseAccountSessions(value: unknown): AccountSessions {
  const rows = isRecord(value) ? value['sessions'] : null;
  if (!Array.isArray(rows)) {
    throw new Error('Account sessions returned an invalid response.');
  }
  return {
    sessions: rows
      .map(parseAccountSessionRow)
      .filter((row): row is AccountSessionRow => row !== null),
    // Anything but an explicit true means "we could not tell", which the UI has
    // to say out loud rather than marking an arbitrary row as this device.
    currentSessionKnown: isRecord(value) && value['currentSessionKnown'] === true,
  };
}

/**
 * The account's active sessions across every surface.
 *
 * This is a real server read, not a guess made from the local Clerk session:
 * `apps/web/app/api/settings/sessions/route.ts` resolves the caller through
 * `getClerkAuthUser`, which accepts the same Clerk session JWT bearer this app
 * already sends on `/api/settings/2fa`, and marks the caller's own row from that
 * token's `sid` claim.
 */
export async function fetchAccountSessions(signal?: AbortSignal): Promise<AccountSessions> {
  const response = await api.get<unknown>(
    '/api/settings/sessions',
    signal ? { signal } : undefined,
  );
  return parseAccountSessions(response);
}

/**
 * End one other device's session. The server re-checks that the session belongs
 * to this account and 404s otherwise, so a stale id fails closed.
 */
export async function revokeAccountSession(sessionId: string): Promise<void> {
  await api.delete(`/api/settings/sessions/${encodeURIComponent(sessionId)}`);
}

/**
 * Recent security activity for this account. Web renders the same rows with
 * filtering and paging; mobile shows the most recent page, which is what the
 * "did anything happen to my account" question actually needs.
 */
export async function fetchAuditLog(limit = 20, signal?: AbortSignal): Promise<AuditLogEntry[]> {
  const response = await api.get<unknown>(
    `/api/settings/audit-logs?limit=${limit}`,
    signal ? { signal } : undefined,
  );
  if (!isRecord(response) || !Array.isArray(response['entries'])) return [];

  return response['entries'].flatMap((raw): AuditLogEntry[] => {
    if (!isRecord(raw)) return [];
    const id = raw['id'];
    const action = raw['action'];
    const createdAt = raw['createdAt'];
    // An entry with no id, action or timestamp cannot be rendered as activity;
    // drop it rather than showing "undefined" in a security log.
    if (typeof id !== 'string' || typeof action !== 'string' || typeof createdAt !== 'string') {
      return [];
    }
    return [
      {
        id,
        action,
        ipAddress: typeof raw['ipAddress'] === 'string' ? raw['ipAddress'] : null,
        createdAt,
      },
    ];
  });
}
