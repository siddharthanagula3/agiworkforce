export type PairingPhase =
  | 'idle'
  | 'requesting'
  | 'awaiting-code'
  | 'confirming'
  | 'paired'
  | 'error';

export interface PairingState {
  phase: PairingPhase;
  fingerprint: string | null;
  error: string | null;
  requestId: string | null;
  codeLength: number | null;
  expiresAt: number | null;
}

import { ALLOWED_BRIDGE_HOSTS, DEFAULT_AGI_BRIDGE_URL } from '../../background/policy';

// SEC-11: two separate credentials, two separate keys. The bridge secret is
// pasted by the operator and only ever leaves as X-Bridge-Token; the pair token
// is issued by Desktop and never travels back to it as authorization.
const STORAGE_KEY_BRIDGE_SECRET = 'agi_bridge_secret';
const STORAGE_KEY_PAIR_TOKEN = 'agi_pair_token';
const STORAGE_KEY_FINGERPRINT = 'agi_pairing_fingerprint';
const STORAGE_KEY_PAIR_REQUEST = 'agi_pair_request';

const PAIRING_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const PAIRING_FINGERPRINT_RE = /^[A-Za-z0-9_-]{4,32}$/;
const PAIRING_REQUEST_ID_RE = /^[a-f0-9]{16,64}$/;
const PAIRING_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,12}$/;

export function isValidPairingToken(value: string): boolean {
  return typeof value === 'string' && PAIRING_TOKEN_RE.test(value);
}

export function isValidPairingFingerprint(value: string): boolean {
  return typeof value === 'string' && PAIRING_FINGERPRINT_RE.test(value);
}

export function normalizePairingCode(value: string): string {
  return (value ?? '')
    .split('')
    .filter((c) => /[A-Za-z0-9]/.test(c))
    .join('')
    .toUpperCase();
}

export function isValidPairingCode(value: string): boolean {
  return PAIRING_CODE_RE.test(normalizePairingCode(value));
}

const DEFAULT_BRIDGE_URL = DEFAULT_AGI_BRIDGE_URL;
const REQUEST_TIMEOUT_MS = 8000;

const IDLE_STATE: PairingState = {
  phase: 'idle',
  fingerprint: null,
  error: null,
  requestId: null,
  codeLength: null,
  expiresAt: null,
};

let _state: PairingState = { ...IDLE_STATE };

function fail(error: string, keep: Partial<PairingState> = {}): PairingState {
  _state = { ...IDLE_STATE, phase: 'error', ...keep, error };
  return getPairingState();
}

export function getPairingState(): PairingState {
  return { ..._state };
}

function readSession(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.session.get(keys, (r) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(r as Record<string, unknown>);
      }
    });
  });
}

function writeSession(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

function removeSession(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.session.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

async function readStoredBridgeSecret(): Promise<string | null> {
  try {
    const stored = await readSession([STORAGE_KEY_BRIDGE_SECRET]);
    const secret = stored[STORAGE_KEY_BRIDGE_SECRET];
    return typeof secret === 'string' && secret.trim() ? secret.trim() : null;
  } catch {
    return null;
  }
}

interface StoredPairRequest {
  requestId: string;
  codeLength: number;
  expiresAt: number;
}

function readStoredPairRequest(data: Record<string, unknown>): StoredPairRequest | null {
  const raw = data[STORAGE_KEY_PAIR_REQUEST] as Partial<StoredPairRequest> | undefined;
  if (!raw || typeof raw.requestId !== 'string' || typeof raw.expiresAt !== 'number') return null;
  if (raw.expiresAt <= Date.now()) return null;
  return {
    requestId: raw.requestId,
    codeLength: typeof raw.codeLength === 'number' ? raw.codeLength : 8,
    expiresAt: raw.expiresAt,
  };
}

export async function loadPairingState(): Promise<PairingState> {
  try {
    const sessionData = await readSession([
      STORAGE_KEY_PAIR_TOKEN,
      STORAGE_KEY_FINGERPRINT,
      STORAGE_KEY_PAIR_REQUEST,
    ]);

    const token = sessionData[STORAGE_KEY_PAIR_TOKEN] as string | undefined;
    const fingerprint = sessionData[STORAGE_KEY_FINGERPRINT] as string | undefined;

    if (token) {
      _state = { ...IDLE_STATE, phase: 'paired', fingerprint: fingerprint ?? null };
      return getPairingState();
    }

    const pending = readStoredPairRequest(sessionData);
    _state = pending
      ? {
          ...IDLE_STATE,
          phase: 'awaiting-code',
          requestId: pending.requestId,
          codeLength: pending.codeLength,
          expiresAt: pending.expiresAt,
        }
      : { ...IDLE_STATE };
  } catch {
    _state = { ...IDLE_STATE };
  }
  return getPairingState();
}

async function getBridgeBaseUrl(): Promise<string> {
  try {
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      chrome.storage.local.get('agi_bridge_url', (r) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(r as Record<string, unknown>);
        }
      });
    });
    const stored = (result['agi_bridge_url'] as string | undefined)?.trim();
    return stored ?? DEFAULT_BRIDGE_URL;
  } catch {
    return DEFAULT_BRIDGE_URL;
  }
}

async function getLocalBridgeBaseUrl(): Promise<string> {
  const baseUrl = await getBridgeBaseUrl();
  const parsed = new URL(baseUrl);
  if (!ALLOWED_BRIDGE_HOSTS.has(parsed.hostname)) {
    throw new Error('Pairing is only supported with local desktop bridge');
  }
  return baseUrl;
}

async function postToBridge(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Desktop returned ${resp.status}${text ? `: ${text}` : ''}`);
  }

  return (await resp.json()) as Record<string, unknown>;
}

async function storeIssuedPairToken(data: Record<string, unknown>): Promise<PairingState> {
  const token = data['token'];
  if (typeof token !== 'string' || !token) {
    return fail('Desktop response missing token');
  }
  if (data['nativeHostManifestInstalled'] !== true) {
    return fail('Desktop could not install the native host manifest');
  }
  if (!isValidPairingToken(token)) {
    return fail('Desktop returned a malformed token');
  }

  const rawFingerprint = (data['fingerprint'] as string | undefined) ?? token.slice(0, 4);
  if (!isValidPairingFingerprint(rawFingerprint)) {
    return fail('Desktop returned a malformed fingerprint');
  }

  await writeSession({
    [STORAGE_KEY_PAIR_TOKEN]: token,
    [STORAGE_KEY_FINGERPRINT]: rawFingerprint,
  });
  await removeSession([STORAGE_KEY_PAIR_REQUEST]);

  _state = { ...IDLE_STATE, phase: 'paired', fingerprint: rawFingerprint };

  if (typeof chrome.runtime.sendMessage === 'function') {
    await chrome.runtime.sendMessage({ type: 'RECONNECT_NATIVE' }).catch(() => undefined);
  }

  return getPairingState();
}

// Step one of the handshake: Desktop parks a code and shows it in its own
// window. Nothing here authorizes an install — the reply carries an opaque
// request id only, so reaching the loopback port is not enough to pair.
export async function startPairing(): Promise<PairingState> {
  if (_state.phase === 'requesting' || _state.phase === 'confirming' || _state.phase === 'paired') {
    return getPairingState();
  }

  _state = { ...IDLE_STATE, phase: 'requesting' };

  try {
    const baseUrl = await getLocalBridgeBaseUrl();
    const data = await postToBridge(`${baseUrl}/pair/request`, {
      extensionId: chrome.runtime.id,
    });

    const requestId = data['requestId'];
    if (typeof requestId !== 'string' || !PAIRING_REQUEST_ID_RE.test(requestId)) {
      return fail('Desktop returned a malformed pairing request id');
    }

    const codeLength = typeof data['codeLength'] === 'number' ? (data['codeLength'] as number) : 8;
    const expiresInMs =
      typeof data['expiresInMs'] === 'number' ? (data['expiresInMs'] as number) : 120000;
    const expiresAt = Date.now() + expiresInMs;

    await writeSession({
      [STORAGE_KEY_PAIR_REQUEST]: { requestId, codeLength, expiresAt } satisfies StoredPairRequest,
    });

    _state = {
      ...IDLE_STATE,
      phase: 'awaiting-code',
      requestId,
      codeLength,
      expiresAt,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Pairing failed');
  }

  return getPairingState();
}

// Step two: the user reads the code off the Desktop window and types it here.
// The code never crossed the HTTP channel, so only someone looking at the
// Desktop screen can complete the handshake.
export async function submitPairingCode(code: string): Promise<PairingState> {
  if (_state.phase !== 'awaiting-code' || !_state.requestId) {
    return fail('Start a pairing request from Desktop before entering a code');
  }
  if (!isValidPairingCode(code)) {
    return fail('Enter the code shown in Desktop', {
      requestId: _state.requestId,
      codeLength: _state.codeLength,
      expiresAt: _state.expiresAt,
      phase: 'awaiting-code',
    });
  }

  const pending = {
    requestId: _state.requestId,
    codeLength: _state.codeLength,
    expiresAt: _state.expiresAt,
  };
  _state = { ...IDLE_STATE, ...pending, phase: 'confirming' };

  try {
    const baseUrl = await getLocalBridgeBaseUrl();
    const data = await postToBridge(`${baseUrl}/pair/confirm`, {
      requestId: pending.requestId,
      code: normalizePairingCode(code),
    });
    return await storeIssuedPairToken(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pairing failed';
    const retryable = message.includes('401') && (pending.expiresAt ?? 0) > Date.now();
    return fail(message, retryable ? { ...pending, phase: 'awaiting-code' } : {});
  }
}

// The operator-provisioned path: an installer or an admin pastes the desktop
// bridge secret once, and pairing needs no code. Kept as the fallback for
// hosts where the Desktop window is not on the same screen as the browser.
export async function requestPairing(): Promise<PairingState> {
  if (_state.phase === 'requesting' || _state.phase === 'paired') {
    return getPairingState();
  }

  _state = { ...IDLE_STATE, phase: 'requesting' };

  try {
    const baseUrl = await getLocalBridgeBaseUrl();

    const bridgeSecret = await readStoredBridgeSecret();
    if (!bridgeSecret) {
      throw new Error(
        'Copy the bridge token from Desktop (Settings, AGI in Chrome) and paste it here before pairing.',
      );
    }

    const data = await postToBridge(
      `${baseUrl}/pair`,
      { extensionId: chrome.runtime.id },
      { 'X-Bridge-Token': bridgeSecret },
    );

    return await storeIssuedPairToken(data);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Pairing failed');
  }
}

// One entry point for the UI: use the operator secret when it is already
// provisioned, otherwise run the Desktop-code handshake.
export async function beginPairing(): Promise<PairingState> {
  const bridgeSecret = await readStoredBridgeSecret();
  return bridgeSecret ? requestPairing() : startPairing();
}

export async function unpair(): Promise<PairingState> {
  try {
    await removeSession([
      STORAGE_KEY_PAIR_TOKEN,
      STORAGE_KEY_FINGERPRINT,
      STORAGE_KEY_PAIR_REQUEST,
    ]);
  } catch {
    // Storage removal failure should not block state reset
  }

  _state = { ...IDLE_STATE };
  return getPairingState();
}

// Store the operator-supplied desktop bridge secret. It authorizes the
// fallback `/pair` call and is never confused with the token Desktop issues.
export async function storeBridgeSecret(secret: string): Promise<PairingState> {
  const trimmed = (secret ?? '').trim();
  if (!trimmed) {
    return fail('Bridge token must not be empty');
  }
  if (!isValidPairingToken(trimmed)) {
    return fail('Bridge token has invalid shape');
  }

  try {
    await writeSession({ [STORAGE_KEY_BRIDGE_SECRET]: trimmed });
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to store bridge token');
  }

  return getPairingState();
}

export async function confirmPairing(token: string, fingerprint?: string): Promise<PairingState> {
  const trimmed = (token ?? '').trim();
  if (!trimmed) {
    return fail('Token must not be empty');
  }
  if (!isValidPairingToken(trimmed)) {
    return fail('Token has invalid shape');
  }

  const fp = fingerprint ?? trimmed.slice(0, 4);
  if (!isValidPairingFingerprint(fp)) {
    return fail('Fingerprint has invalid shape');
  }

  try {
    await writeSession({
      [STORAGE_KEY_PAIR_TOKEN]: trimmed,
      [STORAGE_KEY_FINGERPRINT]: fp,
    });
    _state = { ...IDLE_STATE, phase: 'paired', fingerprint: fp };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to store token');
  }

  return getPairingState();
}

export function _resetStateForTesting(): void {
  _state = { ...IDLE_STATE };
}
