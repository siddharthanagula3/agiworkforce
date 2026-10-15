'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, X } from '@agiworkforce/icons';
import { ApprovalCard, Button, Spinner } from '@agiworkforce/ui';
import { TOOL_APPROVAL_ACTION_LABELS, type VisualFrame } from '@agiworkforce/types';

import { cn } from '@shared/lib/utils';
import { useVoiceSession, type VoiceTranscriptTurn } from '@features/chat/hooks/use-voice-session';
import { LIVE_VOICES } from '@features/chat/lib/live-voices';
import {
  useVoiceSessionStore,
  type VoiceIntelligence,
} from '@features/chat/stores/voice-session-store';
import { VOICE_SESSION_STATUS } from '@agiworkforce/unified-chat';
import { liveVoiceOutputRef } from '@features/chat/hooks/use-voice-session';
import { useDesktopHost } from '@/features/desktop-host/lib/host';
import { useVisualSession } from '@/lib/visual/use-visual-session';
import { VOICE_ATTACHMENT_ACCEPT } from '@features/chat/lib/voice-attachments';
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
  approvalTitle: 'Waiting for your approval',
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

const ESCAPE = 'Escape';
const PLANS_PATH = '/pricing';
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
      <a href={PLANS_PATH} className={LIMIT_ACTION_CLASS} data-testid="voice-usage-upgrade">
        {LABEL.upgrade}
      </a>
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
      {session.toolActivity.length > 0 ? (
        <div data-testid="voice-tool-activity" className="flex w-full max-w-md flex-col gap-2">
          {session.toolActivity.map((activity) => (
            <div
              key={activity.delegationId}
              className="flex items-center gap-2 rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] px-3 py-1.5 text-sm text-[var(--chat-text-primary)]"
            >
              {activity.state === 'running' ? (
                <Spinner size="sm" className="h-4 w-4 shrink-0" />
              ) : (
                <CircleAlert
                  className="h-4 w-4 shrink-0 text-[var(--chat-text-secondary)]"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1 truncate">
                {activity.state === 'timed_out'
                  ? `${activity.label} ${LABEL.slowTool}`
                  : activity.label}
              </span>
            </div>
          ))}
          <button
            type="button"
            data-testid="voice-stop-task"
            onClick={session.cancelBackendWork}
            title={LABEL.stopTaskHint}
            className="min-h-11 self-center rounded-full border border-[var(--chat-border-strong)] px-4 py-2 text-sm font-medium text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
          >
            {LABEL.stopTask}
          </button>
        </div>
      ) : null}
      {session.toolOutcomes.length > 0 ? (
        <div data-testid="voice-tool-results" className="w-full max-w-md text-sm">
          <ToolTimeline tools={toolEntries} />
          {session.toolOutcomes.flatMap((outcome) =>
            outcome.files
              .filter((file) => isGeneratedFilePath(file.uri))
              .map((file) => (
                <a
                  key={`${outcome.callId}-${file.uri}`}
                  href={file.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex min-h-6 items-center gap-1 font-medium text-[var(--chat-accent-primary-text)] underline-offset-2 hover:underline"
                >
                  {LABEL.openFile} {file.name}
                </a>
              )),
          )}
        </div>
      ) : null}
      {sources.length > 0 ? (
        <div data-testid="voice-sources" className="flex w-full max-w-md justify-center">
          <SourcesControl messageId={VOICE_SOURCES_ID} cited={[...sources]} more={[]} />
        </div>
      ) : null}
      {session.toolApprovals.map((approval) => (
        <ApprovalCard
          key={approval.callId}
          data-testid="voice-tool-approval"
          className="w-full max-w-md"
          title={LABEL.approvalTitle}
          requests={[{ id: approval.callId, name: approval.summary, detail: approval.name }]}
          approveLabel={TOOL_APPROVAL_ACTION_LABELS.approve}
          denyLabel={TOOL_APPROVAL_ACTION_LABELS.deny}
          onApprove={() => session.decideToolApproval(approval.callId, 'approved')}
          onDeny={() => session.decideToolApproval(approval.callId, 'rejected')}
          pending={approval.deciding}
        >
          {approval.input ? (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-2 font-mono text-caption text-muted-foreground">
              {approval.input}
            </pre>
          ) : null}
        </ApprovalCard>
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

      {/* The orb keeps its own slot in the column in both states, resting on
          the composer. As a fixed full-viewport overlay in focus mode it was
          painted over the notice, the error row and the composer whenever they
          reached the middle of a short viewport. The canvas reserves room for
          the orb's glow, so the slot pulls the composer up under that margin;
          the composer follows it and paints over the overlap, and nothing
          above the orb is covered. */}
      <div
        data-testid="voice-orb-slot"
        className="-mb-14 flex shrink-0 items-center justify-center"
      >
        {orb}
      </div>

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
