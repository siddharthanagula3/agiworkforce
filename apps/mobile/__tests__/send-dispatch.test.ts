/**
 * Shared composer accept-race contract (resolveOnAcceptedSend), used by both chat
 * screens so their draft-clear-on-accept behavior can't drift.
 */
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';

describe('resolveOnAcceptedSend', () => {
  it('resolves true as soon as onAccepted fires (before the send settles)', async () => {
    let settle: (v: boolean) => void = () => {};
    const send = jest.fn((onAccepted: () => void) => {
      onAccepted(); // store committed the user message
      return new Promise<boolean>((r) => {
        settle = r; // ...but the stream has NOT finished yet
      });
    });

    const result = await resolveOnAcceptedSend(send, () => {});
    expect(result).toBe(true);
    // The send promise is still pending; resolving early is the whole point.
    settle(true);
  });

  it("falls back to the send's own return value when onAccepted never fires", async () => {
    // e.g. a pre-flight gate blocked the send: it resolves false without accepting.
    const send = jest.fn(() => Promise.resolve(false));
    const result = await resolveOnAcceptedSend(send, () => {});
    expect(result).toBe(false);
  });

  it('surfaces the error and resolves false when the send rejects', async () => {
    const onError = jest.fn();
    const send = jest.fn(() => Promise.reject(new Error('network down')));

    const result = await resolveOnAcceptedSend(send, onError);

    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('network down');
  });

  it('passes an onAccepted callback through to the send', async () => {
    const send = jest.fn((onAccepted: () => void) => {
      expect(typeof onAccepted).toBe('function');
      return Promise.resolve(true);
    });
    await resolveOnAcceptedSend(send, () => {});
    expect(send).toHaveBeenCalledTimes(1);
  });
});
