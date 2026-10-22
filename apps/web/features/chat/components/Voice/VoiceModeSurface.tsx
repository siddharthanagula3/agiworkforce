'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openUpgrade } from '@shared/lib/app-commands';
import { CircleAlert, X } from '@agiworkforce/icons';
import { Button, Spinner } from '@agiworkforce/ui';
import type { VisualFrame } from '@agiworkforce/types';
import {
  readToolApprovalReview,
  type LiveVoicePendingApproval,
  type LiveVoiceToolDecision,
  type LiveVoiceToolFile,
} from '@agiworkforce/cloud-contracts';

import { cn } from '@shared/lib/utils';
import { useVoiceSession, type VoiceTranscriptTurn } from '@features/chat/hooks/use-voice-session';
import { LIVE_VOICES } from '@features/chat/lib/live-voices';
import {
  useVoiceSessionStore,
  type VoiceIntelligence,
} from '@features/chat/stores/voice-session-store';
import { formatVoiceCallTime, VOICE_SESSION_STATUS } from '@agiworkforce/unified-chat';
import { liveVoiceOutputRef } from '@features/chat/hooks/use-voice-session';
import { useDesktopHost } from '@/features/desktop-host/lib/host';
import { useVisualSession } from '@/lib/visual/use-visual-session';
import { VOICE_ATTACHMENT_ACCEPT } from '@features/chat/lib/voice-attachments';
import { ToolApprovalCard } from '../approvals/ToolApprovalCard';
import { ToolTimeline, type ToolEntry } from '../messages/ToolTimeline';
import { SourcesControl } from '../research/ResearchPanel';
import { AudioRoutePicker } from './AudioRoutePicker';
import { VoiceCaptions } from './VoiceCaptions';
import { VoiceChatDock } from './VoiceChatDock';
import { VoiceComposer } from './VoiceComposer';
import { voiceStatusAnnouncement } from './voice-announcements';
import { appendVoiceCaption, type VoiceCaptionLine } from './voice-captions';
import { VoiceOrb } from './VoiceOrb';
import { VoiceSettingsModal } from './VoiceSettingsModal';

const LABEL = {
  sending: 'Sending',
  cancelSending: 'Do not send that',
  retry: 'Try again',
  continueInText: 'Continue in text',
  upgrade: 'Upgrade',
  tapToHear: 'Tap to hear the assistant',
  audioBlocked: "Your browser paused the assistant's audio.",
  reconnecting: 'Reconnecting, attempt',
  shareCamera: 'Share your camera',
  stopCamera: 'Stop sharing your camera',
  cameraPreview: 'Preview of what your camera is sharing',
  cameraSharing: 'Your camera is being shared with this call.',
  working: 'Working on your request',
  callTime: 'Call time',
  stopTask: 'Stop the task',
  stopTaskHint: 'Stops the running action and keeps the call open.',
  slowTool: 'is taking longer than usual',
  openFile: 'Open',
  rejoinTitle: 'This chat already has an open voice session',
  rejoinBody:
    'Continue with the voice, language and pace it used, or start with your current settings.',
  rejoin: 'Continue that session',
  startFresh: 'Use my settings',
  resume: 'Resume',
  pausedHint:
    'Paused. The call is closed and nothing is being used. Resume to pick up this conversation.',
} as const;

const GENERATED_FILE_PATH = /^\/api\/files\/[A-Za-z0-9_-]+(?:\?.*)?$/;
const VOICE_SOURCES_ID = 'voice-session-sources';

function isGeneratedFilePath(uri: string): boolean {
  return GENERATED_FILE_PATH.test(uri);
}

function isImageFile(file: LiveVoiceToolFile): boolean {
  return file.mimeType?.startsWith('image/') === true;
}

function approvalParameters(input: string | null): Record<string, unknown> | undefined {
  if (!input) return undefined;
  try {
    const parsed: unknown = JSON.parse(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { arguments: input };
  } catch {
    return { arguments: input };
  }
}

function voiceDecision(decision: string): LiveVoiceToolDecision | null {
  if (decision === 'approved') return 'approved';
  if (decision === 'rejected') return 'rejected';
  return null;
}

function VoiceToolApproval({
  approval,
  onDecide,
}: {
  approval: LiveVoicePendingApproval;
  onDecide: (callId: string, decision: LiveVoiceToolDecision) => void;
}) {
  const review = readToolApprovalReview(approval.review);
  const parameters = approvalParameters(approval.input);
  return (
    <div data-testid="voice-tool-approval" className="w-full max-w-md">
      <ToolApprovalCard
        toolCallId={approval.callId}
        label={approval.summary}
        {...(parameters ? { parameters } : {})}
        {...(review ? { review } : {})}
        decided={approval.deciding}
        onDecide={(callId, decision) => {
          const allowed = voiceDecision(decision);
          if (allowed) onDecide(callId, allowed);
        }}
      />
    </div>
  );
}

const ESCAPE = 'Escape';
const LIMIT_ACTION_CLASS =
  'min-h-6 shrink-0 rounded-full px-2 py-1 font-medium text-[var(--chat-accent-primary-text)] transition-colors hover:bg-[var(--chat-surface-hover)]';

export const VOICE_SURFACE_VARIANT = {
  empty: 'empty',
  chat: 'chat',
} as const;

export type VoiceSurfaceVariant =
  (typeof VOICE_SURFACE_VARIANT)[keyof typeof VOICE_SURFACE_VARIANT];

export interface VoiceModeSurfaceProps {
  variant: VoiceSurfaceVariant;
  turnActive: boolean;
  conversationId: string | null;
  onSend: (text: string) => boolean;
  onStartWorkTask?: (goal: string) => boolean;
  onEnsureConversation: () => Promise<string | null>;
  onTranscript: (conversationId: string, turn: VoiceTranscriptTurn) => void;
  onNewChat: () => void;
  onOpenLibrary: () => void;
  onOpenConnectors: () => void;
  onIntelligenceChange: (intelligence: VoiceIntelligence) => void;
  /** Where a live camera frame goes. Without a sink the control is not offered. */
  onVisualFrame?: (frame: VisualFrame) => void;
}

export function VoiceModeSurface({
  variant,
  turnActive,
  conversationId,
  onSend,
  onStartWorkTask,
  onEnsureConversation,
  onTranscript,
  onNewChat,
  onOpenLibrary,
  onOpenConnectors,
  onIntelligenceChange,
  onVisualFrame,
}: VoiceModeSurfaceProps) {
  const handleTranscript = useCallback(
    (id: string, turn: VoiceTranscriptTurn) => {
      setCaptions((lines) => appendVoiceCaption(lines, turn));
      onTranscript(id, turn);
    },
    [onTranscript],
  );

  const session = useVoiceSession({
    turnActive,
    conversationId,
    onSend,
    ...(onStartWorkTask ? { onStartWorkTask } : {}),
    onEnsureConversation,
    onTranscript: handleTranscript,
  });
  const focusMode = useVoiceSessionStore((store) => store.focusMode);
  const toggleFocusMode = useVoiceSessionStore((store) => store.toggleFocusMode);
  const dockOpen = useVoiceSessionStore((store) => store.dockOpen);
  const setDockOpen = useVoiceSessionStore((store) => store.setDockOpen);
  const settingsOpen = useVoiceSessionStore((store) => store.settingsOpen);
  const setSettingsOpen = useVoiceSessionStore((store) => store.setSettingsOpen);
  const intelligence = useVoiceSessionStore((store) => store.intelligence);
  const setIntelligence = useVoiceSessionStore((store) => store.setIntelligence);
  const language = useVoiceSessionStore((store) => store.language);
  const setLanguage = useVoiceSessionStore((store) => store.setLanguage);
  const voice = useVoiceSessionStore((store) => store.voice);
  const setVoice = useVoiceSessionStore((store) => store.setVoice);
  const usageLimited = useVoiceSessionStore((store) => store.usageLimited);
  const playbackBlocked = useVoiceSessionStore((store) => store.playbackBlocked);
  const providerNotice = useVoiceSessionStore((store) => store.providerNotice);
  const sources = useVoiceSessionStore((store) => store.sources);

  const [typed, setTyped] = useState('');
  const dockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const [captions, setCaptions] = useState<readonly VoiceCaptionLine[]>([]);

  const { state, exit, toggleMute, cancelPending, submitTyped, retry } = session;
  const toolEntries = useMemo<ToolEntry[]>(
    () =>
      session.toolOutcomes.map((outcome) => ({
        id: outcome.callId,
        toolCallId: outcome.callId,
        name: outcome.label,
        summary: outcome.label,
        statusPhrase: outcome.label,
        status: outcome.isError ? 'failed' : 'completed',
        ...(outcome.isError ? { error: outcome.output } : { result: outcome.output }),
      })),
    [session.toolOutcomes],
  );
  const { status, muted, pendingUtterance, error } = state;
  const latestActivity = session.toolActivity[session.toolActivity.length - 1];
  const agentStatus = latestActivity
    ? latestActivity.state === 'timed_out'
      ? `${latestActivity.label} ${LABEL.slowTool}`
      : latestActivity.label
    : session.backendBusy
      ? LABEL.working
      : null;
  const callTime =
    status !== VOICE_SESSION_STATUS.exited && status !== VOICE_SESSION_STATUS.entering
      ? formatVoiceCallTime(session.callElapsedMs)
      : null;
  const announcement = voiceStatusAnnouncement({
    status,
    muted,
    backendBusy: session.backendBusy,
    approvalPending: session.toolApprovals.length > 0,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ESCAPE) return;
      const store = useVoiceSessionStore.getState();
      if (store.settingsOpen || store.dockOpen || store.activityMessageId) return;
      exit();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [exit]);

  // The desktop shell grants the microphone and nothing else: it carries no
  // camera entitlement or usage string, so a camera request there always fails.
  const cameraAvailable = useDesktopHost() === null;
  const visual = useVisualSession({
    source: 'camera',
    voiceActive: status !== VOICE_SESSION_STATUS.exited,
    onFrame: onVisualFrame,
  });
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const visualStream = visual.mediaStream;

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    node.srcObject = visualStream;
    return () => {
      node.srcObject = null;
    };
  }, [visualStream]);

  const toggleCamera = useCallback(() => {
    if (visual.capturing) {
      visual.stop();
      return;
    }
    void visual.start();
  }, [visual]);

  const handleSubmitTyped = useCallback(() => {
    if (!typed.trim()) return;
    submitTyped(typed);
    setTyped('');
  }, [submitTyped, typed]);

  const handleIntelligenceChange = useCallback(
    (next: VoiceIntelligence) => {
      setIntelligence(next);
      onIntelligenceChange(next);
    },
    [onIntelligenceChange, setIntelligence],
  );

  const orb = (
    <VoiceOrb
      status={status}
      backendBusy={session.backendBusy}
      focus={focusMode}
      growIn
      reducedMotion={session.reducedMotion}
      level={session.audioLevel}
      showLabel={false}
      onClick={toggleFocusMode}
    />
  );

  const notice = session.reconnecting ? (
    <div
      role="status"
      data-testid="voice-reconnecting"
      className="flex items-center gap-2 text-sm text-[var(--chat-text-secondary)]"
    >
      <Spinner size="sm" className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        {LABEL.reconnecting} {session.reconnectAttempt} of {session.reconnectMaxAttempts}
      </span>
    </div>
  ) : status === VOICE_SESSION_STATUS.error && usageLimited ? (
    <div
      role="alert"
      data-testid="voice-usage-limit"
      className="flex items-center gap-2 text-sm text-[var(--chat-text-secondary)]"
    >
      <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{error}</span>
      <button
        type="button"
        onClick={() => openUpgrade((href) => window.location.assign(href))}
        className={LIMIT_ACTION_CLASS}
        data-testid="voice-usage-upgrade"
      >
        {LABEL.upgrade}
      </button>
      <button type="button" onClick={exit} className={LIMIT_ACTION_CLASS}>
        {LABEL.continueInText}
      </button>
    </div>
  ) : status === VOICE_SESSION_STATUS.error ? (
    <div
      role="alert"
      data-testid="voice-error"
      className="flex items-center gap-2 text-sm text-[var(--chat-destructive-text)]"
    >
      <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{error}</span>
      <button
        type="button"
        onClick={retry}
        className="shrink-0 rounded-full px-2 py-1 font-medium text-[var(--chat-accent-primary-text)] transition-colors hover:bg-[var(--chat-surface-hover)]"
      >
        {LABEL.retry}
      </button>
    </div>
  ) : session.paused ? (
    <div
      data-testid="voice-paused-hint"
      className="flex items-center gap-2 text-sm text-[var(--chat-text-muted)]"
    >
      <span className="min-w-0">{LABEL.pausedHint}</span>
      <button
        type="button"
        data-testid="voice-resume"
        onClick={session.resume}
        className={LIMIT_ACTION_CLASS}
      >
        {LABEL.resume}
      </button>
    </div>
  ) : muted && status === VOICE_SESSION_STATUS.muted ? (
    <p data-testid="voice-muted-hint" className="text-sm text-[var(--chat-text-muted)]">
      {session.mutedHint}
    </p>
  ) : null;

  const sendingChip = pendingUtterance ? (
    <div
      data-testid="voice-sending-chip"
      className="flex max-w-full items-center gap-2 rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] py-1 ps-3 pe-1 text-sm"
    >
      <span className="shrink-0 font-medium text-[var(--chat-text-secondary)]">
        {LABEL.sending}
      </span>
      <span className="min-w-0 truncate text-[var(--chat-text-primary)]">{pendingUtterance}</span>
      <button
        type="button"
        onClick={cancelPending}
        aria-label={LABEL.cancelSending}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  ) : null;

  return (
    <div
      data-testid="voice-mode-surface"
      data-voice-variant={variant}
      className={cn(
        'flex w-full flex-col items-center gap-3',
        variant === VOICE_SURFACE_VARIANT.chat && 'pb-12',
      )}
    >
      <p className="sr-only" role="status" aria-live="polite" data-testid="voice-live-status">
        {announcement}
      </p>

      {notice}
      {playbackBlocked ? (
        <div
          role="status"
          data-testid="voice-playback-blocked"
          className="flex items-center gap-2 text-sm text-[var(--chat-text-secondary)]"
        >
          <span className="min-w-0">{LABEL.audioBlocked}</span>
          <Button type="button" className="min-h-11" onClick={session.resumePlayback}>
            {LABEL.tapToHear}
          </Button>
        </div>
      ) : null}
      {providerNotice && status !== VOICE_SESSION_STATUS.error ? (
        <p
          role="status"
          data-testid="voice-provider-notice"
          className="text-sm text-[var(--chat-text-secondary)]"
        >
          {providerNotice}
        </p>
      ) : null}
      {session.rejoinOffer ? (
        <div
          role="dialog"
          aria-labelledby="voice-rejoin-title"
          data-testid="voice-rejoin-offer"
          className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] p-4 text-sm"
        >
          <p id="voice-rejoin-title" className="font-medium text-[var(--chat-text-primary)]">
            {LABEL.rejoinTitle}
          </p>
          <p className="text-[var(--chat-text-secondary)]">
            Started{' '}
            {new Date(session.rejoinOffer.startedAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            on {session.rejoinOffer.surface}. {LABEL.rejoinBody}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={() => session.answerRejoin(true)}>
              {LABEL.rejoin}
            </Button>
            <button
              type="button"
              onClick={() => session.answerRejoin(false)}
              className="min-h-11 rounded-full border border-[var(--chat-border-strong)] px-4 py-2 font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
            >
              {LABEL.startFresh}
            </button>
          </div>
        </div>
      ) : null}
      {session.toolOutcomes.length > 0 ? (
        <div data-testid="voice-tool-results" className="w-full max-w-md text-sm">
          <ToolTimeline tools={toolEntries} />
          {session.toolOutcomes.flatMap((outcome) =>
            outcome.files
              .filter((file) => isGeneratedFilePath(file.uri))
              .map((file) =>
                isImageFile(file) ? (
                  <a
                    key={`${outcome.callId}-${file.uri}`}
                    href={file.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="voice-tool-image"
                    aria-label={`${LABEL.openFile} ${file.name}`}
                    className="mt-2 block w-fit overflow-hidden rounded-xl border border-[var(--chat-border-strong)]"
                  >
                    <img
                      src={file.uri}
                      alt={file.name}
                      loading="lazy"
                      className="block max-h-64 max-w-full object-contain"
                    />
                  </a>
                ) : (
                  <a
                    key={`${outcome.callId}-${file.uri}`}
                    href={file.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex min-h-6 items-center gap-1 font-medium text-[var(--chat-accent-primary-text)] underline-offset-2 hover:underline"
                  >
                    {LABEL.openFile} {file.name}
                  </a>
                ),
              ),
          )}
        </div>
      ) : null}
      {sources.length > 0 ? (
        <div data-testid="voice-sources" className="flex w-full max-w-md justify-center">
          <SourcesControl messageId={VOICE_SOURCES_ID} cited={[...sources]} more={[]} />
        </div>
      ) : null}
      {session.toolApprovals.map((approval) => (
        <VoiceToolApproval
          key={approval.callId}
          approval={approval}
          onDecide={session.decideToolApproval}
        />
      ))}
      {sendingChip}
      {captionsOpen ? <VoiceCaptions lines={captions} /> : null}

      {onVisualFrame && cameraAvailable ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            data-testid="voice-camera-toggle"
            onClick={toggleCamera}
            aria-pressed={visual.capturing}
            className="min-h-11 rounded-full border border-[var(--chat-border-strong)] px-4 py-2 text-sm font-medium text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
          >
            {visual.capturing ? LABEL.stopCamera : LABEL.shareCamera}
          </button>
          {visual.status.error ? (
            <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
              {visual.status.error}
            </p>
          ) : null}
          {visual.capturing ? (
            <>
              <p className="sr-only" role="status" aria-live="polite">
                {LABEL.cameraSharing}
              </p>
              <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                aria-label={LABEL.cameraPreview}
                data-testid="voice-camera-preview"
                className="h-24 w-32 rounded-lg border border-[var(--chat-border-strong)] object-cover"
              />
            </>
          ) : null}
        </div>
      ) : null}

      {/* The orb keeps its own slot in the column in both states, so on a short
          viewport it never covers the notice, error row or composer. The canvas
          reserves room for the orb's glow; the negative margin pulls the
          composer up under it, and the composer paints over the overlap. */}
      <div
        data-testid="voice-orb-slot"
        className="-mb-14 flex shrink-0 items-center justify-center"
      >
        {orb}
      </div>

      {callTime !== null || agentStatus !== null ? (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-2 text-sm">
          {callTime !== null ? (
            <p
              role="timer"
              aria-label={`${LABEL.callTime} ${callTime}`}
              data-testid="voice-call-time"
              className="tabular-nums text-[var(--chat-text-muted)]"
            >
              {callTime}
            </p>
          ) : null}
          {agentStatus !== null ? (
            <div
              data-testid="voice-agent-status"
              className="flex max-w-full items-center gap-2 text-[var(--chat-text-secondary)]"
            >
              {latestActivity?.state === 'timed_out' ? (
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Spinner size="sm" className="h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0 truncate">{agentStatus}</span>
              <button
                type="button"
                data-testid="voice-stop-task"
                onClick={session.cancelBackendWork}
                title={LABEL.stopTaskHint}
                className="min-h-11 shrink-0 rounded-full px-3 font-medium text-[var(--chat-accent-primary-text)] transition-colors hover:bg-[var(--chat-surface-hover)]"
              >
                {LABEL.stopTask}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <VoiceComposer
        value={typed}
        muted={muted}
        deviceName={session.deviceName}
        dockOpen={dockOpen}
        dockTriggerRef={dockTriggerRef}
        onChange={setTyped}
        onSubmit={handleSubmitTyped}
        onToggleMute={toggleMute}
        onToggleDock={() => setDockOpen(!dockOpen)}
        onExit={exit}
      />

      <input
        ref={attachmentInputRef}
        type="file"
        accept={VOICE_ATTACHMENT_ACCEPT}
        className="hidden"
        data-testid="voice-attachment-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) session.shareAttachment(file);
        }}
      />
      <VoiceChatDock
        open={dockOpen}
        triggerRef={dockTriggerRef}
        onClose={() => setDockOpen(false)}
        onNewChat={onNewChat}
        onAddFiles={() => attachmentInputRef.current?.click()}
        onOpenLibrary={onOpenLibrary}
        onOpenConnectors={onOpenConnectors}
        captionsOpen={captionsOpen}
        onToggleCaptions={() => setCaptionsOpen((open) => !open)}
        onPause={
          status === VOICE_SESSION_STATUS.error || session.paused ? undefined : session.pause
        }
      />

      <VoiceSettingsModal
        open={settingsOpen}
        reducedMotion={session.reducedMotion}
        voices={LIVE_VOICES}
        voiceUri={voice}
        intelligence={intelligence}
        language={language}
        onOpenChange={setSettingsOpen}
        onVoiceChange={setVoice}
        onIntelligenceChange={handleIntelligenceChange}
        onLanguageChange={setLanguage}
        audioOutput={<AudioRoutePicker audioRef={liveVoiceOutputRef} className="self-start" />}
      />
    </div>
  );
}
