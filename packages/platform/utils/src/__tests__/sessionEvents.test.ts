import { describe, expect, it } from 'vitest';
import { developerSessionEventFromNotification } from '../remoteControl/sessionEvents';

const agentEvent = (event: Record<string, unknown>) => ({
  schemaVersion: 5,
  sessionId: 'thread-1',
  turnId: 'turn-1',
  sequence: 7,
  emittedAtMs: 1,
  event,
});

describe('model thinking from the CLI', () => {
  it('becomes a reasoning delta that carries the text and never the signature', () => {
    expect(
      developerSessionEventFromNotification(
        'turn/agent_event',
        agentEvent({ type: 'reasoning-delta', delta: 'Checking the tests', signature: 'sig-1' }),
      ),
    ).toEqual({
      type: 'reasoning-delta',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Checking the tests',
    });
  });

  it('is dropped when it carries no text or no turn', () => {
    expect(
      developerSessionEventFromNotification(
        'turn/agent_event',
        agentEvent({ type: 'reasoning-delta', delta: '' }),
      ),
    ).toBeNull();
    expect(
      developerSessionEventFromNotification(
        'turn/agent_event',
        agentEvent({ type: 'reasoning-delta' }),
      ),
    ).toBeNull();
    expect(
      developerSessionEventFromNotification('turn/agent_event', {
        sessionId: 'thread-1',
        event: { type: 'reasoning-delta', delta: 'orphan' },
      }),
    ).toBeNull();
  });
});
