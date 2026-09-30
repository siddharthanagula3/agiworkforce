import type { Socket } from 'node:net';
import { beforeAll, describe, expect, it } from 'vitest';

import { MAX_SOCKET_BUFFERED_BYTES } from '../../src/constants.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const ACCOUNT = '5b0c1a7e-0000-4000-8000-0000000000d4';

const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

async function pairedClients(): Promise<{ desktop: RelayClient; mobile: RelayClient }> {
  const created = await createPairing(relay, { metadata: { userId: ACCOUNT } });
  const code = String(created.json['code']);
  const desktopToken = (created.json['pairTokens'] as { desktop: string }).desktop;
  const claimed = await fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify({ role: 'mobile', accountId: ACCOUNT }),
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

describe('a participant that stops reading', () => {
  it('is dropped once its backlog passes the cap instead of growing relay memory', async () => {
    const { desktop, mobile } = await pairedClients();
    (mobile.socket as unknown as { _socket: Socket })._socket.pause();

    const blob = 'x'.repeat(47_000);
    const frames = Math.ceil((MAX_SOCKET_BUFFERED_BYTES * 3) / blob.length);
    for (let sent = 0; sent < frames; sent++) {
      desktop.send({
        type: 'signal',
        kind: 'control',
        payload: { action: 'code.session.event', data: { blob } },
      });
    }

    expect(await desktop.frame('peer_left', 10_000)).toMatchObject({
      type: 'peer_left',
      role: 'mobile',
    });
    expect(desktop.closed).toBeNull();
    desktop.close();
    mobile.close();
  }, 20_000);
});
