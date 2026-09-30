import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db.js';
import { connectionManager } from '../../src/connection-manager.js';
import type { Socket } from 'node:net';
import { withPairingDevice } from '../../src/pairing-device.js';

import {
  FakeStore,
  INTERNAL_SECRET,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const ACCOUNT = '5b0c1a7e-0000-4000-8000-0000000000aa';

const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

afterEach(() => {
  store.failing = false;
  store.stalled = false;
  store.install();
});

async function pairing(): Promise<{ code: string; desktopToken: string }> {
  const created = await createPairing(relay, { metadata: { userId: ACCOUNT } });
  expect(created.status).toBe(200);
  const tokens = created.json['pairTokens'] as { desktop: string };
  return { code: String(created.json['code']), desktopToken: tokens.desktop };
}

async function pendingRegistration(code: string, desktopToken: string) {
  const row = structuredClone(store.rows.get(code));
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<Awaited<ReturnType<typeof db.getSessionByCode>>>((resolve) => {
    release = () => resolve({ data: row ?? null, error: null });
  });
  vi.mocked(db.getSessionByCode).mockImplementationOnce(() => {
    entered();
    return pending;
  });
  const client = await RelayClient.connect(relay.ws);
  client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
  await started;
  return { client, release };
}

describe('registration races with pairing lifecycle', () => {
  it('cannot restore a pre-binding snapshot after the device is revoked', async () => {
    const { code, desktopToken } = await pairing();
    const { client, release } = await pendingRegistration(code, desktopToken);
    const deviceId = '8f76b26b-367b-4d50-8c74-6a53ee221aac';
    const row = store.rows.get(code);
    expect(row).toBeDefined();
    const bound = await db.bindSessionDevice(
      code,
      'mobile',
      deviceId,
      withPairingDevice(row?.metadata, 'mobile', deviceId),
    );
    expect(bound.data).toEqual({ code });
    const revoked = await fetch(`${relay.http}/devices/${deviceId}/revoke`, {
      method: 'POST',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'unlinked_by_owner' }),
    });
    expect(revoked.status).toBe(200);
    expect(store.rows.has(code)).toBe(false);
    release();
    try {
      expect(await client.frame('error')).toEqual({ type: 'error', error: 'pairing_not_found' });
      expect(client.frames.some((frame) => frame['type'] === 'registered')).toBe(false);
    } finally {
      client.close();
      connectionManager.reinstateDevice(deviceId);
    }
  });
  it('accepts only the first registration while its lookup is pending', async () => {
    const first = await pairing();
    const second = await pairing();
    const { client, release } = await pendingRegistration(first.code, first.desktopToken);
    client.send({
      type: 'register',
      code: second.code,
      role: 'desktop',
      pairToken: second.desktopToken,
    });
    await Promise.race([client.frame('registered'), client.frame('error')]);
    release();
    try {
      expect(await client.frame('registered')).toMatchObject({ code: first.code });
      expect(client.frames.filter((frame) => frame['type'] === 'registered')).toHaveLength(1);
      expect(await client.frame('error')).toEqual({
        type: 'error',
        error: 'registration_in_progress',
      });
    } finally {
      client.close();
    }
  });

  it('cannot resurrect a pairing deleted while its lookup was pending', async () => {
    const { code, desktopToken } = await pairing();
    const { client, release } = await pendingRegistration(code, desktopToken);
    const deletion = await fetch(`${relay.http}/pairings/${code}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    });
    expect(deletion.status).toBe(200);
    release();
    try {
      expect(await client.frame('error')).toEqual({ type: 'error', error: 'pairing_not_found' });
      expect(client.frames.some((frame) => frame['type'] === 'registered')).toBe(false);
    } finally {
      client.close();
    }
  });

  it('does not reserve a role for a socket closed during its lookup', async () => {
    const { code, desktopToken } = await pairing();
    const added = vi.spyOn(connectionManager, 'addConnection');
    const { client, release } = await pendingRegistration(code, desktopToken);
    const port = (client.socket as unknown as { _socket: Socket })._socket.localPort;
    const serverSocket = added.mock.calls.find(
      ([socket]) => (socket as unknown as { _socket: Socket })._socket.remotePort === port,
    )?.[0];
    expect(serverSocket).toBeDefined();
    added.mockRestore();
    const removed = vi.spyOn(connectionManager, 'removeConnection');
    client.close();
    await client.closure();
    await vi.waitFor(() =>
      expect(removed.mock.calls.some(([socket]) => socket === serverSocket)).toBe(true),
    );
    removed.mockRestore();
    release();
    const replacement = await RelayClient.connect(relay.ws);
    replacement.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    try {
      expect(await replacement.frame('registered')).toMatchObject({ code, role: 'desktop' });
    } finally {
      replacement.close();
    }
  });
});

describe('registration while the pairing store is unavailable', () => {
  it('refuses retryably instead of calling a live pairing missing', async () => {
    const { code, desktopToken } = await pairing();
    store.failing = true;

    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });

    expect(await client.frame('error')).toEqual({ type: 'error', error: 'service_unavailable' });
    expect(await client.closure()).toEqual({ code: 1013, reason: 'try_again_later' });
    expect(client.frames.some((frame) => frame['error'] === 'pairing_not_found')).toBe(false);
  });

  it('still registers the same pairing once the store answers again', async () => {
    const { code, desktopToken } = await pairing();
    store.failing = true;
    const refused = await RelayClient.connect(relay.ws);
    refused.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    await refused.closure();

    store.failing = false;
    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    expect(await client.frame('registered')).toMatchObject({ type: 'registered', role: 'desktop' });
    client.close();
  });

  it('keeps serving after a lookup fails', async () => {
    const { code, desktopToken } = await pairing();
    store.failing = true;
    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    await client.closure();

    const live = await fetch(`${relay.http}/live`);
    expect(live.status).toBe(200);
  });
});

describe('registration against a pairing the store does not hold', () => {
  it('reports a missing pairing as not found', async () => {
    const client = await RelayClient.connect(relay.ws);
    client.send({
      type: 'register',
      code: 'ZZZZ9999YYYY',
      role: 'desktop',
      pairToken: 'ab'.repeat(32),
    });
    expect(await client.frame('error')).toEqual({ type: 'error', error: 'pairing_not_found' });
    await client.closure();
  });

  it('reports an expired pairing as expired', async () => {
    const { code, desktopToken } = await pairing();
    const row = store.rows.get(code);
    if (!row) throw new Error('pairing was not stored');
    row.expires_at = Date.now() - 1_000;

    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    expect(await client.frame('error')).toEqual({ type: 'error', error: 'pairing_expired' });
    await client.closure();
  });
});

describe('HTTP pairing lookups while the store is unavailable', () => {
  it('answers 503 rather than a not-found the web would show as a wrong code', async () => {
    const { code } = await pairing();
    store.failing = true;

    const lookup = await fetch(`${relay.http}/pairings/${code}`);
    expect(lookup.status).toBe(503);
    expect(await lookup.json()).toEqual({ error: 'persistence_unavailable' });

    const claim = await fetch(`${relay.http}/pairings/${code}/claim`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env['SIGNALING_INTERNAL_SECRET']}`,
      },
      body: JSON.stringify({ role: 'mobile', accountId: ACCOUNT }),
    });
    expect(claim.status).toBe(503);
    expect(await claim.json()).toEqual({ error: 'persistence_unavailable' });
  });
});
