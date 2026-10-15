import { useState } from 'react';
import { create } from 'zustand';
import { useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import { toUserMessage } from '../lib/network-error';
import type { AgentQuestion } from '../lib/runtime';

interface AgentQuestionStore {
  byConversation: Record<string, AgentQuestion>;
  ask: (conversationId: string, question: AgentQuestion) => void;
  clear: (conversationId: string, questionId?: string) => void;
}

export const useAgentQuestionStore = create<AgentQuestionStore>()((set) => ({
  byConversation: {},
  ask: (conversationId, question) =>
    set((state) => ({ byConversation: { ...state.byConversation, [conversationId]: question } })),
  clear: (conversationId, questionId) =>
    set((state) => {
      const current = state.byConversation[conversationId];
      if (!current || (questionId && current.id !== questionId)) return state;
      const byConversation = { ...state.byConversation };
      delete byConversation[conversationId];
      return { byConversation };
    }),
}));

export interface AgentQuestionCardProps {
  conversationId: string | null;
  onAnswer: (question: AgentQuestion, answer: string | string[]) => Promise<void>;
  className?: string;
}

const CHOICE_BUTTON = cn(
  'rounded-full border px-3 py-1 text-sm transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

export function AgentQuestionCard({ conversationId, onAnswer, className }: AgentQuestionCardProps) {
  const { t } = useUiTranslation('chat');
  const question = useAgentQuestionStore((state) =>
    conversationId ? state.byConversation[conversationId] : undefined,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!question) return null;

  const submit = (answer: string | string[]) => {
    setSending(true);
    setError(null);
    onAnswer(question, answer)
      .then(() => setSelected([]))
      .catch((err: unknown) =>
        setError(
          toUserMessage(err, t('question.sendFailed', 'Your answer was not sent. Try again.')),
        ),
      )
      .finally(() => setSending(false));
  };

  return (
    <section
      aria-label={t('question.label', 'Question from the agent')}
      className={cn(
        'mb-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-2',
        className,
      )}
    >
      <p className="text-sm font-medium text-[var(--chat-text-primary)]">{question.question}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {question.choices.map((choice) => {
          const isSelected = selected.includes(choice);
          return (
            <button
              key={choice}
              type="button"
              disabled={sending}
              aria-pressed={question.multiSelect ? isSelected : undefined}
              onClick={() => {
                if (!question.multiSelect) {
                  submit(choice);
                  return;
                }
                setSelected((current) =>
                  current.includes(choice)
                    ? current.filter((value) => value !== choice)
                    : [...current, choice],
                );
              }}
              className={cn(
                CHOICE_BUTTON,
                isSelected
                  ? 'border-[var(--chat-accent-primary)] text-[var(--chat-accent-primary-text)]'
                  : 'border-[var(--chat-border)] text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
              )}
            >
              {choice}
            </button>
          );
        })}
        {question.multiSelect && (
          <button
            type="button"
            disabled={sending || selected.length === 0}
            onClick={() => submit(selected)}
            className={cn(
              CHOICE_BUTTON,
              'border-[var(--chat-border)] font-medium text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
            )}
          >
            {t('question.submit', 'Answer')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-[var(--chat-text-secondary)]">
          {error}
        </p>
      )}
    </section>
  );
}
