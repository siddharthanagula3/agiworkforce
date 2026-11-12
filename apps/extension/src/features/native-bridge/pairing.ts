export type PairingPhase =
  'idle' | 'requesting' | 'awaiting-code' | 'confirming' | 'paired' | 'error';

export interface PairingState {
  phase: PairingPhase;
  fingerprint: string | null;
  error: string | null;
  requestId: string | null;
  codeLength: number | null;
  expiresAt: number | null;
}

import { isBridgePairingCode, normalizePairingCode } from '@agiworkforce/types';
import { DEFAULT_AGI_BRIDGE_URL, validateBridgeUrl } from '../../background/policy';
import { normalizeManagedCloudOwner } from '../cloud-bridge/managedCloudAuthority';

// SEC-11: two separate credentials, two separate keys. The bridge secret is
// pasted by the operator and only ever leaves as X-Bridge-Token; the pair token
// is issued by Desktop and goes back to it only over native messaging.
const STORAGE_KEY_BRIDGE_SECRET = 'agi_bridge_secret';
const STORAGE_KEY_PAIR_REQUEST = 'agi_pair_request';
// Owned by the background worker, which reads it to decide whether a worker
// start should attempt connectNative at all.
const STORAGE_KEY_DESKTOP_PAIRED = 'connectedToDesktop';
// Every Chrome profile shares the extension ID, so the pair token is the only
// thing that tells Desktop which profile it paired. It has to outlive a browser
// restart, so it is kept in local storage, which the worker restricts to
// extension pages: content scripts cannot read it.
const STORAGE_KEY_PAIRED_DESKTOP = 'agi_paired_desktop';
export const STORAGE_KEY_PENDING_DESKTOP_REVOCATION = 'agi_pending_desktop_revocation';
const PENDING_REVOCATION_NOTICE =
  "Unpaired in this browser, but Desktop could not be reached to remove the pairing. It is removed the next time Desktop is open while Chrome is running, or you can remove it in Desktop's settings now.";

const PAIRING_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const PAIRING_FINGERPRINT_RE = /^[A-Za-z0-9_-]{4,32}$/;
const PAIRING_REQUEST_ID_RE = /^[a-f0-9]{16,64}$/;

export function isValidPairingToken(value: string): boolean {
  return typeof value === 'string' && PAIRING_TOKEN_RE.test(value);
}

export function isValidPairingFingerprint(value: string): boolean {
  return typeof value === 'string' && PAIRING_FINGERPRINT_RE.test(value);
}

export { normalizePairingCode };

export function isValidPairingCode(value: string): boolean {
  return isBridgePairingCode(normalizePairingCode(value));
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

async function readSession(keys: string[]): Promise<Record<string, unknown>> {
  return (await chrome.storage.session.get(keys)) as Record<string, unknown>;
}

function writeSession(items: Record<string, unknown>): Promise<void> {
  return chrome.storage.session.set(items);
}

function removeSession(keys: string[]): Promise<void> {
  return chrome.storage.session.remove(keys);
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

/**
 * A pairing survives a session refresh, which rotates the incarnation, but not
 * a sign-out or a switch of account. An unbound pairing was issued where there
 * is no account to bind to, so this check has nothing to say about it.
 */
export function pairingBelongsTo(
  boundAccountId: string | null,
  signedInAccountId: string | null,
): boolean {
  return boundAccountId === null || boundAccountId === signedInAccountId;
}

/** `undefined` means the background could not answer, which is not a sign-out. */
async function readSignedInAccountId(): Promise<string | null | undefined> {
  if (typeof chrome.runtime?.sendMessage !== 'function') return undefined;
  try {
    const response = (await chrome.runtime.sendMessage({ type: 'GET_CLOUD_AUTH_TOKEN' })) as
      { success?: unknown; owner?: unknown } | undefined;
    if (response?.success !== true) return undefined;
    return normalizeManagedCloudOwner(response.owner)?.accountId ?? null;
  } catch {
    return undefined;
  }
}

interface PairedDesktopRecord {
  fingerprint: string;
  accountId: string | null;
  token: string;
}

function parsePairedDesktopRecord(stored: unknown): PairedDesktopRecord | null {
  const record = stored as Partial<PairedDesktopRecord> | null | undefined;
  const fingerprint = record?.fingerprint;
  const token = record?.token;
  if (typeof fingerprint !== 'string' || !isValidPairingFingerprint(fingerprint)) return null;
  if (typeof token !== 'string' || !isValidPairingToken(token)) return null;
  const accountId =
    typeof record?.accountId === 'string' && record.accountId !== '' ? record.accountId : null;
  return { fingerprint, accountId, token };
}

async function readPairedDesktopRecord(): Promise<PairedDesktopRecord | null> {
  try {
    return parsePairedDesktopRecord(await readLocal(STORAGE_KEY_PAIRED_DESKTOP));
  } catch {
    return null;
  }
}

async function writePairedDesktopRecord(record: PairedDesktopRecord): Promise<void> {
  await writeLocal({ [STORAGE_KEY_PAIRED_DESKTOP]: record });
}

/** The token this profile proves its pairing with, or `null` when it is not paired. */
export async function readDesktopPairToken(): Promise<string | null> {
  return (await readPairedDesktopRecord())?.token ?? null;
}

async function releasePairedCredentials(): Promise<void> {
  try {
    await removeLocal([STORAGE_KEY_DESKTOP_PAIRED, STORAGE_KEY_PAIRED_DESKTOP]);
  } catch {
    // The background falls back to a failed connect attempt.
  }
}

async function readLocal(key: string): Promise<unknown> {
  return ((await chrome.storage.local.get([key])) as Record<string, unknown>)[key];
}

function writeLocal(items: Record<string, unknown>): Promise<void> {
  return chrome.storage.local.set(items);
}

function removeLocal(keys: string[]): Promise<void> {
  return chrome.storage.local.remove(keys);
}

/**
 * An unpair Desktop has not acknowledged. It keeps the token, because Desktop
 * accepts the unpair only from the profile that can present it.
 */
export interface PendingDesktopRevocation {
  id: string;
  token: string;
}

export function parsePendingDesktopRevocation(stored: unknown): PendingDesktopRevocation | null {
  const candidate = stored as Partial<PendingDesktopRevocation> | null | undefined;
  const id = candidate?.id;
  const token = candidate?.token;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof token !== 'string' || !isValidPairingToken(token)) return null;
  return { id, token };
}

export async function readPendingDesktopRevocation(): Promise<PendingDesktopRevocation | null> {
  try {
    return parsePendingDesktopRevocation(await readLocal(STORAGE_KEY_PENDING_DESKTOP_REVOCATION));
  } catch {
    return null;
  }
}

/** Records that Desktop still holds the pairing `token` opened. False when it could not be stored. */
export async function oweDesktopRevocation(token: string): Promise<boolean> {
  try {
    await writeLocal({
      [STORAGE_KEY_PENDING_DESKTOP_REVOCATION]: { id: crypto.randomUUID(), token },
    });
    return true;
  } catch {
    return false;
  }
}

export async function settlePendingDesktopRevocation(id: string): Promise<void> {
  if ((await readPendingDesktopRevocation())?.id !== id) return;
  await removeLocal([STORAGE_KEY_PENDING_DESKTOP_REVOCATION]);
}

export function watchDesktopPairingRelease(onRelease: () => void): void {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !(STORAGE_KEY_PAIRED_DESKTOP in changes)) return;
    if (changes[STORAGE_KEY_PAIRED_DESKTOP]?.newValue === undefined) onRelease();
  });
}

export async function releaseStoredDesktopPairing(): Promise<void> {
  await releasePairedCredentials();
  _state = { ...IDLE_STATE };
}

/**
 * True when a stored pairing must not stay attached to `signedInAccountId`.
 * An unknown sign-in is the caller's problem: this only answers for an
 * account id or a positive sign-out (`null`).
 */
export async function desktopPairingRejectsAccount(
  signedInAccountId: string | null,
): Promise<boolean> {
  const record = await readPairedDesktopRecord();
  if (!record) return false;
  return !pairingBelongsTo(record.accountId, signedInAccountId);
}

/**
 * Binds a pairing made while signed out to the first account seen afterwards,
 * on disk, so a later sign-out or switch releases it even after a restart.
 */
export async function bindUnboundDesktopPairing(accountId: string): Promise<void> {
  const record = await readPairedDesktopRecord();
  if (!record || record.accountId !== null) return;
  await writePairedDesktopRecord({ ...record, accountId });
}

export async function loadPairingState(): Promise<PairingState> {
  try {
    const signedInAccountId = await readSignedInAccountId();
    const durable = await readPairedDesktopRecord();
    if (durable) {
      if (
        signedInAccountId !== undefined &&
        !pairingBelongsTo(durable.accountId, signedInAccountId)
      ) {
        const owed = await oweDesktopRevocation(durable.token);
        await releasePairedCredentials();
        _state = { ...IDLE_STATE, error: owed ? PENDING_REVOCATION_NOTICE : null };
        return getPairingState();
      }
      if (durable.accountId === null && typeof signedInAccountId === 'string') {
        await bindUnboundDesktopPairing(signedInAccountId);
      }
      _state = { ...IDLE_STATE, phase: 'paired', fingerprint: durable.fingerprint };
      return getPairingState();
    }

    const sessionData = await readSession([STORAGE_KEY_PAIR_REQUEST]);
    const pending = readStoredPairRequest(sessionData);
    _state = pending
      ? {
          ...IDLE_STATE,
          phase: 'awaiting-code',
          requestId: pending.requestId,
          codeLength: pending.codeLength,
          expiresAt: pending.expiresAt,
        }
      : {
          ...IDLE_STATE,
          error: (await readPendingDesktopRevocation()) ? PENDING_REVOCATION_NOTICE : null,
        };
  } catch {
    _state = { ...IDLE_STATE };
  }
  return getPairingState();
}

async function getBridgeBaseUrl(): Promise<string> {
  try {
    const stored = ((await readLocal('agi_bridge_url')) as string | undefined)?.trim();
    return stored || DEFAULT_BRIDGE_URL;
  } catch {
    return DEFAULT_BRIDGE_URL;
  }
}

async function getLocalBridgeBaseUrl(): Promise<string> {
  const baseUrl = validateBridgeUrl(await getBridgeBaseUrl());
  if (!baseUrl) {
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
    redirect: 'error',
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

  const signedInAccountId = await readSignedInAccountId();
  await writePairedDesktopRecord({
    fingerprint: rawFingerprint,
    accountId: typeof signedInAccountId === 'string' ? signedInAccountId : null,
    token,
  });
  await removeSession([STORAGE_KEY_PAIR_REQUEST]);
  await removeLocal([STORAGE_KEY_PENDING_DESKTOP_REVOCATION]);

  _state = { ...IDLE_STATE, phase: 'paired', fingerprint: rawFingerprint };

  if (typeof chrome.runtime.sendMessage === 'function') {
    await chrome.runtime.sendMessage({ type: 'RECONNECT_NATIVE' }).catch(() => undefined);
  }

  return getPairingState();
}

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

interface UnpairReceipt {
  success?: unknown;
  revocationOwed?: unknown;
}

export async function unpair(): Promise<PairingState> {
  // The background tells Desktop while the pairing still exists to authorise
  // the message, and records the unpair as owed when Desktop cannot be reached.
  // Without that the two sides disagree: Desktop keeps its record and every
  // local client goes on offering browser tools that can never answer.
  const receipt =
    typeof chrome.runtime?.sendMessage === 'function'
      ? ((await chrome.runtime.sendMessage({ type: 'UNPAIR_NATIVE' }).catch(() => undefined)) as
          UnpairReceipt | undefined)
      : undefined;

  let owed = receipt?.revocationOwed === true;
  if (receipt?.success !== true && !owed) {
    const record = await readPairedDesktopRecord();
    if (record) {
      if (!(await oweDesktopRevocation(record.token))) {
        return {
          ..._state,
          error: 'Desktop could not be reached, so the pairing was kept. Try again.',
        };
      }
      owed = true;
    }
  }

  try {
    await removeSession([STORAGE_KEY_PAIR_REQUEST]);
  } catch {
    // Storage removal failure should not block state reset
  }
  await releaseStoredDesktopPairing();
  if (owed) _state = { ...IDLE_STATE, error: PENDING_REVOCATION_NOTICE };
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
    const signedInAccountId = await readSignedInAccountId();
    await writePairedDesktopRecord({
      fingerprint: fp,
      accountId: typeof signedInAccountId === 'string' ? signedInAccountId : null,
      token: trimmed,
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
