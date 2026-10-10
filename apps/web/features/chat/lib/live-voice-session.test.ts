// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import {
  KEEPALIVE_INTERVAL_MS,
  KEEPALIVE_TIMEOUT_MS,
  LIVE_SESSION_MESSAGE,
  LiveVoiceSession,
  LiveVoiceSessionError,
  type LiveTranscriptTurn,
  type LiveVoiceSessionCallbacks,
} from './live-voice-session';

class FakeChannel extends EventTarget {
  readyState: RTCDataChannelState = 'open';
  readonly sent: Record<string, unknown>[] = [];
  send(payload: string) {
    this.sent.push(JSON.parse(payload) as Record<string, unknown>);
  }
  close() {
    this.readyState = 'closed';
  }
  receive(event: Record<string, unknown>) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }));
  }
}

class FakePeer extends EventTarget {
  connectionState: RTCPeerConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription = { sdp: 'offer-sdp' };
  remote: RTCSessionDescriptionInit | null = null;
  closed = false;
  bytesReceived = 0;
  async getStats() {
    return new Map([
      ['pair', { type: 'candidate-pair', bytesReceived: this.bytesReceived }],
      ['outbound', { type: 'outbound-rtp', bytesSent: 999 }],
    ]);
  }
  readonly channel = new FakeChannel();
  createDataChannel(label: string) {
    expect(label).toBe('oai-events');
    return this.channel as unknown as RTCDataChannel;
  }
  addTrack() {
    return {} as RTCRtpSender;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'offer-sdp' } as RTCSessionDescriptionInit;
  }
  async setLocalDescription() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remote = description;
  }
  close() {
    this.closed = true;
  }
}

function fakeTrack(): MediaStreamTrack {
  return {
    stop: vi.fn(),
    enabled: true,
    label: 'Studio mic',
    kind: 'audio',
  } as unknown as MediaStreamTrack;
}

function callbacks(): LiveVoiceSessionCallbacks & { turns: LiveTranscriptTurn[] } {
  const turns: LiveTranscriptTurn[] = [];
  return {
    turns,
    onStarted: vi.fn(),
    onSpeaking: vi.fn(),
    onBackendBusy: vi.fn(),
    onToolActivity: vi.fn(),
    onUnverifiedClaim: vi.fn(),
    onTranscript: vi.fn((turn: LiveTranscriptTurn) => turns.push(turn)),
    onUsage: vi.fn(),
    onClosed: vi.fn(),
    onError: vi.fn(),
    onConnectionLost: vi.fn(),
  };
}

describe('LiveVoiceSession', () => {
  let peer: FakePeer;
  let tracks: MediaStreamTrack[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    peer = new FakePeer();
    tracks = [fakeTrack()];
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            sessionId: 'live_1',
            sdp: 'answer-sdp',
            settlement: {
              idempotencyKey: 'key',
              leaseToken: 'lease',
              requestHash: 'hash',
              estimatedCostCents: 50,
              ceilingSeconds: 600,
            },
            tools: [
              {
                id: 'web_search',
                label: 'Searching the web',
                timeoutMs: 20_000,
                requiresApproval: false,
              },
            ],
          }),
          { status: 201 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'RTCPeerConnection',
      class {
        constructor() {
          return peer;
        }
      },
    );
    vi.stubGlobal(
      'MediaStream',
      class {
        addTrack() {}
        getAudioTracks() {
          return [];
        }
        getTracks() {
          return [];
        }
      },
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => tracks,
          getAudioTracks: () => tracks,
        })),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function startSession(cb = callbacks()) {
    const session = await LiveVoiceSession.start({
      voice: 'marin',
      conversationId: null,
      callbacks: cb,
    });
    return { session, cb };
  }

  it('posts the offer to the app server, applies the answer and reports session.started', async () => {
    const { session, cb } = await startSession();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/voice/live/sessions');
    expect(JSON.parse(String(init.body))).toEqual({
      sdp: 'offer-sdp',
      voice: 'marin',
      conversationId: null,
      language: null,
      surface: 'web',
    });
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-token');
    expect(peer.remote).toEqual({ type: 'answer', sdp: 'answer-sdp' });
    expect(session.sessionId).toBe('live_1');
    expect(cb.onStarted).not.toHaveBeenCalled();
    expect(peer.channel.sent).toEqual([]);

    peer.channel.receive({ type: 'session.started', event_id: 'e1', session: { id: 'live_1' } });
    expect(cb.onStarted).toHaveBeenCalledTimes(1);
  });

  it('keeps a turn open through brief overlap and finalizes it once the other side has taken over', async () => {
    vi.useFakeTimers();
    try {
      const { cb } = await startSession();
      const input = (delta: string) =>
        peer.channel.receive({
          type: 'session.input_transcript.delta',
          delta,
          start_ms: 0,
          end_ms: 0,
        });
      const output = (delta: string) =>
        peer.channel.receive({
          type: 'session.output_transcript.delta',
          delta,
          start_ms: 0,
          end_ms: 0,
        });

      input('What is the square root');
      output("That's ");
      input(' of one forty four');
      await vi.advanceTimersByTimeAsync(300);
      output('twelve.');
      await vi.advanceTimersByTimeAsync(2_000);

      let finals = cb.turns.filter((turn) => turn.final);
      expect(finals.map((turn) => [turn.role, turn.text])).toEqual([
        ['user', 'What is the square root of one forty four'],
      ]);

      input('Actually stop.');
      await vi.advanceTimersByTimeAsync(2_000);
      finals = cb.turns.filter((turn) => turn.final);
      expect(finals.map((turn) => [turn.role, turn.text])).toEqual([
        ['user', 'What is the square root of one forty four'],
        ['assistant', "That's twelve."],
      ]);
      const last = cb.turns[cb.turns.length - 1]!;
      expect(last).toMatchObject({ role: 'user', text: 'Actually stop.', final: false });
      expect(new Set(cb.turns.map((turn) => turn.turnId)).size).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks backend delegation independently of the transcript', async () => {
    const { cb } = await startSession();
    peer.channel.receive({
      type: 'session.delegation.created',
      offset_ms: 10,
      delegation: { id: 'item_1', type: 'delegation', target: 'responses', response_id: 'resp_1' },
    });
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(true);
    peer.channel.receive({
      type: 'response.event',
      delegation_id: 'item_1',
      event: { type: 'response.output_text.delta', delta: 'partial' },
    });
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(true);
    peer.channel.receive({
      type: 'response.event',
      delegation_id: 'item_1',
      event: { type: 'response.completed', response: { output: [] } },
    });
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(false);
    expect(cb.onTranscript).not.toHaveBeenCalled();
  });

  it('finalizes an assistant turn from transcript silence when remote audio is never detected', async () => {
    vi.useFakeTimers();
    try {
      const { cb } = await startSession();
      peer.channel.receive({ type: 'session.started', event_id: 'e1' });
      peer.channel.receive({ type: 'session.output_transcript.delta', delta: 'Four.' });
      peer.channel.receive({ type: 'session.output_transcript.delta', delta: ' Goodbye.' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(cb.turns.filter((turn) => turn.final)).toEqual([]);

      await vi.advanceTimersByTimeAsync(600);
      const finals = cb.turns.filter((turn) => turn.final);
      expect(finals.map((turn) => [turn.role, turn.text])).toEqual([
        ['assistant', 'Four. Goodbye.'],
      ]);
      expect(cb.onSpeaking).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds microphone commands until session.started and only mutes the track locally before it', async () => {
    const { session } = await startSession();
    session.setMuted(true);
    expect(tracks[0]!.enabled).toBe(false);
    expect(peer.channel.sent).toEqual([]);

    peer.channel.receive({ type: 'session.started', event_id: 'e1' });
    session.setMuted(false);
    expect(tracks[0]!.enabled).toBe(true);
    expect(peer.channel.sent.at(-1)).toMatchObject({ type: 'session.input_audio.unmute' });
  });

  it('replays a mute chosen while connecting once the session starts', async () => {
    const { session } = await startSession();
    session.setMuted(true);
    expect(peer.channel.sent).toEqual([]);

    peer.channel.receive({ type: 'session.started', event_id: 'e1' });

    expect(peer.channel.sent).toContainEqual(
      expect.objectContaining({ type: 'session.input_audio.mute' }),
    );
    expect(tracks[0]!.enabled).toBe(false);
  });

  it('reports usage snapshots and finishes the close handshake before tearing down', async () => {
    const { session, cb } = await startSession();
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });
    peer.channel.receive({ type: 'session.usage.updated', usage: { seconds: 12 } });
    expect(cb.onUsage).toHaveBeenCalledWith(12);

    session.setMuted(true);
    expect(tracks[0]!.enabled).toBe(false);
    expect(peer.channel.sent.at(-1)).toMatchObject({ type: 'session.input_audio.mute' });

    const closing = session.close();
    expect(peer.channel.sent.at(-1)).toMatchObject({ type: 'session.close' });
    expect(tracks[0]!.stop).toHaveBeenCalled();
    peer.channel.receive({
      type: 'session.closed',
      reason: 'close_requested',
      usage: { seconds: 30 },
    });
    const closed = await closing;
    expect(closed).toEqual({ reason: 'close_requested', seconds: 30 });
    expect(peer.closed).toBe(true);
    expect(cb.onClosed).not.toHaveBeenCalled();
  });

  it('maps a denied microphone to the permission message and opens no connection', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(denied);
    await expect(startSession()).rejects.toMatchObject({
      message: LIVE_SESSION_MESSAGE.microphoneDenied,
      code: 'microphone_denied',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a quiet session alive while its transport still receives bytes, without a ping event', async () => {
    vi.useFakeTimers();
    try {
      const { cb } = await startSession();
      peer.channel.receive({ type: 'session.started', event_id: 'e1' });

      for (let elapsed = 0; elapsed < KEEPALIVE_TIMEOUT_MS * 2; elapsed += KEEPALIVE_INTERVAL_MS) {
        peer.bytesReceived += 1_000;
        await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
      }
      expect(cb.onError).not.toHaveBeenCalled();
      expect(cb.onConnectionLost).not.toHaveBeenCalled();
      expect(peer.channel.sent.map((event) => event['type'])).not.toContain('session.ping');
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a link that has gone silent as a recoverable drop', async () => {
    vi.useFakeTimers();
    try {
      const { cb } = await startSession();
      peer.channel.receive({ type: 'session.started', event_id: 'e1' });

      await vi.advanceTimersByTimeAsync(KEEPALIVE_TIMEOUT_MS + KEEPALIVE_INTERVAL_MS);

      expect(cb.onConnectionLost).toHaveBeenCalledWith(LIVE_SESSION_MESSAGE.connectionDropped);
      expect(cb.onError).not.toHaveBeenCalled();
      expect(peer.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands a failed peer to the host as recoverable, with the turn in flight finalized', async () => {
    const { cb } = await startSession();
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });
    peer.channel.receive({ type: 'session.output_transcript.delta', delta: 'Half a sentence' });

    peer.connectionState = 'failed';
    peer.dispatchEvent(new Event('connectionstatechange'));

    expect(cb.onConnectionLost).toHaveBeenCalledWith(LIVE_SESSION_MESSAGE.connectionDropped);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.turns.filter((turn) => turn.final).map((turn) => turn.text)).toEqual([
      'Half a sentence',
    ]);
  });

  it('reports a drop before the session started as a failure, never as a reconnect', async () => {
    const { cb } = await startSession();

    peer.connectionState = 'failed';
    peer.dispatchEvent(new Event('connectionstatechange'));

    expect(cb.onError).toHaveBeenCalledWith(LIVE_SESSION_MESSAGE.connectionFailed);
    expect(cb.onConnectionLost).not.toHaveBeenCalled();
  });

  it('leaves a host with no reconnect path on the error it already handled', async () => {
    const cb = callbacks();
    delete (cb as { onConnectionLost?: unknown }).onConnectionLost;
    await startSession(cb);
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });

    peer.connectionState = 'failed';
    peer.dispatchEvent(new Event('connectionstatechange'));

    expect(cb.onError).toHaveBeenCalledWith(LIVE_SESSION_MESSAGE.connectionDropped);
  });

  it('surfaces the server error message when the session is refused and releases the microphone', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'live_voice_access_denied', message: 'No access.' } }),
        { status: 403 },
      ),
    );
    await expect(startSession()).rejects.toBeInstanceOf(LiveVoiceSessionError);
    expect(tracks[0]!.stop).toHaveBeenCalled();
    expect(peer.closed).toBe(true);
  });

  it('labels a running tool and clears it when the delegated turn completes', async () => {
    const { cb } = await startSession();
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });

    peer.channel.receive({
      type: 'session.delegation.created',
      delegation: { id: 'd1', tool: 'web_search' },
    });
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(true);
    expect(cb.onToolActivity).toHaveBeenLastCalledWith([
      expect.objectContaining({ delegationId: 'd1', toolId: 'web_search', state: 'running' }),
    ]);

    peer.channel.receive({
      type: 'response.event',
      delegation_id: 'd1',
      event: { type: 'response.completed' },
    });
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(false);
    expect(cb.onToolActivity).toHaveBeenLastCalledWith([]);
  });

  it('marks a tool that outran its budget so the caller can offer to cancel', async () => {
    vi.useFakeTimers();
    try {
      const { cb } = await startSession();
      peer.channel.receive({ type: 'session.started', event_id: 'e1' });
      peer.channel.receive({
        type: 'session.delegation.created',
        delegation: { id: 'd1', tool: 'web_search' },
      });
      vi.advanceTimersByTime(20_001);
      expect(cb.onToolActivity).toHaveBeenLastCalledWith([
        expect.objectContaining({ delegationId: 'd1', state: 'timed_out' }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the in-flight delegation on close instead of leaving the provider running it', async () => {
    const { session } = await startSession();
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });
    peer.channel.receive({
      type: 'session.delegation.created',
      delegation: { id: 'd1', tool: 'web_search' },
    });

    const closing = session.close();
    const sent = peer.channel.sent.map((event) => event['type']);
    expect(sent).toContain('session.close');
    expect(sent).not.toContain('session.delegation.cancel');
    peer.channel.receive({ type: 'session.closed', reason: 'close_requested' });
    await closing;
  });

  it('stops a running task with a documented instruction instead of an undefined cancel event', async () => {
    const { cb, session } = await startSession();
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });
    peer.channel.receive({
      type: 'session.delegation.created',
      delegation: { id: 'd1', tool: 'web_search' },
    });

    session.cancelBackendWork();

    expect(peer.channel.sent.at(-1)).toMatchObject({
      type: 'session.instructions.append',
      delegation_id: null,
    });
    expect(peer.channel.sent.map((event) => event['type'])).not.toContain(
      'session.delegation.cancel',
    );
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(false);
  });

  it('never sends session.update for voice settings and appends instructions only for a real change', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: 'live_1',
          sdp: 'answer-sdp',
          settings: { voice: 'marin', language: null, pace: 1 },
          settlement: {
            idempotencyKey: 'key',
            leaseToken: 'lease',
            requestHash: 'hash',
            ceilingSeconds: 600,
          },
        }),
        { status: 201 },
      ),
    );
    const { session } = await startSession();
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });
    fetchMock.mockClear();

    await session.updateSettings({ voice: 'quartz', language: null, pace: 1 });
    expect(peer.channel.sent.map((event) => event['type'])).not.toContain('session.update');
    expect(peer.channel.sent).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();

    await session.updateSettings({ voice: 'quartz', language: 'es', pace: 1.5 });
    expect(peer.channel.sent).toEqual([
      expect.objectContaining({
        type: 'session.instructions.append',
        delegation_id: null,
        content:
          "Speak and transcribe in es. Keep to it even when the user's audio is ambiguous. Speak at about 1.5 times your natural speaking pace.",
      }),
    ]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ language: 'es', pace: 1.5 });

    await session.updateSettings({ voice: 'quartz', language: 'es', pace: 1.5 });
    expect(peer.channel.sent).toHaveLength(1);
  });

  it('totals the delegated backend usage once per response, with web search calls', async () => {
    const { session } = await startSession();
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });
    expect(session.backendUsage).toBeNull();

    const completed = (id: string, input: number, output: number, cached: number) => ({
      type: 'response.event',
      delegation_id: 'd1',
      event: {
        type: 'response.completed',
        response: {
          id,
          output: [],
          usage: {
            input_tokens: input,
            output_tokens: output,
            input_tokens_details: { cached_tokens: cached },
          },
        },
      },
    });
    peer.channel.receive({
      type: 'response.event',
      delegation_id: 'd1',
      event: { type: 'response.output_item.done', item: { id: 'ws_1', type: 'web_search_call' } },
    });
    peer.channel.receive({
      type: 'response.event',
      delegation_id: 'd1',
      event: { type: 'response.output_item.done', item: { id: 'ws_1', type: 'web_search_call' } },
    });
    peer.channel.receive(completed('resp_1', 1_000, 200, 400));
    peer.channel.receive(completed('resp_1', 1_000, 200, 400));
    peer.channel.receive(completed('resp_2', 300, 50, 9_999));
    peer.channel.receive({
      type: 'response.event',
      event: { type: 'response.completed', response: { id: 'resp_3' } },
    });

    expect(session.backendUsage).toEqual({
      inputTokens: 1_300,
      outputTokens: 250,
      cachedTokens: 700,
      webSearchCalls: 1,
    });
  });

  it('reports a provider error during the call without ending it', async () => {
    const cb = callbacks();
    const onProviderError = vi.fn();
    const { session } = await startSession({ ...cb, onProviderError });
    peer.channel.receive({ type: 'session.started', event_id: 'e1' });

    peer.channel.receive({
      type: 'error',
      event_id: 'evt_err',
      error: { type: 'invalid_request_error', code: 'moderation_blocked', message: 'Blocked.' },
    });

    expect(onProviderError).toHaveBeenCalledWith({
      code: 'moderation_blocked',
      message: 'Blocked.',
    });
    expect(cb.onError).not.toHaveBeenCalled();
    expect(peer.closed).toBe(false);
    session.dispose();
  });

  it('tells the host when the browser blocks the assistant audio, and plays on a later tap', async () => {
    const blocked = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(blocked)
      .mockResolvedValue(undefined);
    vi.stubGlobal(
      'MediaStream',
      class {
        addTrack() {}
        getAudioTracks() {
          return [fakeTrack()];
        }
        getTracks() {
          return [];
        }
      },
    );
    const cb = callbacks();
    const onPlaybackBlocked = vi.fn();
    const { session } = await startSession({ ...cb, onPlaybackBlocked });

    await vi.waitFor(() => expect(onPlaybackBlocked).toHaveBeenCalledTimes(1));
    await expect(session.resumePlayback()).resolves.toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    play.mockRestore();
  });

  it('reports a spoken success claim with no tool result behind it', async () => {
    vi.useFakeTimers();
    try {
      const { cb } = await startSession();
      peer.channel.receive({ type: 'session.started', event_id: 'e1' });
      peer.channel.receive({
        type: 'session.output_transcript.delta',
        delta: "I've sent the message.",
      });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(cb.onUnverifiedClaim).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', final: true }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts the same claim once a tool call actually completed', async () => {
    vi.useFakeTimers();
    try {
      const { cb } = await startSession();
      peer.channel.receive({ type: 'session.started', event_id: 'e1' });
      peer.channel.receive({
        type: 'session.delegation.created',
        delegation: { id: 'd1', tool: 'web_search' },
      });
      peer.channel.receive({
        type: 'response.event',
        delegation_id: 'd1',
        event: { type: 'response.completed' },
      });
      peer.channel.receive({
        type: 'session.output_transcript.delta',
        delta: "I've sent the message.",
      });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(cb.onUnverifiedClaim).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
