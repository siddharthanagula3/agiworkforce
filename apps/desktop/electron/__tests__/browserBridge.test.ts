import { promises as fs, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_BRIDGE_ROUTES,
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

async function freshBridge(
  overrides: Partial<
    Parameters<typeof import('../browser/bridgeServer').startBrowserBridge>[0]
  > = {},
) {
  vi.resetModules();
  const pairingStore = await import('../browser/pairingStore');
  pairingStore.resetPairingCacheForTests();
  const bridge = await import('../browser/bridgeServer');
  const localClient = await import('../browser/localClient');
  bridge.resetBridgeForTests();
  const port = await bridge.startBrowserBridge({
    onStateChanged: () => undefined,
    onPairRequest: () => undefined,
    port: 0,
    home,
    ...overrides,
  });
  return { bridge, pairingStore, localClient, port };
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

  it('stands down rather than fighting another app for the bridge port', async () => {
    const taken = context.port;
    const second = await (async () => {
      vi.resetModules();
      const bridge = await import('../browser/bridgeServer');
      bridge.resetBridgeForTests();
      return bridge;
    })();

    const secondHome = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-bridge-second-'));
    await expect(
      second.startBrowserBridge({
        onStateChanged: () => undefined,
        onPairRequest: () => undefined,
        port: taken,
        home: secondHome,
      }),
    ).rejects.toThrow(/already using the browser bridge on port/);

    // The app that lost keeps its hands off the file the running one published,
    // which is the only thing a local client reads to find the bridge.
    await expect(
      fs.stat(path.join(secondHome, '.agiworkforce', 'desktop-bridge.json')),
    ).rejects.toThrow();
    // And the one that had the port is untouched.
    expect(context.bridge.pairingState().bridgeListening).toBe(true);
    await fs.rm(secondHome, { recursive: true, force: true });
  });

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

  /**
   * The routes come from the contract, not from a list here, so a route added
   * later is checked the day it exists. Two of them are the pairing handshake
   * itself, which cannot present a token because issuing one is what it does;
   * they are held to the code the user reads off their own screen instead,
   * which the case above proves, and neither one acts on the browser.
   */
  const ISSUES_THE_GRANT: readonly string[] = [
    BROWSER_BRIDGE_ROUTES.pairRequest,
    BROWSER_BRIDGE_ROUTES.pairConfirm,
  ];

  it('refuses every route that acts on the browser to a caller holding no grant', async () => {
    const routes = Object.values(BROWSER_BRIDGE_ROUTES);
    expect(routes.length).toBeGreaterThan(0);

    const privileged = routes.filter((route) => !ISSUES_THE_GRANT.includes(route));
    expect(privileged).toHaveLength(routes.length - ISSUES_THE_GRANT.length);

    for (const route of privileged) {
      const response = await fetch(url(route), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          extensionId: EXTENSION_ID,
          message: { type: 'ping' },
          command: 'browser_read_page',
          args: {},
          client: { name: 'agi' },
        }),
      });
      expect(response.status, route).toBe(401);
    }
  });

  it('refuses every route to a caller that is not on this machine', async () => {
    for (const route of Object.values(BROWSER_BRIDGE_ROUTES)) {
      const response = await fetch(url(route), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify({ extensionId: EXTENSION_ID }),
      });
      expect(response.status, route).toBe(403);
    }
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

/**
 * The CLI is another program on this machine, not the paired extension. It
 * gets its own token, its own two routes, and the same gate the renderer goes
 * through, scoped to the client that asked.
 */
describe('local client routes', () => {
  let context: Awaited<ReturnType<typeof freshBridge>>;
  let calls: {
    command: string;
    args: Record<string, unknown>;
    caller: { name: string; label: string };
  }[];
  let outcome: { ok: boolean; value?: unknown; error?: string; code?: string };

  beforeEach(async () => {
    calls = [];
    outcome = { ok: true, value: { title: 'Example' } };
    context = await freshBridge({
      appVersion: '1.7.1',
      runBrowserCommand: async (command, args, caller) => {
        calls.push({ command, args, caller });
        return outcome;
      },
    });
    // A pairing written by an earlier case persists on disk, and a test that
    // silently started paired would assert nothing about the unpaired path.
    context.pairingStore.clearPairing();
  });

  afterEach(async () => {
    await context.bridge.stopBrowserBridge();
  });

  function url(route: string): string {
    return `http://127.0.0.1:${context.port}${route}`;
  }

  function post(route: string, body: unknown, token?: string | null): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const presented = token === undefined ? context.localClient.localClientToken() : token;
    if (presented) headers['x-local-client-token'] = presented;
    return fetch(url(route), { method: 'POST', headers, body: JSON.stringify(body) });
  }

  function pairBrowser(): void {
    context.pairingStore.savePairing(EXTENSION_ID);
  }

  it('writes a 0600 bridge file when the bridge starts and removes it when it stops', async () => {
    const filePath = path.join(home, '.agiworkforce', 'desktop-bridge.json');
    const file = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
    expect(file['version']).toBe(1);
    expect(file['port']).toBe(context.port);
    expect(file['pid']).toBe(process.pid);
    expect(String(file['token'])).toHaveLength(64);
    // The token in this file is the whole grant: anything that can read it can
    // ask the shell to act in the user's signed-in browser.
    const mode = (await fs.stat(filePath)).mode & 0o777;
    expect(mode).toBe(0o600);

    await context.bridge.stopBrowserBridge();
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it('answers the pairing state to a client holding the token', async () => {
    const unpaired = (await (await post('/client/state', { version: 1 })).json()) as Record<
      string,
      unknown
    >;
    expect(unpaired['paired']).toBe(false);
    expect(unpaired['appVersion']).toBe('1.7.1');

    pairBrowser();
    const paired = (await (await post('/client/state', { version: 1 })).json()) as Record<
      string,
      unknown
    >;
    expect(paired['paired']).toBe(true);
    expect(paired['extensionId']).toBe(EXTENSION_ID);
  });

  it('refuses both routes without the token, and says which problem it is', async () => {
    pairBrowser();
    for (const route of ['/client/state', '/client/command']) {
      const response = await post(route, { version: 1 }, null);
      expect(response.status).toBe(401);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body['code']).toBe('unauthorized');
    }

    const wrong = await post('/client/command', { version: 1 }, 'a'.repeat(64));
    expect(wrong.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('refuses a command from a client on another revision, without running it', async () => {
    pairBrowser();

    for (const [version, expected] of [
      [2, /This app is older/],
      [0, /older than the app/],
    ] as const) {
      const response = await post('/client/command', {
        version,
        command: 'browser_read_page',
        args: {},
        client: { name: 'agi' },
      });

      expect(response.status, String(version)).toBe(409);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body['ok']).toBe(false);
      expect(String(body['error'])).toMatch(expected);
      // The shell says which revision it speaks, so the other side can name
      // the version to install rather than guess.
      expect(body['version']).toBe(1);
      // Nothing about the mismatch reads as a pairing problem, which is what
      // sent a user to re-pair a browser that was fine.
      expect(String(body['error'])).not.toMatch(/pair/i);
      expect(body['code']).toBeUndefined();
    }

    expect(calls).toHaveLength(0);
  });

  it('refuses a command that names no revision at all', async () => {
    pairBrowser();
    const response = await post('/client/command', {
      command: 'browser_read_page',
      args: {},
      client: { name: 'agi' },
    });

    expect(response.status).toBe(409);
    expect(String(((await response.json()) as Record<string, unknown>)['error'])).toMatch(
      /did not say which version/,
    );
    expect(calls).toHaveLength(0);
  });

  it('runs a command through the shell gate, naming who asked', async () => {
    pairBrowser();
    const response = await post('/client/command', {
      version: 1,
      command: 'browser_read_page',
      args: {},
      client: { name: 'agi', cwd: '/work/project' },
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['value']).toEqual({ title: 'Example' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('browser_read_page');
    // The grant is scoped to the client, so the user answers once for "agi"
    // rather than once for every program that reaches the bridge.
    expect(calls[0]?.caller.name).toBe('agi');
    // The prompt asks in words: a subject the user recognises and the folder
    // by name, with the path kept whole for the body.
    expect(calls[0]?.caller.subject).toBe('The AGI CLI');
    expect(calls[0]?.caller.folder).toBe('project');
    expect(calls[0]?.caller.path).toBe('/work/project');
  });

  it('passes a refusal back with the code the gate chose', async () => {
    pairBrowser();
    outcome = { ok: false, error: 'Permission refused.', code: 'permission-denied' };
    const body = (await (
      await post('/client/command', {
        version: 1,
        command: 'browser_click',
        args: { selector: '#buy' },
        client: { name: 'agi' },
      })
    ).json()) as Record<string, unknown>;
    expect(body['ok']).toBe(false);
    expect(body['code']).toBe('permission-denied');
  });

  it('answers not-paired rather than running the gate when no browser is paired', async () => {
    const body = (await (
      await post('/client/command', {
        version: 1,
        command: 'browser_read_page',
        args: {},
        client: { name: 'agi' },
      })
    ).json()) as Record<string, unknown>;
    expect(body['code']).toBe('not-paired');
    expect(calls).toHaveLength(0);
  });

  // A revision this app does not speak is answered separately, above: it is a
  // different problem from a command this app has no such thing as, and
  // reporting both as malformed is what sent a user hunting for a typo.
  it('refuses a malformed command before it reaches the gate', async () => {
    pairBrowser();
    for (const body of [
      { version: 1, command: 'browser_teleport', args: {}, client: { name: 'agi' } },
      { version: 1, command: 'browser_read_page', args: {}, client: { name: '  ' } },
      { version: 1, command: 'browser_read_page', args: {} },
    ]) {
      const response = await post('/client/command', body);
      expect(response.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('is reachable only over loopback', () => {
    expect(context.bridge.isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(context.bridge.isLoopbackAddress('10.0.0.7')).toBe(false);
  });

  /// A page that refused an action and a browser that never answered need
  /// different things from the user, so they cannot share one code.
  it('keeps a page refusal apart from a browser that never answered', async () => {
    pairBrowser();
    const { BrowserBridgeError } = context.bridge;
    for (const [thrown, expected] of [
      [new BrowserBridgeError('site not approved', 'permission-denied'), 'permission-denied'],
      [new BrowserBridgeError('nothing polled'), 'timeout'],
      [new BrowserBridgeError('bridge closed', 'cancelled'), 'cancelled'],
    ] as const) {
      const failing = await freshBridge({
        appVersion: '1.7.1',
        runBrowserCommand: async () => {
          throw thrown;
        },
      });
      failing.pairingStore.savePairing(EXTENSION_ID);
      const response = await fetch(`http://127.0.0.1:${failing.port}/client/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-local-client-token': failing.localClient.localClientToken() ?? '',
        },
        body: JSON.stringify({
          version: 1,
          command: 'browser_read_page',
          args: {},
          client: { name: 'agi' },
        }),
      });
      const body = (await response.json()) as Record<string, unknown>;
      expect(body['code']).toBe(expected);
      await failing.bridge.stopBrowserBridge();
    }
  });

  /// A prompt the user cannot read is not a question. The client gets a name
  /// in words, the folder is named on its own, and the path is never cut.
  it('describes a client in words, with the folder named and the path whole', async () => {
    const { describeLocalClient } = context.localClient;
    expect(describeLocalClient({ name: 'agi' })).toEqual({
      subject: 'The AGI CLI',
      folder: null,
      path: null,
      label: 'The AGI CLI',
    });

    const described = describeLocalClient({ name: 'agi', cwd: '/work/qa-project' });
    expect(described.subject).toBe('The AGI CLI');
    expect(described.folder).toBe('qa-project');
    expect(described.path).toBe('/work/qa-project');
    expect(described.label).toBe('The AGI CLI in qa-project');

    // Home collapses to ~, and a long path outside it is kept whole rather
    // than cut down to the prefix every path on this machine shares.
    const home = os.homedir();
    expect(describeLocalClient({ name: 'agi', cwd: `${home}/work/app` }).path).toBe('~/work/app');
    expect(describeLocalClient({ name: 'agi', cwd: home }).path).toBe('~');
    const long = `/private/tmp/${'a'.repeat(120)}/qa-project`;
    const longDescribed = describeLocalClient({ name: 'agi', cwd: long });
    expect(longDescribed.path).toBe(long);
    expect(longDescribed.folder).toBe('qa-project');

    // A client this shell has no words for keeps its own name rather than
    // being described as something it is not.
    expect(describeLocalClient({ name: 'some-tool' }).subject).toBe('some-tool');
  });

  /// The two sides must not disagree about whether a pairing exists: a shell
  /// that keeps its record after the browser forgets leaves every local client
  /// offering tools that can never answer.
  it('drops its pairing when the browser says it has unpaired', async () => {
    pairBrowser();
    expect(context.bridge.pairingState().paired).toBe(true);

    const token = context.pairingStore.hostToken();
    const response = await fetch(url('/native/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Native-Host-Token': token },
      body: JSON.stringify({
        extensionId: EXTENSION_ID,
        message: { type: 'desktop_browser_unpair' },
      }),
    });
    expect(((await response.json()) as Record<string, unknown>)['success']).toBe(true);
    expect(context.bridge.pairingState().paired).toBe(false);

    // And a client asking now is told which problem it has.
    const body = (await (
      await post('/client/command', {
        version: 1,
        command: 'browser_read_page',
        args: {},
        client: { name: 'agi' },
      })
    ).json()) as Record<string, unknown>;
    expect(body['code']).toBe('not-paired');
  });

  /// A command already waiting when the pairing goes cannot ever be answered,
  /// so it is failed with the reason rather than left to time out.
  it('fails a waiting command when the pairing is dropped', async () => {
    pairBrowser();
    const pending = context.bridge.sendBrowserCommand('browser_read_page', {});
    context.bridge.removeHostAndPairing();
    await expect(pending).rejects.toThrow(/no longer paired/i);
  });

  it('records each command against the client that asked', async () => {
    pairBrowser();
    await post('/client/command', {
      version: 1,
      command: 'browser_read_page',
      args: {},
      client: { name: 'agi', cwd: '/work/project' },
    });
    const activity = context.bridge.listLocalClientActivity();
    expect(activity.at(-1)?.client).toBe('The AGI CLI in project');
    expect(activity.at(-1)?.command).toBe('browser_read_page');
  });
});
