import { WS_URL } from '@/lib/constants';
import { secureFetch } from '@/services/secureFetch';

const CURRENT_PAIRING_CODE_PATTERN = /^[A-Z0-9]{12}$/;
const PAIR_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export interface ManualPairingClaim {
  code: string;
  pairToken: string;
  expiresAt: number;
  wsUrl: string;
}

export function normalizePairingInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('agiw:')) {
    return trimmed.replace(/[ -]/g, '');
  }

  const [code = '', token, ...extra] = trimmed.slice(5).split(':');
  const normalizedCode = code.replace(/[ -]/g, '');
  return `agiw:${normalizedCode}${token !== undefined ? `:${token}` : ''}${
    extra.length > 0 ? `:${extra.join(':')}` : ''
  }`;
}

export function signalingHttpBaseUrl(wsUrl: string = WS_URL): string {
  const parsed = new URL(wsUrl);
  if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
  else if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
  else throw new Error('Companion signaling URL must use ws:// or wss://');
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/ws\/?$/, '').replace(/\/+$/, '');
  return parsed.toString().replace(/\/+$/, '');
}

function parseClaimResponse(value: unknown, expectedCode: string): ManualPairingClaim {
  if (!value || typeof value !== 'object') {
    throw new Error('The pairing service returned an invalid response.');
  }
  const record = value as Record<string, unknown>;
  const code = typeof record['code'] === 'string' ? record['code'] : '';
  const pairToken =
    typeof record['pairToken'] === 'string' ? record['pairToken'].toLowerCase() : '';
  const expiresAt = typeof record['expiresAt'] === 'number' ? record['expiresAt'] : Number.NaN;
  const wsUrl = typeof record['wsUrl'] === 'string' ? record['wsUrl'] : '';

  if (
    code !== expectedCode ||
    !PAIR_TOKEN_PATTERN.test(pairToken) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    !/^wss?:\/\//.test(wsUrl)
  ) {
    throw new Error('The pairing service returned an invalid response.');
  }
  return { code, pairToken, expiresAt, wsUrl };
}

export async function claimManualPairingToken(rawCode: string): Promise<ManualPairingClaim> {
  const code = normalizePairingInput(rawCode).toUpperCase();
  if (!CURRENT_PAIRING_CODE_PATTERN.test(code)) {
    throw new Error('Enter the 12-character pairing code shown on Desktop.');
  }

  const response = await secureFetch(
    `${signalingHttpBaseUrl()}/pairings/${encodeURIComponent(code)}/claim`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mobile' }),
    },
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('That pairing code is invalid or expired. Generate a new code on Desktop.');
    }
    if (response.status === 409) {
      throw new Error('That pairing code is already connected to a phone.');
    }
    throw new Error('Manual pairing is temporarily unavailable. Please try again.');
  }

  return parseClaimResponse(await response.json(), code);
}
