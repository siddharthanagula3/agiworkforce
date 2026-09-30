const guardedFetchMock = jest.fn();

function loadStreaming() {
  jest.resetModules();
  guardedFetchMock.mockReset();
  jest.doMock('@/lib/constants', () => ({
    API_URL: 'https://api.agi.test',
    WS_URL: 'wss://api.agi.test',
    TIMEOUTS: { STREAMING: 60_000, STREAM_STALL: 45_000 },
  }));
  jest.doMock('@/lib/egressGuard', () => ({
    guardedFetch: guardedFetchMock,
    EgressBlockedError: class EgressBlockedError extends Error {},
  }));
  jest.doMock('../services/authSession', () => ({
    getAuthToken: jest.fn().mockResolvedValue('cloud-token'),
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/streaming') as typeof import('../services/streaming');
}

function neverEndingStream(onCancel: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'));
    },
    cancel: onCancel,
  });
}

describe('a detached resume from the phone', () => {
  afterEach(() => {
    jest.dontMock('@/lib/constants');
    jest.dontMock('@/lib/egressGuard');
    jest.dontMock('../services/authSession');
  });

  it('asks for a streaming fetch and returns once the headers arrive', async () => {
    const { createMobileCloudAgentRunClient } = loadStreaming();
    const cancelled = jest.fn();
    guardedFetchMock.mockResolvedValue(
      new Response(neverEndingStream(cancelled), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    await createMobileCloudAgentRunClient().resumeRun('0190a000-0000-7000-8000-000000000001', [
      { toolCallId: 'call-1', decision: 'approved' },
    ]);

    const [url, , options] = guardedFetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.agi.test/api/llm/v1/chat/completions/approve');
    expect(options).toEqual({ stream: true });
    expect(cancelled).toHaveBeenCalled();
  });

  it('keeps ordinary run reads on the regular fetch', async () => {
    const { createMobileCloudAgentRunClient } = loadStreaming();
    guardedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ runs: [], nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await createMobileCloudAgentRunClient()
      .listRuns()
      .catch(() => undefined);

    expect(guardedFetchMock.mock.calls[0]).toHaveLength(2);
  });

  it('acts on a passkey refusal from a run call as it does for a chat turn', async () => {
    const announce = jest.fn();
    jest.doMock('@/src/features/auth/services/accountSecurityEvents', () => ({
      announcePasskeyRequired: announce,
      onPasskeyRequired: jest.fn(() => () => undefined),
    }));
    const { createMobileCloudAgentRunClient } = loadStreaming();
    guardedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'passkey_required',
            message: 'Verify with a passkey.',
            details: { reason: 'passkey_required' },
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await createMobileCloudAgentRunClient()
      .resumeRun('0190a000-0000-7000-8000-000000000001', [
        { toolCallId: 'call-1', decision: 'approved' },
      ])
      .catch(() => undefined);

    expect(announce).toHaveBeenCalled();
    jest.dontMock('@/src/features/auth/services/accountSecurityEvents');
  });
});
