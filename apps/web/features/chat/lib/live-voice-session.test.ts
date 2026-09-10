// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import {
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
    onTranscript: vi.fn((turn: LiveTranscriptTurn) => turns.push(turn)),
    onUsage: vi.fn(),
    onClosed: vi.fn(),
    onError: vi.fn(),
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

  it('reports usage snapshots and finishes the close handshake before tearing down', async () => {
    const { session, cb } = await startSession();
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
});
