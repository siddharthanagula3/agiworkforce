import { isRelayPairingCode } from '@agiworkforce/types';

export const REMOTE_COMPUTER_PATH = '/code/computer';

const PAYLOAD_PREFIX = 'agiw3:';
const SECRET_PATTERN = /^[0-9a-f]{64}$/i;

export interface BrowserPairing {
  code: string;
  secret: string;
}

export function readBrowserPairing(raw: string): BrowserPairing | null {
  const trimmed = raw.trim();
  const hashAt = trimmed.indexOf('#');
  const payload = hashAt === -1 ? trimmed : decodeURIComponent(trimmed.slice(hashAt + 1));
  if (!payload.startsWith(PAYLOAD_PREFIX)) return null;
  const fields = payload.slice(PAYLOAD_PREFIX.length).split(':');
  const [code = '', secret = ''] = fields;
  const normalized = code.replace(/[ -]/g, '').toUpperCase();
  if (fields.length !== 2 || !SECRET_PATTERN.test(secret) || !isRelayPairingCode(normalized)) {
    return null;
  }
  return { code: normalized, secret: secret.toLowerCase() };
}

export function browserPairingLink(origin: string, qrPayload: string): string {
  return `${origin}${REMOTE_COMPUTER_PATH}#${qrPayload}`;
}
