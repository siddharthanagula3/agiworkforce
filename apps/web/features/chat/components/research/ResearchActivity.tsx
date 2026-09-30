'use client';

import { useEffect, useState } from 'react';
import {
  Telescope,
  CircleAlert,
  CirclePause,
  CircleStop,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  MessageSquarePlus,
  Pause,
  Play,
  Plus,
  RotateCw,
  Search,
  FileText,
  X,
} from 'lucide-react';
import {
  FILES_RESEARCH_SOURCE,
  addResearchSource,
  formatCredits,
  removeResearchSource,
  researchSourceKey,
  researchSourceRequest,
  runStatusLabel,
  RESEARCH_GUIDANCE_MAX_CHARS,
  type ResearchDeliverableSpec,
  type ResearchSource,
  type ResearchSourceRequest,
  type ResearchStep,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { useModelStore } from '@shared/stores/model-store';
import { estimateResearchCredits } from '@/lib/billing/credit-estimates';
import { ResearchPlan } from './ResearchPlan';
import { useResearchRunControls } from './research-run-controls';
import type { MessageResearchState } from '@shared/stores/web-chat-store';
import { useUiTranslation } from '@agiworkforce/ui';
import { isResearchGuidanceStep } from '../../utils/research-plan';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const PHASE_FALLBACK_LABELS: Record<MessageResearchState['phase'], string> = {
  planning: 'Planning research',
  awaiting_approval: 'Review the plan to start searching',
  searching: 'Searching the web',
  synthesizing: 'Writing report',
  paused: 'Research paused',
  complete: 'Research complete',
  error: 'Research failed',
  interrupted: 'Research stopped',
};

const GUIDANCE_STEP_LABEL = 'Your guidance';

const DROPPED_STEP_LABEL = 'Not run';

const STEP_STATUS_LABELS: Record<ResearchStep['status'], string> = {
  pending: runStatusLabel('queued'),
  running: runStatusLabel('running'),
  completed: runStatusLabel('completed'),
  failed: runStatusLabel('failed'),
  dropped: DROPPED_STEP_LABEL,
};

function PlanStepRow({ step }: { step: ResearchStep }) {
  if (isResearchGuidanceStep(step)) {
    return (
      <li
        className="flex items-start gap-2 py-1"
        data-testid="research-plan-step"
        data-status={step.status}
        data-kind="guidance"
      >
        <MessageSquare className="mt-[2px] h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-snug text-foreground">{step.description}</span>
        <span className="shrink-0 text-caption uppercase tracking-wide text-muted-foreground">
          {GUIDANCE_STEP_LABEL}
        </span>
      </li>
    );
  }
  const Icon =
    step.status === 'completed'
      ? CircleCheck
      : step.status === 'failed'
        ? CircleAlert
        : step.status === 'running'
          ? LoaderCircle
          : step.status === 'dropped'
            ? CircleSlash
            : CircleDashed;
  const TypeIcon = step.type === 'synthesize' ? FileText : Search;

  return (
    <li
      className="flex items-start gap-2 py-1"
      data-testid="research-plan-step"
      data-status={step.status}
    >
      <Icon
        className={cn(
          'mt-[2px] h-3 w-3 shrink-0',
          step.status === 'completed' && 'text-primary',
          step.status === 'failed' && 'text-danger',
          step.status === 'running' && 'animate-spin text-primary',
          step.status === 'pending' && 'text-muted-foreground',
          step.status === 'dropped' && 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
      <TypeIcon className="mt-[2px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span
        className={cn(
          'min-w-0 flex-1 leading-snug',
          step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground',
          step.status === 'completed' && 'text-muted-foreground',
          step.status === 'dropped' && 'text-muted-foreground',
        )}
      >
        {step.description}
        {(step.status === 'dropped' || step.status === 'failed') && step.note ? (
          <span className="block text-caption text-muted-foreground">{step.note}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-caption uppercase tracking-wide text-muted-foreground">
        {STEP_STATUS_LABELS[step.status]}
      </span>
    </li>
  );
}

export type ResearchPlanDecision = 'start' | 'cancel';

/**
 * What the reader chose the run may read, taken at the moment they press Start
 * (§24 File sources, Domain restrictions). The server enforces all of it: the
 * domain list gates every source at ingestion, files are searched only when
 * asked for, and a connected app is read only while the account's connector
 * permissions still allow it.
 */
export type ResearchPlanOptions = ResearchSourceRequest & {
  /** The plan as the reader edited it, absent when they started it unchanged. */
  steps?: ResearchStep[];
  deliverable?: ResearchDeliverableSpec;
};

const DOMAIN_SEPARATOR = /[\s,;]+/;

export function parseResearchDomainList(value: string): string[] {
  return Array.from(new Set(value.split(DOMAIN_SEPARATOR).map((part) => part.trim()))).filter(
    (part) => part.length > 0,
  );
}

/** A connected app the reader may add to the run, resolved by the surface. */
export interface ResearchConnectorOption {
  connectorId: string;
  label: string;
}

type AddableKind = 'web' | 'web-excluded' | 'files' | 'connector';

const ADD_KIND_LABELS: Record<AddableKind, string> = {
  web: 'Only this site',
  'web-excluded': 'Never this site',
  files: 'My files',
  connector: 'Connected app',
};

interface ResearchActivityProps {
  research: MessageResearchState;
  messageId?: string;
  isStreaming: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  /**
   * Answer a paused run's plan. Absent when the surface cannot send, so a
   * plan that cannot be started shows no Start button.
   */
  onPlanDecision?: (decision: ResearchPlanDecision, options?: ResearchPlanOptions) => void;
  /** Connected apps this account may read from. Empty when none are connected. */
  connectorOptions?: readonly ResearchConnectorOption[];
}

const CONTROL_BUTTON_CLASS = cn(
  'inline-flex items-center gap-1 min-h-6 rounded-md border border-border/40 px-2 py-0.5 pointer-coarse:min-h-11',
  'text-caption font-medium text-foreground transition-colors',
  'hover:border-border hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60',
);

const CONTROL_INPUT_CLASS =
  'min-h-7 min-w-0 flex-1 rounded-md border border-border/40 bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11';

export function ResearchActivity({
  research,
  messageId,
  isStreaming,
  onRetry,
  isRetrying = false,
  onPlanDecision,
  connectorOptions,
}: ResearchActivityProps) {
  const { plural } = useUiTranslation('chat');
  const isActive =
    isStreaming &&
    (research.phase === 'planning' ||
      research.phase === 'searching' ||
      research.phase === 'synthesizing');
  const selectedModelId = useModelStore((state) => state.selectedModelId);
  const costEstimate = {
    modelId: selectedModelId,
    rounds: research.maxIterations,
    searches: research.maxSearches,
  };
  const runEstimate =
    isActive && research.maxIterations && research.maxSearches !== undefined
      ? estimateResearchCredits({
          modelId: selectedModelId,
          rounds: research.maxIterations,
          searches: research.maxSearches,
        })
      : null;

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const anchorElapsed = research.elapsedMs ?? 0;
  const startedAtMs = research.startedAt ? Date.parse(research.startedAt) : NaN;
  const liveElapsed =
    isActive && Number.isFinite(startedAtMs)
      ? Math.max(anchorElapsed, nowMs - startedAtMs)
      : anchorElapsed;

  const label = research.label || PHASE_FALLBACK_LABELS[research.phase];
  const failed = research.phase === 'error';
  const interrupted = research.phase === 'interrupted';
  const paused = research.phase === 'paused';
  const complete = research.phase === 'complete';

  const runControls = useResearchRunControls();
  const runAction = runControls?.act ?? null;
  const availableConnectors = connectorOptions ?? runControls?.connectorOptions ?? [];
  const controllable = Boolean(runAction && messageId);
  const steerable =
    controllable &&
    isStreaming &&
    (research.phase === 'planning' || research.phase === 'searching');
  const [pauseRequested, setPauseRequested] = useState(false);
  const [steerOpen, setSteerOpen] = useState(false);
  const [steerDraft, setSteerDraft] = useState('');
  const guidanceRead = (research.steps ?? []).filter(isResearchGuidanceStep).length;
  const [steerSentAfter, setSteerSentAfter] = useState<number | null>(null);
  const steerQueued = steerSentAfter !== null && guidanceRead <= steerSentAfter;
  const [sentGuidance, setSentGuidance] = useState<string | null>(null);
  const [sendingAsMessage, setSendingAsMessage] = useState(false);
  const [resumeGuidance, setResumeGuidance] = useState('');

  const requestPause = async () => {
    if (!runAction || !messageId) return;
    setPauseRequested(true);
    if (!(await runAction(messageId, { kind: 'pause' }))) setPauseRequested(false);
  };

  const submitSteer = async () => {
    const guidance = steerDraft.trim();
    if (!guidance || !runAction || !messageId) return;
    setSteerSentAfter(guidanceRead);
    setSteerOpen(false);
    if (await runAction(messageId, { kind: 'steer', guidance })) {
      setSteerDraft('');
      setSentGuidance(guidance);
      return;
    }
    setSteerSentAfter(null);
    setSteerOpen(true);
  };

  const sendGuidanceAsMessage = async () => {
    if (!runAction || !messageId || !sentGuidance) return;
    setSendingAsMessage(true);
    const sent = await runAction(messageId, { kind: 'sendAsNew', guidance: sentGuidance });
    setSendingAsMessage(false);
    if (!sent) return;
    setSentGuidance(null);
    setSteerSentAfter(null);
  };

  const resume = () => {
    if (!runAction || !messageId) {
      onRetry?.();
      return;
    }
    const guidance = resumeGuidance.trim();
    void runAction(messageId, guidance ? { kind: 'resume', guidance } : { kind: 'resume' });
  };

  const counts: string[] = [];
  if (typeof research.searches === 'number' && research.searches > 0) {
    counts.push(
      isActive && typeof research.maxSearches === 'number' && research.maxSearches > 0
        ? plural(
            'counts.searchesOf',
            research.searches,
            { one: '{{count}} of {{max}} search', other: '{{count}} of {{max}} searches' },
            { max: research.maxSearches },
          )
        : plural('counts.searches', research.searches, {
            one: '{{count}} search',
            other: '{{count}} searches',
          }),
    );
  }
  if (typeof research.sources === 'number' && research.sources > 0) {
    counts.push(
      plural('counts.sources', research.sources, {
        one: '{{count}} source',
        other: '{{count}} sources',
      }),
    );
  }
  if (!isActive && typeof research.credits === 'number' && Number.isFinite(research.credits)) {
    counts.push(formatCredits(research.credits, { maximumFractionDigits: 2 }));
  }
  if (runEstimate) {
    counts.push(`up to ~${formatCredits(runEstimate.total, { maximumFractionDigits: 0 })}`);
  }
  if (
    isActive &&
    typeof research.iteration === 'number' &&
    research.iteration > 0 &&
    typeof research.maxIterations === 'number' &&
    research.maxIterations > 0
  ) {
    counts.unshift(`round ${research.iteration} of ${research.maxIterations}`);
  }

  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [addKind, setAddKind] = useState<AddableKind>('web');
  const [addValue, setAddValue] = useState('');

  const connectorChoices = availableConnectors.filter(
    (option) =>
      !sources.some((source) => source.kind === 'connector' && source.id === option.connectorId),
  );
  const canAdd =
    addKind === 'files'
      ? !sources.some((source) => source.kind === 'files')
      : addKind === 'connector'
        ? connectorChoices.length > 0 && addValue.length > 0
        : parseResearchDomainList(addValue).length > 0;

  const addChosenSource = () => {
    if (!canAdd) return;
    if (addKind === 'files') {
      setSources((current) => addResearchSource(current, FILES_RESEARCH_SOURCE));
      return;
    }
    if (addKind === 'connector') {
      const option = connectorChoices.find((choice) => choice.connectorId === addValue);
      if (!option) return;
      setSources((current) =>
        addResearchSource(current, {
          kind: 'connector',
          id: option.connectorId,
          label: option.label,
        }),
      );
      setAddValue('');
      return;
    }
    const excluded = addKind === 'web-excluded';
    setSources((current) =>
      parseResearchDomainList(addValue).reduce(
        (next, domain) =>
          addResearchSource(next, { kind: 'web', id: domain, label: domain, excluded }),
        current,
      ),
    );
    setAddValue('');
  };

  const steps = research.steps ?? [];
  const awaitingApproval = research.phase === 'awaiting_approval';
  const canRetry = Boolean(onRetry) && failed;
  const canResume = (Boolean(onRetry) || controllable) && (interrupted || paused) && !isStreaming;
  const canDecide = Boolean(onPlanDecision) && awaitingApproval && !isStreaming;
  const showSteerInput = steerable && steerOpen;
  const showSteerQueued = steerable && steerQueued;
  const showResumeGuidance = canResume && controllable;
  const showSteerUnread =
    controllable &&
    !isStreaming &&
    (complete || failed || interrupted) &&
    steerQueued &&
    sentGuidance !== null;
  const controlRows = showSteerInput || showSteerQueued || showResumeGuidance || showSteerUnread;

  return (
    <div className="mb-3">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
          (steps.length > 0 || controlRows) && 'rounded-b-none border-b-0',
          failed
            ? 'border-destructive/30 bg-destructive/5 text-danger'
            : 'border-border/30 bg-muted/20 text-muted-foreground',
        )}
        role="status"
        aria-label={`Deep research: ${label}`}
        data-testid="research-activity"
      >
        {failed ? (
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : interrupted ? (
          <CircleStop className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : paused ? (
          <CirclePause className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        ) : complete ? (
          <CircleCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        ) : awaitingApproval ? (
          <ListChecks className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <Telescope
            className={cn('h-3.5 w-3.5 shrink-0 text-primary', isActive && 'animate-pulse')}
            aria-hidden="true"
          />
        )}

        <span className={cn('font-medium', !failed && 'text-foreground')}>{label}</span>

        {interrupted && <span className="text-muted-foreground">(stopped by you)</span>}

        <span className="ms-auto flex shrink-0 items-center gap-2 tabular-nums">
          {counts.length > 0 && <span>{counts.join(' · ')}</span>}
          {liveElapsed > 0 && <span>{formatElapsed(liveElapsed)}</span>}
          {steerable && (
            <>
              <button
                type="button"
                onClick={() => setSteerOpen((open) => !open)}
                disabled={pauseRequested}
                className={CONTROL_BUTTON_CLASS}
                aria-expanded={steerOpen}
                data-testid="research-steer"
              >
                <MessageSquarePlus className="h-3 w-3" aria-hidden="true" />
                Steer
              </button>
              <button
                type="button"
                onClick={() => void requestPause()}
                disabled={pauseRequested || steerQueued}
                className={CONTROL_BUTTON_CLASS}
                data-testid="research-pause"
                aria-label={
                  pauseRequested
                    ? 'Pausing after the current step'
                    : 'Pause this research after the current step'
                }
              >
                <Pause className="h-3 w-3" aria-hidden="true" />
                {pauseRequested ? 'Pausing…' : 'Pause'}
              </button>
            </>
          )}
          {canResume && !showResumeGuidance && (
            <button
              type="button"
              onClick={resume}
              disabled={isRetrying}
              className={CONTROL_BUTTON_CLASS}
              data-testid="research-resume"
              aria-label="Resume this research from where it stopped"
            >
              <Play className="h-3 w-3" aria-hidden="true" />
              {isRetrying ? 'Resuming…' : 'Resume'}
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className={CONTROL_BUTTON_CLASS}
              data-testid="research-retry"
              aria-label="Retry this research run"
            >
              <RotateCw
                className={cn('h-3 w-3', isRetrying && 'animate-spin')}
                aria-hidden="true"
              />
              {isRetrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </span>
      </div>

      {showSteerInput && (
        <form
          className={cn(
            'flex flex-col gap-2 border border-t-0 border-border/30 bg-muted/10 px-3 py-2 text-xs sm:flex-row sm:items-center',
            steps.length === 0 && !showSteerQueued && 'rounded-b-lg',
          )}
          onSubmit={(event) => {
            event.preventDefault();
            void submitSteer();
          }}
          data-testid="research-steer-form"
        >
          <input
            type="text"
            value={steerDraft}
            onChange={(event) => setSteerDraft(event.target.value)}
            maxLength={RESEARCH_GUIDANCE_MAX_CHARS}
            placeholder="Add a focus, a question or a source to cover"
            className={CONTROL_INPUT_CLASS}
            aria-label="Guidance for the rest of this research"
            data-testid="research-steer-input"
          />
          <button
            type="submit"
            disabled={steerDraft.trim().length === 0}
            className={CONTROL_BUTTON_CLASS}
            data-testid="research-steer-send"
          >
            Send
          </button>
        </form>
      )}

      {showSteerQueued && (
        <p
          className={cn(
            'border border-t-0 border-border/30 bg-muted/10 px-3 py-2 text-xs text-muted-foreground',
            steps.length === 0 && 'rounded-b-lg',
          )}
          aria-live="polite"
          data-testid="research-steer-queued"
        >
          Your guidance is applied when the current step finishes, and the plan updates to follow
          it.
        </p>
      )}

      {showSteerUnread && (
        <div
          className={cn(
            'flex flex-col gap-2 border border-t-0 border-border/30 bg-muted/10 px-3 py-2 text-xs sm:flex-row sm:items-center',
            steps.length === 0 && !showResumeGuidance && 'rounded-b-lg',
          )}
          data-testid="research-steer-unread"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Not read before the task finished</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
              {sentGuidance}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void sendGuidanceAsMessage()}
            disabled={sendingAsMessage}
            className={CONTROL_BUTTON_CLASS}
            data-testid="research-steer-send-new"
          >
            {sendingAsMessage ? 'Sending…' : 'Send as new message'}
          </button>
        </div>
      )}

      {showResumeGuidance && (
        <form
          className={cn(
            'flex flex-col gap-2 border border-t-0 border-border/30 bg-muted/10 px-3 py-2 text-xs sm:flex-row sm:items-center',
            steps.length === 0 && 'rounded-b-lg',
          )}
          onSubmit={(event) => {
            event.preventDefault();
            resume();
          }}
          data-testid="research-resume-form"
        >
          <input
            type="text"
            value={resumeGuidance}
            onChange={(event) => setResumeGuidance(event.target.value)}
            maxLength={RESEARCH_GUIDANCE_MAX_CHARS}
            placeholder="Add guidance for the rest of the research (optional)"
            className={CONTROL_INPUT_CLASS}
            aria-label="Guidance for the rest of this research, optional"
            data-testid="research-resume-guidance"
          />
          <button
            type="submit"
            disabled={isRetrying}
            className={CONTROL_BUTTON_CLASS}
            data-testid="research-resume"
            aria-label="Resume this research from where it stopped"
          >
            <Play className="h-3 w-3" aria-hidden="true" />
            {isRetrying ? 'Resuming…' : 'Resume'}
          </button>
        </form>
      )}

      {canDecide && (
        <div
          className={cn(
            'flex flex-col gap-2 border border-t-0 border-border/30 bg-muted/10 px-3 py-2 text-xs',
            steps.length === 0 && 'rounded-b-lg',
          )}
          data-testid="research-plan-sources"
        >
          <p className="text-muted-foreground">
            {sources.length === 0
              ? 'Searching the whole web. Add a source to narrow it.'
              : 'Sources for this run'}
          </p>
          {sources.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" data-testid="research-plan-source-list">
              {sources.map((source) => {
                const key = researchSourceKey(source);
                return (
                  <li
                    key={key}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5',
                      source.excluded
                        ? 'border-destructive/30 text-danger'
                        : 'border-border/40 text-foreground',
                    )}
                    data-testid="research-plan-source"
                    data-kind={source.kind}
                    data-excluded={source.excluded ? 'true' : 'false'}
                  >
                    {source.excluded ? `Never ${source.label}` : source.label}
                    <button
                      type="button"
                      onClick={() => setSources((current) => removeResearchSource(current, key))}
                      className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-compact text-muted-foreground transition-colors hover:text-foreground"
                      data-testid={`research-plan-remove-${key}`}
                      aria-label={`Remove ${source.label} from this research run`}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-col gap-1 text-muted-foreground">
              Add a source
              <select
                value={addKind}
                onChange={(event) => {
                  setAddKind(event.target.value as AddableKind);
                  setAddValue('');
                }}
                className="min-h-7 rounded-md border border-border/40 bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="research-plan-add-kind"
                aria-label="What kind of source to add"
              >
                {(['web', 'web-excluded', 'files', 'connector'] as AddableKind[])
                  .filter((kind) => kind !== 'connector' || availableConnectors.length > 0)
                  .map((kind) => (
                    <option key={kind} value={kind}>
                      {ADD_KIND_LABELS[kind]}
                    </option>
                  ))}
              </select>
            </label>
            {addKind === 'connector' ? (
              <select
                value={addValue}
                onChange={(event) => setAddValue(event.target.value)}
                className="min-h-7 min-w-0 flex-1 rounded-md border border-border/40 bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="research-plan-add-connector"
                aria-label="Which connected app to read from"
              >
                <option value="">Choose an app</option>
                {connectorChoices.map((option) => (
                  <option key={option.connectorId} value={option.connectorId}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : addKind === 'files' ? null : (
              <input
                type="text"
                value={addValue}
                onChange={(event) => setAddValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addChosenSource();
                }}
                placeholder="nature.com, who.int"
                className="min-h-7 min-w-0 flex-1 rounded-md border border-border/40 bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="research-plan-add-domain"
                aria-label="Site to add"
              />
            )}
            <button
              type="button"
              onClick={addChosenSource}
              disabled={!canAdd}
              className={cn(
                'inline-flex min-h-7 items-center gap-1 rounded-md border border-border/40 px-2 py-0.5',
                'text-caption font-medium text-foreground transition-colors',
                'hover:border-border hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60',
              )}
              data-testid="research-plan-add-source"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add
            </button>
          </div>
        </div>
      )}

      {canDecide ? (
        <div className="rounded-b-lg border border-t-0 border-border/30 bg-muted/10 px-3 py-2">
          <ResearchPlan
            steps={steps}
            editable
            busy={isRetrying}
            costEstimate={costEstimate}
            onStart={(submission) =>
              onPlanDecision?.('start', {
                ...researchSourceRequest(sources),
                steps: submission.steps,
                deliverable: submission.deliverable,
              })
            }
            onCancel={() => onPlanDecision?.('cancel')}
          />
        </div>
      ) : (
        steps.length > 0 && (
          <ol
            className={cn(
              'space-y-0 rounded-b-lg border border-t-0 px-3 py-2 text-xs',
              failed ? 'border-destructive/30 bg-destructive/5' : 'border-border/30 bg-muted/10',
            )}
            aria-label="Research plan"
            role="status"
            aria-live="polite"
            data-testid="research-plan"
          >
            {steps.map((step) => (
              <PlanStepRow key={step.id} step={step} />
            ))}
          </ol>
        )
      )}
    </div>
  );
}
