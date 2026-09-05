'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, X } from '@agiworkforce/icons';

import { useTTS } from '@/lib/hooks/useTTS';
import { cn } from '@shared/lib/utils';
import { useVoiceSession, type VoiceReplyTurn } from '@features/chat/hooks/use-voice-session';
import {
  useVoiceSessionStore,
  type VoiceIntelligence,
} from '@features/chat/stores/voice-session-store';
import { VOICE_SESSION_STATUS } from '@agiworkforce/unified-chat';
import { VoiceChatDock } from './VoiceChatDock';
import { VoiceComposer } from './VoiceComposer';
import { VoiceOrb } from './VoiceOrb';
import { VoiceSettingsModal } from './VoiceSettingsModal';

const LABEL = {
  sending: 'Sending',
  cancelSending: 'Do not send that',
  retry: 'Try again',
  playbackUnavailable: 'Spoken replies are unavailable in this browser.',
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
  reply: VoiceReplyTurn | null;
  onSend: (text: string) => boolean;
  onNewChat: () => void;
  onOpenLibrary: () => void;
  onOpenConnectors: () => void;
  onIntelligenceChange: (intelligence: VoiceIntelligence) => void;
}

export function VoiceModeSurface({
  variant,
  turnActive,
  reply,
  onSend,
  onNewChat,
  onOpenLibrary,
  onOpenConnectors,
  onIntelligenceChange,
}: VoiceModeSurfaceProps) {
  const session = useVoiceSession({ turnActive, reply, onSend });
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
  const tts = useTTS();

  const [typed, setTyped] = useState('');

  const { state, exit, toggleMute, cancelPending, submitTyped, retry } = session;
  const { status, muted, pendingUtterance, error } = state;

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
      focus={focusMode}
      growIn
      reducedMotion={session.reducedMotion}
      onClick={toggleFocusMode}
      className={focusMode ? 'pointer-events-auto' : undefined}
    />
  );

  const notice =
    status === VOICE_SESSION_STATUS.error ? (
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
    ) : session.playbackUnavailable ? (
      <p data-testid="voice-playback-notice" className="text-sm text-[var(--chat-text-muted)]">
        {LABEL.playbackUnavailable}
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
          focusMode && 'pointer-events-none fixed inset-0 z-[var(--z-overlay,200)]',
        )}
      >
        {orb}
      </div>

      {notice}
      {sendingChip}

      <VoiceComposer
        value={typed}
        muted={muted}
        deviceName={session.deviceName}
        dockOpen={dockOpen}
        onChange={setTyped}
        onSubmit={handleSubmitTyped}
        onToggleMute={toggleMute}
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
        voices={tts.voices}
        voiceUri={tts.voiceUri}
        intelligence={intelligence}
        language={language}
        onOpenChange={setSettingsOpen}
        onVoiceChange={tts.setVoiceUri}
        onIntelligenceChange={handleIntelligenceChange}
        onLanguageChange={setLanguage}
      />
    </div>
  );
}
