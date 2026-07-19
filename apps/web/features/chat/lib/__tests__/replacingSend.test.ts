/**
 * Ordering guarantees for the data-loss-safe replace-and-resend helper
 * (WEBUI-REGEN-DELETE-BEFORE-RESEND): server rows are deleted ONLY after the
 * replacement commits, and the transcript is restored verbatim if it never does.
 */
import { describe, it, expect, vi } from 'vitest';
import { runReplacingSend, type ReplacingSendPorts } from '../replacingSend';

interface Msg {
  id: string;
  text: string;
}

function makePorts(initial: Msg[]) {
  let messages = [...initial];
  const ports: ReplacingSendPorts<Msg> = {
    snapshot: () => [...messages],
    removeLocal: (id) => {
      messages = messages.filter((m) => m.id !== id);
    },
    restore: (snap) => {
      messages = [...snap];
    },
    deleteServer: vi.fn(),
  };
  return { ports, current: () => messages };
}

const SNAPSHOT: Msg[] = [
  { id: 'a', text: 'keep' },
  { id: 'u', text: 'user' },
  { id: 'r', text: 'assistant' },
];

describe('runReplacingSend', () => {
  it('deletes old server rows only AFTER a committed send, and does not restore', async () => {
    const { ports, current } = makePorts(SNAPSHOT);
    // The send commits (true) and, like the real sendMessage, appends the new turn.
    const send = vi.fn(async () => {
      // At this point the rolled-back rows must already be gone locally (clean UI).
      expect(current().map((m) => m.id)).toEqual(['a']);
      return true;
    });

    await runReplacingSend(ports, ['u', 'r'], send);

    expect(send).toHaveBeenCalledOnce();
    expect(ports.deleteServer).toHaveBeenCalledWith(['u', 'r']);
    // Committed → no restore, so the removal stands.
    expect(current().map((m) => m.id)).toEqual(['a']);
  });

  it('restores the exact transcript and skips the server delete when the send does NOT commit', async () => {
    const { ports, current } = makePorts(SNAPSHOT);
    const send = vi.fn(async () => false); // e.g. expired token → bailed pre-commit

    await runReplacingSend(ports, ['u', 'r'], send);

    // Nothing lost: the full original transcript is back, order preserved.
    expect(current()).toEqual(SNAPSHOT);
    expect(ports.deleteServer).not.toHaveBeenCalled();
  });

  it('restores (and does not delete server rows) when the send throws', async () => {
    const { ports, current } = makePorts(SNAPSHOT);
    const send = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(runReplacingSend(ports, ['u', 'r'], send)).rejects.toThrow('network down');
    expect(current()).toEqual(SNAPSHOT);
    expect(ports.deleteServer).not.toHaveBeenCalled();
  });

  it('removes every rolled-back id locally before the send runs', async () => {
    const { ports, current } = makePorts(SNAPSHOT);
    let idsAtSendTime: string[] = [];
    const send = vi.fn(async () => {
      idsAtSendTime = current().map((m) => m.id);
      return true;
    });

    await runReplacingSend(ports, ['u', 'r'], send);

    expect(idsAtSendTime).toEqual(['a']);
  });
});
