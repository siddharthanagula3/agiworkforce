import { z } from 'zod';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import { getCsrfToken } from '@/lib/client/csrf';
import { generateOTPAuthURL, TOTP_CONFIG, type TwoFactorStatus } from './user-preferences';

export type TwoFactorAction = 'setup' | 'verify' | 'disable' | 'regenerate';
const codes = z
  .array(
    z
      .string()
      .length(TOTP_CONFIG.BACKUP_CODE_LENGTH)
      .refine((value) =>
        [...value].every((character) => TOTP_CONFIG.BACKUP_CODE_ALPHABET.includes(character)),
      ),
  )
  .length(TOTP_CONFIG.BACKUP_CODE_COUNT);
const secret = z
  .string()
  .length(Math.ceil((TOTP_CONFIG.SECRET_LENGTH * 8) / 5))
  .refine((value) =>
    [...value].every((character) => TOTP_CONFIG.SECRET_ALPHABET.includes(character)),
  );
const setup = z.object({ secret, otpauth_url: z.string() }).refine((value) => {
  try {
    const url = new URL(value.otpauth_url);
    const label = decodeURIComponent(url.pathname.slice(1));
    const prefix = `${TOTP_CONFIG.ISSUER}:`;
    if (!label.startsWith(prefix)) return false;
    const account = label.slice(prefix.length);
    return account.length > 0 && value.otpauth_url === generateOTPAuthURL(value.secret, account);
  } catch {
    return false;
  }
});
const status = z.object({
  enabled: z.boolean(),
  backup_codes_ready: z.boolean(),
  enrollment_available: z.boolean(),
});
export type TwoFactorReceipt =
  { secret: string; otpauth_url: string } | { backup_codes: string[] } | { success: true };

export function parseTwoFactorStatus(body: unknown): TwoFactorStatus {
  const value = status.parse(body);
  return {
    enabled: value.enabled,
    backupCodesReady: value.backup_codes_ready,
    enrollmentAvailable: value.enrollment_available,
  };
}

export async function readTwoFactorStatus(request: RequestAuthority): Promise<TwoFactorStatus> {
  const response = await request.fetch('/api/settings/2fa', { cache: 'no-store' });
  request.assertCurrent();
  if (!response.ok) throw new Error('Your two-factor status could not be loaded.');
  const body: unknown = await response.json();
  request.assertCurrent();
  return parseTwoFactorStatus(body);
}

export async function sendTwoFactorMutation(
  request: RequestAuthority,
  action: TwoFactorAction,
  headers: Record<string, string> = {},
  code?: string,
): Promise<Response> {
  request.assertCurrent();
  const csrf = await getCsrfToken();
  request.assertCurrent();
  const suffix =
    action === 'disable' ? '' : action === 'regenerate' ? '/backup-codes' : `/${action}`;
  return request.fetch(`/api/settings/2fa${suffix}`, {
    method: action === 'disable' ? 'DELETE' : 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    ...(action === 'verify' ? { body: JSON.stringify({ code }) } : {}),
  });
}

export async function readTwoFactorReceipt(
  request: RequestAuthority,
  response: Response,
  action: TwoFactorAction,
): Promise<TwoFactorReceipt> {
  request.assertCurrent();
  if (!response.ok)
    throw new Error('The complete two-factor change outcome could not be confirmed.');
  const body: unknown = await response.json();
  request.assertCurrent();
  if (action === 'setup') return setup.parse(body);
  if (action === 'disable') return z.object({ success: z.literal(true) }).parse(body);
  if (action === 'verify')
    return z.object({ success: z.literal(true), backup_codes: codes }).parse(body);
  return z.object({ backup_codes: codes }).parse(body);
}
