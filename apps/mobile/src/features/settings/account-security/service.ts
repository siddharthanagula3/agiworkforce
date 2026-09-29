import { api } from '@/services/api';
import {
  fetchAccountSettings,
  fetchPreferenceNamespace,
  saveAccountSettings,
  savePreferenceNamespace,
} from '@/services/preferences';

export const WEB_SECURITY_URL = 'https://agiworkforce.com/settings/security';

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
  backupCodesReady: boolean;
  enrollmentAvailable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAccountSecurityStatus(value: unknown): AccountSecurityStatus {
  if (!isRecord(value) || typeof value['enabled'] !== 'boolean') {
    throw new Error('Account security returned an invalid response.');
  }
  return {
    twoFactorEnabled: value['enabled'],
    backupCodesReady: value['backup_codes_ready'] === true,
    enrollmentAvailable: value['enrollment_available'] === true,
  };
}

export async function fetchWorkspaceMfaRequirement(signal?: AbortSignal): Promise<boolean> {
  const response = await api.get<{ required?: unknown }>('/api/settings/2fa/requirement', {
    signal,
  });
  return response?.required === true;
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

export async function revokeAllAccountSessions(headers: Record<string, string>): Promise<void> {
  await api.delete('/api/settings/sessions', { headers });
}

export interface PasswordChange {
  currentPassword: string | null;
  newPassword: string;
}

export async function changeAccountPassword(
  change: PasswordChange,
  headers: Record<string, string>,
): Promise<void> {
  await api.post(
    '/api/settings/password',
    {
      newPassword: change.newPassword,
      ...(change.currentPassword === null ? {} : { currentPassword: change.currentPassword }),
    },
    { headers },
  );
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

const LOCKDOWN_PREFERENCE_NAMESPACE = 'lockdown';

export async function fetchLockdownMode(): Promise<boolean> {
  const settings = await fetchPreferenceNamespace(LOCKDOWN_PREFERENCE_NAMESPACE);
  return (settings as { enabled?: unknown }).enabled === true;
}

export async function saveLockdownMode(enabled: boolean): Promise<void> {
  await savePreferenceNamespace(LOCKDOWN_PREFERENCE_NAMESPACE, { enabled });
}

export interface SignInIdentity {
  id: string;
  provider: string;
  lastAuthenticatedAt: string | null;
}

export interface SignInKey {
  id: string;
  name: string;
  kind: 'passkey' | 'security_key';
}

export interface SignInMethods {
  identities: SignInIdentity[];
  keys: SignInKey[];
}

function readIdentities(value: unknown): SignInIdentity[] {
  const identities = (value as { identities?: unknown } | null)?.identities;
  if (!Array.isArray(identities)) return [];
  return identities.flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    return typeof row['id'] === 'string' && typeof row['provider'] === 'string'
      ? [
          {
            id: row['id'],
            provider: row['provider'],
            lastAuthenticatedAt:
              typeof row['lastAuthenticatedAt'] === 'string' ? row['lastAuthenticatedAt'] : null,
          },
        ]
      : [];
  });
}

function readKeys(value: unknown): SignInKey[] {
  const credentials = (value as { credentials?: unknown } | null)?.credentials;
  if (!Array.isArray(credentials)) return [];
  return credentials.flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    const kind = row['kind'];
    return typeof row['id'] === 'string' &&
      typeof row['name'] === 'string' &&
      (kind === 'passkey' || kind === 'security_key')
      ? [{ id: row['id'], name: row['name'], kind }]
      : [];
  });
}

export async function fetchSignInMethods(signal?: AbortSignal): Promise<SignInMethods> {
  const [identities, security] = await Promise.all([
    api.get<unknown>('/api/settings/identities', { signal }),
    api.get<unknown>('/api/account-security', { signal }).catch(() => null),
  ]);
  return { identities: readIdentities(identities), keys: readKeys(security) };
}

function readBackupCodes(value: unknown): string[] {
  const codes = isRecord(value) ? value['backup_codes'] : null;
  if (!Array.isArray(codes) || !codes.every((code) => typeof code === 'string')) {
    throw new Error('Account security returned no backup codes.');
  }
  return codes;
}

export async function startAuthenticatorSetup(
  headers: Record<string, string>,
): Promise<{ secret: string; otpauthUrl: string }> {
  const response = await api.post<unknown>('/api/settings/2fa/setup', {}, { headers });
  const secret = isRecord(response) ? response['secret'] : null;
  const otpauthUrl = isRecord(response) ? response['otpauth_url'] : null;
  if (typeof secret !== 'string' || typeof otpauthUrl !== 'string') {
    throw new Error('Account security returned an invalid setup key.');
  }
  return { secret, otpauthUrl };
}

export async function verifyAuthenticatorCode(code: string): Promise<string[]> {
  return readBackupCodes(await api.post<unknown>('/api/settings/2fa/verify', { code }));
}

export async function regenerateBackupCodes(headers: Record<string, string>): Promise<string[]> {
  return readBackupCodes(
    await api.post<unknown>('/api/settings/2fa/backup-codes', {}, { headers }),
  );
}

export async function turnOffTwoFactor(headers: Record<string, string>): Promise<void> {
  await api.delete('/api/settings/2fa', { headers });
}
