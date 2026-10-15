// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetStateForTesting,
  startPairing,
  storeBridgeSecret,
  submitPairingCode,
  requestPairing,
} from '../src/features/native-bridge/pairing';

const local: Record<string, unknown> = {};
const session: Record<string, unknown> = {};
const servers: Server[] = [];
function storage(items: Record<string, unknown>) {
  return {
    get: (keys: string | string[], callback: (value: Record<string, unknown>) => void) =>
      callback(
        Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, items[key]])),
      ),
    set: (value: Record<string, unknown>, callback?: () => void) => {
      Object.assign(items, value);
      callback?.();
    },
    remove: (keys: string | string[], callback?: () => void) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete items[key];
      callback?.();
    },
  };
}
async function server(handler: Parameters<typeof createServer>[0]): Promise<string> {
  const instance = createServer(handler);
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  if (!address || typeof address === 'string') throw new Error('Test server has no TCP port');
  return `http://127.0.0.1:${address.port}`;
}
beforeEach(() => {
  _resetStateForTesting();
  for (const key of Object.keys(local)) delete local[key];
  for (const key of Object.keys(session)) delete session[key];
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'abcdefghijklmnopabcdefghijklmnop',
      lastError: null,
      sendMessage: async () => ({ success: true }),
    },
    storage: { local: storage(local), session: storage(session) },
  });
});
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (instance) =>
          new Promise<void>((resolve, reject) =>
            instance.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  vi.unstubAllGlobals();
});

describe('pairing uses the canonical loopback transport', () => {
  it('preserves the normal code handshake over real HTTP without an operator secret', async () => {
    const paths: string[] = [];
    local['agi_bridge_url'] = await server(async (request, response) => {
      paths.push(request.url!);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
      response.setHeader('content-type', 'application/json');
      if (request.url === '/pair/request')
        response.end(
          JSON.stringify({ requestId: 'a'.repeat(32), codeLength: 8, expiresInMs: 120000 }),
        );
      else {
        expect(body.code).toBe('ABCD2345');
        response.end(
          JSON.stringify({
            token: 'b'.repeat(64),
            fingerprint: 'bbbbbbbb',
            nativeHostManifestInstalled: true,
          }),
        );
      }
    });
    expect((await startPairing()).phase).toBe('awaiting-code');
    expect((await submitPairingCode('abcd-2345')).phase).toBe('paired');
    expect(paths).toEqual(['/pair/request', '/pair/confirm']);
    expect(session['agi_bridge_secret']).toBeUndefined();
  });

  it.each(['code', 'operator-secret'] as const)(
    'never follows a 307 redirect carrying a %s credential',
    async (credential) => {
      const received = vi.fn();
      const destination = await server((request, response) => {
        received(request.url);
        response.end('{}');
      });
      local['agi_bridge_url'] = await server((request, response) => {
        if (request.url === '/pair/request') {
          response.setHeader('content-type', 'application/json');
          response.end(
            JSON.stringify({ requestId: 'a'.repeat(32), codeLength: 8, expiresInMs: 120000 }),
          );
        } else {
          response.writeHead(307, { Location: `${destination}/unexpected-credential` });
          response.end();
        }
      });
      if (credential === 'code') {
        expect((await startPairing()).phase).toBe('awaiting-code');
        expect((await submitPairingCode('ABCD2345')).phase).toBe('error');
      } else {
        await storeBridgeSecret('b'.repeat(64));
        expect((await requestPairing()).phase).toBe('error');
      }
      expect(received).not.toHaveBeenCalled();
      expect(session['agi_pair_token']).toBeUndefined();
    },
  );

  it('rejects a non-HTTP local URL before transport and normalizes the existing WebSocket form', async () => {
    const received = vi.fn();
    const base = await server((_request, response) => {
      received();
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({ requestId: 'a'.repeat(32), codeLength: 8, expiresInMs: 120000 }),
      );
    });
    local['agi_bridge_url'] = base.replace('http:', 'ftp:');
    expect((await startPairing()).phase).toBe('error');
    expect(received).not.toHaveBeenCalled();
    _resetStateForTesting();
    local['agi_bridge_url'] = base.replace('http:', 'ws:');
    expect((await startPairing()).phase).toBe('awaiting-code');
    expect(received).toHaveBeenCalledTimes(1);
  });
});
