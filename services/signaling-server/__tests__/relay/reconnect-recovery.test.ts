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
let ACCOUNT = 'recovery-account';
const DESKTOP = 'c0c50204-7477-43b7-a323-a0d026e23c88';
const MOBILE = 'c0c50204-7477-43b7-a323-a0d026e23c89';
const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

beforeEach(() => {
  ACCOUNT = `recovery-account-${++accountSequence}`;
  store.install();
});

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

async function claimMobile(code: string): Promise<string> {
  const response = await fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'mobile', accountId: ACCOUNT, deviceId: MOBILE }),
  });
  expect(response.status).toBe(200);
  return String(((await response.json()) as { pairToken: string }).pairToken);
}

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

describe('reconnecting over a connection the relay still believes is open', () => {
  it('lets the holder of the current credential take the role from the stale socket', async () => {
    const { code, token } = await pairing();
    const stale = await RelayClient.connect(relay.ws);
    const fresh = await RelayClient.connect(relay.ws);
    try {
      stale.send({ type: 'register', code, role: 'desktop', pairToken: token });
      const registered = await stale.frame('registered');

      fresh.send({
        type: 'register',
        code,
        role: 'desktop',
        pairToken: registered['pairToken'],
      });
      expect(await fresh.frame('registered')).toMatchObject({ code, role: 'desktop' });
      expect(fresh.frames.some((frame) => frame['error'] === 'role_already_connected')).toBe(false);
      await stale.closure();
      expect(fresh.closed).toBeNull();
    } finally {
      stale.close();
      fresh.close();
    }
  });

  it('does not let a consumed credential take the role from the live socket', async () => {
    const { code, token } = await pairing();
    const live = await RelayClient.connect(relay.ws);
    const replay = await RelayClient.connect(relay.ws);
    try {
      live.send({ type: 'register', code, role: 'desktop', pairToken: token });
      await live.frame('registered');

      replay.send({ type: 'register', code, role: 'desktop', pairToken: token });
      expect(await replay.frame('error')).toMatchObject({ error: 'pairing_not_found' });
      await replay.closure();
      expect(live.closed).toBeNull();
    } finally {
      live.close();
      replay.close();
    }
  });
});

describe('a registration whose reply never arrived', () => {
  it('accepts the credential the client still holds when the rotated one was never sent', async () => {
    const { code } = await pairing();
    const original = await claimMobile(code);
    const pause = pauseRotationReply();
    const mobile = await RelayClient.connect(relay.ws);
    try {
      mobile.send({ type: 'register', code, role: 'mobile', pairToken: original });
      await pause.started;
      mobile.close();
      await mobile.closure();
      await vi.waitFor(() => expect(connectionManager.getDeviceConnectionCount(MOBILE)).toBe(0));
      pause.release();

      const retry = await RelayClient.connect(relay.ws);
      try {
        retry.send({ type: 'register', code, role: 'mobile', pairToken: original });
        const registered = await retry.frame('registered');
        expect(registered).toMatchObject({ code, role: 'mobile' });
        expect(registered['pairToken']).not.toBe(original);
      } finally {
        retry.close();
      }
      await vi.waitFor(() => expect(connectionManager.getDeviceConnectionCount(MOBILE)).toBe(0));

      const replay = await RelayClient.connect(relay.ws);
      try {
        replay.send({ type: 'register', code, role: 'mobile', pairToken: original });
        expect(await replay.frame('error')).toMatchObject({ error: 'pairing_not_found' });
      } finally {
        replay.close();
      }
    } finally {
      pause.release();
      mobile.close();
    }
  });
});
