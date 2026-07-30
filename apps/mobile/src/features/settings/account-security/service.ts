import { api } from '@/services/api';

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
