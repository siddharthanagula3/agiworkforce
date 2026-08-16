import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Button, useUiTranslation } from '@agiworkforce/ui';
import { detectGoalIntent } from '../lib/goalIntent';
import type { ChatMessage } from '../lib/types';

export interface GoalHandoffChipProps {
  messages: readonly ChatMessage[];
  onSubmitGoal: (goal: string) => void | Promise<void>;
}

export function GoalHandoffChip({ messages, onSubmitGoal }: GoalHandoffChipProps) {
  const { t } = useUiTranslation('chat');
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);

  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return null;

  const intent = detectGoalIntent(lastUser.content);
  if (!intent.isGoal) return null;

  if (submittedFor === lastUser.id) {
    return (
      <div
        data-testid="agi-submitted"
        role="status"
        className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-2 text-[13px] text-[var(--chat-text-secondary)]"
      >
        <Check size={14} className="text-[var(--chat-accent-secondary)]" aria-hidden />
        {t('goalHandoff.submitted', 'Sent to Agent Tasks. Track it in the Agent Tasks panel.')}
      </div>
    );
  }

  return (
    <div
      data-testid="agi-goal-detected"
      className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-2"
    >
      <span className="flex items-center gap-2 text-[13px] text-[var(--chat-text-secondary)]">
        <Sparkles size={14} aria-hidden />
        {t('goalHandoff.offer', 'This reads like a goal. Run it as an agent task instead?')}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setSubmittedFor(lastUser.id);
          void onSubmitGoal(lastUser.content.trim());
        }}
      >
        {t('goalHandoff.action', 'Run as task')}
      </Button>
    </div>
  );
}
