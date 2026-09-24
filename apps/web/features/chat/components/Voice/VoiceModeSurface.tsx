'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, X } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import type { VisualFrame } from '@agiworkforce/types';

import { cn } from '@shared/lib/utils';
import { useVoiceSession, type VoiceTranscriptTurn } from '@features/chat/hooks/use-voice-session';
import { LIVE_VOICES } from '@features/chat/lib/live-voices';
import {
  useVoiceSessionStore,
  type VoiceIntelligence,
} from '@features/chat/stores/voice-session-store';
import { VOICE_SESSION_STATUS } from '@agiworkforce/unified-chat';
import { useVisualSession } from '@/lib/visual/use-visual-session';
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
  reconnecting: 'Reconnecting, attempt',
  shareCamera: 'Share your camera',
  stopCamera: 'Stop sharing your camera',
  cameraPreview: 'Preview of what your camera is sharing',
  cameraSharing: 'Your camera is being shared with this call.',
} as const;

const ESCAPE = 'Escape';

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

  const [typed, setTyped] = useState('');
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const [captions, setCaptions] = useState<readonly VoiceCaptionLine[]>([]);

  const { state, exit, toggleMute, cancelPending, submitTyped, retry } = session;
  const { status, muted, pendingUtterance, error } = state;
  const announcement = voiceStatusAnnouncement({
    status,
    muted,
    backendBusy: session.backendBusy,
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
      onClick={toggleFocusMode}
      className={focusMode ? 'pointer-events-auto' : undefined}
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
  ) : muted && status === VOICE_SESSION_STATUS.muted ? (
    <p data-testid="voice-muted-hint" className="text-sm text-[var(--chat-text-muted)]">
      {session.mutedHint}
    </p>
  ) : null;

  const sendingChip = pendingUtterance ? (
    <div
      data-testid="voice-sending-chip"
      className="flex max-w-full items-center gap-2 rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] py-1 pl-3 pr-1 text-sm"
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
      {/* One node in both states. Moving the orb into an overlay instead
          remounted it, and a remount restarts the grow-in, so the focus
          toggle shrank the sphere to a pinprick before it doubled. */}
      <div
        className={cn(
          'flex items-center justify-center',
          focusMode && 'pointer-events-none fixed inset-0 z-[var(--z-overlay)]',
        )}
      >
        {orb}
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="voice-live-status">
        {announcement}
      </p>

      {notice}
      {sendingChip}
      {captionsOpen ? <VoiceCaptions lines={captions} /> : null}

      {onVisualFrame ? (
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

      <VoiceComposer
        value={typed}
        muted={muted}
        captionsOpen={captionsOpen}
        deviceName={session.deviceName}
        dockOpen={dockOpen}
        onChange={setTyped}
        onSubmit={handleSubmitTyped}
        onToggleMute={toggleMute}
        onToggleCaptions={() => setCaptionsOpen((open) => !open)}
        onToggleDock={() => setDockOpen(!dockOpen)}
        onExit={exit}
      />

      <VoiceChatDock
        open={dockOpen}
        onClose={() => setDockOpen(false)}
        onNewChat={onNewChat}
        onOpenLibrary={onOpenLibrary}
        onOpenConnectors={onOpenConnectors}
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
      />
    </div>
  );
}
