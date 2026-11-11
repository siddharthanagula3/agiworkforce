import { beforeAll, describe, expect, it } from 'vitest';

import { metrics } from '../../src/metrics.js';
import { FakeStore, RelayClient, startInProcessRelay, type InProcessRelay } from './in-process.js';

const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

async function disconnections(atLeast: number): Promise<number> {
  const deadline = Date.now() + 3_000;
  for (;;) {
    const seen = metrics.toJSON().messages['disconnection'] ?? 0;
    if (seen >= atLeast || Date.now() > deadline) return seen;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('connection close metrics', () => {
  it('counts a normal close as a disconnection and not as an error', async () => {
    const before = metrics.toJSON();
    const baseline = before.messages['disconnection'] ?? 0;
    const normalBefore = before.errors['ws_close_1000'] ?? 0;
    const client = await RelayClient.connect(relay.ws);
    client.socket.close(1000, 'done');
    await client.closure();
    expect(await disconnections(baseline + 1)).toBe(baseline + 1);
    expect(metrics.toJSON().errors['ws_close_1000'] ?? 0).toBe(normalBefore);
    expect(metrics.toPrometheusFormat()).not.toContain(
      'signaling_errors_total{type="ws_close_1000"}',
    );
  });

  it('still counts an abnormal close as an error', async () => {
    const before = metrics.toJSON();
    const baseline = before.messages['disconnection'] ?? 0;
    const abnormalBefore = before.errors['ws_close_4001'] ?? 0;
    const client = await RelayClient.connect(relay.ws);
    client.socket.close(4001, 'client_failure');
    await client.closure();
    expect(await disconnections(baseline + 1)).toBe(baseline + 1);
    expect(metrics.toJSON().errors['ws_close_4001']).toBe(abnormalBefore + 1);
  });
});
