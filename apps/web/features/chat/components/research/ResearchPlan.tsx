'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  DEFAULT_RESEARCH_DELIVERABLE,
  RESEARCH_DELIVERABLE_DEPTHS,
  RESEARCH_DELIVERABLE_FORMATS,
  RESEARCH_MAX_MIN_SOURCES,
  isResearchGap,
  type ResearchDeliverableDepth,
  type ResearchDeliverableFormat,
  type ResearchDeliverableSpec,
  type ResearchGap,
  type ResearchStep,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';

const MAX_PLAN_STEPS = 6;
const MAX_STEP_CHARS = 300;

const HEADING = 'Research plan';
const EXPLANATION =
  'Edit any step before it runs. What you start here is exactly what gets searched, and it spends your budget.';
const ADD_STEP_LABEL = 'Add a step';
const REMOVE_STEP_LABEL = 'Remove this step';
const START_LABEL = 'Start research';
const CANCEL_LABEL = 'Cancel';
const EMPTY_PLAN_COPY = 'Add at least one step, or cancel.';
const GAPS_HEADING = 'Gaps';
const GAPS_EXPLANATION =
  'What the plan asked for that the report does not answer. Derived from the plan against the finished report.';

const DEPTH_LABEL: Record<ResearchDeliverableDepth, string> = {
  'executive-summary': 'Executive summary',
  'full-report': 'Full report',
};

const DEPTH_HINT: Record<ResearchDeliverableDepth, string> = {
  'executive-summary': 'The answer in a page, only what changes a decision.',
  'full-report': 'Sections, with the reasoning and the evidence behind each.',
};

const FORMAT_LABEL: Record<ResearchDeliverableFormat, string> = {
  prose: 'Prose',
  'prose-with-tables': 'Prose with comparison tables',
  'bullet-brief': 'Bullet brief',
};

const MIN_SOURCE_CHOICES = [0, 5, 10, 20] as const;

export interface ResearchPlanSubmission {
  steps: ResearchStep[];
  deliverable: ResearchDeliverableSpec;
}

export interface ResearchPlanProps {
  steps: readonly ResearchStep[];
  gaps?: readonly ResearchGap[];
  editable: boolean;
  busy?: boolean;
  onStart?: (submission: ResearchPlanSubmission) => void;
  onCancel?: () => void;
  className?: string;
}

/** Parse the additive `x_research_gaps` SSE payload. Unknown shapes yield null. */
export function parseResearchGapsEvent(payload: unknown): ResearchGap[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as { gaps?: unknown }).gaps;
  if (!Array.isArray(raw)) return null;
  const gaps = raw.filter(isResearchGap).slice(0, 50);
  return gaps.length > 0 ? gaps : null;
}

function editableSteps(steps: readonly ResearchStep[]): ResearchStep[] {
  return steps
    .filter((step) => step.type === 'search' && step.status === 'pending')
    .map((step) => ({ ...step }));
}

export function ResearchPlan({
  steps,
  gaps,
  editable,
  busy = false,
  onStart,
  onCancel,
  className,
}: ResearchPlanProps) {
  const [draft, setDraft] = useState<ResearchStep[]>(() => editableSteps(steps));
  const [deliverable, setDeliverable] = useState<ResearchDeliverableSpec>({
    ...DEFAULT_RESEARCH_DELIVERABLE,
  });

  useEffect(() => {
    setDraft(editableSteps(steps));
  }, [steps]);

  const editStep = useCallback((id: string, description: string) => {
    setDraft((current) =>
      current.map((step) =>
        step.id === id ? { ...step, description: description.slice(0, MAX_STEP_CHARS) } : step,
      ),
    );
  }, []);

  const removeStep = useCallback((id: string) => {
    setDraft((current) => current.filter((step) => step.id !== id));
  }, []);

  const addStep = useCallback(() => {
    setDraft((current) =>
      current.length >= MAX_PLAN_STEPS
        ? current
        : [
            ...current,
            {
              id: `draft-${current.length + 1}-${Date.now()}`,
              type: 'search',
              description: '',
              status: 'pending',
            },
          ],
    );
  }, []);

  const ready = draft.some((step) => step.description.trim().length > 0);
  const openGaps = (gaps ?? []).filter((gap) => gap.status === 'open');

  return (
    <section className={cn('space-y-3', className)} aria-labelledby="research-plan-heading">
      <div>
        <h3 id="research-plan-heading" className="text-sm font-medium text-foreground">
          {HEADING}
        </h3>
        {editable ? <p className="mt-0.5 text-xs text-muted-foreground">{EXPLANATION}</p> : null}
      </div>

      <ul className="space-y-1.5">
        {draft.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            {editable ? (
              <>
                <input
                  type="text"
                  value={step.description}
                  onChange={(event) => editStep(step.id, event.target.value)}
                  aria-label={`Research step ${index + 1}`}
                  className="min-h-8 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                />
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  aria-label={`${REMOVE_STEP_LABEL}: ${step.description || index + 1}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <span className="flex-1 text-xs text-foreground">{step.description}</span>
            )}
          </li>
        ))}
      </ul>

      {editable ? (
        <button
          type="button"
          onClick={addStep}
          disabled={draft.length >= MAX_PLAN_STEPS}
          className="inline-flex min-h-6 items-center gap-1 px-1 text-xs font-medium underline disabled:opacity-50"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          {ADD_STEP_LABEL}
        </button>
      ) : null}

      {editable ? (
        <fieldset className="space-y-2 rounded-lg border border-border/60 p-3">
          <legend className="px-1 text-xs font-medium text-foreground">Deliverable</legend>

          <div className="flex flex-wrap gap-2">
            {RESEARCH_DELIVERABLE_DEPTHS.map((depth) => (
              <label key={depth} className="flex items-center gap-1.5 text-xs text-foreground">
                <input
                  type="radio"
                  name="research-deliverable-depth"
                  value={depth}
                  checked={deliverable.depth === depth}
                  onChange={() => setDeliverable((current) => ({ ...current, depth }))}
                />
                {DEPTH_LABEL[depth]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{DEPTH_HINT[deliverable.depth]}</p>

          <label className="flex flex-wrap items-center gap-2 text-xs text-foreground">
            Format
            <select
              value={deliverable.format}
              onChange={(event) =>
                setDeliverable((current) => ({
                  ...current,
                  format: event.target.value as ResearchDeliverableFormat,
                }))
              }
              className="min-h-8 rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {RESEARCH_DELIVERABLE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABEL[format]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-wrap items-center gap-2 text-xs text-foreground">
            Done when it has at least
            <select
              value={deliverable.minSources}
              onChange={(event) =>
                setDeliverable((current) => ({
                  ...current,
                  minSources: Math.min(RESEARCH_MAX_MIN_SOURCES, Number(event.target.value)),
                }))
              }
              className="min-h-8 rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {MIN_SOURCE_CHOICES.map((count) => (
                <option key={count} value={count}>
                  {count === 0 ? 'no minimum' : `${count} sources`}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={deliverable.stopWhenNoNewSources}
              onChange={(event) =>
                setDeliverable((current) => ({
                  ...current,
                  stopWhenNoNewSources: event.target.checked,
                }))
              }
            />
            Stop once a round of searching stops finding anything new
          </label>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={deliverable.saveToLibrary}
              onChange={(event) =>
                setDeliverable((current) => ({ ...current, saveToLibrary: event.target.checked }))
              }
            />
            Save the finished report to my library
          </label>
        </fieldset>
      ) : null}

      {openGaps.length > 0 ? (
        <div className="space-y-1 rounded-lg border border-border/60 p-3">
          <h4 className="text-xs font-medium text-foreground">
            {GAPS_HEADING} ({openGaps.length})
          </h4>
          <p className="text-xs text-muted-foreground">{GAPS_EXPLANATION}</p>
          <ul className="space-y-1">
            {openGaps.map((gap) => (
              <li key={gap.id} className="text-xs text-foreground">
                <span className="font-medium">{gap.question}</span>
                <span className="text-muted-foreground"> {gap.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() =>
              onStart?.({
                steps: draft
                  .filter((step) => step.description.trim().length > 0)
                  .map((step) => ({ ...step, description: step.description.trim() })),
                deliverable,
              })
            }
            className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {START_LABEL}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-8 items-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground disabled:opacity-60"
          >
            {CANCEL_LABEL}
          </button>
          {!ready ? <span className="text-xs text-muted-foreground">{EMPTY_PLAN_COPY}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
