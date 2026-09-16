class FakeChannel {
  readyState = 'open';
  readonly sent: Record<string, unknown>[] = [];
  private listeners: Array<(event: { data: string }) => void> = [];

  addEventListener(type: string, listener: (event: { data: string }) => void) {
    if (type === 'message') this.listeners.push(listener);
  }

  removeEventListener() {}

  send(payload: string) {
    this.sent.push(JSON.parse(payload) as Record<string, unknown>);
  }

  close() {
    this.readyState = 'closed';
  }

  receive(event: Record<string, unknown>) {
    for (const listener of this.listeners) listener({ data: JSON.stringify(event) });
  }
}

class FakePeer {
  connectionState = 'new';
  iceGatheringState = 'complete';
  localDescription: { sdp: string } | null = { sdp: 'offer-sdp' };
  remote: { type: string; sdp: string } | null = null;
  closed = false;
  readonly channel = new FakeChannel();
  readonly added: unknown[] = [];
  private listeners = new Map<string, Array<() => void>>();

  createDataChannel() {
    return this.channel;
  }

  addTrack(track: unknown) {
    this.added.push(track);
    return {};
  }

  addEventListener(type: string, listener: () => void) {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  removeEventListener() {}

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  async createOffer() {
    return { type: 'offer', sdp: 'offer-sdp' };
  }

  async setLocalDescription() {}

  async setRemoteDescription(description: { type: string; sdp: string }) {
    this.remote = description;
  }

  close() {
    this.closed = true;
  }
}

const mockState = {
  peer: new FakePeer(),
  tracks: [] as Array<{ stop: jest.Mock; enabled: boolean; kind: string }>,
  getUserMedia: jest.fn(),
};

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn().mockImplementation(() => mockState.peer),
  RTCSessionDescription: jest
    .fn()
    .mockImplementation((description: unknown) => description as object),
  MediaStream: jest.fn(),
  mediaDevices: { getUserMedia: (...args: unknown[]) => mockState.getUserMedia(...args) },
}));

const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

jest.mock('react-native', () => ({ NativeModules: { WebRTCModule: {} } }));

import {
  LIVE_VOICE_SESSION_PATH,
  LiveVoiceSession,
  LiveVoiceSessionError,
  settleLiveVoiceSession,
  type LiveTranscriptTurn,
  type LiveVoiceSessionCallbacks,
} from '@/src/features/voice/services/liveVoiceSession';
import {
  LIVE_VOICE_LOCAL_MODE_REASON,
  LIVE_VOICE_MESSAGE,
  LIVE_VOICE_SIGNIN_REASON,
  liveVoiceModeUnavailableReason,
  liveVoiceUnavailableReason,
} from '@/src/features/voice/services/liveVoiceAvailability';

const SETTLEMENT = {
  idempotencyKey: 'key',
  leaseToken: 'lease',
  requestHash: 'hash',
  estimatedCostCents: 50,
  ceilingSeconds: 600,
};

function callbacks(): LiveVoiceSessionCallbacks & { turns: LiveTranscriptTurn[] } {
  const turns: LiveTranscriptTurn[] = [];
  return {
    turns,
    onStarted: jest.fn(),
    onAssistantSpeaking: jest.fn(),
    onBackendBusy: jest.fn(),
    onTranscript: jest.fn((turn: LiveTranscriptTurn) => turns.push(turn)),
    onInterrupted: jest.fn(),
    onUsage: jest.fn(),
    onClosed: jest.fn(),
    onError: jest.fn(),
  };
}

function createdResponse() {
  return {
    ok: true,
    json: async () => ({ sessionId: 'live_1', sdp: 'answer-sdp', settlement: SETTLEMENT }),
  };
}

async function startSession(cb = callbacks()) {
  const session = await LiveVoiceSession.start({
    voice: null,
    conversationId: 'conv_1',
    callbacks: cb,
  });
  return { session, cb };
}

describe('LiveVoiceSession', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockState.peer = new FakePeer();
    mockState.tracks = [{ stop: jest.fn(), enabled: true, kind: 'audio' }];
    mockState.getUserMedia = jest.fn(async () => ({
      getTracks: () => mockState.tracks,
      getAudioTracks: () => mockState.tracks,
    }));
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(createdResponse());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('posts the offer to the app server and applies the answer', async () => {
    const { cb } = await startSession();

    const [path, init] = mockApiFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe(LIVE_VOICE_SESSION_PATH);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ sdp: 'offer-sdp', conversationId: 'conv_1' });
    expect(mockState.peer.remote).toEqual({ type: 'answer', sdp: 'answer-sdp' });
    expect(mockState.peer.added).toHaveLength(1);

    mockState.peer.channel.receive({ type: 'session.started', session: { id: 'live_1' } });
    expect(cb.onStarted).toHaveBeenCalled();
  });

  it('builds a user turn and an assistant turn from transcript deltas', async () => {
    const { cb } = await startSession();

    mockState.peer.channel.receive({ type: 'session.input_transcript.delta', delta: 'book a ' });
    mockState.peer.channel.receive({ type: 'session.input_transcript.delta', delta: 'table' });
    expect(cb.turns.at(-1)).toMatchObject({ role: 'user', text: 'book a table', final: false });

    mockState.peer.channel.receive({ type: 'session.output_transcript.delta', delta: 'On it' });
    expect(cb.onAssistantSpeaking).toHaveBeenCalledWith(true);

    jest.advanceTimersByTime(2_000);
    const finals = cb.turns.filter((turn) => turn.final);
    expect(finals.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(finals.at(-1)?.text).toBe('On it');
    expect(cb.onAssistantSpeaking).toHaveBeenLastCalledWith(false);
  });

  it('reports an interruption when the user speaks over the assistant', async () => {
    const { cb } = await startSession();

    mockState.peer.channel.receive({
      type: 'session.output_transcript.delta',
      delta: 'Here is a long',
    });
    expect(cb.onAssistantSpeaking).toHaveBeenLastCalledWith(true);

    mockState.peer.channel.receive({ type: 'session.input_transcript.delta', delta: 'stop' });

    expect(cb.onInterrupted).toHaveBeenCalledTimes(1);
    expect(cb.onAssistantSpeaking).toHaveBeenLastCalledWith(false);
    expect(cb.turns).toContainEqual(
      expect.objectContaining({ role: 'assistant', text: 'Here is a long', final: true }),
    );
  });

  it('tracks the delegated backend as tool activity', async () => {
    const { cb } = await startSession();

    mockState.peer.channel.receive({
      type: 'session.delegation.created',
      delegation: { id: 'del_1' },
    });
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(true);

    mockState.peer.channel.receive({
      type: 'response.event',
      delegation_id: 'del_1',
      event: { type: 'response.completed' },
    });
    expect(cb.onBackendBusy).toHaveBeenLastCalledWith(false);
  });

  it('mutes the microphone track and tells the session', async () => {
    const { session } = await startSession();
    session.setMuted(true);
    expect(mockState.tracks[0]?.enabled).toBe(false);
    expect(mockState.peer.channel.sent).toEqual([]);
    mockState.peer.channel.receive({ type: 'session.started' });

    session.setMuted(true);
    expect(mockState.tracks[0]?.enabled).toBe(false);
    expect(mockState.peer.channel.sent.at(-1)).toMatchObject({ type: 'session.input_audio.mute' });

    session.setMuted(false);
    expect(mockState.tracks[0]?.enabled).toBe(true);
    expect(mockState.peer.channel.sent.at(-1)).toMatchObject({
      type: 'session.input_audio.unmute',
    });
  });

  it('closes on the session.closed acknowledgement and stops the microphone', async () => {
    const { session, cb } = await startSession();

    mockState.peer.channel.receive({ type: 'session.usage.updated', usage: { seconds: 42 } });
    expect(cb.onUsage).toHaveBeenCalledWith(42);

    const closing = session.close();
    expect(mockState.peer.channel.sent.at(-1)).toMatchObject({ type: 'session.close' });
    mockState.peer.channel.receive({
      type: 'session.closed',
      reason: 'close_requested',
      usage: { seconds: 44 },
    });

    await expect(closing).resolves.toEqual({ reason: 'close_requested', seconds: 44 });
    expect(mockState.tracks[0]?.stop).toHaveBeenCalled();
    expect(mockState.peer.closed).toBe(true);
  });

  it('reports a remote close that the client did not ask for', async () => {
    const { cb } = await startSession();

    mockState.peer.channel.receive({ type: 'session.closed', reason: 'expired' });

    expect(cb.onClosed).toHaveBeenCalledWith({ reason: 'expired', seconds: null });
    expect(mockState.peer.closed).toBe(true);
  });

  it('fails the session when the connection drops after the grace period', async () => {
    const { cb } = await startSession();
    mockState.peer.channel.receive({ type: 'session.started' });

    mockState.peer.connectionState = 'disconnected';
    mockState.peer.emit('connectionstatechange');
    jest.advanceTimersByTime(6_000);

    expect(cb.onError).toHaveBeenCalledWith(LIVE_VOICE_MESSAGE.connectionDropped);
  });

  it('surfaces the server error message when the session is refused', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: { message: 'Out of credits.', code: 'insufficient_quota' } }),
    });

    await expect(startSession()).rejects.toMatchObject({
      message: 'Out of credits.',
      code: 'insufficient_quota',
    });
    expect(mockState.peer.closed).toBe(true);
    expect(mockState.tracks[0]?.stop).toHaveBeenCalled();
  });

  it('refuses to start when the native WebRTC module is missing', async () => {
    const nativeModules = jest.requireMock('react-native').NativeModules as Record<string, unknown>;
    const saved = nativeModules['WebRTCModule'];
    delete nativeModules['WebRTCModule'];
    try {
      expect(liveVoiceUnavailableReason()).toBe(LIVE_VOICE_MESSAGE.unsupported);
      await expect(startSession()).rejects.toBeInstanceOf(LiveVoiceSessionError);
    } finally {
      nativeModules['WebRTCModule'] = saved;
    }
  });

  it('keeps Local Mode and a signed-out session on the turn-based path', () => {
    expect(liveVoiceModeUnavailableReason({ executionMode: 'local', signedIn: true })).toBe(
      LIVE_VOICE_LOCAL_MODE_REASON,
    );
    expect(liveVoiceModeUnavailableReason({ executionMode: 'cloud', signedIn: false })).toBe(
      LIVE_VOICE_SIGNIN_REASON,
    );
    expect(liveVoiceModeUnavailableReason({ executionMode: 'cloud', signedIn: true })).toBeNull();
  });

  it('reports the billed seconds to the close route', async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await settleLiveVoiceSession('live_1', SETTLEMENT, { reason: 'close_requested', seconds: 31 });

    const [path, init] = mockApiFetch.mock.calls[0] as [string, { body: string }];
    expect(path).toBe(`${LIVE_VOICE_SESSION_PATH}/live_1/close`);
    expect(JSON.parse(init.body)).toEqual({
      seconds: 31,
      reason: 'close_requested',
      settlement: SETTLEMENT,
    });
  });
});
