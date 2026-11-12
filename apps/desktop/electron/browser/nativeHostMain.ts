/**
 * The native messaging host the Chrome extension launches.
 *
 * The packaged app starts this process with `AGI_NATIVE_MESSAGING_HOST=1`.
 * The bootstrap loads this file instead of the windowed shell. It owns the
 * session secret and the envelope authentication, and relays every
 * authenticated message to the running shell over the loopback bridge. Nothing
 * privileged happens here: a host process without the shell answers that the
 * desktop is not running. Stdout is the native-messaging stream, so this file
 * must not log.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_BRIDGE_LOOPBACK_ADDRESS,
  BROWSER_BRIDGE_ROUTES,
  BROWSER_COMMAND_POLL_WINDOW_MS,
  NATIVE_HOST_TOKEN_HEADER,
  PRODUCT_NAMES,
} from '@agiworkforce/types';
import { createNativeMessageReader, encodeNativeMessage } from './framing';
import { EnvelopeRejected, NativeSession, parseEnvelope } from './envelope';

const RELAY_TIMEOUT_MS = BROWSER_COMMAND_POLL_WINDOW_MS + 10_000;

function readToken(): string {
  const tokenPath = process.env['AGI_CLOUD_HOST_TOKEN_FILE'];
  if (!tokenPath) return '';
  try {
    return readFileSync(tokenPath, 'utf8').trim();
  } catch {
    return '';
  }
}

function bridgeUrl(): string {
  const port = Number.parseInt(process.env['AGI_CLOUD_BRIDGE_PORT'] ?? '', 10);
  return `http://${BROWSER_BRIDGE_LOOPBACK_ADDRESS}:${port}${BROWSER_BRIDGE_ROUTES.nativeMessage}`;
}

async function relay(
  token: string,
  extensionId: string | null,
  pairToken: string | null,
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!token) {
    return {
      success: false,
      error: `${PRODUCT_NAMES.desktop} has not registered this browser host.`,
    };
  }
  try {
    const response = await fetch(bridgeUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [NATIVE_HOST_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({ extensionId, pairToken, message }),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        success: false,
        error: `${PRODUCT_NAMES.desktop} refused the request (${response.status}).`,
      };
    }
    const parsed = (await response.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, error: `${PRODUCT_NAMES.desktop} returned an unreadable response.` };
    }
    return parsed as Record<string, unknown>;
  } catch {
    return { success: false, error: `${PRODUCT_NAMES.desktop} is not running.` };
  }
}

function pairTokenFromConnect(message: Record<string, unknown>): string | null {
  const supplied = message['pair_token'];
  return typeof supplied === 'string' && supplied.length > 0 ? supplied : null;
}

function withoutPairToken(message: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'pair_token'));
}

function extensionOriginFromArgv(argv: readonly string[]): string | undefined {
  return argv.find((entry) => entry.startsWith('chrome-extension://'));
}

function launchedAsThisFile(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function runNativeHost(): void {
  const session = new NativeSession(extensionOriginFromArgv(process.argv));
  const token = readToken();
  const reader = createNativeMessageReader();
  let pairToken: string | null = null;

  const write = (payload: Record<string, unknown>): void => {
    process.stdout.write(encodeNativeMessage(payload));
  };

  const handle = async (raw: unknown): Promise<void> => {
    const now = Date.now();
    let envelope;
    try {
      envelope = parseEnvelope(raw);
      session.authenticate(envelope, now);
    } catch (error) {
      const id = envelope?.id ?? '';
      const body = {
        success: false,
        error: error instanceof EnvelopeRejected ? error.message : 'Native request rejected.',
      };
      write(session.isEstablished ? session.signResponse(id, body, Date.now()) : { ...body, id });
      return;
    }

    const isConnect = envelope.message['type'] === 'connect';
    if (isConnect) pairToken = pairTokenFromConnect(envelope.message);
    const body = await relay(
      token,
      session.extensionId,
      pairToken,
      isConnect ? withoutPairToken(envelope.message) : envelope.message,
    );
    const signed = session.signResponse(envelope.id, body, Date.now());
    write(isConnect ? { ...signed, session_secret: session.secretHex } : signed);
  };

  process.stdin.on('data', (chunk: Buffer) => {
    let messages: unknown[];
    try {
      messages = reader.push(chunk);
    } catch {
      process.exit(1);
      return;
    }
    for (const message of messages) void handle(message);
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

if (process.env['AGI_NATIVE_MESSAGING_HOST'] === '1' || launchedAsThisFile()) {
  runNativeHost();
}
