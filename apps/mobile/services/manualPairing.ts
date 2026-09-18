import { isRelayPairingCode, PAIRING_CODE_LENGTH } from '@agiworkforce/types';
import { API_URL, WS_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/services/authSession';
import { secureFetch } from '@/services/secureFetch';

const PAIR_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const HEX_64_PATTERN = /^[a-fA-F0-9]{64}$/;

/**
 * Scheme of a payload that carries the out-of-band pairing secret.
 *
 * The version lives in the scheme, not inside a field, because it has to be
 * unforgeable by the signaling relay: the relay picks the pair token an older
 * Desktop prints in its `agiw:` QR, so any marker inside those 64 hex chars
 * could be chosen by the relay to make a v2 QR look like a v3 one and get its
 * own key material accepted as the secret. Only Desktop decides which scheme
 * it renders, so an `agiw:` payload can never be mistaken for an `agiw3:` one.
 */
const SECRET_PAYLOAD_PREFIX = 'agiw3:';

const LEGACY_PAYLOAD_PREFIX = 'agiw:';

export const PAIRING_UPDATE_REQUIRED_MESSAGE =
  'This QR code was made by an older Desktop version. Update AGI Workforce on Desktop, generate a new code, and scan it again.';

export const PAIRING_SECRET_REQUIRED_MESSAGE = `The ${PAIRING_CODE_LENGTH}-character code alone can no longer secure this connection. Scan the QR code on Desktop, or use Copy pairing link and paste it here.`;

export interface ParsedPairingPayload {
  code: string;
  pairingSecret: string | null;
  legacyPayload: boolean;
}

export interface ManualPairingClaim {
  code: string;
  pairToken: string;
  expiresAt: number;
  wsUrl: string;
}

function stripCodeSeparators(code: string): string {
  return code.replace(/[ -]/g, '');
}

/**
 * Canonicalize a scanned or pasted payload for the pairing-code validator in
 * `services/companion.ts`, which the QR scanner gates every camera read and
 * every manual submit on. That validator only understands `agiw:<code>` and
 * `agiw:<code>:<64 hex>`, so the `agiw3:` scheme is folded down to the shape it
 * recognises, otherwise the scanner would silently ignore Desktop's own QR.
 * Only `parsePairingPayload` reads the version, and it reads the raw input.
 */
export function normalizePairingInput(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith(SECRET_PAYLOAD_PREFIX)) {
    const [code = '', ...rest] = trimmed.slice(SECRET_PAYLOAD_PREFIX.length).split(':');
    const normalizedCode = stripCodeSeparators(code);
    return rest.length > 0
      ? `${LEGACY_PAYLOAD_PREFIX}${normalizedCode}:${rest.join(':')}`
      : `${LEGACY_PAYLOAD_PREFIX}${normalizedCode}`;
  }

  if (!trimmed.startsWith(LEGACY_PAYLOAD_PREFIX)) {
    return stripCodeSeparators(trimmed);
  }

  const [code = '', token, ...extra] = trimmed.slice(LEGACY_PAYLOAD_PREFIX.length).split(':');
  const normalizedCode = stripCodeSeparators(code);
  return `${LEGACY_PAYLOAD_PREFIX}${normalizedCode}${token !== undefined ? `:${token}` : ''}${
    extra.length > 0 ? `:${extra.join(':')}` : ''
  }`;
}

/**
 * Parse a scanned or pasted pairing payload.
 *
 * The current payload is `agiw3:<code>:<secretHex>`. `secretHex` is the
 * out-of-band key material the signaling relay never sees; without it the
 * dispatch HMAC key would be derivable by the relay. No pair token is returned
 * from any payload shape: the phone claims its own from the relay, so a token
 * printed by an older Desktop can never be replayed out of a scanned code.
 *
 * `agiw:<code>` and `agiw:<code>:<pairToken>` are payloads from a Desktop build
 * that predates the secret, so they are flagged `legacyPayload` and the caller
 * refuses them with an update prompt instead of keying off relay-visible data.
 */
export function parsePairingPayload(raw: string): ParsedPairingPayload {
  const trimmed = raw.trim();

  if (trimmed.startsWith(SECRET_PAYLOAD_PREFIX)) {
    const fields = trimmed.slice(SECRET_PAYLOAD_PREFIX.length).split(':');
    const [code = '', secret = ''] = fields;
    const wellFormed = fields.length === 2 && HEX_64_PATTERN.test(secret);
    return {
      code: stripCodeSeparators(code).toUpperCase(),
      pairingSecret: wellFormed ? secret.toLowerCase() : null,
      legacyPayload: false,
    };
  }

  if (!trimmed.startsWith(LEGACY_PAYLOAD_PREFIX)) {
    return {
      code: stripCodeSeparators(trimmed).toUpperCase(),
      pairingSecret: null,
      legacyPayload: false,
    };
  }

  const [code = ''] = trimmed.slice(LEGACY_PAYLOAD_PREFIX.length).split(':');
  return {
    code: stripCodeSeparators(code).toUpperCase(),
    pairingSecret: null,
    legacyPayload: true,
  };
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
  if (!isRelayPairingCode(code)) {
    throw new Error(`Enter the ${PAIRING_CODE_LENGTH}-character pairing code shown on Desktop.`);
  }

  // The relay mints a pair token for whoever asks, and it cannot tell one
  // account from another, so the claim goes through the gateway that already
  // knows who is signed in here.
  const response = await secureFetch(`${API_URL}/api/pair/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(await getAuthHeaders()),
    },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('That pairing code is invalid or expired. Generate a new code on Desktop.');
    }
    if (response.status === 409) {
      throw new Error('That pairing code is already connected to a phone.');
    }
    if (response.status === 403) {
      throw new Error(
        'That pairing code belongs to a different account. Sign in as that account on Desktop, or generate a code here.',
      );
    }
    if (response.status === 401) {
      throw new Error('Sign in on this phone before pairing it with Desktop.');
    }
    throw new Error('Manual pairing is temporarily unavailable. Please try again.');
  }

  return parseClaimResponse(await response.json(), code);
}
