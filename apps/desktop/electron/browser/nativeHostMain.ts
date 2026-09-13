/**
 * The native messaging host the Chrome extension launches.
 *
 * It runs as a plain Node program (the packaged app re-executes Electron with
 * `ELECTRON_RUN_AS_NODE=1`), owns the session secret and the envelope
 * authentication, and relays every authenticated message to the running shell
 * over the loopback bridge. Nothing privileged happens here: a host process
 * without the shell answers "AGI Cloud is not running".
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import {
  BROWSER_BRIDGE_LOOPBACK_ADDRESS,
  BROWSER_BRIDGE_ROUTES,
  BROWSER_COMMAND_POLL_WINDOW_MS,
  NATIVE_HOST_TOKEN_HEADER,
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
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!token) {
    return { success: false, error: 'AGI Cloud has not registered this browser host.' };
  }
  try {
    const response = await fetch(bridgeUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [NATIVE_HOST_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({ extensionId, message }),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { success: false, error: `AGI Cloud refused the request (${response.status}).` };
    }
    const parsed = (await response.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, error: 'AGI Cloud returned an unreadable response.' };
    }
    return parsed as Record<string, unknown>;
  } catch {
    return { success: false, error: 'AGI Cloud is not running.' };
  }
}

function runNativeHost(): void {
  const session = new NativeSession(process.argv[2]);
  const token = readToken();
  const reader = createNativeMessageReader();

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
    const body = await relay(token, session.extensionId, envelope.message);
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

runNativeHost();
