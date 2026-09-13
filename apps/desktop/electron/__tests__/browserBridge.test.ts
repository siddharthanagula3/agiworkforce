import { promises as fs, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_COMMAND_PROTOCOL_VERSION,
  NATIVE_BROWSER_POLL_MESSAGE,
  NATIVE_BROWSER_RESULT_MESSAGE,
  PAIR_CODE_LENGTH,
} from '@agiworkforce/types';

let userData: string;
let appPath: string;
let home: string;

vi.mock('electron', () => ({
  app: {
    getPath: () => userData,
    getAppPath: () => appPath,
  },
}));

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-bridge-'));
  userData = path.join(base, 'userData');
  appPath = path.join(base, 'app');
  home = path.join(base, 'home');
  mkdirSync(userData, { recursive: true });
  mkdirSync(path.join(appPath, 'electron', 'dist'), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(appPath, 'electron', 'dist', 'native-host.cjs'), '// host\n');
});

afterAll(async () => {
  await fs.rm(path.dirname(userData), { recursive: true, force: true });
});

async function freshBridge() {
  vi.resetModules();
  const pairingStore = await import('../browser/pairingStore');
  pairingStore.resetPairingCacheForTests();
  const bridge = await import('../browser/bridgeServer');
  bridge.resetBridgeForTests();
  const port = await bridge.startBrowserBridge({
    onStateChanged: () => undefined,
    onPairRequest: () => undefined,
    port: 0,
    home,
  });
  return { bridge, pairingStore, port };
}

describe('native message framing', () => {
  it('round-trips a message across split chunks', async () => {
    const { createNativeMessageReader, encodeNativeMessage } = await import('../browser/framing');
    const encoded = encodeNativeMessage({ id: 'a', message: { type: 'ping' } });
    const reader = createNativeMessageReader();

    expect(reader.push(encoded.subarray(0, 3))).toEqual([]);
    expect(reader.push(encoded.subarray(3))).toEqual([{ id: 'a', message: { type: 'ping' } }]);
    expect(reader.pending()).toBe(0);
  });

  it('refuses a length prefix beyond the accepted size', async () => {
    const { createNativeMessageReader, MAX_INBOUND_MESSAGE_BYTES } =
      await import('../browser/framing');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(MAX_INBOUND_MESSAGE_BYTES + 1, 0);
    expect(() => createNativeMessageReader().push(header)).toThrow(/accepted size/);
  });
});

describe('native session handshake', () => {
  it('accepts an unsigned connect, then requires a matching MAC', async () => {
    const { NativeSession, signPayload } = await import('../browser/envelope');
    const session = new NativeSession(`chrome-extension://${EXTENSION_ID}/`);
    const now = Date.now();

    session.authenticate(
      {
        id: 'r1',
        timestamp: now,
        mac: null,
        message: { type: 'connect', extension_id: EXTENSION_ID },
      },
      now,
    );
    expect(session.extensionId).toBe(EXTENSION_ID);

    const message = { type: 'ping' };
    const mac = signPayload(session.secret, 'r2', now, message);
    expect(() =>
      session.authenticate({ id: 'r2', timestamp: now, mac, message }, now),
    ).not.toThrow();
    expect(() => session.authenticate({ id: 'r2', timestamp: now, mac, message }, now)).toThrow(
      /replay/i,
    );
  });

  it('refuses a connect that does not match the launch origin', async () => {
    const { NativeSession } = await import('../browser/envelope');
    const session = new NativeSession(`chrome-extension://${EXTENSION_ID}/`);
    const now = Date.now();
    expect(() =>
      session.authenticate(
        {
          id: 'r1',
          timestamp: now,
          mac: null,
          message: { type: 'connect', extension_id: 'ponmlkjihgfedcbaponmlkjihgfedcba' },
        },
        now,
      ),
    ).toThrow(/launch origin/);
  });

  it('refuses an unsigned request before the handshake and an expired envelope', async () => {
    const { NativeSession } = await import('../browser/envelope');
    const session = new NativeSession();
    const now = Date.now();
    expect(() =>
      session.authenticate({ id: 'r1', timestamp: now, mac: null, message: { type: 'ping' } }, now),
    ).toThrow(/before the authenticated connect handshake/);
    expect(() =>
      session.authenticate(
        {
          id: 'r2',
          timestamp: now - 60_000,
          mac: null,
          message: { type: 'connect', extension_id: EXTENSION_ID },
        },
        now,
      ),
    ).toThrow(/expired/);
  });

  it('signs a response the extension can verify over the body alone', async () => {
    const { NativeSession } = await import('../browser/envelope');
    const session = new NativeSession();
    const now = Date.now();
    session.authenticate(
      {
        id: 'r1',
        timestamp: now,
        mac: null,
        message: { type: 'connect', extension_id: EXTENSION_ID },
      },
      now,
    );

    const signed = session.signResponse('r1', { success: true }, now);
    const body: Record<string, unknown> = { ...signed };
    delete body['id'];
    delete body['mac'];
    delete body['timestamp'];

    const expected = createHmac('sha256', session.secret)
      .update(`r1|${now}|${JSON.stringify(body)}`)
      .digest('hex');
    expect(signed['mac']).toBe(expected);
  });
});

describe('loopback pairing bridge', () => {
  let context: Awaited<ReturnType<typeof freshBridge>>;

  beforeEach(async () => {
    context = await freshBridge();
  });

  afterEach(async () => {
    await context.bridge.stopBrowserBridge();
  });

  function url(route: string): string {
    return `http://127.0.0.1:${context.port}${route}`;
  }

  it('binds loopback only', () => {
    expect(context.bridge.isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(context.bridge.isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(context.bridge.isLoopbackAddress('192.168.1.4')).toBe(false);
    expect(context.bridge.pairingState().bridgeListening).toBe(true);
  });

  it('refuses a web page origin', async () => {
    const response = await fetch(url('/pair/request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ extensionId: EXTENSION_ID }),
    });
    expect(response.status).toBe(403);
  });

  it('keeps the code off the request response and pairs only with it', async () => {
    const requested = await fetch(url('/pair/request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: `chrome-extension://${EXTENSION_ID}` },
      body: JSON.stringify({ extensionId: EXTENSION_ID }),
    });
    const opened = (await requested.json()) as Record<string, unknown>;
    expect(opened['codeLength']).toBe(PAIR_CODE_LENGTH);
    expect(JSON.stringify(opened)).not.toContain(
      context.bridge.pairingState().pendingRequest?.code ?? 'no-code',
    );

    const prompt = context.bridge.pairingState().pendingRequest;
    expect(prompt?.extensionId).toBe(EXTENSION_ID);

    const wrong = await fetch(url('/pair/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: opened['requestId'], code: 'AAAAAAAA' }),
    });
    expect(wrong.status).toBe(401);

    const confirmed = await fetch(url('/pair/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: opened['requestId'], code: prompt?.code }),
    });
    const issued = (await confirmed.json()) as Record<string, unknown>;
    expect(issued['nativeHostManifestInstalled']).toBe(true);
    expect(String(issued['token'])).toMatch(/^[a-f0-9]{64}$/);
    expect(context.bridge.pairingState().paired).toBe(true);
    expect(context.bridge.pairingState().hostInstalled).toBe(true);
  });

  it('refuses a native message without the host token', async () => {
    const response = await fetch(url('/native/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensionId: EXTENSION_ID, message: { type: 'ping' } }),
    });
    expect(response.status).toBe(401);
  });

  it('carries a command to the extension and its result back', async () => {
    const prompt = await (async () => {
      await fetch(url('/pair/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionId: EXTENSION_ID }),
      });
      return context.bridge.pairingState().pendingRequest;
    })();
    const opened = context.bridge.pairingState().pendingRequest;
    await fetch(url('/pair/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: opened?.requestId, code: prompt?.code }),
    });

    const token = context.pairingStore.hostToken();
    const pending = context.bridge.sendBrowserCommand('browser_read_page', {});

    const polled = await fetch(url('/native/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Native-Host-Token': token },
      body: JSON.stringify({
        extensionId: EXTENSION_ID,
        message: { type: NATIVE_BROWSER_POLL_MESSAGE, version: BROWSER_COMMAND_PROTOCOL_VERSION },
      }),
    });
    const delivered = (await polled.json()) as { command?: { id: string; command: string } };
    expect(delivered.command?.command).toBe('browser_read_page');

    await fetch(url('/native/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Native-Host-Token': token },
      body: JSON.stringify({
        extensionId: EXTENSION_ID,
        message: {
          type: NATIVE_BROWSER_RESULT_MESSAGE,
          result: {
            version: BROWSER_COMMAND_PROTOCOL_VERSION,
            id: delivered.command?.id,
            ok: true,
            value: { url: 'https://example.com', title: 'Example', text: 'hello' },
          },
        },
      }),
    });

    await expect(pending).resolves.toEqual({
      url: 'https://example.com',
      title: 'Example',
      text: 'hello',
    });
    expect(context.bridge.pairingState().connected).toBe(true);
  });

  it('refuses a native message from an extension that is not the paired one', async () => {
    const token = context.pairingStore.hostToken();
    const response = await fetch(url('/native/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Native-Host-Token': token },
      body: JSON.stringify({
        extensionId: 'ponmlkjihgfedcbaponmlkjihgfedcba',
        message: { type: 'ping' },
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body['success']).toBe(false);
    expect(String(body['error'])).toMatch(/not paired/i);
  });

  it('refuses a command while nothing is paired', async () => {
    context.bridge.removeHostAndPairing();
    await expect(
      context.bridge.sendBrowserCommand('browser_click', { selector: 'a' }),
    ).rejects.toThrow(/No browser is paired/);
  });
});
