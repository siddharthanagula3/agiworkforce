const ACCOUNT_REFUSAL_CODES: ReadonlySet<string> = new Set([
  'ACCOUNT_UNAVAILABLE',
  'PASSKEY_REQUIRED',
]);

export interface AccountRefusal {
  code: string;
  message: string;
}

export async function readAccountRefusal(response: Response): Promise<AccountRefusal | undefined> {
  if (response.status !== 403) return undefined;
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const error = body?.error as { code?: unknown; message?: unknown } | undefined;
  if (typeof error?.code !== 'string' || typeof error.message !== 'string') return undefined;
  const code = error.code.toUpperCase();
  const message = error.message.trim();
  return ACCOUNT_REFUSAL_CODES.has(code) && message !== '' ? { code, message } : undefined;
}

export function accountRefusalMessage(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (typeof candidate?.code !== 'string' || typeof candidate.message !== 'string')
    return undefined;
  return ACCOUNT_REFUSAL_CODES.has(candidate.code.toUpperCase()) && candidate.message.trim() !== ''
    ? candidate.message.trim()
    : undefined;
}
