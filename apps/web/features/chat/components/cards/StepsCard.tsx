/**
 * StepsCard - Step-by-step guide with interactive progress
 *
 * Displays numbered steps parsed from markdown with:
 * - Clickable checkmarks for progress tracking
 * - Visual progress indicator
 * - Collapsible details per step
 * - Completion celebration state
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Check, ChevronDown, ChevronRight, ListChecks, Circle } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader } from '@agiworkforce/ui';
import { Progress } from '@agiworkforce/ui';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import {
  CardExtraSections,
  appendExtraLine,
  openExtraSection,
  stripListMarker,
  type ExtraSection,
} from './card-extras';

interface ParsedStep {
  title: string;
  details: string[];
}

interface ParsedSteps {
  title: string;
  description: string;
  steps: ParsedStep[];
  extraSections: ExtraSection[];
}

function parseSteps(content: string): ParsedSteps {
  const lines = content.split('\n');

  let title = '';
  let description = '';
  const steps: ParsedStep[] = [];
  const descLines: string[] = [];
  const extraSections: ExtraSection[] = [];
  let inPreamble = true;
  let extraHeading: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (!trimmed) continue;

    // Extract title from first heading
    if (!title && /^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      continue;
    }

    // Detect step headers: "## Step N: ...", "### Step N ...", "N. **Title**", etc.
    const stepHeaderMatch = trimmed.match(
      /^(?:#{2,4}\s+)?(?:step\s+)?(\d+)[.:)\s]+\s*\*?\*?(.+?)\*?\*?\s*$/i,
    );
    // Also match: "## Step N: Title" or "**Step N: Title**"
    const altStepMatch = trimmed.match(
      /^(?:#{2,4}\s+)?\*?\*?step\s+(\d+)[.:)\s]+\s*(.+?)\*?\*?\s*$/i,
    );

    const match = stepHeaderMatch || altStepMatch;
    if (match) {
      inPreamble = false;
      extraHeading = null;
      steps.push({
        title: (match[2] ?? '').replace(/\*\*/g, '').trim(),
        details: [],
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = (heading[1] ?? '').length;
      const text = (heading[2] ?? '').replace(/\*\*/g, '').trim();
      const lastStep = steps[steps.length - 1];
      // A deeper heading inside a step is part of that step, so it stays with
      // it; a sibling heading opens a section of its own after the checklist.
      if (extraHeading === null && !inPreamble && level >= 3 && lastStep) {
        if (text) lastStep.details.push(text);
        continue;
      }
      extraHeading = text;
      openExtraSection(extraSections, text);
      continue;
    }

    if (extraHeading !== null) {
      appendExtraLine(extraSections, extraHeading, stripListMarker(trimmed));
      continue;
    }

    // Preamble text
    if (inPreamble) {
      descLines.push(trimmed);
      continue;
    }

    // Step detail lines (belongs to last step)
    const lastStep = steps[steps.length - 1];
    if (lastStep) {
      const detailText = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      if (detailText) lastStep.details.push(detailText);
    } else {
      appendExtraLine(extraSections, '', stripListMarker(trimmed));
    }
  }

  description = descLines
    .filter((l) => !l.startsWith('#'))
    .join(' ')
    .replace(/\*\*/g, '')
    .trim();

  return {
    title: title || 'Step-by-Step Guide',
    description,
    steps,
    extraSections,
  };
}

const DESCRIPTION_CHAR_BUDGET = 180;

export function clampToSentence(text: string, budget = DESCRIPTION_CHAR_BUDGET): string {
  const full = text.trim();
  if (full.length <= budget) return full;

  const sentences = full.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) ?? [];
  let kept = '';
  for (const sentence of sentences) {
    const next = kept + sentence;
    if (kept && next.trim().length > budget) break;
    kept = next;
    if (kept.trim().length >= budget) break;
  }
  kept = kept.trim();

  if (kept && kept.length <= budget && /[.!?]["')\]]*$/.test(kept)) return `${kept} …`;

  const head = full.slice(0, budget);
  const lastSpace = head.lastIndexOf(' ');
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[\s,;:]+$/, '')}…`;
}

interface StepsCardProps {
  content: string;
  messageId?: string;
}

function hashContent(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function storageKey(content: string, messageId?: string): string {
  const conversation =
    typeof window === 'undefined'
      ? 'ssr'
      : (window.location.pathname.match(/\/chat\/([^/?#]+)/)?.[1] ?? 'no-conversation');
  const identity = messageId ? `m:${messageId}` : hashContent(content);
  return `agi:steps-card:${conversation}:${identity}`;
}

function readPersisted(key: string): Set<number> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is number => typeof n === 'number' && n >= 0));
  } catch {
    // Private mode, quota, or malformed value: fall back to empty rather than
    // breaking the card.
    return new Set();
  }
}

export function StepsCard({ content, messageId }: StepsCardProps) {
  const parsed = useMemo(() => parseSteps(content), [content]);
  const descriptionPreview = useMemo(
    () => clampToSentence(parsed.description),
    [parsed.description],
  );
  const key = useMemo(() => storageKey(content, messageId), [content, messageId]);
  // Lazy initializer so the first paint already shows the restored state and
  // the progress bar never flashes 0% before filling in.
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(() => readPersisted(key));
  const [expandedStep, setExpandedStep] = useState<number | null>(0);

  // Re-read when the card identity changes (e.g. navigating between two chats
  // that both render a checklist without unmounting this component).
  useEffect(() => {
    setCompletedSteps(readPersisted(key));
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (completedSteps.size === 0) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify([...completedSteps].sort((a, b) => a - b)));
      }
    } catch {
      // Persisting is best-effort; a full quota must not break ticking a box.
    }
  }, [key, completedSteps]);

  const toggleStep = useCallback((index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((index: number) => {
    setExpandedStep((prev) => (prev === index ? null : index));
  }, []);

  const progressPercent =
    parsed.steps.length > 0 ? Math.round((completedSteps.size / parsed.steps.length) * 100) : 0;
  const allComplete = completedSteps.size === parsed.steps.length && parsed.steps.length > 0;

  return (
    <Card className="steps-card overflow-hidden border-[var(--chat-border)]">
      <CardHeader className="border-b border-[var(--chat-border-subtle)] bg-[var(--chat-surface-hover)] pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--chat-surface-elevated)]">
              <ListChecks className="h-5 w-5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight">{parsed.title}</h3>
              {parsed.description && (
                <p
                  className="mt-0.5 text-sm text-muted-foreground"
                  title={descriptionPreview === parsed.description ? undefined : parsed.description}
                >
                  {descriptionPreview}
                </p>
              )}
            </div>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 text-xs',
              allComplete &&
                'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
            )}
          >
            {completedSteps.size}/{parsed.steps.length}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="mt-3 space-y-1.5">
          <Progress
            value={progressPercent}
            className="h-1.5"
            aria-label={`${progressPercent}% complete`}
          />
          <p className="text-xs text-muted-foreground">
            {allComplete ? 'All steps completed!' : `${progressPercent}% complete`}
          </p>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        <div className="space-y-1" role="list" aria-label="Steps">
          {parsed.steps.map((step, index) => {
            const isCompleted = completedSteps.has(index);
            const isExpanded = expandedStep === index;
            const hasDetails = step.details.length > 0;

            return (
              <div
                key={`step-${index}`}
                role="listitem"
                className={cn(
                  'rounded-lg border transition-colors',
                  isCompleted
                    ? 'border-emerald-200/50 bg-emerald-50/30 dark:border-emerald-800/20 dark:bg-emerald-950/10'
                    : 'border-transparent hover:border-border hover:bg-muted/30',
                )}
              >
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(index)}>
                  <div className="flex items-center gap-3 p-3">
                    {/* Checkmark button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStep(index);
                      }}
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        isCompleted
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-muted-foreground/30 hover:border-[var(--chat-accent-primary)]',
                      )}
                      aria-label={
                        isCompleted
                          ? `Mark step ${index + 1} incomplete`
                          : `Mark step ${index + 1} complete`
                      }
                    >
                      {isCompleted ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      )}
                    </button>

                    {/* Step title */}
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-left"
                        aria-expanded={isExpanded}
                      >
                        <span className="text-xs font-semibold text-muted-foreground min-w-[1.5rem]">
                          {index + 1}.
                        </span>
                        <span
                          className={cn(
                            'flex-1 text-sm font-medium',
                            isCompleted && 'line-through text-muted-foreground',
                          )}
                        >
                          {step.title}
                        </span>
                        {hasDetails && (
                          <span className="text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                        )}
                      </button>
                    </CollapsibleTrigger>
                  </div>

                  {/* Expandable details */}
                  {hasDetails && (
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pl-[3.75rem]">
                        <ul className="space-y-1.5">
                          {step.details.map((detail, di) => (
                            <li
                              key={`detail-${index}-${di}`}
                              className="flex items-start gap-2 text-sm text-muted-foreground"
                            >
                              <span
                                className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40"
                                aria-hidden="true"
                              />
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              </div>
            );
          })}
        </div>

        <CardExtraSections sections={parsed.extraSections} />
      </CardContent>
    </Card>
  );
}
