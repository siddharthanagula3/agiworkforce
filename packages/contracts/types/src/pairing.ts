import { isLoopbackHostname } from './url';

/**
 * Pairing Types
 *
 * The codes, status and relay URL rules shared by the desktop and mobile
 * clients when they pair.
 *
 * @module pairing
 * @packageDocumentation
 */

export type PairingStatus =
  'generating' | 'waiting' | 'connecting' | 'paired' | 'expired' | 'failed' | 'disconnected';

/**
 * The name mobile gives the pairing page in its header and in the links that
 * open it. The page is reached from the coding screen, so an instruction that
 * tells someone where to start pairing names `MOBILE_CODE_SCREEN_LABEL` and
 * `MOBILE_ADD_DEVICE_LABEL` instead.
 */
export const MOBILE_REMOTE_SCREEN_LABEL = 'Remote';

/**
 * Where pairing starts on the phone: the coding screen in the side panel and
 * the control on it, in the words mobile shows. Mobile labels both from these
 * and every pairing instruction on the computer reads them, so an instruction
 * cannot keep naming a place the phone no longer has.
 */
export const MOBILE_CODE_SCREEN_LABEL = 'AGI Code';
export const MOBILE_ADD_DEVICE_LABEL = 'Add device';

/**
 * The two pairing codes the product issues, and the only place either one is
 * described.
 *
 * They are not interchangeable and they are not one system. A relay code pairs
 * a phone with a desktop through the signaling server; a bridge code pairs the
 * Chrome extension with the desktop over loopback, and it is read off the
 * screen and retyped, which is why its alphabet drops the characters a person
 * confuses (I, L, O, 0, 1).
 *
 * Each validator states exactly what its generator mints, no wider. The six
 * hand-written copies this replaced disagreed: one accepted 8 to 32 characters
 * for a code the relay always makes 12 of, another 6 to 12 for a code the
 * desktop always makes 8 of. A check looser than the generator admits codes
 * that cannot exist and tells the user "invalid" one round trip later than it
 * could.
 */
export const PAIRING_CODE_LENGTH = 12;

export const RELAY_PAIRING_CODE_PATTERN = new RegExp(`^[A-Z0-9]{${PAIRING_CODE_LENGTH}}$`);

/** Mirrors PAIR_CODE_ALPHABET in apps/desktop/src-tauri/src/integrations/realtime. */
export const BRIDGE_PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BRIDGE_PAIRING_CODE_LENGTH = 8;

export const BRIDGE_PAIRING_CODE_PATTERN = new RegExp(
  `^[${BRIDGE_PAIRING_CODE_ALPHABET}]{${BRIDGE_PAIRING_CODE_LENGTH}}$`,
);

/**
 * What a person typed, reduced to what a code is: separators dropped, case
 * folded up. Validators are strict, so anything a human touched is normalized
 * first and anything a machine passed on is not.
 */
export function normalizePairingCode(raw: string): string {
  return (raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isRelayPairingCode(value: string): boolean {
  return typeof value === 'string' && RELAY_PAIRING_CODE_PATTERN.test(value);
}

export function isBridgePairingCode(value: string): boolean {
  return typeof value === 'string' && BRIDGE_PAIRING_CODE_PATTERN.test(value);
}

function isSecureRelayAddress(
  value: unknown,
  secureProtocol: string,
  localProtocol: string,
  allowInsecureLoopback: boolean,
): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2_048 ||
    /[\s\\]/u.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.hash ||
      value.includes('#') ||
      /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/iu.test(value)
    )
      return false;
    return (
      url.protocol === secureProtocol ||
      (allowInsecureLoopback && url.protocol === localProtocol && isLoopbackHostname(url.hostname))
    );
  } catch {
    return false;
  }
}

export function isSecureRelayUrl(value: unknown, allowInsecureLoopback = false): value is string {
  return isSecureRelayAddress(value, 'wss:', 'ws:', allowInsecureLoopback);
}

export function isSecureRelayHttpUrl(
  value: unknown,
  allowInsecureLoopback = false,
): value is string {
  return (
    isSecureRelayAddress(value, 'https:', 'http:', allowInsecureLoopback) && !value.includes('?')
  );
}
