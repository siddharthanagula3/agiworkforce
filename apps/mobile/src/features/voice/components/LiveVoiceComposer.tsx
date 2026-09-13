import { useCallback } from 'react';
import { useLiveVoiceSession } from '@/src/features/voice/hooks/useLiveVoiceSession';
import { LiveVoiceBar } from './LiveVoiceBar';

export interface LiveVoiceComposerProps {
  visible: boolean;
  conversationId: string | null;
  model: string;
  ensureConversation: () => Promise<string | null>;
  onSwitchToText: () => void;
  onEnded: (message: string | null) => void;
}

export function LiveVoiceComposer({
  visible,
  conversationId,
  model,
  ensureConversation,
  onSwitchToText,
  onEnded,
}: LiveVoiceComposerProps) {
  const controller = useLiveVoiceSession({
    active: visible,
    conversationId,
    model,
    ensureConversation,
    onEnded,
  });

  const handleExit = useCallback(() => onEnded(null), [onEnded]);

  return (
    <LiveVoiceBar
      visible={visible}
      status={controller.status}
      muted={controller.muted}
      assistantSpeaking={controller.assistantSpeaking}
      backendBusy={controller.backendBusy}
      interrupted={controller.interrupted}
      turns={controller.turns}
      error={controller.error}
      onToggleMute={controller.toggleMute}
      onSwitchToText={onSwitchToText}
      onRetry={controller.retry}
      onExit={handleExit}
    />
  );
}
