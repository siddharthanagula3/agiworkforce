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

import { useState, useMemo, useCallback } from 'react';
import { Check, ChevronDown, ChevronRight, ListChecks, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@shared/ui/card';
import { Badge } from '@shared/ui/badge';
import { Progress } from '@shared/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/ui/collapsible';
import { cn } from '@shared/lib/utils';

interface ParsedStep {
  title: string;
  details: string[];
}

interface ParsedSteps {
  title: string;
  description: string;
  steps: ParsedStep[];
}

function parseSteps(content: string): ParsedSteps {
  const lines = content.split('\n');

  let title = '';
  let description = '';
  const steps: ParsedStep[] = [];
  const descLines: string[] = [];
  let inPreamble = true;

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
      steps.push({
        title: (match[2] ?? '').replace(/\*\*/g, '').trim(),
        details: [],
      });
      continue;
    }

    // Preamble text
    if (inPreamble && !trimmed.startsWith('#')) {
      descLines.push(trimmed);
      continue;
    }

    // Step detail lines (belongs to last step)
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep) {
        // Skip sub-section headers that are not steps
        if (/^#{3,}\s+/.test(trimmed)) continue;
        const detailText = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
        if (detailText) lastStep.details.push(detailText);
      }
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
  };
}

interface StepsCardProps {
  content: string;
}

export function StepsCard({ content }: StepsCardProps) {
  const parsed = useMemo(() => parseSteps(content), [content]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [expandedStep, setExpandedStep] = useState<number | null>(0);

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
    <Card className="steps-card overflow-hidden border-teal-200/50 dark:border-teal-800/30">
      <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <ListChecks className="h-5 w-5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight">{parsed.title}</h3>
              {parsed.description && (
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                  {parsed.description}
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
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-muted-foreground/30 hover:border-teal-500',
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
                        <Circle className="h-3 w-3 text-muted-foreground/30" aria-hidden="true" />
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
      </CardContent>
    </Card>
  );
}
