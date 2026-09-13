import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  type BrowserPairRequestPrompt,
  type BrowserPairingState,
} from '@agiworkforce/local-runtime-contract';
import {
  BROWSER_BRIDGE_DEFAULT_PORT,
  BROWSER_BRIDGE_LOOPBACK_ADDRESS,
  BROWSER_BRIDGE_ROUTES,
  BROWSER_COMMAND_POLL_WINDOW_MS,
  BROWSER_COMMAND_PROTOCOL_VERSION,
  BROWSER_COMMAND_TIMEOUT_MS,
  BRIDGE_TOKEN_HEADER,
  MAX_PAIR_CONFIRM_ATTEMPTS,
  MAX_PENDING_PAIR_REQUESTS,
  NATIVE_BROWSER_POLL_MESSAGE,
  NATIVE_BROWSER_RESULT_MESSAGE,
  NATIVE_HOST_TOKEN_HEADER,
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  PAIR_REQUEST_TTL_MS,
  isBrowserCommandResult,
  isValidExtensionId,
  isValidPairCode,
  normalizePairCode,
  type BrowserCommand,
  type BrowserCommandRequest,
} from '@agiworkforce/types';
import { installNativeHost, installedManifestPaths, uninstallNativeHost } from './hostInstaller';
import { bridgeToken, clearPairing, hostToken, readPairing, savePairing } from './pairingStore';

const MAX_PAIR_BODY_BYTES = 4 * 1024;
const MAX_NATIVE_BODY_BYTES = 32 * 1024 * 1024;
const CONNECTION_IDLE_MS = 40_000;

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
}

type PollWaiter = (command: BrowserCommandRequest | null) => void;

export interface BridgeDependencies {
  onStateChanged: (state: BrowserPairingState) => void;
  onPairRequest: (prompt: BrowserPairRequestPrompt) => void;
  extraManifestDirectories?: readonly string[];
  port?: number;
  home?: string;
}

let server: Server | null = null;
let listeningPort = 0;
let deps: BridgeDependencies | null = null;
let lastSeenMs = 0;

const pendingPairRequests = new Map<string, PendingPairRequest>();
const queuedCommands: BrowserCommandRequest[] = [];
const pollWaiters: PollWaiter[] = [];
const pendingResults = new Map<string, PendingResult>();

export class BrowserBridgeError extends Error {}

function extraDirectories(): readonly string[] {
  return deps?.extraManifestDirectories ?? [];
}

function homeDirectory(): { home?: string } {
  return deps?.home ? { home: deps.home } : {};
}

function generatePairCode(): string {
  const bytes = randomBytes(PAIR_CODE_LENGTH);
  return Array.from(bytes)
    .map((byte) => PAIR_CODE_ALPHABET[byte % PAIR_CODE_ALPHABET.length])
    .join('');
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

function currentPrompt(): BrowserPairRequestPrompt | null {
  dropExpiredPairRequests(Date.now());
  for (const [requestId, request] of pendingPairRequests) {
    return {
      requestId,
      extensionId: request.extensionId,
      code: request.code,
      expiresAtMs: request.createdAtMs + PAIR_REQUEST_TTL_MS,
    };
  }
  return null;
}

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
  };
}

function publishState(): void {
  deps?.onStateChanged(pairingState());
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin || origin === 'null') return true;
  return origin.startsWith('chrome-extension://') || origin.startsWith('vscode-webview://');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    Connection: 'close',
  });
  response.end(payload);
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/plain',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    Connection: 'close',
  });
  response.end(body);
}

async function readBody(request: IncomingMessage, limit: number): Promise<string> {
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

function takeConfirmedPairRequest(requestId: string, suppliedCode: string): string {
  const now = Date.now();
  dropExpiredPairRequests(now);
  const request = pendingPairRequests.get(requestId);
  if (!request) throw new BrowserBridgeError('No pairing request is waiting for that code.');
  if (!codeMatches(normalizePairCode(suppliedCode), request.code)) {
    request.failedAttempts += 1;
    if (request.failedAttempts >= MAX_PAIR_CONFIRM_ATTEMPTS) {
      pendingPairRequests.delete(requestId);
      throw new BrowserBridgeError('Too many wrong codes. Start pairing again from Chrome.');
    }
    throw new BrowserBridgeError('That code does not match the one shown in AGI Cloud.');
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

function handlePairRequestRoute(response: ServerResponse, body: Record<string, unknown>): void {
  const extensionId = typeof body['extensionId'] === 'string' ? body['extensionId'].trim() : '';
  if (!isValidExtensionId(extensionId)) {
    sendText(response, 400, 'extensionId is required');
    return;
  }
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
  // After the answer, never before: showing the code is the shell's business
  // and a modal there must not hold the browser's request open.
  setImmediate(() => {
    deps?.onPairRequest(prompt);
    publishState();
  });
}

function handlePairConfirmRoute(response: ServerResponse, body: Record<string, unknown>): void {
  const requestId = typeof body['requestId'] === 'string' ? body['requestId'].trim() : '';
  const code = typeof body['code'] === 'string' ? body['code'] : '';
  if (!requestId || !isValidPairCode(code)) {
    sendText(response, 400, 'requestId and code are required');
    return;
  }
  let extensionId: string;
  try {
    extensionId = takeConfirmedPairRequest(requestId, code);
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
  request: IncomingMessage,
  response: ServerResponse,
  body: Record<string, unknown>,
): void {
  const extensionId = typeof body['extensionId'] === 'string' ? body['extensionId'].trim() : '';
  if (!isValidExtensionId(extensionId)) {
    sendText(response, 400, 'extensionId is required');
    return;
  }
  const supplied = request.headers[BRIDGE_TOKEN_HEADER];
  const expected = bridgeToken();
  const provided = typeof supplied === 'string' ? supplied : '';
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    sendText(response, 401, 'Unauthorized manifest install');
    return;
  }
  try {
    sendJson(response, 200, completePairing(extensionId, listeningPort));
  } catch (error) {
    sendText(response, 500, error instanceof Error ? error.message : 'Pairing failed');
  }
}

function nextQueuedCommand(): BrowserCommandRequest | null {
  return queuedCommands.shift() ?? null;
}

function handlePoll(response: ServerResponse): void {
  const queued = nextQueuedCommand();
  if (queued) {
    sendJson(response, 200, { success: true, command: queued });
    return;
  }

  let settled = false;
  const waiter: PollWaiter = (command) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    sendJson(response, 200, { success: true, command });
  };
  const timer = setTimeout(() => {
    const index = pollWaiters.indexOf(waiter);
    if (index >= 0) pollWaiters.splice(index, 1);
    waiter(null);
  }, BROWSER_COMMAND_POLL_WINDOW_MS);
  pollWaiters.push(waiter);
}

function handleCommandResult(body: Record<string, unknown>): void {
  const result = body['result'];
  if (!isBrowserCommandResult(result)) return;
  const pending = pendingResults.get(result.id);
  if (!pending) return;
  pendingResults.delete(result.id);
  clearTimeout(pending.timer);
  if (result.ok) {
    pending.resolve(result.value);
  } else {
    pending.reject(new BrowserBridgeError(result.error ?? 'The browser refused that action.'));
  }
}

function handleNativeMessageRoute(
  request: IncomingMessage,
  response: ServerResponse,
  body: Record<string, unknown>,
): void {
  const supplied = request.headers[NATIVE_HOST_TOKEN_HEADER];
  const expected = hostToken();
  const provided = typeof supplied === 'string' ? supplied : '';
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    sendText(response, 401, 'Unauthorized native host');
    return;
  }

  const pairing = readPairing();
  const extensionId = typeof body['extensionId'] === 'string' ? body['extensionId'] : null;
  if (!pairing || !extensionId || extensionId !== pairing.extensionId) {
    sendJson(response, 200, {
      success: false,
      error: 'This browser is not paired with AGI Cloud. Pair it from Settings, Capabilities.',
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
  if (type === NATIVE_BROWSER_POLL_MESSAGE) {
    handlePoll(response);
    return;
  }
  if (type === NATIVE_BROWSER_RESULT_MESSAGE) {
    handleCommandResult(message as Record<string, unknown>);
    sendJson(response, 200, { success: true });
    return;
  }
  sendJson(response, 200, { success: true });
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
  const known =
    isNative ||
    path === BROWSER_BRIDGE_ROUTES.pair ||
    path === BROWSER_BRIDGE_ROUTES.pairRequest ||
    path === BROWSER_BRIDGE_ROUTES.pairConfirm;

  if (request.method !== 'POST' || !known) {
    sendText(response, 404, `Not found: ${request.method ?? ''} ${path}`);
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = parseJsonBody(
      await readBody(request, isNative ? MAX_NATIVE_BODY_BYTES : MAX_PAIR_BODY_BYTES),
    );
  } catch (error) {
    sendText(response, 400, error instanceof Error ? error.message : 'Bad Request');
    return;
  }

  if (isNative) {
    handleNativeMessageRoute(request, response, body);
    return;
  }
  if (path === BROWSER_BRIDGE_ROUTES.pairRequest) {
    handlePairRequestRoute(response, body);
    return;
  }
  if (path === BROWSER_BRIDGE_ROUTES.pairConfirm) {
    handlePairConfirmRoute(response, body);
    return;
  }
  handlePairLegacyRoute(request, response, body);
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

  await new Promise<void>((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(port, BROWSER_BRIDGE_LOOPBACK_ADDRESS, () => {
      instance.removeListener('error', reject);
      resolve();
    });
  });

  server = instance;
  const address = instance.address();
  listeningPort = typeof address === 'object' && address ? address.port : port;
  publishState();
  return listeningPort;
}

export async function stopBrowserBridge(): Promise<void> {
  for (const waiter of pollWaiters.splice(0)) waiter(null);
  for (const [, pending] of pendingResults) {
    clearTimeout(pending.timer);
    pending.reject(new BrowserBridgeError('AGI Cloud closed the browser bridge.'));
  }
  pendingResults.clear();
  queuedCommands.length = 0;
  const instance = server;
  server = null;
  if (!instance) return;
  await new Promise<void>((resolve) => instance.close(() => resolve()));
}

/**
 * Hands one command to the paired browser and waits for its answer.
 *
 * The extension is the only side that can act, so a desktop command is parked
 * until the extension's next poll; if nothing is polling, the command times out
 * rather than sitting in the queue forever.
 */
export function sendBrowserCommand(
  command: BrowserCommand,
  args: Record<string, unknown>,
): Promise<unknown> {
  const pairing = readPairing();
  if (!pairing) {
    return Promise.reject(
      new BrowserBridgeError('No browser is paired with AGI Cloud yet. Pair one in Settings.'),
    );
  }

  const request: BrowserCommandRequest = {
    version: BROWSER_COMMAND_PROTOCOL_VERSION,
    id: randomUUID(),
    command,
    args,
  };

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResults.delete(request.id);
      const index = queuedCommands.indexOf(request);
      if (index >= 0) queuedCommands.splice(index, 1);
      reject(new BrowserBridgeError('The paired browser did not answer.'));
    }, BROWSER_COMMAND_TIMEOUT_MS);
    pendingResults.set(request.id, { resolve, reject, timer });

    const waiter = pollWaiters.shift();
    if (waiter) {
      waiter(request);
    } else {
      queuedCommands.push(request);
    }
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

export function removeHostAndPairing(): void {
  uninstallNativeHost(extraDirectories(), deps?.home);
  clearPairing();
  lastSeenMs = 0;
  publishState();
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
}
