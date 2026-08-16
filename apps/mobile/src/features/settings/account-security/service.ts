import { api } from '@/services/api';
import { fetchAccountSettings, saveAccountSettings } from '@/services/preferences';

export const SESSION_TIMEOUT_MINUTES = [15, 30, 60, 120, 480] as const;
export type SessionTimeoutMinutes = (typeof SESSION_TIMEOUT_MINUTES)[number];

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

export async function fetchSessionTimeout(): Promise<SessionTimeoutMinutes> {
  const settings = await fetchAccountSettings();
  const stored = settings['session_timeout'];
  return isSessionTimeout(stored) ? stored : DEFAULT_SESSION_TIMEOUT;
}

export async function saveSessionTimeout(minutes: SessionTimeoutMinutes): Promise<void> {
  await saveAccountSettings({ session_timeout: minutes });
}

export interface AccountSessionRow {
  id: string;
  device: string;
  browser: string | null;
  location: string | null;
  lastActiveAt: string | null;
  isCurrent: boolean;
}

export interface AccountSessions {
  sessions: AccountSessionRow[];
  currentSessionKnown: boolean;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseAccountSessionRow(value: unknown): AccountSessionRow | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
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
    currentSessionKnown: isRecord(value) && value['currentSessionKnown'] === true,
  };
}

export async function fetchAccountSessions(signal?: AbortSignal): Promise<AccountSessions> {
  const response = await api.get<unknown>(
    '/api/settings/sessions',
    signal ? { signal } : undefined,
  );
  return parseAccountSessions(response);
}

export async function revokeAccountSession(sessionId: string): Promise<void> {
  await api.delete(`/api/settings/sessions/${encodeURIComponent(sessionId)}`);
}

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
