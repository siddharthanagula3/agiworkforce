import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  type BrowserActivityEntry,
  type BrowserPairRequestNotice,
  type BrowserPairRequestPrompt,
  type BrowserPairingState,
} from '@agiworkforce/local-runtime-contract';
import {
  BROWSER_BRIDGE_DEFAULT_PORT,
  BROWSER_BRIDGE_LOOPBACK_ADDRESS,
  BROWSER_BRIDGE_ROUTES,
  LOCAL_CLIENT_PROTOCOL_VERSION,
  type LocalClientFailureCode,
  BROWSER_COMMAND_POLL_WINDOW_MS,
  BROWSER_COMMAND_PROTOCOL_VERSION,
  BROWSER_COMMAND_TIMEOUT_MS,
  BRIDGE_TOKEN_HEADER,
  MAX_CONTEXT_HANDOFF_SELECTION_CHARS,
  MAX_CONTEXT_HANDOFF_URL_CHARS,
  MAX_PAIR_CONFIRM_ATTEMPTS,
  MAX_PENDING_PAIR_REQUESTS,
  NATIVE_BROWSER_POLL_MESSAGE,
  NATIVE_BROWSER_COMMAND_WATCH_MESSAGE,
  NATIVE_BROWSER_RESULT_MESSAGE,
  NATIVE_BROWSER_UNPAIR_MESSAGE,
  NATIVE_HOST_TOKEN_HEADER,
  NATIVE_PAGE_CAPTURE_MESSAGE,
  NATIVE_SELECTED_TEXT_MESSAGE,
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  PAIR_REQUEST_TTL_MS,
  isBrowserCommandResult,
  isLocalClientFailureCode,
  isValidExtensionId,
  isValidPairCode,
  normalizePairCode,
  type BrowserCommand,
  type BrowserCommandRequest,
  PRODUCT_NAMES,
} from '@agiworkforce/types';
import {
  describeLocalClient,
  isAuthorizedLocalClient,
  parseLocalClientCommand,
  publishLocalClientBridge,
  withdrawLocalClientBridge,
} from './localClient';
import {
  installNativeHost,
  installedManifestPaths,
  refreshInstalledHost,
  uninstallNativeHost,
} from './hostInstaller';
import { bridgeToken, clearPairing, hostToken, readPairing, savePairing } from './pairingStore';

const MAX_PAIR_BODY_BYTES = 4 * 1024;
const MAX_NATIVE_BODY_BYTES = 32 * 1024 * 1024;
const CONNECTION_IDLE_MS = 40_000;

const NATIVE_CONNECT_MESSAGE = 'connect';
const NATIVE_PING_MESSAGE = 'ping';
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type BrowserChatHandoff =
  { kind: 'page-capture'; png: Buffer } | { kind: 'selection'; text: string; url: string };

interface PendingPairRequest {
  extensionId: string;
  code: string;
  createdAtMs: number;
  failedAttempts: number;
}

interface PendingResult {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal;
  onAbort?: () => void;
}

type PollWaiter = (command: BrowserCommandRequest | null) => boolean;

export interface BridgeDependencies {
  onStateChanged: (state: BrowserPairingState) => void;
  onPairRequest: (prompt: BrowserPairRequestPrompt) => void;
  extraManifestDirectories?: readonly string[];
  port?: number;
  home?: string;
  appVersion?: string;
  refreshInstalledHost?: boolean;
  /**
   * Injected rather than imported, so this module keeps no dependency on the
   * runtime dispatcher, which imports it.
   */
  runBrowserCommand?: (
    command: string,
    args: Record<string, unknown>,
    caller: { name: string; subject: string; folder: string | null; path: string | null },
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; value?: unknown; error?: string; code?: string }>;
  deliverToChat?: (handoff: BrowserChatHandoff) => Promise<void>;
}

let server: Server | null = null;
let listeningPort = 0;
let deps: BridgeDependencies | null = null;
let lastSeenMs = 0;

const pendingPairRequests = new Map<string, PendingPairRequest>();
const queuedCommands: BrowserCommandRequest[] = [];
const pollWaiters: PollWaiter[] = [];
const pendingResults = new Map<string, PendingResult>();
const commandWatchers = new Map<string, (state: 'active' | 'cancelled' | 'completed') => void>();

/**
 * A bridge failure carrying why, not only what. A refusal and a browser that
 * never answered need different things from the user, so they cannot share a
 * code.
 */
export class BrowserBridgeError extends Error {
  constructor(
    message: string,
    readonly code: LocalClientFailureCode = 'timeout',
  ) {
    super(message);
  }
}

function extraDirectories(): readonly string[] {
  return deps?.extraManifestDirectories ?? [];
}

function homeDirectory(): { home?: string } {
  return deps?.home ? { home: deps.home } : {};
}

function generatePairCode(): string {
  const unbiasedLimit = 256 - (256 % PAIR_CODE_ALPHABET.length);
  let code = '';
  while (code.length < PAIR_CODE_LENGTH) {
    for (const byte of randomBytes(PAIR_CODE_LENGTH)) {
      if (byte >= unbiasedLimit || code.length === PAIR_CODE_LENGTH) continue;
      code += PAIR_CODE_ALPHABET[byte % PAIR_CODE_ALPHABET.length];
    }
  }
  return code;
}

function codeMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function dropExpiredPairRequests(nowMs: number): void {
  for (const [requestId, request] of pendingPairRequests) {
    if (nowMs - request.createdAtMs >= PAIR_REQUEST_TTL_MS) pendingPairRequests.delete(requestId);
  }
}

/**
 * That a pairing is waiting, for the page to say so. The code is not in it:
 * the code is what proves a person at this computer read it off this app and
 * typed it into the extension, and a page that could read it could confirm a
 * pairing for an extension of its own choosing.
 */
function currentPrompt(): BrowserPairRequestNotice | null {
  dropExpiredPairRequests(Date.now());
  for (const [requestId, request] of pendingPairRequests) {
    return {
      requestId,
      extensionId: request.extensionId,
      expiresAtMs: request.createdAtMs + PAIR_REQUEST_TTL_MS,
    };
  }
  return null;
}

const START_FAILED =
  'This app could not open the browser bridge on this computer. Reopen it to try again.';

let startFailure: string | null = null;

export function pairingState(): BrowserPairingState {
  const pairing = readPairing();
  const manifests = installedManifestPaths(extraDirectories(), deps?.home);
  return {
    bridgePort: listeningPort || (deps?.port ?? BROWSER_BRIDGE_DEFAULT_PORT),
    bridgeListening: server !== null && server.listening,
    paired: pairing !== null,
    extensionId: pairing?.extensionId ?? null,
    fingerprint: pairing?.fingerprint ?? null,
    pairedAtMs: pairing?.pairedAtMs ?? null,
    connected: pairing !== null && Date.now() - lastSeenMs < CONNECTION_IDLE_MS,
    hostInstalled: manifests.length > 0,
    installedManifestPaths: manifests,
    pendingRequest: currentPrompt(),
    unavailableReason: startFailure,
  };
}

function publishState(): void {
  deps?.onStateChanged(pairingState());
}

const EXTENSION_ORIGIN = /^chrome-extension:\/\/([a-p]{32})$/u;

/**
 * The extension a request came from, by the `Origin` its browser put on it,
 * or null. A page cannot set that header to an extension's, and a sandboxed
 * frame sends `null`, so this is what a pairing is bound to: a body can name
 * any extension, and the routes that pair one take the name only from here.
 */
function originExtensionId(origin: string | undefined): string | null {
  return EXTENSION_ORIGIN.exec(origin ?? '')?.[1] ?? null;
}

/**
 * Whether a request may reach a route that is not a pairing route. The native
 * host and the local clients are programs, which send no `Origin`; a browser
 * always sends one from a page, and only an extension's is taken.
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  return originExtensionId(origin) !== null || origin.startsWith('vscode-webview://');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    Connection: 'close',
  });
  response.end(payload);
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/plain',
    'Content-Length': Buffer.byteLength(body),
    Connection: 'close',
  });
  response.end(body);
}

function tokenMatches(supplied: unknown, expected: string): boolean {
  const provided = Buffer.from(typeof supplied === 'string' ? supplied : '');
  const expectedBytes = Buffer.from(expected);
  return provided.length === expectedBytes.length && timingSafeEqual(provided, expectedBytes);
}

/**
 * The body, read only up to `limit`. A request that says it is longer is
 * refused before any of it is read, and one that says nothing, or less than
 * it sends, is cut off as it passes the limit.
 */
async function readBody(request: IncomingMessage, limit: number): Promise<string> {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    request.destroy();
    throw new BrowserBridgeError('Request body is too large.');
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new BrowserBridgeError('Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => reject(new BrowserBridgeError('Request body could not be read.')));
  });
}

function parseJsonBody(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BrowserBridgeError('Body was not a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function openPairRequest(extensionId: string): BrowserPairRequestPrompt {
  const now = Date.now();
  dropExpiredPairRequests(now);
  if (pendingPairRequests.size >= MAX_PENDING_PAIR_REQUESTS) {
    throw new BrowserBridgeError('Too many pending pairing requests.');
  }
  const requestId = randomBytes(16).toString('hex');
  const code = generatePairCode();
  pendingPairRequests.set(requestId, {
    extensionId,
    code,
    createdAtMs: now,
    failedAttempts: 0,
  });
  return { requestId, extensionId, code, expiresAtMs: now + PAIR_REQUEST_TTL_MS };
}

function takeConfirmedPairRequest(
  requestId: string,
  suppliedCode: string,
  fromExtension: string,
): string {
  const now = Date.now();
  dropExpiredPairRequests(now);
  const request = pendingPairRequests.get(requestId);
  if (!request || request.extensionId !== fromExtension) {
    throw new BrowserBridgeError('No pairing request is waiting for that code.');
  }
  if (!codeMatches(normalizePairCode(suppliedCode), request.code)) {
    request.failedAttempts += 1;
    if (request.failedAttempts >= MAX_PAIR_CONFIRM_ATTEMPTS) {
      pendingPairRequests.delete(requestId);
      throw new BrowserBridgeError('Too many wrong codes. Start pairing again from Chrome.');
    }
    throw new BrowserBridgeError(
      `That code does not match the one shown in ${PRODUCT_NAMES.desktop}.`,
    );
  }
  pendingPairRequests.delete(requestId);
  return request.extensionId;
}

function completePairing(extensionId: string, port: number): Record<string, unknown> {
  const { manifestPaths } = installNativeHost({
    extensionId,
    port,
    ...homeDirectory(),
    ...(extraDirectories().length > 0 ? { extraManifestDirectories: extraDirectories() } : {}),
  });
  const record = savePairing(extensionId);
  publishState();
  return {
    token: record.pairToken,
    fingerprint: record.fingerprint,
    nativeHostManifestInstalled: manifestPaths.length > 0,
  };
}

/**
 * The extension a pairing request is for: the one its `Origin` names, which
 * has to be the one its body names. Null after the refusal has been sent.
 */
function pairingExtension(
  response: ServerResponse,
  fromExtension: string,
  body: Record<string, unknown>,
): string | null {
  const extensionId = typeof body['extensionId'] === 'string' ? body['extensionId'].trim() : '';
  if (!isValidExtensionId(extensionId)) {
    sendText(response, 400, 'extensionId is required');
    return null;
  }
  if (extensionId !== fromExtension) {
    sendText(response, 403, 'A pairing is asked for by the extension it is for');
    return null;
  }
  return extensionId;
}

function handlePairRequestRoute(
  response: ServerResponse,
  fromExtension: string,
  body: Record<string, unknown>,
): void {
  const extensionId = pairingExtension(response, fromExtension, body);
  if (extensionId === null) return;
  let prompt: BrowserPairRequestPrompt;
  try {
    prompt = openPairRequest(extensionId);
  } catch (error) {
    sendText(response, 429, error instanceof Error ? error.message : 'Pairing refused');
    return;
  }
  sendJson(response, 200, {
    requestId: prompt.requestId,
    expiresInMs: PAIR_REQUEST_TTL_MS,
    codeLength: PAIR_CODE_LENGTH,
  });
  setImmediate(() => {
    deps?.onPairRequest(prompt);
    publishState();
  });
}

function handlePairConfirmRoute(
  response: ServerResponse,
  fromExtension: string,
  body: Record<string, unknown>,
): void {
  const requestId = typeof body['requestId'] === 'string' ? body['requestId'].trim() : '';
  const code = typeof body['code'] === 'string' ? body['code'] : '';
  if (!requestId || !isValidPairCode(code)) {
    sendText(response, 400, 'requestId and code are required');
    return;
  }
  let extensionId: string;
  try {
    extensionId = takeConfirmedPairRequest(requestId, code, fromExtension);
  } catch (error) {
    sendText(response, 401, error instanceof Error ? error.message : 'Pairing refused');
    return;
  }
  try {
    sendJson(response, 200, completePairing(extensionId, listeningPort));
  } catch (error) {
    sendText(response, 500, error instanceof Error ? error.message : 'Pairing failed');
  }
}

function handlePairLegacyRoute(
  response: ServerResponse,
  fromExtension: string,
  body: Record<string, unknown>,
): void {
  const extensionId = pairingExtension(response, fromExtension, body);
  if (extensionId === null) return;
  try {
    sendJson(response, 200, completePairing(extensionId, listeningPort));
  } catch (error) {
    sendText(response, 500, error instanceof Error ? error.message : 'Pairing failed');
  }
}

function nextQueuedCommand(): BrowserCommandRequest | null {
  while (queuedCommands.length) {
    const command = queuedCommands.shift()!;
    if (pendingResults.has(command.id)) return command;
  }
  return null;
}

function handlePoll(response: ServerResponse): void {
  if (response.destroyed || response.writableEnded) return;
  const queued = nextQueuedCommand();
  if (queued) {
    sendJson(response, 200, { success: true, command: queued });
    return;
  }

  let settled = false;
  const waiter: PollWaiter = (command) => {
    if (settled || response.destroyed || response.writableEnded) return false;
    settled = true;
    clearTimeout(timer);
    response.removeListener('close', closed);
    sendJson(response, 200, { success: true, command });
    return true;
  };
  const closed = (): void => {
    settled = true;
    clearTimeout(timer);
    const index = pollWaiters.indexOf(waiter);
    if (index >= 0) pollWaiters.splice(index, 1);
  };
  const timer = setTimeout(() => {
    const index = pollWaiters.indexOf(waiter);
    if (index >= 0) pollWaiters.splice(index, 1);
    waiter(null);
  }, BROWSER_COMMAND_POLL_WINDOW_MS);
  response.once('close', closed);
  pollWaiters.push(waiter);
}

function takePendingResult(
  id: string,
  state: 'cancelled' | 'completed' = 'cancelled',
): PendingResult | null {
  const pending = pendingResults.get(id);
  if (!pending) return null;
  pendingResults.delete(id);
  clearTimeout(pending.timer);
  if (pending.signal && pending.onAbort)
    pending.signal.removeEventListener('abort', pending.onAbort);
  notifyCommandWatcher(id, state);
  return pending;
}

function notifyCommandWatcher(id: string, state: 'active' | 'cancelled' | 'completed'): void {
  const watcher = commandWatchers.get(id);
  if (typeof watcher === 'function') watcher(state);
}

function handleCommandWatch(response: ServerResponse, id: unknown, wait: unknown): void {
  if (typeof wait !== 'boolean') {
    sendJson(response, 200, { success: false, error: 'A command watch mode is required.' });
    return;
  }
  if (typeof id !== 'string' || !pendingResults.has(id)) {
    sendJson(response, 200, { success: true, state: 'cancelled' });
    return;
  }
  if (response.destroyed || response.writableEnded) return;
  if (!wait) {
    sendJson(response, 200, { success: true, state: 'active' });
    return;
  }
  notifyCommandWatcher(id, 'active');
  let settled = false;
  const cleanup = (): void => {
    clearTimeout(timer);
    response.removeListener('close', closed);
    if (commandWatchers.get(id) === finish) commandWatchers.delete(id);
  };
  const finish = (state: 'active' | 'cancelled' | 'completed'): void => {
    if (settled) return;
    settled = true;
    cleanup();
    if (!response.destroyed && !response.writableEnded)
      sendJson(response, 200, { success: true, state });
  };
  const closed = (): void => {
    settled = true;
    cleanup();
  };
  const timer = setTimeout(
    () => finish(pendingResults.has(id) ? 'active' : 'cancelled'),
    BROWSER_COMMAND_POLL_WINDOW_MS,
  );
  commandWatchers.set(id, finish);
  response.once('close', closed);
}

function handleCommandResult(body: Record<string, unknown>): void {
  const result = body['result'];
  if (!isBrowserCommandResult(result)) return;
  const pending = takePendingResult(result.id, 'completed');
  if (!pending) return;
  if (result.ok) {
    pending.resolve(result.value);
  } else {
    pending.reject(
      new BrowserBridgeError(
        result.error ?? 'The browser refused that action.',
        'permission-denied',
      ),
    );
  }
}

function readPageCapture(message: Record<string, unknown>): BrowserChatHandoff | string {
  const dataUrl = message['dataUrl'];
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    return 'The captured page was not a PNG image.';
  }
  const png = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64');
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'The captured page was not a PNG image.';
  }
  return { kind: 'page-capture', png };
}

function readSelection(message: Record<string, unknown>): BrowserChatHandoff | string {
  const text = message['selectedText'];
  const url = message['url'];
  if (
    typeof text !== 'string' ||
    text.trim() === '' ||
    text.length > MAX_CONTEXT_HANDOFF_SELECTION_CHARS
  ) {
    return 'The selected text was empty or too long.';
  }
  if (typeof url !== 'string' || url.length > MAX_CONTEXT_HANDOFF_URL_CHARS) {
    return 'The selection did not name the page it came from.';
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return 'The selection did not name the page it came from.';
  }
  if (protocol !== 'https:' && protocol !== 'http:') {
    return `Only text selected on a web page can be sent to ${PRODUCT_NAMES.desktop}.`;
  }
  return { kind: 'selection', text: text.trim(), url };
}

async function deliverChatHandoff(
  response: ServerResponse,
  handoff: BrowserChatHandoff | string,
): Promise<void> {
  if (typeof handoff === 'string') {
    sendJson(response, 200, { success: false, error: handoff });
    return;
  }
  const deliver = deps?.deliverToChat;
  if (!deliver) {
    sendJson(response, 200, { success: false, error: 'This desktop app cannot open a chat.' });
    return;
  }
  try {
    await deliver(handoff);
    sendJson(response, 200, { success: true });
  } catch (error) {
    sendJson(response, 200, {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : `${PRODUCT_NAMES.desktop} could not open the chat.`,
    });
  }
}

async function handleNativeMessageRoute(
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const pairing = readPairing();
  const extensionId = typeof body['extensionId'] === 'string' ? body['extensionId'] : null;
  if (!pairing || !extensionId || extensionId !== pairing.extensionId) {
    sendJson(response, 200, {
      success: false,
      error: `This browser is not paired with ${PRODUCT_NAMES.desktop}. Pair it from Settings, Capabilities.`,
    });
    return;
  }

  const message = body['message'];
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    sendJson(response, 200, { success: false, error: 'The browser sent an unreadable message.' });
    return;
  }

  const wasConnected = Date.now() - lastSeenMs < CONNECTION_IDLE_MS;
  lastSeenMs = Date.now();
  if (!wasConnected) publishState();

  const type = (message as Record<string, unknown>)['type'];
  if (
    (type === NATIVE_BROWSER_POLL_MESSAGE ||
      type === NATIVE_BROWSER_RESULT_MESSAGE ||
      type === NATIVE_BROWSER_COMMAND_WATCH_MESSAGE) &&
    (message as Record<string, unknown>)['version'] !== BROWSER_COMMAND_PROTOCOL_VERSION
  ) {
    sendJson(response, 200, {
      success: false,
      error:
        'The desktop and Chrome browser command protocols do not match. Update both before running paired browser work.',
    });
    return;
  }
  if (type === NATIVE_BROWSER_COMMAND_WATCH_MESSAGE) {
    handleCommandWatch(
      response,
      (message as Record<string, unknown>)['id'],
      (message as Record<string, unknown>)['wait'],
    );
    return;
  }
  if (type === NATIVE_BROWSER_UNPAIR_MESSAGE) {
    // Keeping the record would leave clients offering tools that never answer.
    removeHostAndPairing();
    sendJson(response, 200, { success: true });
    return;
  }
  if (type === NATIVE_BROWSER_POLL_MESSAGE) {
    handlePoll(response);
    return;
  }
  if (type === NATIVE_BROWSER_RESULT_MESSAGE) {
    handleCommandResult(message as Record<string, unknown>);
    sendJson(response, 200, { success: true });
    return;
  }
  if (type === NATIVE_CONNECT_MESSAGE || type === NATIVE_PING_MESSAGE) {
    sendJson(response, 200, { success: true });
    return;
  }
  if (type === NATIVE_PAGE_CAPTURE_MESSAGE) {
    await deliverChatHandoff(response, readPageCapture(message as Record<string, unknown>));
    return;
  }
  if (type === NATIVE_SELECTED_TEXT_MESSAGE) {
    await deliverChatHandoff(response, readSelection(message as Record<string, unknown>));
    return;
  }
  sendJson(response, 200, {
    success: false,
    error:
      typeof type === 'string'
        ? `${PRODUCT_NAMES.desktop} does not handle ${type.slice(0, 64)} messages from the browser.`
        : 'The browser sent a message without a type.',
  });
}

/**
 * Whether the client speaks a different revision of this protocol, and which
 * side is behind. Null when the versions agree, which is every ordinary call.
 */
export function protocolMismatch(body: Record<string, unknown>): string | null {
  const version = body['version'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return 'The client did not say which version of the desktop bridge it speaks.';
  }
  if (version === LOCAL_CLIENT_PROTOCOL_VERSION) return null;
  return version > LOCAL_CLIENT_PROTOCOL_VERSION
    ? `This app is older than the program asking it to drive the browser. Update ${PRODUCT_NAMES.desktop}, then try again.`
    : 'The program asking this app to drive the browser is older than the app. Update it, then try again.';
}

/**
 * One page command from another program on this machine. The shell decides:
 * the renderer's own gate runs here, scoped to the client's name.
 */
async function handleLocalClientCommandRoute(
  response: ServerResponse,
  body: Record<string, unknown>,
): Promise<void> {
  const mismatch = protocolMismatch(body);
  if (mismatch) {
    // Answered before the command is read, and never run: the two sides do not
    // agree on what the arguments mean, so acting on them is the one outcome
    // worse than refusing. The envelope carries this app's own version so the
    // client can say which side is behind, and the sentence says it too,
    // because "malformed" sent a user looking for a typo in their command.
    sendJson(response, 409, {
      version: LOCAL_CLIENT_PROTOCOL_VERSION,
      ok: false,
      error: mismatch,
    });
    return;
  }

  const parsed = parseLocalClientCommand(body);
  if (!parsed) {
    sendJson(response, 400, {
      version: LOCAL_CLIENT_PROTOCOL_VERSION,
      ok: false,
      error: 'Malformed browser command.',
      code: 'not-paired',
    });
    return;
  }
  if (!pairingState().paired && parsed.command !== 'browser_open_tab') {
    sendJson(response, 200, {
      version: LOCAL_CLIENT_PROTOCOL_VERSION,
      ok: false,
      error: 'No browser is paired with this desktop app.',
      code: 'not-paired',
    });
    return;
  }

  const run = deps?.runBrowserCommand;
  if (!run) {
    sendJson(response, 200, {
      version: LOCAL_CLIENT_PROTOCOL_VERSION,
      ok: false,
      error: 'This desktop app cannot run browser commands.',
      code: 'not-paired',
    });
    return;
  }

  const described = describeLocalClient(parsed.client);
  const activity = recordBrowserActivity(described.label, parsed.command, parsed.args);
  // An uncaught throw becomes a plain-text 500, which a client parsing JSON
  // reads as a broken connection rather than the refusal it was.
  let outcome: { ok: boolean; value?: unknown; error?: string; code?: string };
  const controller = new AbortController();
  const closed = (): void => {
    if (!response.writableEnded)
      controller.abort(
        new BrowserBridgeError('The requesting local client disconnected.', 'cancelled'),
      );
  };
  response.once('close', closed);
  if (response.destroyed) closed();
  try {
    outcome = await run(
      parsed.command,
      parsed.args,
      {
        name: parsed.client.name.trim().slice(0, 60),
        ...described,
      },
      controller.signal,
    );
  } catch (error) {
    // Read the code off the error rather than testing its class: `instanceof`
    // is per module instance, so an error thrown by another copy of this
    // module would silently lose its code and read as a timeout.
    const code = (error as { code?: unknown } | null)?.code;
    outcome = {
      ok: false,
      error: error instanceof Error ? error.message : 'The browser did not answer.',
      code: isLocalClientFailureCode(code) ? code : 'timeout',
    };
  } finally {
    response.removeListener('close', closed);
  }
  settleBrowserActivity(activity, outcome.ok ? null : (outcome.error ?? null));
  if (response.destroyed || controller.signal.aborted) return;
  sendJson(response, 200, {
    version: LOCAL_CLIENT_PROTOCOL_VERSION,
    ...outcome,
  });
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const socket = request.socket;
  if (socket.remoteAddress && !isLoopbackAddress(socket.remoteAddress)) {
    sendText(response, 403, 'Forbidden');
    return;
  }
  if (!isOriginAllowed(request.headers.origin)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  const path = (request.url ?? '').split('?')[0] ?? '';
  const isNative = path === BROWSER_BRIDGE_ROUTES.nativeMessage;
  const isLocalClient =
    path === BROWSER_BRIDGE_ROUTES.clientState || path === BROWSER_BRIDGE_ROUTES.clientCommand;
  const known =
    isNative ||
    isLocalClient ||
    path === BROWSER_BRIDGE_ROUTES.pair ||
    path === BROWSER_BRIDGE_ROUTES.pairRequest ||
    path === BROWSER_BRIDGE_ROUTES.pairConfirm;

  if (request.method !== 'POST' || !known) {
    sendText(response, 404, `Not found: ${request.method ?? ''} ${path}`);
    return;
  }

  // Who is asking is settled from the headers, before a byte of the body is
  // read: a caller with no right to a route does not get to make this
  // process buffer and parse what it sends.
  const fromExtension = originExtensionId(request.headers.origin);
  if (isLocalClient) {
    // The local-client token is a separate grant from the extension's: an
    // extension that somehow reached these routes still has to present it.
    if (!isAuthorizedLocalClient(request.headers as Record<string, unknown>)) {
      sendJson(response, 401, {
        version: LOCAL_CLIENT_PROTOCOL_VERSION,
        ok: false,
        error: 'This client is not authorized to use the browser bridge.',
        code: 'unauthorized',
      });
      return;
    }
  } else if (isNative) {
    if (!tokenMatches(request.headers[NATIVE_HOST_TOKEN_HEADER], hostToken())) {
      sendText(response, 401, 'Unauthorized native host');
      return;
    }
  } else {
    if (fromExtension === null) {
      sendText(response, 403, 'A pairing is asked for by the extension it is for');
      return;
    }
    if (
      path === BROWSER_BRIDGE_ROUTES.pair &&
      !tokenMatches(request.headers[BRIDGE_TOKEN_HEADER], bridgeToken())
    ) {
      sendText(response, 401, 'Unauthorized manifest install');
      return;
    }
  }

  let body: Record<string, unknown>;
  try {
    body = parseJsonBody(
      await readBody(
        request,
        isNative || path === BROWSER_BRIDGE_ROUTES.clientCommand
          ? MAX_NATIVE_BODY_BYTES
          : MAX_PAIR_BODY_BYTES,
      ),
    );
  } catch (error) {
    sendText(response, 400, error instanceof Error ? error.message : 'Bad Request');
    return;
  }

  if (isLocalClient) {
    if (path === BROWSER_BRIDGE_ROUTES.clientState) {
      const state = pairingState();
      sendJson(response, 200, {
        version: LOCAL_CLIENT_PROTOCOL_VERSION,
        paired: state.paired,
        answering: state.connected,
        ...(state.extensionId ? { extensionId: state.extensionId } : {}),
        ...(deps?.appVersion ? { appVersion: deps.appVersion } : {}),
      });
      return;
    }
    await handleLocalClientCommandRoute(response, body);
    return;
  }

  if (isNative) {
    await handleNativeMessageRoute(response, body);
    return;
  }
  if (fromExtension === null) return;
  if (path === BROWSER_BRIDGE_ROUTES.pairRequest) {
    handlePairRequestRoute(response, fromExtension, body);
    return;
  }
  if (path === BROWSER_BRIDGE_ROUTES.pairConfirm) {
    handlePairConfirmRoute(response, fromExtension, body);
    return;
  }
  handlePairLegacyRoute(response, fromExtension, body);
}

export function isLoopbackAddress(address: string): boolean {
  const normalized = address.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized.startsWith('127.');
}

export async function startBrowserBridge(dependencies: BridgeDependencies): Promise<number> {
  if (server) return listeningPort;
  deps = dependencies;
  const port = dependencies.port ?? BROWSER_BRIDGE_DEFAULT_PORT;

  const instance = createServer((request, response) => {
    void route(request, response).catch(() => {
      if (!response.headersSent) sendText(response, 500, 'Bridge error');
    });
  });
  instance.keepAliveTimeout = 0;

  // A second app on this Mac holding the port is the ordinary way this fails,
  // and it is not a fault in this app: the two would otherwise take turns
  // owning the bridge file and the extension would talk to whichever won the
  // last race. This one stands down, leaves the running bridge's file alone,
  // and says what to do about it.
  try {
    await new Promise<void>((resolve, reject) => {
      instance.once('error', (error: NodeJS.ErrnoException) => {
        instance.close();
        reject(
          error.code === 'EADDRINUSE'
            ? new BrowserBridgeError(
                `Another app on this computer is already using the browser bridge on port ${port}. Quit it, then reopen this app to pair a browser here.`,
                'not-paired',
              )
            : error,
        );
      });
      instance.listen(port, BROWSER_BRIDGE_LOOPBACK_ADDRESS, () => {
        instance.removeAllListeners('error');
        resolve();
      });
    });
  } catch (error) {
    startFailure = error instanceof BrowserBridgeError ? error.message : START_FAILED;
    throw error;
  }

  startFailure = null;
  server = instance;
  const address = instance.address();
  listeningPort = typeof address === 'object' && address ? address.port : port;
  publishLocalClientBridge(listeningPort, deps.home ? { home: deps.home } : {});
  if (deps.refreshInstalledHost) refreshHostForPairedExtension();
  publishState();
  return listeningPort;
}

function refreshHostForPairedExtension(): void {
  const pairing = readPairing();
  if (!pairing) return;
  try {
    refreshInstalledHost({
      extensionId: pairing.extensionId,
      port: listeningPort,
      ...homeDirectory(),
      ...(extraDirectories().length > 0 ? { extraManifestDirectories: extraDirectories() } : {}),
    });
  } catch {
    return;
  }
}

export async function stopBrowserBridge(): Promise<void> {
  withdrawLocalClientBridge();
  for (const waiter of pollWaiters.splice(0)) waiter(null);
  for (const [id] of pendingResults) {
    takePendingResult(id)?.reject(
      new BrowserBridgeError(`${PRODUCT_NAMES.desktop} closed the browser bridge.`, 'cancelled'),
    );
  }
  pendingResults.clear();
  queuedCommands.length = 0;
  const instance = server;
  server = null;
  if (!instance) return;
  await new Promise<void>((resolve) => instance.close(() => resolve()));
}

/**
 * The extension is the only side that can act, so a command is parked until
 * its next poll and times out rather than sitting in the queue forever.
 */
export function sendBrowserCommand(
  command: BrowserCommand,
  args: Record<string, unknown>,
  siteRules?: { allow: string[]; deny: string[] },
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted)
    return Promise.reject(
      new BrowserBridgeError('The browser command was cancelled.', 'cancelled'),
    );
  const pairing = readPairing();
  if (!pairing) {
    return Promise.reject(
      new BrowserBridgeError(
        `No browser is paired with ${PRODUCT_NAMES.desktop} yet. Pair one in Settings.`,
        'not-paired',
      ),
    );
  }

  const request: BrowserCommandRequest = {
    version: BROWSER_COMMAND_PROTOCOL_VERSION,
    id: randomUUID(),
    command,
    args,
    ...(siteRules ? { siteRules } : {}),
  };

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!takePendingResult(request.id)) return;
      const index = queuedCommands.indexOf(request);
      if (index >= 0) queuedCommands.splice(index, 1);
      reject(new BrowserBridgeError('The paired browser did not answer.'));
    }, BROWSER_COMMAND_TIMEOUT_MS);
    const onAbort = (): void => {
      if (!takePendingResult(request.id)) return;
      const index = queuedCommands.indexOf(request);
      if (index >= 0) queuedCommands.splice(index, 1);
      reject(
        new BrowserBridgeError('The browser command was cancelled by its requester.', 'cancelled'),
      );
    };
    pendingResults.set(request.id, {
      resolve,
      reject,
      timer,
      ...(signal ? { signal, onAbort } : {}),
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    if (!pendingResults.has(request.id)) return;

    while (pollWaiters.length) if (pollWaiters.shift()!(request)) return;
    queuedCommands.push(request);
  });
}

export function installHostForPairedExtension(): string[] {
  const pairing = readPairing();
  if (!pairing) throw new BrowserBridgeError('Pair a browser before installing the host.');
  const { manifestPaths } = installNativeHost({
    extensionId: pairing.extensionId,
    port: listeningPort,
    ...homeDirectory(),
    ...(extraDirectories().length > 0 ? { extraManifestDirectories: extraDirectories() } : {}),
  });
  publishState();
  return manifestPaths;
}

/**
 * The one owner: the shell's Unpair control and the browser's own unpair both
 * land here, so the two cannot leave different state behind.
 */
export function removeHostAndPairing(): void {
  for (const waiter of pollWaiters.splice(0)) waiter(null);
  for (const [id] of pendingResults) {
    takePendingResult(id)?.reject(
      new BrowserBridgeError('The browser is no longer paired with this Mac.', 'not-paired'),
    );
  }
  pendingResults.clear();
  queuedCommands.length = 0;
  uninstallNativeHost(extraDirectories(), deps?.home);
  clearPairing();
  lastSeenMs = 0;
  publishState();
}

/** Bounded, so a runaway client cannot grow it without limit. */
const localClientActivity: BrowserActivityEntry[] = [];
const MAX_LOCAL_CLIENT_ACTIVITY = 200;

function activityTarget(args: Record<string, unknown>): string | null {
  for (const key of ['url', 'selector']) {
    const value = args[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function recordBrowserActivity(
  client: string,
  command: string,
  args: Record<string, unknown>,
): BrowserActivityEntry {
  const entry: BrowserActivityEntry = {
    atMs: Date.now(),
    client,
    command,
    target: activityTarget(args),
    outcome: 'running',
    error: null,
  };
  localClientActivity.push(entry);
  if (localClientActivity.length > MAX_LOCAL_CLIENT_ACTIVITY) localClientActivity.shift();
  console.debug(`[browser-bridge] ${client} ran ${command} in the paired browser`);
  return entry;
}

export function settleBrowserActivity(entry: BrowserActivityEntry, error: string | null): void {
  entry.outcome = error === null ? 'ok' : 'failed';
  entry.error = error;
}

export function listBrowserActivity(): BrowserActivityEntry[] {
  return localClientActivity.map((entry) => ({ ...entry })).reverse();
}

export function resetBridgeForTests(): void {
  pendingPairRequests.clear();
  queuedCommands.length = 0;
  pollWaiters.length = 0;
  pendingResults.clear();
  lastSeenMs = 0;
  listeningPort = 0;
  deps = null;
  server = null;
  startFailure = null;
}
