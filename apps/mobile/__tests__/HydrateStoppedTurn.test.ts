import { requireFreeMobileCloudModel } from '@/test-utils/modelFixtures';
import { hydrateStoredCloudMessage } from '@/stores/chat/hydrateCloudMessage';
import type { ChatMessage } from '@/types/chat';

const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const SHOWN = 'The migration needs three steps. First export';
const KEPT_BY_SERVER = 'The migration needs three steps. First export the schema, then';

function assistant(content: string, metadata?: Record<string, unknown>): ChatMessage {
  return {
    id: 'answer-stopped',
    conversationId: 'conversation-stopped',
    role: 'assistant',
    content,
    createdAt: '2026-11-15T09:00:00.000Z',
    model: CLOUD_MODEL,
    ...(metadata ? { metadata } : {}),
  };
}

const stoppedOnThisPhone = assistant(SHOWN, { finishReason: 'stopped' });

describe('a turn stopped on this phone after the server copy is pulled', () => {
  it('stays stopped when the server kept more text and stored the cancel without a reason', () => {
    const pulled = assistant(KEPT_BY_SERVER, {
      serverPersisted: true,
      truncated: true,
      truncationReason: 'stream_cancelled',
    });

    const hydrated = hydrateStoredCloudMessage(pulled, stoppedOnThisPhone);

    expect(hydrated.content).toBe(KEPT_BY_SERVER);
    expect(hydrated.metadata?.finishReason).toBe('stopped');
    expect(hydrated.metadata?.['serverPersisted']).toBe(true);
  });

  it('stays stopped when the server recorded the stop itself', () => {
    const pulled = assistant(KEPT_BY_SERVER, {
      serverPersisted: true,
      truncated: true,
      finishReason: 'stopped',
    });

    expect(hydrateStoredCloudMessage(pulled, stoppedOnThisPhone).metadata?.finishReason).toBe(
      'stopped',
    );
    expect(hydrateStoredCloudMessage(pulled).metadata?.finishReason).toBe('stopped');
  });

  it('does not call a failure stopped when the server stored a failed turn', () => {
    const pulled = assistant(KEPT_BY_SERVER, {
      serverPersisted: true,
      truncated: true,
      finishReason: null,
    });

    const hydrated = hydrateStoredCloudMessage(pulled, stoppedOnThisPhone);

    expect(hydrated.metadata).not.toHaveProperty('finishReason');
  });

  it('does not call a turn stopped that was not stopped on this phone', () => {
    const pulled = assistant(KEPT_BY_SERVER, { serverPersisted: true, truncated: true });

    expect(hydrateStoredCloudMessage(pulled).metadata?.finishReason).toBeUndefined();
    expect(
      hydrateStoredCloudMessage(pulled, assistant(SHOWN, { finishReason: 'stop' })).metadata
        ?.finishReason,
    ).toBeUndefined();
  });

  it('takes the server copy when the server finished the answer', () => {
    const pulled = assistant(KEPT_BY_SERVER, { serverPersisted: true, truncated: false });

    expect(
      hydrateStoredCloudMessage(pulled, stoppedOnThisPhone).metadata?.finishReason,
    ).toBeUndefined();

    const finished = assistant(KEPT_BY_SERVER, {
      serverPersisted: true,
      truncated: false,
      finishReason: 'stop',
    });
    const hydrated = hydrateStoredCloudMessage(finished, stoppedOnThisPhone);

    expect(hydrated.content).toBe(KEPT_BY_SERVER);
    expect(hydrated.metadata?.finishReason).toBe('stop');
  });
});

describe('a phone-saved row the server marked stopped', () => {
  const RUN = { cloudAgentRun: { runId: 'run-stopped-1' } };

  it('reads as stopped on a phone that never showed the turn', () => {
    const pulled = assistant(SHOWN, { ...RUN, finishReason: 'stopped' });

    const hydrated = hydrateStoredCloudMessage(pulled);

    expect(hydrated.metadata?.finishReason).toBe('stopped');
    expect(hydrated.metadata).not.toHaveProperty('truncated');
    expect(hydrated.metadata).not.toHaveProperty('requestId');
  });

  it('reads as stopped on the phone that saved it before the stop was recorded', () => {
    const savedBeforeStamp = assistant(SHOWN, { ...RUN });
    const pulled = assistant(SHOWN, { ...RUN, finishReason: 'stopped' });

    expect(hydrateStoredCloudMessage(pulled, savedBeforeStamp).metadata?.finishReason).toBe(
      'stopped',
    );
    expect(hydrateStoredCloudMessage(pulled, stoppedOnThisPhone).metadata?.finishReason).toBe(
      'stopped',
    );
  });

  it('keeps the stored thinking times next to the stopped reason', () => {
    const pulled = assistant(SHOWN, {
      ...RUN,
      finishReason: 'stopped',
      thinkingDurationSeconds: 4,
    });

    const hydrated = hydrateStoredCloudMessage(pulled);

    expect(hydrated.metadata?.finishReason).toBe('stopped');
    expect(hydrated.metadata?.['thinkingDuration']).toBe(4);
  });

  it('does not call a phone-saved failure stopped', () => {
    const failed = assistant(KEPT_BY_SERVER, { ...RUN, finishReason: null });
    const unmarked = assistant(KEPT_BY_SERVER, { ...RUN });

    expect(hydrateStoredCloudMessage(failed, stoppedOnThisPhone).metadata).not.toHaveProperty(
      'finishReason',
    );
    expect(hydrateStoredCloudMessage(failed).metadata).not.toHaveProperty('finishReason');
    expect(
      hydrateStoredCloudMessage(unmarked, stoppedOnThisPhone).metadata?.finishReason,
    ).toBeUndefined();
    expect(
      hydrateStoredCloudMessage(
        assistant(SHOWN, { ...RUN, finishReason: 'error' }),
        stoppedOnThisPhone,
      ).metadata?.finishReason,
    ).toBe('error');
  });
});
