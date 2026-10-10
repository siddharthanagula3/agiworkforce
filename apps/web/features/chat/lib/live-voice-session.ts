import {
  LiveVoiceBackendUsageMeter,
  LiveVoiceToolBridge,
  LiveVoiceToolCallResponseSchema,
  LIVE_VOICE_WORK_TASK_TOOL,
  liveVoiceFunctionCallOf,
  liveVoiceToolCallPath,
  liveVoiceWorkTaskGoal,
  type LiveVoicePendingApproval,
  type LiveVoiceBackendUsage,
  type LiveVoiceToolCallRequest,
  type LiveVoiceToolCallResponse,
  type LiveVoiceToolDecision,
  type LiveVoiceToolFile,
} from '@agiworkforce/cloud-contracts';

export interface LiveVoiceToolOutcome {
  callId: string;
  label: string;
  output: string;
  isError: boolean;
  files: readonly LiveVoiceToolFile[];
}
import { formatUsageResetIn } from '@agiworkforce/types';
import {
  liveVoiceLanguageInstruction,
  liveVoicePaceInstruction,
  type LiveVoiceReasoning,
} from '@agiworkforce/types/live-voices';
import { getCsrfToken } from '@/lib/client/csrf';
import { isDesktopHost } from '@/features/desktop-host/lib/host';
import { ANALYSER_FFT_SIZE, readAnalyserLevel } from '@features/chat/lib/dictation-machine';

export const LIVE_SESSION_ENDPOINT = '/api/voice/live/sessions';
const EVENTS_CHANNEL = 'oai-events';
const CSRF_HEADER = 'x-csrf-token';
const ICE_GATHERING_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 3_000;
const DISCONNECT_GRACE_MS = 5_000;
export const KEEPALIVE_INTERVAL_MS = 15_000;
export const KEEPALIVE_TIMEOUT_MS = 60_000;
const LEVEL_SAMPLE_MS = 50;
const ASSISTANT_AUDIO_LEVEL = 0.03;
const ASSISTANT_AUDIO_HOLD_MS = 350;
const ASSISTANT_TURN_SETTLE_MS = 1_500;
const OVERLAP_GRACE_MS = 800;
const ASSISTANT_TRANSCRIPT_IDLE_MS = 2_500;
const CLIENT_EVENT_PREFIX = 'agi';
const DEFAULT_TOOL_TIMEOUT_MS = 20_000;
const NATURAL_PACE = 1;
const INBOUND_STAT_TYPES = new Set(['candidate-pair', 'inbound-rtp']);
const TASK_STOPPED_INSTRUCTION =
  'The user stopped the task that was running. Do not report its result, and tell the user it was stopped only if they ask.';

export const LIVE_SESSION_MESSAGE = {
  microphoneDenied: 'Microphone access was denied. Allow the microphone to use voice mode.',
  microphoneUnavailable: 'No microphone is available in this browser.',
  unsupported: 'This browser cannot open a voice connection.',
  connectionFailed: 'The voice connection could not be established.',
  connectionDropped: 'The voice connection dropped.',
  reconnecting: 'The voice connection dropped. Reconnecting.',
  reconnectFailed: 'The voice connection could not be restored.',
  sessionEnded: 'The voice session ended.',
  sessionRejected: 'The voice session could not be started.',
  usageExhausted:
    'Voice ran out of included minutes on this plan, so the session ended. Nothing was lost from the conversation.',
  providerError: 'The voice service could not do that. You can keep talking or ask again.',
} as const;

export interface LiveVoiceProviderError {
  code: string | null;
  message: string;
}

const PLAYBACK_BLOCKED_ERROR = 'NotAllowedError';

export type LiveTranscriptRole = 'user' | 'assistant';

export interface LiveTranscriptTurn {
  turnId: string;
  role: LiveTranscriptRole;
  text: string;
  final: boolean;
}

/** How long the session's voice minutes cover it before the host must extend. */
export interface LiveSessionSettlement {
  ceilingSeconds: number;
}

export interface LiveSessionClosed {
  reason: string;
  seconds: number | null;
}

export interface LiveVoiceToolDescriptor {
  id: string;
  label: string;
  timeoutMs: number;
  requiresApproval: boolean;
}

export type LiveVoiceToolState = 'running' | 'timed_out';

export interface LiveVoiceToolActivity {
  delegationId: string;
  toolId: string;
  label: string;
  state: LiveVoiceToolState;
  startedAt: number;
}

/**
 * The prompt tells the model never to claim an action it did not take. This is
 * the app-level half: a spoken claim of completion with no tool result behind
 * it in this session is reported rather than trusted.
 */
const SUCCESS_CLAIM =
  /\b(?:i(?:'|’)?ve|i\s+have|i\s+just)\s+(?:done|finished|completed|sent|saved|created|updated|deleted|booked|scheduled|posted|cancell?ed|started|run|ran)\b|\b(?:it(?:'|’)?s|that(?:'|’)?s)\s+(?:done|sent|saved|created|updated|deleted|booked|scheduled|posted)\b|\b(?:all\s+set|taken\s+care\s+of|went\s+through)\b/i;
const CLAIM_HEDGE =
  /\b(?:cannot|can(?:'|’)?t|could\s+not|couldn(?:'|’)?t|unable|failed|did\s+not|didn(?:'|’)?t|would\s+you\s+like|do\s+you\s+want|shall\s+i)\b/i;

export function checkSpokenSuccessClaim(
  text: string,
  completedTools: readonly string[],
): { claimsSuccess: boolean; verified: boolean } {
  const claimsSuccess = SUCCESS_CLAIM.test(text) && !CLAIM_HEDGE.test(text);
  return { claimsSuccess, verified: !claimsSuccess || completedTools.length > 0 };
}

const WORK_TASK_NOT_STARTED =
  'The task did not start because the chat could not send it right now. Tell the user to type the request in the chat with Work mode on.';

export interface LiveVoiceSessionCallbacks {
  onStarted: () => void;
  onSpeaking: (active: boolean) => void;
  onBackendBusy: (active: boolean) => void;
  /** Per-tool detail behind the busy flag, for the label and the cancel affordance. */
  onToolActivity?: (activities: readonly LiveVoiceToolActivity[]) => void;
  /** A spoken claim of a completed action with no tool result behind it. */
  onUnverifiedClaim?: (turn: LiveTranscriptTurn) => void;
  onToolApprovals?: (approvals: readonly LiveVoicePendingApproval[]) => void;
  /** A function tool's result, so the surface can show what the voice turn got back. */
  onToolResult?: (outcome: LiveVoiceToolOutcome) => void;
  /** Sends a spoken goal to the chat as an AGI Work turn; false when it could not start. */
  onStartWorkTask?: (goal: string) => boolean;
  onTranscript: (turn: LiveTranscriptTurn) => void;
  onUsage: (seconds: number) => void;
  onClosed: (closed: LiveSessionClosed) => void;
  onError: (message: string) => void;
  /** A transport drop of a started session, which a host can reconnect from.
   *  Hosts without one get onError and the session stays down. */
  onConnectionLost?: (message: string) => void;
  /** An error event from the provider during a running session; the session stays up. */
  onProviderError?: (error: LiveVoiceProviderError) => void;
  /** The browser refused to start the assistant's audio without a user gesture. */
  onPlaybackBlocked?: () => void;
}

export interface LiveVoiceSettings {
  voice?: string | null;
  language?: string | null;
  pace?: number;
}

export interface LiveVoiceSessionOptions {
  voice: string | null;
  conversationId: string | null;
  language?: string | null;
  pace?: number;
  reasoning?: LiveVoiceReasoning;
  callbacks: LiveVoiceSessionCallbacks;
}

interface CreateSessionResponse {
  sessionId: string;
  sdp: string;
  settlement: LiveSessionSettlement;
  voiceSessionId?: string | null;
  settings?: { voice: string; language: string | null; pace: number };
  tools?: LiveVoiceToolDescriptor[];
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

// A spend or quota refusal gets its own code and its own sentence: the generic
// 'could not be started' left the user with no idea why voice stopped.
function isUsageRefusal(status: number): boolean {
  return status === 402 || status === 429;
}

const USAGE_LIMIT_CODES = new Set([
  'usage_exhausted',
  'voice_usage_not_in_plan',
  'voice_minutes_monthly_limit_reached',
  'rolling_five_hour_limit_reached',
  'rolling_weekly_limit_reached',
  'flagship_weekly_limit_reached',
  'insufficient_credits',
  'extra_usage_required',
  'organization_spend_cap_reached',
]);

export function isUsageLimitError(error: unknown): boolean {
  return error instanceof LiveVoiceSessionError && USAGE_LIMIT_CODES.has(error.code);
}

const LIMIT_REACHED: Readonly<Record<string, string>> = {
  rolling_five_hour_limit_reached: '5-hour limit reached',
  rolling_weekly_limit_reached: 'Weekly limit reached',
  insufficient_credits: 'Monthly limit reached',
};

function limitNotice(code: string | undefined, resetsAt: string | undefined): string | null {
  const reached = code ? LIMIT_REACHED[code] : undefined;
  const reset = formatUsageResetIn(resetsAt);
  return reached && reset ? `${reached}. ${reset}.` : null;
}

export async function readLiveSessionError(response: Response): Promise<LiveVoiceSessionError> {
  const fallback = isUsageRefusal(response.status)
    ? LIVE_SESSION_MESSAGE.usageExhausted
    : LIVE_SESSION_MESSAGE.sessionRejected;
  const fallbackCode = isUsageRefusal(response.status)
    ? 'usage_exhausted'
    : `http_${response.status}`;
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string; resets_at?: string };
    };
    const message =
      limitNotice(body.error?.code, body.error?.resets_at) ?? body.error?.message?.trim();
    return new LiveVoiceSessionError(message || fallback, body.error?.code ?? fallbackCode);
  } catch {
    return new LiveVoiceSessionError(fallback, fallbackCode);
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
  private inputLevel = 0;
  private outputLevel = 0;
  private settleTimer: number | null = null;
  private disconnectTimer: number | null = null;
  private keepaliveTimer: number | null = null;
  private lastInboundAt = Date.now();
  private lastAudioAt = 0;
  private speaking = false;
  private started = false;
  private closing = false;
  private disposed = false;
  private clientEventSeq = 0;
  private userTurn: { id: string; text: string; lastDeltaAt: number } | null = null;
  private assistantTurn: { id: string; text: string; lastDeltaAt: number } | null = null;
  private overlapTimer: number | null = null;
  private idleTimer: number | null = null;
  private readonly pendingDelegations = new Map<string, LiveVoiceToolActivity>();
  private readonly delegationTimers = new Map<string, number>();
  private readonly completedTools: string[] = [];
  private readonly toolDescriptors = new Map<string, LiveVoiceToolDescriptor>();
  private readonly toolBridge: LiveVoiceToolBridge;
  private closeResolve: (() => void) | null = null;
  private usageSeconds: number | null = null;
  private lastDeliveredTurnId: string | null = null;
  private pendingMuted: boolean | null = null;
  private inboundBytes = 0;
  private readonly backendMeter = new LiveVoiceBackendUsageMeter();
  private playbackRequested = false;
  private appliedLanguage: string | null;
  private appliedPace: number;

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
    this.appliedLanguage = created.settings?.language ?? null;
    this.appliedPace = created.settings?.pace ?? NATURAL_PACE;
    for (const tool of created.tools ?? []) this.toolDescriptors.set(tool.id, tool);
    this.toolBridge = new LiveVoiceToolBridge({
      callTool: (request) => this.callTool(request),
      send: (event) => this.send(event),
      onApprovalsChanged: (approvals) => {
        if (approvals.length > 0) this.holdDelegationTimers();
        this.callbacks.onToolApprovals?.(approvals);
        this.publishToolActivity();
      },
      onToolCompleted: (name) => this.completedTools.push(name),
      onToolResult: (result) =>
        this.callbacks.onToolResult?.({
          callId: result.callId,
          label: this.describeTool(result.name).label,
          output: result.output,
          isError: result.isError,
          files: result.files,
        }),
    });
  }

  get level(): number {
    return Math.max(this.inputLevel, this.outputLevel);
  }

  get outputElement(): HTMLAudioElement {
    return this.audio;
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
      session?.startPlayback();
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
          language: options.language ?? null,
          ...(options.pace === undefined ? {} : { pace: options.pace }),
          ...(options.reasoning ? { reasoning: options.reasoning } : {}),
          surface: isDesktopHost() ? 'desktop' : 'web',
          ...(options.callbacks.onStartWorkTask
            ? { clientHandoffs: [LIVE_VOICE_WORK_TASK_TOOL] }
            : {}),
        }),
      });
      if (!response.ok) throw await readLiveSessionError(response);
      const created = (await response.json()) as CreateSessionResponse;
      await peer.setRemoteDescription({ type: 'answer', sdp: created.sdp });
      session = new LiveVoiceSession(microphone, peer, channel, audio, created, options.callbacks);
      session.watchRemoteAudio(remote);
      session.startPlayback();
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

  get lastTurnId(): string | null {
    return this.lastDeliveredTurnId;
  }

  get backendUsage(): LiveVoiceBackendUsage | null {
    return this.backendMeter.report();
  }

  startPlayback(): void {
    if (this.playbackRequested || this.disposed) return;
    const stream = this.audio.srcObject as MediaStream | null;
    if (!stream || stream.getAudioTracks().length === 0) return;
    this.playbackRequested = true;
    void this.playAudio().then((played) => {
      if (!played) this.callbacks.onPlaybackBlocked?.();
    });
  }

  /** Called from a user gesture after the browser blocked autoplay. */
  resumePlayback(): Promise<boolean> {
    return this.playAudio();
  }

  private async playAudio(): Promise<boolean> {
    try {
      await this.audio.play();
      return true;
    } catch (error) {
      return !(error instanceof Error && error.name === PLAYBACK_BLOCKED_ERROR);
    }
  }

  /**
   * GPT-Live fixes the voice at startup and accepts session.update only for
   * the Responses backend, so a voice change waits for the next session.
   * Language and pace are steered through an appended instruction, the
   * documented way to change behaviour mid-session, and only when they changed.
   */
  async updateSettings(settings: LiveVoiceSettings): Promise<void> {
    const body: Record<string, unknown> = {};
    const instructions: string[] = [];
    if (settings.language !== undefined && settings.language !== this.appliedLanguage) {
      this.appliedLanguage = settings.language;
      body['language'] = settings.language;
      instructions.push(liveVoiceLanguageInstruction(settings.language));
    }
    if (settings.pace !== undefined && settings.pace !== this.appliedPace) {
      this.appliedPace = settings.pace;
      body['pace'] = settings.pace;
      instructions.push(
        liveVoicePaceInstruction(settings.pace) ?? 'Speak at your natural speaking pace.',
      );
    }
    if (instructions.length === 0) return;
    this.appendInstruction(instructions.join(' '));
    await fetch(`${LIVE_SESSION_ENDPOINT}/${encodeURIComponent(this.sessionId)}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: await getCsrfToken() },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  }

  private appendInstruction(content: string): void {
    this.send({ type: 'session.instructions.append', delegation_id: null, content });
  }

  decideToolApproval(callId: string, decision: LiveVoiceToolDecision): Promise<void> {
    return this.toolBridge.decide(callId, decision);
  }

  private async callTool(request: LiveVoiceToolCallRequest): Promise<LiveVoiceToolCallResponse> {
    const response = await fetch(liveVoiceToolCallPath(this.sessionId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: await getCsrfToken() },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw await readLiveSessionError(response);
    const parsed = LiveVoiceToolCallResponseSchema.parse(await response.json());
    if (
      request.name !== LIVE_VOICE_WORK_TASK_TOOL ||
      parsed.status !== 'completed' ||
      parsed.isError
    ) {
      return parsed;
    }
    const goal = liveVoiceWorkTaskGoal(request.arguments);
    if (goal && this.callbacks.onStartWorkTask?.(goal)) return parsed;
    return { status: 'completed', isError: true, output: WORK_TASK_NOT_STARTED };
  }

  setMuted(muted: boolean): void {
    this.microphone.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    // Commands are held until the session starts, so a mute chosen while
    // connecting has to be replayed rather than dropped.
    if (!this.started) {
      this.pendingMuted = muted;
      return;
    }
    this.sendMuteState(muted);
  }

  private sendMuteState(muted: boolean): void {
    this.send({ type: muted ? 'session.input_audio.mute' : 'session.input_audio.unmute' });
  }

  async close(): Promise<LiveSessionClosed> {
    if (this.disposed) return { reason: 'disposed', seconds: this.usageSeconds };
    this.closing = true;
    this.cancelBackendWork();
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
    this.toolBridge.dispose();
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
    if (!this.started && event['type'] !== 'session.close') return;
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
        this.lastInboundAt = Date.now();
        return;
      }
      if (state === 'disconnected') {
        this.disconnectTimer ??= window.setTimeout(() => {
          this.disconnectTimer = null;
          if (this.peer.connectionState === 'disconnected') this.fail(true);
        }, DISCONNECT_GRACE_MS);
        return;
      }
      if (state === 'failed' || state === 'closed') this.fail(true);
    });
    this.startKeepalive();
  }

  /**
   * A peer stuck in 'connected' with nothing arriving is the drop the connection
   * state never reports, so liveness is any inbound event, inbound audio, or
   * bytes the transport received. GPT-Live defines no ping event to ask for one.
   */
  private startKeepalive(): void {
    this.keepaliveTimer = window.setInterval(() => {
      if (this.closing || this.disposed) return;
      void this.readInboundBytes().then((bytes) => {
        if (this.closing || this.disposed) return;
        if (bytes > this.inboundBytes) {
          this.inboundBytes = bytes;
          this.lastInboundAt = Date.now();
        }
        if (this.started && Date.now() - this.lastInboundAt > KEEPALIVE_TIMEOUT_MS) {
          this.fail(true);
        }
      });
    }, KEEPALIVE_INTERVAL_MS);
  }

  private async readInboundBytes(): Promise<number> {
    try {
      const report = await this.peer.getStats();
      let total = 0;
      report.forEach((stat: { type?: string; bytesReceived?: number }) => {
        if (
          stat.type &&
          INBOUND_STAT_TYPES.has(stat.type) &&
          typeof stat.bytesReceived === 'number'
        ) {
          total += stat.bytesReceived;
        }
      });
      return total;
    } catch {
      return this.inboundBytes;
    }
  }

  private fail(recoverable = false): void {
    if (this.closing || this.disposed) return;
    const started = this.started;
    const reconnect = recoverable && started && this.callbacks.onConnectionLost;
    if (!reconnect) {
      this.callbacks.onError(
        started ? LIVE_SESSION_MESSAGE.connectionDropped : LIVE_SESSION_MESSAGE.connectionFailed,
      );
    }
    this.finalizeTurns();
    this.dispose();
    if (reconnect) this.callbacks.onConnectionLost?.(LIVE_SESSION_MESSAGE.connectionDropped);
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
    const microphoneAnalyser = this.context.createAnalyser();
    microphoneAnalyser.fftSize = ANALYSER_FFT_SIZE;
    if (this.microphone.getAudioTracks().length > 0) {
      this.context.createMediaStreamSource(this.microphone).connect(microphoneAnalyser);
    }
    const microphoneSamples = new Uint8Array(microphoneAnalyser.fftSize);
    this.levelTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      microphoneAnalyser.getByteTimeDomainData(microphoneSamples);
      this.outputLevel = readAnalyserLevel(samples);
      this.inputLevel = this.microphone.getAudioTracks().some((track) => track.enabled)
        ? readAnalyserLevel(microphoneSamples)
        : 0;
      const now = Date.now();
      if (this.outputLevel >= ASSISTANT_AUDIO_LEVEL) {
        this.lastAudioAt = now;
        this.lastInboundAt = now;
      }
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
    this.lastInboundAt = Date.now();
    let parsed: ServerEvent;
    try {
      parsed = JSON.parse(String(event.data)) as ServerEvent;
    } catch {
      return;
    }
    switch (parsed.type) {
      case 'session.started': {
        this.started = true;
        const pendingMuted = this.pendingMuted;
        this.pendingMuted = null;
        if (pendingMuted !== null) this.sendMuteState(pendingMuted);
        this.callbacks.onStarted();
        return;
      }
      case 'session.input_transcript.delta':
        this.appendUser(String(parsed['delta'] ?? ''));
        return;
      case 'session.output_transcript.delta':
        this.appendAssistant(String(parsed['delta'] ?? ''));
        return;
      case 'session.delegation.created': {
        const delegation = parsed['delegation'] as
          { id?: string; tool?: string; type?: string } | undefined;
        if (delegation?.id) this.beginDelegation(delegation.id, delegation.tool ?? delegation.type);
        this.publishToolActivity();
        return;
      }
      case 'response.event': {
        const nested = parsed['event'] as { type?: string; item?: { type?: string } } | undefined;
        this.backendMeter.observe(nested);
        const delegationId = parsed['delegation_id'];
        const toolId = liveVoiceFunctionCallOf(nested)?.name ?? nested?.item?.type;
        if (typeof delegationId === 'string' && toolId) this.nameDelegation(delegationId, toolId);
        this.toolBridge.observe(nested);
        if (nested?.type && DELEGATION_TERMINAL_EVENTS.has(nested.type)) {
          const succeeded = nested.type === 'response.completed';
          if (succeeded && this.toolBridge.busy) {
            this.publishToolActivity();
            return;
          }
          if (!succeeded) this.toolBridge.cancel();
          if (typeof delegationId === 'string') this.endDelegation(delegationId, succeeded);
          else
            for (const id of [...this.pendingDelegations.keys()]) this.endDelegation(id, succeeded);
          this.publishToolActivity();
        }
        return;
      }
      case 'error': {
        const error = parsed['error'] as { code?: unknown; message?: unknown } | undefined;
        this.callbacks.onProviderError?.({
          code: typeof error?.code === 'string' ? error.code : null,
          message: typeof error?.message === 'string' ? error.message : '',
        });
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

  private beginDelegation(delegationId: string, toolId: string | undefined): void {
    const descriptor = this.describeTool(toolId);
    this.pendingDelegations.set(delegationId, {
      delegationId,
      toolId: descriptor.id,
      label: descriptor.label,
      state: 'running',
      startedAt: Date.now(),
    });
    const timer = window.setTimeout(() => {
      this.delegationTimers.delete(delegationId);
      const activity = this.pendingDelegations.get(delegationId);
      if (!activity) return;
      this.pendingDelegations.set(delegationId, { ...activity, state: 'timed_out' });
      this.publishToolActivity();
    }, descriptor.timeoutMs);
    this.delegationTimers.set(delegationId, timer);
  }

  private holdDelegationTimers(): void {
    for (const [delegationId, timer] of this.delegationTimers) {
      window.clearTimeout(timer);
      this.delegationTimers.delete(delegationId);
      const activity = this.pendingDelegations.get(delegationId);
      if (activity) this.pendingDelegations.set(delegationId, { ...activity, state: 'running' });
    }
  }

  private nameDelegation(delegationId: string, toolId: string): void {
    const activity = this.pendingDelegations.get(delegationId);
    if (!activity || activity.toolId !== 'unknown') return;
    const descriptor = this.describeTool(toolId);
    this.pendingDelegations.set(delegationId, {
      ...activity,
      toolId: descriptor.id,
      label: descriptor.label,
    });
  }

  private endDelegation(delegationId: string, succeeded: boolean): void {
    const timer = this.delegationTimers.get(delegationId);
    if (timer !== undefined) window.clearTimeout(timer);
    this.delegationTimers.delete(delegationId);
    const activity = this.pendingDelegations.get(delegationId);
    this.pendingDelegations.delete(delegationId);
    if (succeeded && activity) this.completedTools.push(activity.toolId);
  }

  private describeTool(toolId: string | undefined): LiveVoiceToolDescriptor {
    const known = toolId ? this.toolDescriptors.get(toolId) : undefined;
    if (known) return known;
    return {
      id: toolId ?? 'unknown',
      label: 'Working on it',
      timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
      requiresApproval: false,
    };
  }

  private publishToolActivity(): void {
    this.callbacks.onBackendBusy(this.pendingDelegations.size > 0 || this.toolBridge.busy);
    this.callbacks.onToolActivity?.([...this.pendingDelegations.values()]);
  }

  /**
   * GPT-Live has no command that cancels a Responses delegation; only
   * session.close cancels queued backend work. Function tools this app runs
   * are cancelled here, and the live model is told the task was stopped so it
   * does not speak a result the user no longer wants.
   */
  cancelBackendWork(): void {
    const hadWork = this.pendingDelegations.size > 0 || this.toolBridge.busy;
    for (const delegationId of [...this.pendingDelegations.keys()]) {
      this.endDelegation(delegationId, false);
    }
    this.toolBridge.cancel();
    if (hadWork && !this.closing) this.appendInstruction(TASK_STOPPED_INSTRUCTION);
    this.publishToolActivity();
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
    this.scheduleAssistantIdle();
  }

  private scheduleAssistantIdle(): void {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      if (!this.speaking) this.finalizeAssistant();
    }, ASSISTANT_TRANSCRIPT_IDLE_MS);
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
    this.lastDeliveredTurnId = turn.id;
    this.callbacks.onTranscript({ turnId: turn.id, role: 'user', text: turn.text, final: true });
  }

  private finalizeAssistant(): void {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const turn = this.assistantTurn;
    this.assistantTurn = null;
    if (!turn || !turn.text.trim()) return;
    this.lastDeliveredTurnId = turn.id;
    const delivered: LiveTranscriptTurn = {
      turnId: turn.id,
      role: 'assistant',
      text: turn.text,
      final: true,
    };
    this.callbacks.onTranscript(delivered);
    if (!checkSpokenSuccessClaim(turn.text, this.completedTools).verified) {
      this.callbacks.onUnverifiedClaim?.(delivered);
    }
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
    for (const timer of this.delegationTimers.values()) window.clearTimeout(timer);
    this.delegationTimers.clear();
    if (this.levelTimer !== null) window.clearInterval(this.levelTimer);
    if (this.keepaliveTimer !== null) window.clearInterval(this.keepaliveTimer);
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    if (this.overlapTimer !== null) window.clearTimeout(this.overlapTimer);
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.keepaliveTimer = null;
    this.levelTimer = null;
    this.settleTimer = null;
    this.overlapTimer = null;
    this.idleTimer = null;
    this.clearDisconnectTimer();
  }
}
