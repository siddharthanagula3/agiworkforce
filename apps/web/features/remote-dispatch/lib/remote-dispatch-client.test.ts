import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalingEvent } from '@agiworkforce/types';

const relay = vi.hoisted(() => ({
  onEvent: null as ((event: SignalingEvent) => void) | null,
  close: vi.fn(),
}));

vi.mock('@agiworkforce/utils/signaling', () => ({
  SignalingClient: class {
    constructor(options: { onEvent: (event: SignalingEvent) => void }) {
      relay.onEvent = options.onEvent;
    }
    connect() {
      return undefined;
    }
    close() {
      relay.close();
    }
    sendSignal() {
      return true;
    }
  },
}));
vi.mock('@/lib/client/csrf', () => ({
  CsrfTokenError: class CsrfTokenError extends Error {},
  clearCsrfToken: vi.fn(),
  getCsrfToken: vi.fn(),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));
vi.mock('./dispatch-envelope', () => ({
  createDispatchSession: vi.fn(async () => ({})),
  newDispatchSalt: () => 'salt',
  openDispatchEnvelope: vi.fn(),
  signDispatchEnvelope: vi.fn(),
}));

import { connectRemoteDispatch } from './remote-dispatch-client';

describe('the web dispatch link to a computer', () => {
  beforeEach(() => {
    relay.onEvent = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ pairToken: 'token', wsUrl: 'wss://relay.test' }), {
            status: 200,
          }),
      ),
    );
  });

  it('says the computer was unlinked, not that the connection dropped', async () => {
    const onClosed = vi.fn();
    await connectRemoteDispatch(
      { code: 'ABC123', secret: 'secret' } as never,
      {
        onReady: vi.fn(),
        onAway: vi.fn(),
        onClosed,
        onTaskStatus: vi.fn(),
      } as never,
    );

    relay.onEvent?.({ type: 'error', error: 'device_revoked' } as SignalingEvent);
    relay.onEvent?.({ type: 'close' } as SignalingEvent);

    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed.mock.calls[0]![0]).toContain('unlinked from your account');
  });
});
