'use client';

import { useCallback, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type {
  ClarifyAnswer,
  ClarifyCardBody,
  ClarifyQuestion,
  InteractiveCard,
  InteractiveCardResponsePayload,
} from '@agiworkforce/types';
import { CLARIFY_OTHER_MAX_LENGTH } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';

export interface ClarifyCardContext {
  canRespond: boolean;
  onRespond?: (cardId: string, payload: InteractiveCardResponsePayload) => void;
}

interface ClarifyCardProps {
  card: InteractiveCard;
  body: ClarifyCardBody;
  ctx: ClarifyCardContext;
}

type Draft = Record<string, { optionIds: string[]; otherText: string }>;

function emptyDraft(questions: readonly ClarifyQuestion[]): Draft {
  return Object.fromEntries(questions.map((q) => [q.id, { optionIds: [], otherText: '' }]));
}

function describeAnswer(answer: ClarifyAnswer | undefined): string {
  if (!answer) return 'No answer';
  if (answer.kind === 'skipped') return 'Skipped';
  if (answer.kind === 'other') return answer.text;
  return answer.labels.length > 0 ? answer.labels.join(', ') : answer.optionIds.join(', ');
}

export function ClarifyCard({ card, body, ctx }: ClarifyCardProps) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(body.questions));

  const isPending = body.state.status === 'pending';
  const interactive = isPending && ctx.canRespond && typeof ctx.onRespond === 'function';

  const answersById = useMemo(() => {
    if (body.state.status !== 'answered') return new Map<string, ClarifyAnswer>();
    return new Map(body.state.answers.map((a) => [a.questionId, a]));
  }, [body.state]);

  const toggleOption = useCallback((question: ClarifyQuestion, optionId: string) => {
    setDraft((prev) => {
      const current = prev[question.id] ?? { optionIds: [], otherText: '' };
      const selected = current.optionIds.includes(optionId);
      const optionIds = question.multiSelect
        ? selected
          ? current.optionIds.filter((id) => id !== optionId)
          : [...current.optionIds, optionId]
        : selected
          ? []
          : [optionId];
      return { ...prev, [question.id]: { optionIds, otherText: '' } };
    });
  }, []);

  const setOtherText = useCallback((questionId: string, text: string) => {
    setDraft((prev) => ({
      ...prev,
      [questionId]: { optionIds: [], otherText: text.slice(0, CLARIFY_OTHER_MAX_LENGTH) },
    }));
  }, []);

  const canSubmit = useMemo(() => {
    if (!interactive) return false;
    return body.questions.some((q) => {
      const entry = draft[q.id];
      return (entry?.optionIds.length ?? 0) > 0 || (entry?.otherText.trim().length ?? 0) > 0;
    });
  }, [body.questions, draft, interactive]);

  const submit = useCallback(() => {
    if (!ctx.onRespond) return;
    ctx.onRespond(card.cardId, {
      kind: 'answers',
      answers: body.questions.map((q) => {
        const entry = draft[q.id] ?? { optionIds: [], otherText: '' };
        if (entry.otherText.trim().length > 0) {
          return { question_id: q.id, text: entry.otherText.trim() };
        }
        if (entry.optionIds.length > 0) {
          return { question_id: q.id, option_ids: entry.optionIds };
        }
        return { question_id: q.id, skipped: true };
      }),
    });
  }, [body.questions, card.cardId, ctx, draft]);

  const dismiss = useCallback(() => {
    ctx.onRespond?.(card.cardId, { kind: 'dismiss' });
  }, [card.cardId, ctx]);

  return (
    <section
      aria-label={card.fallback.headline}
      data-testid="interactive-card-clarify"
      data-card-kind={card.kind}
      data-card-state={body.state.status}
      className={cn(
        'my-2 rounded-xl border px-4 py-3',
        'border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)]',
      )}
    >
      <p className="text-sm font-semibold text-foreground">
        {body.prompt ?? card.fallback.headline}
      </p>

      {body.state.status === 'expired' && (
        <p className="mt-1 text-xs text-muted-foreground">
          These questions are no longer answerable
          {body.state.reason === 'checkpoint_gone'
            ? ' — the turn that asked them has ended.'
            : body.state.reason === 'turn_failed'
              ? ' — that turn failed.'
              : ' — they were superseded by a newer message.'}
        </p>
      )}

      {body.state.status === 'dismissed' && (
        <p className="mt-1 text-xs text-muted-foreground">
          You answered in your own words instead.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {body.questions.map((question) => {
          const entry = draft[question.id] ?? { optionIds: [], otherText: '' };
          const settled = answersById.get(question.id);

          return (
            <div key={question.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="rounded bg-[var(--chat-surface-base)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {question.header}
                </span>
                <span className="text-sm text-foreground">{question.question}</span>
              </div>

              {body.state.status === 'answered' ? (
                <p className="text-sm text-muted-foreground">{describeAnswer(settled)}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {question.options.map((option) => {
                      const selected = entry.optionIds.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!interactive}
                          aria-pressed={selected}
                          onClick={() => toggleOption(question, option.id)}
                          title={option.description}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                            selected
                              ? 'border-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/10 text-foreground'
                              : 'border-[var(--chat-border)] text-muted-foreground hover:text-foreground',
                            !interactive && 'cursor-default opacity-70',
                          )}
                        >
                          {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  {question.isOther && (
                    <input
                      type="text"
                      value={entry.otherText}
                      disabled={!interactive}
                      maxLength={CLARIFY_OTHER_MAX_LENGTH}
                      onChange={(e) => setOtherText(question.id, e.target.value)}
                      placeholder="Something else…"
                      aria-label={`Other answer for ${question.header}`}
                      className="mt-1 w-full rounded-md border border-[var(--chat-border)] bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-70"
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {interactive && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-md bg-[var(--chat-accent-primary)] px-3 py-1.5 text-xs font-medium text-[var(--chat-surface-elevated)] disabled:opacity-40"
          >
            Send answers
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            I'll just type it
          </button>
        </div>
      )}
    </section>
  );
}
