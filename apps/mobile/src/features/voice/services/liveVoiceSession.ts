import {
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import {
  LIVE_VOICE_WORK_TASK_TOOL,
  LiveVoiceToolBridge,
  LiveVoiceToolCallResponseSchema,
  liveVoiceFunctionCallOf,
  liveVoiceWorkTaskGoal,
  liveVoiceToolCallPath,
  type LiveVoicePendingApproval,
  type LiveVoiceToolCallRequest,
  type LiveVoiceToolCallResponse,
  type LiveVoiceToolDecision,
} from '@agiworkforce/cloud-contracts';
import type { LifecycleStatus } from '@agiworkforce/types';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { apiFetch } from '@/services/api';
import { LIVE_VOICE_MESSAGE, liveVoiceUnavailableReason } from './liveVoiceAvailability';

export const LIVE_VOICE_SESSION_PATH = '/api/voice/live/sessions';

const EVENTS_CHANNEL = 'oai-events';
const ICE_GATHERING_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 3_000;
const DISCONNECT_GRACE_MS = 5_000;
const ASSISTANT_SPEECH_HOLD_MS = 1_200;
const CLIENT_EVENT_PREFIX = 'agi';
const DEFAULT_TOOL_TIMEOUT_MS = 20_000;
const UNKNOWN_TOOL_LABEL = 'Working on it';

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

export interface LiveVoiceToolDescriptor {
  id: string;
  label: string;
  timeoutMs: number;
  requiresApproval: boolean;
}

export type LiveVoiceToolState = Extract<LifecycleStatus, 'running'> | 'timed_out';

export interface LiveVoiceToolActivity {
  delegationId: string;
  toolId: string;
  label: string;
  state: LiveVoiceToolState;
  startedAt: number;
}

export interface LiveVoiceToolOutcome {
  callId: string;
  label: string;
  output: string;
  isError: boolean;
}

export interface LiveVoiceSessionCallbacks {
  onStarted: () => void;
  onAssistantSpeaking: (active: boolean) => void;
  onBackendBusy: (active: boolean) => void;
  onToolActivity?: (activities: readonly LiveVoiceToolActivity[]) => void;
  onToolApprovals?: (approvals: readonly LiveVoicePendingApproval[]) => void;
  onToolResult?: (outcome: LiveVoiceToolOutcome) => void;
  onTranscript: (turn: LiveTranscriptTurn) => void;
  onInterrupted: () => void;
  onUsage: (seconds: number) => void;
  onClosed: (closed: LiveSessionClosed) => void;
  onError: (message: string) => void;
  onConnectionLost?: (message: string) => void;
  onStartWorkTask?: (goal: string) => boolean;
}

export interface LiveVoiceSessionOptions {
  voice: string | null;
  conversationId: string | null;
  language: string | null;
  callbacks: LiveVoiceSessionCallbacks;
}

const WORK_TASK_NOT_STARTED =
  'The task did not start because the chat could not send it right now. Tell the user to type the request in the chat with Work mode on.';

interface CreateSessionResponse {
  sessionId: string;
  sdp: string;
  settlement: LiveSessionSettlement;
  tools?: LiveVoiceToolDescriptor[];
}

interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * react-native-webrtc types its classes against `event-target-shim`, which is
 * not resolvable from this workspace, so TypeScript sees the classes without
 * their EventTarget base. The listener surface is real at runtime; this names
 * only the events this session subscribes to.
 */
interface WebrtcEventTarget<TEvent> {
  addEventListener(type: string, listener: (event: TEvent) => void): void;
  removeEventListener(type: string, listener: (event: TEvent) => void): void;
}

function eventsOf<TEvent>(target: object): WebrtcEventTarget<TEvent> {
  return target as unknown as WebrtcEventTarget<TEvent>;
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
    const body = (await response.json()) as { error?: { message?: string; code?: string } };
    const message = body.error?.message?.trim();
    return new LiveVoiceSessionError(
      message || LIVE_VOICE_MESSAGE.sessionRejected,
      body.error?.code ?? `http_${response.status}`,
    );
  } catch {
    return new LiveVoiceSessionError(LIVE_VOICE_MESSAGE.sessionRejected, `http_${response.status}`);
  }
}

function microphoneError(error: unknown): LiveVoiceSessionError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new LiveVoiceSessionError(LIVE_VOICE_MESSAGE.microphoneDenied, 'microphone_denied');
  }
  return new LiveVoiceSessionError(LIVE_VOICE_MESSAGE.connectionFailed, 'microphone_failed');
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
    function finish() {
      clearTimeout(timer);
      eventsOf(peer).removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }
    function onChange() {
      if (peer.iceGatheringState === 'complete') finish();
    }
    eventsOf(peer).addEventListener('icegatheringstatechange', onChange);
  });
}

export class LiveVoiceSession {
  readonly settlement: LiveSessionSettlement;
  readonly sessionId: string;

  private readonly callbacks: LiveVoiceSessionCallbacks;
  private readonly microphone: MediaStream;
  private readonly peer: RTCPeerConnection;
  private readonly channel: ReturnType<RTCPeerConnection['createDataChannel']>;
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private speaking = false;
  private started = false;
  private closing = false;
  private disposed = false;
  private clientEventSeq = 0;
  private userTurn: { id: string; text: string; lastDeltaAt: number } | null = null;
  private assistantTurn: { id: string; text: string; lastDeltaAt: number } | null = null;
  private readonly pendingDelegations = new Map<string, LiveVoiceToolActivity>();
  private readonly delegationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly toolDescriptors = new Map<string, LiveVoiceToolDescriptor>();
  private readonly toolBridge: LiveVoiceToolBridge;
  private closeResolve: (() => void) | null = null;
  private usageSeconds: number | null = null;
  private pendingMuted: boolean | null = null;

  private constructor(
    microphone: MediaStream,
    peer: RTCPeerConnection,
    channel: ReturnType<RTCPeerConnection['createDataChannel']>,
    created: CreateSessionResponse,
    callbacks: LiveVoiceSessionCallbacks,
  ) {
    this.microphone = microphone;
    this.peer = peer;
    this.channel = channel;
    this.sessionId = created.sessionId;
    this.settlement = created.settlement;
    this.callbacks = callbacks;
    for (const tool of created.tools ?? []) this.toolDescriptors.set(tool.id, tool);
    this.toolBridge = new LiveVoiceToolBridge({
      callTool: (request) => this.callTool(request),
      send: (event) => this.send(event),
      onApprovalsChanged: (approvals) => {
        if (approvals.length > 0) this.holdDelegationTimers();
        this.callbacks.onToolApprovals?.(approvals);
        this.publishToolActivity();
      },
      onToolResult: (result) =>
        this.callbacks.onToolResult?.({
          callId: result.callId,
          label: this.describeTool(result.name).label,
          output: result.output,
          isError: result.isError,
        }),
    });
  }

  static async start(options: LiveVoiceSessionOptions): Promise<LiveVoiceSession> {
    const unavailable = liveVoiceUnavailableReason();
    if (unavailable) throw new LiveVoiceSessionError(unavailable, 'unsupported');

    let microphone: MediaStream;
    try {
      microphone = await mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      throw microphoneError(error);
    }

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const channel = peer.createDataChannel(EVENTS_CHANNEL);
    const inbox: string[] = [];
    let session: LiveVoiceSession | null = null;
    const teardown = () => {
      microphone.getTracks().forEach((track) => track.stop());
      peer.close();
    };

    eventsOf<{ data?: unknown }>(channel).addEventListener('message', (event) => {
      const payload = String(event.data ?? '');
      if (session) session.handleMessage(payload);
      else inbox.push(payload);
    });
    microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));

    try {
      const offer = await peer.createOffer({});
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new LiveVoiceSessionError(LIVE_VOICE_MESSAGE.connectionFailed, 'no_offer');
      const response = await apiFetch(LIVE_VOICE_SESSION_PATH, {
        method: 'POST',
        body: JSON.stringify({
          sdp,
          voice: options.voice,
          conversationId: options.conversationId,
          ...(options.language ? { language: options.language } : {}),
          surface: 'mobile',
          ...(options.callbacks.onStartWorkTask
            ? { clientHandoffs: [LIVE_VOICE_WORK_TASK_TOOL] }
            : {}),
        }),
      });
      if (!response.ok) throw await readErrorMessage(response);
      const created = (await response.json()) as CreateSessionResponse;
      await peer.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: created.sdp }),
      );
      session = new LiveVoiceSession(microphone, peer, channel, created, options.callbacks);
      session.watchConnection();
      for (const payload of inbox) session.handleMessage(payload);
      return session;
    } catch (error) {
      teardown();
      throw error instanceof LiveVoiceSessionError
        ? error
        : new LiveVoiceSessionError(LIVE_VOICE_MESSAGE.connectionFailed, 'connection_failed');
    }
  }

  get lastUsageSeconds(): number | null {
    return this.usageSeconds;
  }

  decideToolApproval(callId: string, decision: LiveVoiceToolDecision): Promise<void> {
    return this.toolBridge.decide(callId, decision);
  }

  private async callTool(request: LiveVoiceToolCallRequest): Promise<LiveVoiceToolCallResponse> {
    const response = await apiFetch(liveVoiceToolCallPath(this.sessionId), {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (!response.ok) throw await readErrorMessage(response);
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

  cancelBackendWork(): void {
    for (const delegationId of [...this.pendingDelegations.keys()]) {
      this.send({ type: 'session.delegation.cancel', delegation_id: delegationId });
      this.endDelegation(delegationId);
    }
    this.toolBridge.cancel();
    this.publishToolActivity();
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
    const timer = setTimeout(() => {
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
      clearTimeout(timer);
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

  private endDelegation(delegationId: string): void {
    const timer = this.delegationTimers.get(delegationId);
    if (timer !== undefined) clearTimeout(timer);
    this.delegationTimers.delete(delegationId);
    this.pendingDelegations.delete(delegationId);
  }

  private describeTool(toolId: string | undefined): LiveVoiceToolDescriptor {
    const known = toolId ? this.toolDescriptors.get(toolId) : undefined;
    if (known) return known;
    return {
      id: toolId ?? 'unknown',
      label: UNKNOWN_TOOL_LABEL,
      timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
      requiresApproval: false,
    };
  }

  private publishToolActivity(): void {
    this.callbacks.onBackendBusy(this.pendingDelegations.size > 0 || this.toolBridge.busy);
    this.callbacks.onToolActivity?.([...this.pendingDelegations.values()]);
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
    this.microphone.getTracks().forEach((track) => track.stop());
    let closed: LiveSessionClosed = { reason: 'close_requested', seconds: this.usageSeconds };
    if (this.channel.readyState === 'open') {
      const settled = new Promise<LiveSessionClosed | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), CLOSE_TIMEOUT_MS);
        this.closeResolve = () => {
          clearTimeout(timer);
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
    eventsOf(this.peer).addEventListener('connectionstatechange', () => {
      const state = this.peer.connectionState;
      if (state === 'connected') {
        this.clearDisconnectTimer();
        return;
      }
      if (state === 'disconnected') {
        this.disconnectTimer ??= setTimeout(() => {
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
    if (this.started && this.callbacks.onConnectionLost) {
      this.callbacks.onConnectionLost(LIVE_VOICE_MESSAGE.connectionDropped);
    } else {
      this.callbacks.onError(
        this.started ? LIVE_VOICE_MESSAGE.connectionDropped : LIVE_VOICE_MESSAGE.connectionFailed,
      );
    }
    this.finalizeTurns();
    this.dispose();
  }

  private handleMessage(payload: string): void {
    let parsed: ServerEvent;
    try {
      parsed = JSON.parse(payload) as ServerEvent;
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
          if (typeof delegationId === 'string') this.endDelegation(delegationId);
          else for (const id of [...this.pendingDelegations.keys()]) this.endDelegation(id);
          this.publishToolActivity();
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

  private appendUser(delta: string): void {
    if (!delta) return;
    const now = Date.now();
    if (this.speaking) {
      this.setSpeaking(false);
      this.callbacks.onInterrupted();
    }
    if (this.assistantTurn) this.finalizeAssistant();
    this.userTurn ??= { id: uuidv7(), text: '', lastDeltaAt: now };
    this.userTurn.text += delta;
    this.userTurn.lastDeltaAt = now;
    this.callbacks.onTranscript({
      turnId: this.userTurn.id,
      role: 'user',
      text: this.userTurn.text,
      final: false,
    });
  }

  private appendAssistant(delta: string): void {
    if (!delta) return;
    const now = Date.now();
    if (!this.assistantTurn && this.userTurn) this.finalizeUser();
    this.assistantTurn ??= { id: uuidv7(), text: '', lastDeltaAt: now };
    this.assistantTurn.text += delta;
    this.assistantTurn.lastDeltaAt = now;
    this.callbacks.onTranscript({
      turnId: this.assistantTurn.id,
      role: 'assistant',
      text: this.assistantTurn.text,
      final: false,
    });
    this.setSpeaking(true);
  }

  private setSpeaking(active: boolean): void {
    if (this.speechTimer !== null) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
    if (active !== this.speaking) {
      this.speaking = active;
      this.callbacks.onAssistantSpeaking(active);
    }
    if (!active) return;
    this.speechTimer = setTimeout(() => {
      this.speechTimer = null;
      this.setSpeaking(false);
      this.finalizeAssistant();
    }, ASSISTANT_SPEECH_HOLD_MS);
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
    clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  private stopTimers(): void {
    if (this.speechTimer !== null) clearTimeout(this.speechTimer);
    this.speechTimer = null;
    this.clearDisconnectTimer();
    for (const timer of this.delegationTimers.values()) clearTimeout(timer);
    this.delegationTimers.clear();
  }
}

export async function settleLiveVoiceSession(
  sessionId: string,
  settlement: LiveSessionSettlement,
  closed: LiveSessionClosed,
): Promise<void> {
  try {
    await apiFetch(`${LIVE_VOICE_SESSION_PATH}/${encodeURIComponent(sessionId)}/close`, {
      method: 'POST',
      body: JSON.stringify({
        seconds: closed.seconds ?? 0,
        reason: closed.reason,
        settlement,
      }),
    });
  } catch {
    return;
  }
}
