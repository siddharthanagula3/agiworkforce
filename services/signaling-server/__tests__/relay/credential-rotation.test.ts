import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db.js';
import { connectionManager } from '../../src/connection-manager.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

let accountSequence = 0;
let ACCOUNT = 'rotation-account';
const DESKTOP = 'b0b50204-7477-43b7-a323-a0d026e23c88';
const MOBILE = 'b0b50204-7477-43b7-a323-a0d026e23c89';
const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

beforeEach(() => {
  ACCOUNT = `rotation-account-${++accountSequence}`;
  store.install();
});

function pauseRotationReply() {
  const real = vi.mocked(db.rotatePairCredential).getMockImplementation()!;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(db.rotatePairCredential).mockImplementationOnce(async (...args) => {
    const result = await real(...args);
    entered();
    await paused;
    return result;
  });
  return { started, release };
}

async function pairing() {
  const created = await createPairing(relay, {
    initiator: 'desktop',
    device: { role: 'desktop', id: DESKTOP },
    metadata: { userId: ACCOUNT },
  });
  expect(created.status).toBe(200);
  return {
    code: String(created.json['code']),
    token: (created.json['pairTokens'] as { desktop: string }).desktop,
  };
}

async function claim(code: string, deviceId: string | undefined = MOBILE) {
  return fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'mobile', accountId: ACCOUNT, deviceId }),
  });
}

describe('pair credential rotation', () => {
  it('recovers an authenticated device after its registration acknowledgement is lost', async () => {
    const { code } = await pairing();
    const original = (await (await claim(code)).json()).pairToken;
    const pause = pauseRotationReply();
    const mobile = await RelayClient.connect(relay.ws);
    try {
      mobile.send({ type: 'register', code, role: 'mobile', pairToken: original });
      await pause.started;
      mobile.close();
      await mobile.closure();
      pause.release();
      let recovered: Response | undefined;
      await vi.waitFor(async () => {
        recovered = await claim(code);
        expect(recovered.status).toBe(200);
      });
      const token = (await recovered!.json()).pairToken;
      const replay = await RelayClient.connect(relay.ws);
      try {
        replay.send({ type: 'register', code, role: 'mobile', pairToken: original });
        expect(await replay.frame('error')).toMatchObject({ error: 'pairing_not_found' });
      } finally {
        replay.close();
      }
      const reconnect = await RelayClient.connect(relay.ws);
      try {
        reconnect.send({ type: 'register', code, role: 'mobile', pairToken: token });
        expect(await reconnect.frame('registered')).toMatchObject({ role: 'mobile' });
      } finally {
        reconnect.close();
      }
    } finally {
      pause.release();
      mobile.close();
    }
  });

  it('refuses a paused inactive claim after revocation and explicit device reinstatement', async () => {
    const { code } = await pairing();
    const pause = pauseRotationReply();
    const recovering = claim(code);
    try {
      await pause.started;
      const revoked = await fetch(`${relay.http}/devices/${MOBILE}/revoke`, {
        method: 'POST',
        headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'test' }),
      });
      expect(revoked.status).toBe(200);
      expect(store.rows.has(code)).toBe(false);
      const recreated = await createPairing(relay, {
        initiator: 'mobile',
        device: { role: 'mobile', id: MOBILE },
        metadata: { userId: ACCOUNT },
      });
      expect(recreated.status).toBe(200);
      expect(connectionManager.isDeviceRevoked(MOBILE)).toBe(false);
      pause.release();
      expect((await recovering).status).toBe(404);
    } finally {
      pause.release();
    }
  });

  it('blocks recovery while registration has committed but not acknowledged its rotation', async () => {
    const { code } = await pairing();
    const original = (await (await claim(code)).json()).pairToken;
    const pause = pauseRotationReply();
    const mobile = await RelayClient.connect(relay.ws);
    try {
      mobile.send({ type: 'register', code, role: 'mobile', pairToken: original });
      await pause.started;
      expect((await claim(code)).status).toBe(409);
      pause.release();
      const registered = await mobile.frame('registered');
      mobile.close();
      await mobile.closure();
      await vi.waitFor(() => expect(connectionManager.getDeviceConnectionCount(MOBILE)).toBe(0));
      const reconnect = await RelayClient.connect(relay.ws);
      try {
        reconnect.send({
          type: 'register',
          code,
          role: 'mobile',
          pairToken: registered['pairToken'],
        });
        expect(await reconnect.frame('registered')).toMatchObject({ role: 'mobile' });
      } finally {
        reconnect.close();
      }
    } finally {
      pause.release();
      mobile.close();
    }
  });

  it('blocks registration while a recovery rotation awaits its acknowledgement', async () => {
    const { code } = await pairing();
    const original = (await (await claim(code)).json()).pairToken;
    const pause = pauseRotationReply();
    const recovering = claim(code);
    await pause.started;
    const old = await RelayClient.connect(relay.ws);
    try {
      old.send({ type: 'register', code, role: 'mobile', pairToken: original });
      expect(await old.frame('error')).toMatchObject({ error: 'service_unavailable' });
      pause.release();
      const recovered = await recovering;
      expect(recovered.status).toBe(200);
      const replacement = (await recovered.json()).pairToken;
      const reconnect = await RelayClient.connect(relay.ws);
      try {
        reconnect.send({ type: 'register', code, role: 'mobile', pairToken: replacement });
        expect(await reconnect.frame('registered')).toMatchObject({ role: 'mobile' });
      } finally {
        reconnect.close();
      }
    } finally {
      pause.release();
      old.close();
    }
  });

  it('does not install a participant from a rotation completed before deletion', async () => {
    const { code, token } = await pairing();
    const pause = pauseRotationReply();
    const client = await RelayClient.connect(relay.ws);
    try {
      client.send({ type: 'register', code, role: 'desktop', pairToken: token });
      await pause.started;
      expect(
        (
          await fetch(`${relay.http}/pairings/${code}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
          })
        ).status,
      ).toBe(200);
      pause.release();
      expect(await client.frame('error')).toMatchObject({ error: 'pairing_not_found' });
      expect(client.frames.some((frame) => frame['type'] === 'registered')).toBe(false);
    } finally {
      pause.release();
      client.close();
    }
  });

  it('does not return a recovered credential after a deletion barrier has already cleared', async () => {
    const { code } = await pairing();
    const pause = pauseRotationReply();
    const claiming = claim(code);
    await pause.started;
    expect(
      (
        await fetch(`${relay.http}/pairings/${code}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
        })
      ).status,
    ).toBe(200);
    pause.release();
    expect((await claiming).status).toBe(404);
  });

  it('rejects a consumed credential after disconnect and accepts its replacement', async () => {
    const { code, token } = await pairing();
    const first = await RelayClient.connect(relay.ws);
    first.send({ type: 'register', code, role: 'desktop', pairToken: token });
    const registered = await first.frame('registered');
    expect(registered['pairToken']).toMatch(/^[a-f0-9]{64}$/);
    expect(registered['pairToken']).not.toBe(token);
    first.close();
    await first.closure();
    await vi.waitFor(() => expect(connectionManager.getDeviceConnectionCount(DESKTOP)).toBe(0));
    const replay = await RelayClient.connect(relay.ws);
    replay.send({ type: 'register', code, role: 'desktop', pairToken: token });
    expect(await replay.frame('error')).toMatchObject({ error: 'pairing_not_found' });
    await replay.closure();
    const replacement = await RelayClient.connect(relay.ws);
    try {
      replacement.send({
        type: 'register',
        code,
        role: 'desktop',
        pairToken: registered['pairToken'],
      });
      expect(await replacement.frame('registered')).toMatchObject({ code, role: 'desktop' });
    } finally {
      replacement.close();
    }
  });

  it('invalidates the previous claim on authenticated same-device recovery', async () => {
    const { code } = await pairing();
    const first = await claim(code);
    expect(first.status).toBe(200);
    const original = (await first.json()).pairToken;
    const recovered = await claim(code);
    expect(recovered.status).toBe(200);
    const replacement = (await recovered.json()).pairToken;
    expect(replacement).not.toBe(original);
    const replay = await RelayClient.connect(relay.ws);
    replay.send({ type: 'register', code, role: 'mobile', pairToken: original });
    expect(await replay.frame('error')).toMatchObject({ error: 'pairing_not_found' });
    await replay.closure();
  });

  it('does not recover a bound role for a different or missing device identity', async () => {
    const { code } = await pairing();
    expect((await claim(code)).status).toBe(200);
    expect((await claim(code, DESKTOP)).status).toBe(409);
    const missing = await fetch(`${relay.http}/pairings/${code}/claim`, {
      method: 'POST',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'mobile', accountId: ACCOUNT }),
    });
    expect(missing.status).toBe(409);
  });
});
