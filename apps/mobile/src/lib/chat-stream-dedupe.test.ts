import { chatStreamEventId, createChatStreamDedupe } from './chat-stream-dedupe';

const envelope = (sequence: number, turnId = 'turn-1') => ({
  sessionId: 'session-1',
  turnId,
  sequence,
});

describe('chatStreamEventId', () => {
  it('is the same id for the same event, which is what a replay sends again', () => {
    expect(chatStreamEventId(envelope(3))).toBe(chatStreamEventId(envelope(3)));
    expect(chatStreamEventId(envelope(3))).not.toBe(chatStreamEventId(envelope(4)));
  });

  it('separates two turns of one session', () => {
    expect(chatStreamEventId(envelope(1, 'turn-1'))).not.toBe(
      chatStreamEventId(envelope(1, 'turn-2')),
    );
  });
});

describe('reconnect dedupe', () => {
  it('applies each event once although the reconnect replays the whole turn', () => {
    const dedupe = createChatStreamDedupe();
    const before = [0, 1, 2].map((sequence) => dedupe.admit(envelope(sequence)));
    const replayed = [0, 1, 2].map((sequence) => dedupe.admit(envelope(sequence)));

    expect(before).toEqual([true, true, true]);
    expect(replayed).toEqual([false, false, false]);
  });

  it('still applies the events the reconnect adds after the replayed ones', () => {
    const dedupe = createChatStreamDedupe();
    dedupe.admit(envelope(0));
    dedupe.admit(envelope(1));

    expect(dedupe.admit(envelope(0))).toBe(false);
    expect(dedupe.admit(envelope(2))).toBe(true);
    expect(dedupe.size).toBe(3);
  });

  it('does not confuse a second turn that restarts its sequence at zero', () => {
    const dedupe = createChatStreamDedupe();
    dedupe.admit(envelope(0, 'turn-1'));
    expect(dedupe.admit(envelope(0, 'turn-2'))).toBe(true);
  });

  it('forgets one settled turn without forgetting the other', () => {
    const dedupe = createChatStreamDedupe();
    dedupe.admit(envelope(0, 'turn-1'));
    dedupe.admit(envelope(0, 'turn-2'));

    dedupe.forget('turn-1');

    expect(dedupe.admit(envelope(0, 'turn-1'))).toBe(true);
    expect(dedupe.admit(envelope(0, 'turn-2'))).toBe(false);
  });

  it('resumes from ids a previous connection already applied', () => {
    const dedupe = createChatStreamDedupe([chatStreamEventId(envelope(0))]);
    expect(dedupe.admit(envelope(0))).toBe(false);
    expect(dedupe.admit(envelope(1))).toBe(true);
  });
});
