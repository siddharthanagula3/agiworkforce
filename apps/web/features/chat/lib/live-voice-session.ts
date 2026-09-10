import { getCsrfToken } from '@/lib/client/csrf';
import { ANALYSER_FFT_SIZE, readAnalyserLevel } from '@features/chat/lib/dictation-machine';

export const LIVE_SESSION_ENDPOINT = '/api/voice/live/sessions';
const EVENTS_CHANNEL = 'oai-events';
const CSRF_HEADER = 'x-csrf-token';
const ICE_GATHERING_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 3_000;
const DISCONNECT_GRACE_MS = 5_000;
const LEVEL_SAMPLE_MS = 50;
const ASSISTANT_AUDIO_LEVEL = 0.03;
const ASSISTANT_AUDIO_HOLD_MS = 350;
const ASSISTANT_TURN_SETTLE_MS = 1_500;
const OVERLAP_GRACE_MS = 800;
const CLIENT_EVENT_PREFIX = 'agi';

export const LIVE_SESSION_MESSAGE = {
  microphoneDenied: 'Microphone access was denied. Allow the microphone to use voice mode.',
  microphoneUnavailable: 'No microphone is available in this browser.',
  unsupported: 'This browser cannot open a voice connection.',
  connectionFailed: 'The voice connection could not be established.',
  connectionDropped: 'The voice connection dropped.',
  sessionEnded: 'The voice session ended.',
  sessionRejected: 'The voice session could not be started.',
} as const;

export type LiveTranscriptRole = 'user' | 'assistant';

export interface LiveTranscriptTurn {
  turnId: string;
  role: LiveTranscriptRole;
  text: string;
  final: boolean;
}

export interface LiveSessionSettlement {
  idempotencyKey: string;
  leaseToken: string;
  requestHash: string;
  estimatedCostCents: number;
  ceilingSeconds: number;
}

export interface LiveSessionClosed {
  reason: string;
  seconds: number | null;
}

export interface LiveVoiceSessionCallbacks {
  onStarted: () => void;
  onSpeaking: (active: boolean) => void;
  onBackendBusy: (active: boolean) => void;
  onTranscript: (turn: LiveTranscriptTurn) => void;
  onUsage: (seconds: number) => void;
  onClosed: (closed: LiveSessionClosed) => void;
  onError: (message: string) => void;
}

export interface LiveVoiceSessionOptions {
  voice: string | null;
  conversationId: string | null;
  callbacks: LiveVoiceSessionCallbacks;
}

interface CreateSessionResponse {
  sessionId: string;
  sdp: string;
  settlement: LiveSessionSettlement;
}

interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

const DELEGATION_TERMINAL_EVENTS = new Set([
  'response.completed',
  'response.failed',
  'response.incomplete',
  'response.cancelled',
]);

export class LiveVoiceSessionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LiveVoiceSessionError';
  }
}

async function readErrorMessage(response: Response): Promise<LiveVoiceSessionError> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string };
    };
    const message = body.error?.message?.trim();
    const code = body.error?.code ?? `http_${response.status}`;
    return new LiveVoiceSessionError(message || LIVE_SESSION_MESSAGE.sessionRejected, code);
  } catch {
    return new LiveVoiceSessionError(
      LIVE_SESSION_MESSAGE.sessionRejected,
      `http_${response.status}`,
    );
  }
}

function microphoneError(error: unknown): LiveVoiceSessionError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new LiveVoiceSessionError(LIVE_SESSION_MESSAGE.microphoneDenied, 'microphone_denied');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new LiveVoiceSessionError(
      LIVE_SESSION_MESSAGE.microphoneUnavailable,
      'microphone_unavailable',
    );
  }
  return new LiveVoiceSessionError(LIVE_SESSION_MESSAGE.connectionFailed, 'microphone_failed');
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
    function finish() {
      window.clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }
    function onChange() {
      if (peer.iceGatheringState === 'complete') finish();
    }
    peer.addEventListener('icegatheringstatechange', onChange);
  });
}

export class LiveVoiceSession {
  readonly settlement: LiveSessionSettlement;
  readonly sessionId: string;

  private readonly callbacks: LiveVoiceSessionCallbacks;
  private readonly microphone: MediaStream;
  private readonly peer: RTCPeerConnection;
  private readonly channel: RTCDataChannel;
  private readonly audio: HTMLAudioElement;
  private context: AudioContext | null = null;
  private levelTimer: number | null = null;
  private settleTimer: number | null = null;
  private disconnectTimer: number | null = null;
  private lastAudioAt = 0;
  private speaking = false;
  private started = false;
  private closing = false;
  private disposed = false;
  private clientEventSeq = 0;
  private userTurn: { id: string; text: string; lastDeltaAt: number } | null = null;
  private assistantTurn: { id: string; text: string; lastDeltaAt: number } | null = null;
  private overlapTimer: number | null = null;
  private readonly pendingDelegations = new Set<string>();
  private closeResolve: (() => void) | null = null;
  private usageSeconds: number | null = null;

  private constructor(
    microphone: MediaStream,
    peer: RTCPeerConnection,
    channel: RTCDataChannel,
    audio: HTMLAudioElement,
    created: CreateSessionResponse,
    callbacks: LiveVoiceSessionCallbacks,
  ) {
    this.microphone = microphone;
    this.peer = peer;
    this.channel = channel;
    this.audio = audio;
    this.sessionId = created.sessionId;
    this.settlement = created.settlement;
    this.callbacks = callbacks;
  }

  static async start(options: LiveVoiceSessionOptions): Promise<LiveVoiceSession> {
    if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new LiveVoiceSessionError(LIVE_SESSION_MESSAGE.unsupported, 'unsupported');
    }
    let microphone: MediaStream;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      throw microphoneError(error);
    }

    const peer = new RTCPeerConnection();
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.hidden = true;
    const remote = new MediaStream();
    audio.srcObject = remote;
    document.body.append(audio);
    const channel = peer.createDataChannel(EVENTS_CHANNEL);
    const inbox: MessageEvent[] = [];
    let session: LiveVoiceSession | null = null;
    const teardown = () => {
      microphone.getTracks().forEach((track) => track.stop());
      peer.close();
      audio.srcObject = null;
      audio.remove();
    };

    peer.addEventListener('track', (event) => {
      event.streams[0]?.getTracks().forEach((track) => remote.addTrack(track));
      if (event.streams.length === 0) remote.addTrack(event.track);
      session?.watchRemoteAudio(remote);
    });
    channel.addEventListener('message', (event) => {
      if (session) session.handleMessage(event);
      else inbox.push(event);
    });
    microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new LiveVoiceSessionError(LIVE_SESSION_MESSAGE.connectionFailed, 'no_offer');
      const response = await fetch(LIVE_SESSION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: await getCsrfToken() },
        body: JSON.stringify({
          sdp,
          voice: options.voice,
          conversationId: options.conversationId,
        }),
      });
      if (!response.ok) throw await readErrorMessage(response);
      const created = (await response.json()) as CreateSessionResponse;
      await peer.setRemoteDescription({ type: 'answer', sdp: created.sdp });
      session = new LiveVoiceSession(microphone, peer, channel, audio, created, options.callbacks);
      session.watchRemoteAudio(remote);
      session.watchConnection();
      for (const event of inbox) session.handleMessage(event);
      return session;
    } catch (error) {
      teardown();
      throw error instanceof LiveVoiceSessionError
        ? error
        : new LiveVoiceSessionError(LIVE_SESSION_MESSAGE.connectionFailed, 'connection_failed');
    }
  }

  get microphoneLabel(): string {
    return this.microphone.getAudioTracks()[0]?.label ?? '';
  }

  get lastUsageSeconds(): number | null {
    return this.usageSeconds;
  }

  setMuted(muted: boolean): void {
    this.microphone.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.send({ type: muted ? 'session.input_audio.mute' : 'session.input_audio.unmute' });
  }

  async close(): Promise<LiveSessionClosed> {
    if (this.disposed) return { reason: 'disposed', seconds: this.usageSeconds };
    this.closing = true;
    this.microphone.getTracks().forEach((track) => track.stop());
    this.audio.pause();
    let closed: LiveSessionClosed = { reason: 'close_requested', seconds: this.usageSeconds };
    if (this.channel.readyState === 'open') {
      const settled = new Promise<LiveSessionClosed | null>((resolve) => {
        const timer = window.setTimeout(() => resolve(null), CLOSE_TIMEOUT_MS);
        this.closeResolve = () => {
          window.clearTimeout(timer);
          resolve({ reason: 'close_requested', seconds: this.usageSeconds });
        };
      });
      this.send({ type: 'session.close' });
      closed = (await settled) ?? closed;
    }
    this.finalizeTurns();
    this.dispose();
    return closed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTimers();
    this.microphone.getTracks().forEach((track) => track.stop());
    this.channel.close();
    this.peer.close();
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.remove();
    void this.context?.close();
    this.context = null;
  }

  private send(event: Record<string, unknown>): void {
    if (this.channel.readyState !== 'open') return;
    this.clientEventSeq += 1;
    this.channel.send(
      JSON.stringify({ event_id: `${CLIENT_EVENT_PREFIX}_${this.clientEventSeq}`, ...event }),
    );
  }

  private watchConnection(): void {
    this.peer.addEventListener('connectionstatechange', () => {
      const state = this.peer.connectionState;
      if (state === 'connected') {
        this.clearDisconnectTimer();
        return;
      }
      if (state === 'disconnected') {
        this.disconnectTimer ??= window.setTimeout(() => {
          this.disconnectTimer = null;
          if (this.peer.connectionState === 'disconnected') this.fail();
        }, DISCONNECT_GRACE_MS);
        return;
      }
      if (state === 'failed' || state === 'closed') this.fail();
    });
  }

  private fail(): void {
    if (this.closing || this.disposed) return;
    this.callbacks.onError(
      this.started ? LIVE_SESSION_MESSAGE.connectionDropped : LIVE_SESSION_MESSAGE.connectionFailed,
    );
    this.finalizeTurns();
    this.dispose();
  }

  private watchRemoteAudio(remote: MediaStream): void {
    if (this.context || remote.getAudioTracks().length === 0) return;
    const AudioContextCtor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    this.context = new AudioContextCtor();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    this.context.createMediaStreamSource(remote).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    this.levelTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      const now = Date.now();
      if (readAnalyserLevel(samples) >= ASSISTANT_AUDIO_LEVEL) this.lastAudioAt = now;
      const active = now - this.lastAudioAt < ASSISTANT_AUDIO_HOLD_MS;
      if (active !== this.speaking) this.setSpeaking(active);
    }, LEVEL_SAMPLE_MS);
  }

  private setSpeaking(active: boolean): void {
    this.speaking = active;
    this.callbacks.onSpeaking(active);
    if (this.settleTimer !== null) {
      window.clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    if (!active && this.assistantTurn) {
      this.settleTimer = window.setTimeout(() => {
        this.settleTimer = null;
        if (!this.speaking) this.finalizeAssistant();
      }, ASSISTANT_TURN_SETTLE_MS);
    }
  }

  private handleMessage(event: MessageEvent): void {
    let parsed: ServerEvent;
    try {
      parsed = JSON.parse(String(event.data)) as ServerEvent;
    } catch {
      return;
    }
    switch (parsed.type) {
      case 'session.started':
        this.started = true;
        this.callbacks.onStarted();
        return;
      case 'session.input_transcript.delta':
        this.appendUser(String(parsed['delta'] ?? ''));
        return;
      case 'session.output_transcript.delta':
        this.appendAssistant(String(parsed['delta'] ?? ''));
        return;
      case 'session.delegation.created': {
        const delegation = parsed['delegation'] as { id?: string } | undefined;
        if (delegation?.id) this.pendingDelegations.add(delegation.id);
        this.callbacks.onBackendBusy(this.pendingDelegations.size > 0);
        return;
      }
      case 'response.event': {
        const nested = parsed['event'] as { type?: string } | undefined;
        const delegationId = parsed['delegation_id'];
        if (nested?.type && DELEGATION_TERMINAL_EVENTS.has(nested.type)) {
          if (typeof delegationId === 'string') this.pendingDelegations.delete(delegationId);
          else this.pendingDelegations.clear();
          this.callbacks.onBackendBusy(this.pendingDelegations.size > 0);
        }
        return;
      }
      case 'session.usage.updated': {
        const usage = parsed['usage'] as { seconds?: number } | undefined;
        if (typeof usage?.seconds === 'number') {
          this.usageSeconds = usage.seconds;
          this.callbacks.onUsage(usage.seconds);
        }
        return;
      }
      case 'session.closed': {
        const usage = parsed['usage'] as { seconds?: number } | undefined;
        if (typeof usage?.seconds === 'number') this.usageSeconds = usage.seconds;
        const reason = String(parsed['reason'] ?? 'unknown');
        if (this.closeResolve) {
          this.closeResolve();
          this.closeResolve = null;
          return;
        }
        this.finalizeTurns();
        this.callbacks.onClosed({ reason, seconds: this.usageSeconds });
        this.dispose();
        return;
      }
      default:
        return;
    }
  }

  private nextTurnId(): string {
    return crypto.randomUUID();
  }

  private appendUser(delta: string): void {
    if (!delta) return;
    const now = Date.now();
    if (this.assistantTurn && now - this.assistantTurn.lastDeltaAt > OVERLAP_GRACE_MS) {
      this.finalizeAssistant();
    }
    this.userTurn ??= { id: this.nextTurnId(), text: '', lastDeltaAt: now };
    this.userTurn.text += delta;
    this.userTurn.lastDeltaAt = now;
    this.callbacks.onTranscript({
      turnId: this.userTurn.id,
      role: 'user',
      text: this.userTurn.text,
      final: false,
    });
    this.scheduleOverlapSettle();
  }

  private appendAssistant(delta: string): void {
    if (!delta) return;
    const now = Date.now();
    if (this.userTurn && now - this.userTurn.lastDeltaAt > OVERLAP_GRACE_MS) this.finalizeUser();
    this.assistantTurn ??= { id: this.nextTurnId(), text: '', lastDeltaAt: now };
    this.assistantTurn.text += delta;
    this.assistantTurn.lastDeltaAt = now;
    this.callbacks.onTranscript({
      turnId: this.assistantTurn.id,
      role: 'assistant',
      text: this.assistantTurn.text,
      final: false,
    });
    this.scheduleOverlapSettle();
  }

  private scheduleOverlapSettle(): void {
    if (this.overlapTimer !== null) window.clearTimeout(this.overlapTimer);
    this.overlapTimer = window.setTimeout(() => {
      this.overlapTimer = null;
      const now = Date.now();
      const user = this.userTurn;
      const assistant = this.assistantTurn;
      if (!user || !assistant) return;
      if (now - user.lastDeltaAt > OVERLAP_GRACE_MS && user.lastDeltaAt < assistant.lastDeltaAt) {
        this.finalizeUser();
      } else if (
        now - assistant.lastDeltaAt > OVERLAP_GRACE_MS &&
        assistant.lastDeltaAt < user.lastDeltaAt
      ) {
        this.finalizeAssistant();
      }
    }, OVERLAP_GRACE_MS + 50);
  }

  private finalizeUser(): void {
    const turn = this.userTurn;
    this.userTurn = null;
    if (!turn || !turn.text.trim()) return;
    this.callbacks.onTranscript({ turnId: turn.id, role: 'user', text: turn.text, final: true });
  }

  private finalizeAssistant(): void {
    const turn = this.assistantTurn;
    this.assistantTurn = null;
    if (!turn || !turn.text.trim()) return;
    this.callbacks.onTranscript({
      turnId: turn.id,
      role: 'assistant',
      text: turn.text,
      final: true,
    });
  }

  private finalizeTurns(): void {
    this.finalizeUser();
    this.finalizeAssistant();
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer === null) return;
    window.clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  private stopTimers(): void {
    if (this.levelTimer !== null) window.clearInterval(this.levelTimer);
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    if (this.overlapTimer !== null) window.clearTimeout(this.overlapTimer);
    this.levelTimer = null;
    this.settleTimer = null;
    this.overlapTimer = null;
    this.clearDisconnectTimer();
  }
}
