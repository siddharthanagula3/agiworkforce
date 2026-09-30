'use client';

import { useEffect, useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { AGIWORK_PLAN_MAX_STEPS, MAX_AGIWORK_PLAN_STEP_CHARS } from '@agiworkforce/cloud-contracts';
import type { AgiWorkPlanStep } from '@/features/chat/utils/agiwork-plan';

const LABEL = {
  heading: 'Plan',
  explanation: 'Edit any step before the work starts. The agent follows the plan you start here.',
  addStep: 'Add a step',
  removeStep: 'Remove this step',
  start: 'Start work',
  cancel: 'Cancel',
  empty: 'Add at least one step, or cancel.',
  retryFrom: 'Retry from this step',
} as const;

const STATUS_LABEL: Record<AgiWorkPlanStep['status'], string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export type AgiWorkPlanDecision =
  { kind: 'start'; steps: string[] } | { kind: 'cancel' } | { kind: 'retry'; fromIndex: number };

export interface AgiWorkPlanReviewProps {
  steps: readonly AgiWorkPlanStep[];
  awaitingApproval: boolean;
  runFinished: boolean;
  busy: boolean;
  onDecision: (decision: AgiWorkPlanDecision) => void;
}

export function AgiWorkPlanReview({
  steps,
  awaitingApproval,
  runFinished,
  busy,
  onDecision,
}: AgiWorkPlanReviewProps) {
  const [draft, setDraft] = useState(() => steps.map((step) => step.description));

  useEffect(() => {
    setDraft(steps.map((step) => step.description));
  }, [steps]);

  const retryIndex = runFinished
    ? steps.findIndex((step) => step.status === 'failed' || step.status === 'cancelled')
    : -1;

  if (!awaitingApproval && retryIndex < 0) return null;

  if (!awaitingApproval) {
    const step = steps[retryIndex]!;
    return (
      <section
        aria-label="Retry a step"
        data-testid="agiwork-plan-retry"
        className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 p-3 text-xs"
      >
        <span className="min-w-0 flex-1 break-words text-foreground">
          {retryIndex + 1}. {step.description}
          <span className="text-muted-foreground"> · {STATUS_LABEL[step.status]}</span>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecision({ kind: 'retry', fromIndex: retryIndex })}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border px-3 py-1 font-medium text-foreground disabled:opacity-60"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {LABEL.retryFrom}
        </button>
      </section>
    );
  }

  const cleaned = draft.map((description) => description.trim()).filter(Boolean);
  const ready = cleaned.length > 0;

  return (
    <section
      aria-label="Review the plan"
      data-testid="agiwork-plan-review"
      className="mt-3 space-y-3 rounded-lg border border-border/70 p-3"
    >
      <div>
        <h3 className="text-sm font-medium text-foreground">{LABEL.heading}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{LABEL.explanation}</p>
      </div>
      <ol className="space-y-2">
        {draft.map((description, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-2 w-4 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
            <textarea
              value={description}
              rows={2}
              maxLength={MAX_AGIWORK_PLAN_STEP_CHARS}
              aria-label={`Step ${index + 1}`}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) =>
                  current.map((value, position) =>
                    position === index ? event.target.value : value,
                  ),
                )
              }
              className="min-w-0 flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
            <button
              type="button"
              aria-label={LABEL.removeStep}
              disabled={busy || draft.length <= 1}
              onClick={() =>
                setDraft((current) => current.filter((_, position) => position !== index))
              }
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {draft.length < AGIWORK_PLAN_MAX_STEPS ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setDraft((current) => [...current, ''])}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {LABEL.addStep}
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onDecision({ kind: 'start', steps: cleaned })}
          className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
          data-testid="agiwork-plan-start"
        >
          {LABEL.start}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecision({ kind: 'cancel' })}
          className="inline-flex min-h-8 items-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground disabled:opacity-60"
          data-testid="agiwork-plan-cancel"
        >
          {LABEL.cancel}
        </button>
        {!ready ? <span className="text-xs text-muted-foreground">{LABEL.empty}</span> : null}
      </div>
    </section>
  );
}
