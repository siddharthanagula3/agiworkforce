import { beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

import {
  WS_MESSAGE_LIMIT,
  WS_PARTICIPANT_MESSAGE_BURST,
  WS_PARTICIPANT_MESSAGES_PER_SECOND,
} from '../../src/middleware/rateLimit.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RELAY_DEFAULTS,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const store = new FakeStore();
let relay: InProcessRelay;
let accountSequence = 0;

beforeAll(async () => {
  relay = await startInProcessRelay(store, RELAY_DEFAULTS);
});

async function pairedOnOneAddress(): Promise<{ desktop: RelayClient; mobile: RelayClient }> {
  const account = `5b0c1a7e-0000-4000-8000-${String(++accountSequence).padStart(12, '0')}`;
  const created = await createPairing(relay, { metadata: { userId: account } });
  const code = String(created.json['code']);
  const desktopToken = (created.json['pairTokens'] as { desktop: string }).desktop;
  const claimed = await fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify({ role: 'mobile', accountId: account }),
  });
  const mobileToken = String(((await claimed.json()) as { pairToken: string }).pairToken);

  const desktop = await RelayClient.connect(relay.ws);
  desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
  await desktop.frame('registered');
  const mobile = await RelayClient.connect(relay.ws);
  mobile.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
  await mobile.frame('peer_ready');
  await desktop.frame('peer_ready');
  return { desktop, mobile };
}

function outputDelta(index: number) {
  return {
    type: 'signal',
    kind: 'control',
    payload: {
      action: 'code.session.event',
      data: {
        threadId: 'thread-1',
        event: { type: 'output-delta', turnId: 'turn-1', delta: `token ${index} ` },
      },
    },
  };
}

function deltasInOrder(client: RelayClient): string[] {
  return client.frames
    .filter((frame) => frame['type'] === 'signal')
    .map(
      (frame) =>
        (frame['payload'] as { data?: { event?: { delta?: string } } } | undefined)?.data?.event
          ?.delta ?? '',
    )
    .filter((delta) => delta.startsWith('token '));
}

function deltasReceived(client: RelayClient): number {
  return client.frames.filter(
    (frame) =>
      frame['type'] === 'signal' &&
      (frame['payload'] as { action?: string } | undefined)?.action === 'code.session.event',
  ).length;
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function stillAdmitsTheAddress(): Promise<void> {
  const probe = await RelayClient.connect(relay.ws);
  try {
    probe.send({ type: 'heartbeat' });
    expect(await probe.frame('error')).toMatchObject({ error: 'registration_required' });
    expect(probe.closed).toBeNull();
  } finally {
    probe.close();
  }
}

describe('a streamed reply under the default limits', () => {
  it('runs with the shipped defaults, not raised test limits', () => {
    expect(WS_MESSAGE_LIMIT).toBe(100);
    expect(WS_PARTICIPANT_MESSAGES_PER_SECOND).toBe(200);
    expect(WS_PARTICIPANT_MESSAGE_BURST).toBe(2_000);
  });

  it('delivers every delta of a long reply and keeps the address admitted', async () => {
    const { desktop, mobile } = await pairedOnOneAddress();
    try {
      const total = 1_500;
      const perTick = 30;
      for (let sent = 0; sent < total; sent += perTick) {
        for (let index = sent; index < Math.min(total, sent + perTick); index++) {
          desktop.send(outputDelta(index));
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await waitFor(() => deltasReceived(mobile) === total, 5_000);
      expect(desktop.frames.some((frame) => frame['error'] === 'rate_limit_exceeded')).toBe(false);

      mobile.send({
        type: 'signal',
        kind: 'control',
        payload: { action: 'code.approval.respond', data: { requestId: 'r-1', decision: 'allow' } },
      });
      await waitFor(
        () =>
          desktop.frames.some(
            (frame) =>
              (frame['payload'] as { action?: string } | undefined)?.action ===
              'code.approval.respond',
          ),
        3_000,
      );
      await stillAdmitsTheAddress();
    } finally {
      desktop.close();
      mobile.close();
    }
  });

  it('holds a participant past its burst back and still delivers every frame in order', async () => {
    const { desktop, mobile } = await pairedOnOneAddress();
    try {
      const total = WS_PARTICIPANT_MESSAGE_BURST + 600;
      for (let index = 0; index < total; index++) {
        desktop.send(outputDelta(index));
      }
      await waitFor(() => deltasReceived(mobile) === total, 10_000);
      expect(deltasInOrder(mobile)).toEqual(
        Array.from({ length: total }, (_, index) => `token ${index} `),
      );
      expect(desktop.frames.some((frame) => frame['type'] === 'error')).toBe(false);
      expect(desktop.closed).toBeNull();

      mobile.send({
        type: 'signal',
        kind: 'control',
        payload: { action: 'code.approval.respond', data: { requestId: 'r-2', decision: 'deny' } },
      });
      await waitFor(
        () =>
          desktop.frames.some(
            (frame) =>
              (frame['payload'] as { action?: string } | undefined)?.action ===
              'code.approval.respond',
          ),
        3_000,
      );
      await stillAdmitsTheAddress();
    } finally {
      desktop.close();
      mobile.close();
    }
  });

  it('closes retryably a participant that keeps writing although the relay stopped reading', async () => {
    const { desktop, mobile } = await pairedOnOneAddress();
    const pause = vi.spyOn(WebSocket.prototype, 'pause').mockImplementation(() => undefined);
    try {
      for (let index = 0; index < 2 * WS_PARTICIPANT_MESSAGE_BURST + 200; index++) {
        desktop.send({ type: 'heartbeat' });
      }
      expect((await desktop.closure(5_000)).code).toBe(1013);
      expect(desktop.frames.some((frame) => frame['error'] === 'service_unavailable')).toBe(true);
      expect(desktop.frames.some((frame) => frame['error'] === 'rate_limit_exceeded')).toBe(false);
      await stillAdmitsTheAddress();
    } finally {
      pause.mockRestore();
      desktop.close();
      mobile.close();
    }
  });
});
