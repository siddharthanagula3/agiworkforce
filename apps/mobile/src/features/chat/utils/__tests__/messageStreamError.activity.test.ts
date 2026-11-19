import {
  getMessageStreamErrorMessage,
  hasMessageStreamError,
  streamFailureNoticeText,
} from '../messageStreamError';

function failedTurn(content: string, status: string, entries: unknown[]) {
  return { content, metadata: { agentActivity: { status, entries } } };
}

describe('a turn whose activity failed without a stream error', () => {
  const reason = 'Your rolling 5-hour usage limit is reached. Wait for earlier usage to expire.';

  it('names the failure in the turn instead of hiding it in the collapsed activity', () => {
    const turn = failedTurn('', 'failed', [
      { kind: 'tool', status: 'completed' },
      { kind: 'error', message: `  ${reason}  ` },
    ]);
    expect(hasMessageStreamError(turn)).toBe(true);
    expect(getMessageStreamErrorMessage(turn)).toBe(reason);
    expect(streamFailureNoticeText(turn)).toBe(reason);
  });

  it('prefers the stream error the gateway sent over the activity entry', () => {
    const turn = {
      content: '',
      metadata: {
        streamError: { message: 'Gateway sentence.' },
        agentActivity: { status: 'failed', entries: [{ kind: 'error', message: reason }] },
      },
    };
    expect(getMessageStreamErrorMessage(turn)).toBe('Gateway sentence.');
  });

  it('says nothing for an activity that finished or only partly failed', () => {
    expect(
      hasMessageStreamError(failedTurn('Done.', 'completed', [{ kind: 'error', message: reason }])),
    ).toBe(false);
    expect(
      hasMessageStreamError(failedTurn('Done.', 'partial', [{ kind: 'error', message: reason }])),
    ).toBe(false);
    expect(
      hasMessageStreamError(failedTurn('', 'failed', [{ kind: 'error', message: '   ' }])),
    ).toBe(false);
  });
});
