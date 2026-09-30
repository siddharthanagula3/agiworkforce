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
  onStartWorkTask?: (goal: string) => boolean;
}

export function LiveVoiceComposer({
  visible,
  conversationId,
  model,
  ensureConversation,
  onSwitchToText,
  onEnded,
  onStartWorkTask,
}: LiveVoiceComposerProps) {
  const controller = useLiveVoiceSession({
    active: visible,
    conversationId,
    model,
    ensureConversation,
    onEnded,
    ...(onStartWorkTask ? { onStartWorkTask } : {}),
  });

  const handleExit = useCallback(() => onEnded(null), [onEnded]);

  return (
    <LiveVoiceBar
      visible={visible}
      status={controller.status}
      reconnecting={controller.reconnecting}
      muted={controller.muted}
      assistantSpeaking={controller.assistantSpeaking}
      backendBusy={controller.backendBusy}
      interrupted={controller.interrupted}
      turns={controller.turns}
      error={controller.error}
      approvals={controller.approvals}
      toolActivity={controller.toolActivity}
      toolOutcomes={controller.toolOutcomes}
      onDecideApproval={controller.decideToolApproval}
      onToggleMute={controller.toggleMute}
      onStopTask={controller.cancelBackendWork}
      onSwitchToText={onSwitchToText}
      onRetry={controller.retry}
      onExit={handleExit}
    />
  );
}
