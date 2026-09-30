import { beforeAll, describe, expect, it } from 'vitest';
import {
  FakeStore,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

describe('pairing credential disclosure', () => {
  for (const initiator of ['desktop', 'mobile']) {
    it(`returns only the ${initiator} initiator credential`, async () => {
      const result = await createPairing(relay, {
        initiator,
        metadata: { userId: 'credential-exposure-account' },
      });
      expect(result.status).toBe(200);
      expect(Object.keys(result.json['pairTokens'] as Record<string, unknown>)).toEqual([
        initiator,
      ]);
      expect(result.json['qrData']).toBe(`agiw:${String(result.json['code'])}`);
    });
  }

  it('rejects a device role that differs from the initiator', async () => {
    const result = await createPairing(relay, {
      initiator: 'mobile',
      device: { role: 'desktop', id: '5443bc53-8e20-447c-a7ae-5b2134f914cb' },
      metadata: { userId: 'credential-exposure-account' },
    });
    expect(result.status).toBe(400);
    expect(result.json).toEqual({ error: 'initiator_device_mismatch' });
  });
});
