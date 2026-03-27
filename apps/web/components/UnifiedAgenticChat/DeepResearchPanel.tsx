import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Sparkles,
  Target,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ResearchTask } from '@/types/chat';

interface DeepResearchPanelProps {
  task: ResearchTask;
  className?: string;
  onViewSource?: (url: string) => void;
}

type ResearchTab = 'overview' | 'activity' | 'sources';

function getStatusTone(status: ResearchTask['status']) {
  switch (status) {
    case 'completed':
      return {
        badgeVariant: 'default' as const,
        badgeClassName: 'bg-agent-success/15 text-agent-success border-agent-success/25',
        panelClassName: 'border-agent-success/15 bg-agent-success/5',
      };
    case 'failed':
      return {
        badgeVariant: 'destructive' as const,
        badgeClassName: '',
        panelClassName: 'border-destructive/20 bg-destructive/5',
      };
    default:
      return {
        badgeVariant: 'secondary' as const,
        badgeClassName: 'bg-primary/10 text-primary border-primary/20',
        panelClassName: 'border-primary/15 bg-primary/5',
      };
  }
}

function formatSourceDomain(url: string, fallback?: string) {
  if (fallback) return fallback;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatElapsedLabel(value?: number | string) {
  if (value === undefined || value === null || value === '') return 'In progress';
  return typeof value === 'number' ? `${Math.round(value)}s` : value;
}

export function DeepResearchPanel({ task, className, onViewSource }: DeepResearchPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<ResearchTab>('overview');

  const steps = task.steps ?? [];
  const findings = task.findings ?? [];
  const sources = task.sources ?? [];
  const currentStep =
    steps.find((step: any) => step.status === 'running') || steps[steps.length - 1];
  const completedSteps = steps.filter((step: any) => step.status === 'completed').length;
  const totalSteps = steps.length;
  const resolvedProgress =
    typeof task.progress === 'number'
      ? task.progress
      : totalSteps > 0
        ? Math.round((completedSteps / totalSteps) * 100)
        : task.status === 'completed'
          ? 100
          : 0;
  const summaryText =
    typeof task.summary === 'string' && task.summary.trim().length > 0 ? task.summary.trim() : null;
  const statusTone = getStatusTone(task.status);

  const overviewCards = useMemo(
    () => [
      {
        label: 'Progress',
        value: `${resolvedProgress}%`,
        helper: totalSteps > 0 ? `${completedSteps}/${totalSteps} steps` : 'No steps yet',
      },
      {
        label: 'Findings',
        value: String(findings.length),
        helper: findings.length > 0 ? 'Signals collected' : 'No findings yet',
      },
      {
        label: 'Sources',
        value: String(sources.length),
        helper: sources.length > 0 ? 'Pages reviewed' : 'No sources yet',
      },
      {
        label: 'Time',
        value: formatElapsedLabel(task.timeElapsed),
        helper: task.status === 'completed' ? 'Final duration' : 'Elapsed so far',
      },
    ],
    [
      completedSteps,
      findings.length,
      resolvedProgress,
      sources.length,
      task.status,
      task.timeElapsed,
      totalSteps,
    ],
  );

  const handleSourceClick = (url: string) => {
    if (onViewSource) {
      onViewSource(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card
      className={cn(
        'w-full overflow-hidden border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm',
        className,
      )}
    >
      <div className="border-b border-border/60 bg-linear-to-br from-primary/8 via-transparent to-agent-thinking/8 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">Research</span>
          </div>
          <Badge
            variant={statusTone.badgeVariant}
            className={cn('capitalize', statusTone.badgeClassName)}
          >
            {task.status}
          </Badge>
        </div>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-semibold text-foreground" title={task.query}>
              {task.query}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatElapsedLabel(task.timeElapsed)}
              </span>
              <span>
                {totalSteps > 0 ? `${completedSteps}/${totalSteps} steps` : 'No steps yet'}
              </span>
              <span>{sources.length} sources</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((open) => !open)}
            className="rounded-full border border-border/50 bg-background/80 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={isExpanded ? 'Collapse research details' : 'Expand research details'}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isExpanded && 'rotate-180',
              )}
            />
          </button>
        </div>

        {currentStep && task.status !== 'completed' ? (
          <div className={cn('mt-4 rounded-2xl border px-3 py-2.5', statusTone.panelClassName)}>
            <div className="flex items-start gap-2">
              <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary/80">
                  Current Step
                </p>
                <p className="mt-1 text-sm text-foreground">{currentStep.description}</p>
                {'details' in currentStep && typeof currentStep.details === 'string' ? (
                  <p className="mt-1 text-xs text-muted-foreground">{currentStep.details}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <Progress
            value={resolvedProgress}
            className="h-1.5 bg-background/80"
            indicatorClassName="bg-primary"
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-b border-border/60 bg-surface-elevated/60 px-4 py-2">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['overview', 'Report'],
                    ['activity', 'Activity'],
                    ['sources', `Sources (${sources.length})`],
                  ] as const
                ).map(([tabId, label]) => {
                  const isActive = activeTab === tabId;
                  return (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setActiveTab(tabId)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        isActive
                          ? 'border-primary/25 bg-primary/10 text-primary'
                          : 'border-border/50 bg-background/70 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto bg-background/60 p-4">
              {activeTab === 'overview' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {overviewCards.map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-border/50 bg-surface-elevated px-4 py-3"
                      >
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          {card.label}
                        </div>
                        <div className="mt-2 text-lg font-semibold text-foreground">
                          {card.value}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{card.helper}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-surface-elevated p-4">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">
                        {summaryText ? 'Research Summary' : 'Emerging Findings'}
                      </h4>
                    </div>

                    {summaryText ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                        {summaryText}
                      </p>
                    ) : findings.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {findings.map((finding: any, index: number) => (
                          <li
                            key={`${index}-${finding}`}
                            className="flex gap-2 rounded-xl border border-border/40 bg-background/70 px-3 py-2.5 text-sm text-foreground/85"
                          >
                            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                        The report will appear here as soon as the agent gathers enough signal to
                        summarize its work.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === 'activity' ? (
                <div className="space-y-3">
                  {steps.length > 0 ? (
                    steps.map((step: any, index: number) => (
                      <div key={step.id || index} className="relative flex gap-3">
                        {index !== steps.length - 1 ? (
                          <div className="absolute left-[10px] top-7 h-[calc(100%-0.5rem)] w-px bg-border/70" />
                        ) : null}

                        <div
                          className={cn(
                            'relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                            step.status === 'completed'
                              ? 'border-agent-success/30 bg-agent-success/10 text-agent-success'
                              : step.status === 'running'
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : step.status === 'failed'
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                  : 'border-border/60 bg-background text-muted-foreground',
                          )}
                        >
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : step.status === 'running' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : step.status === 'failed' ? (
                            <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                          ) : (
                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 rounded-2xl border border-border/50 bg-surface-elevated px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  'text-sm font-medium',
                                  step.status === 'running' ? 'text-primary' : 'text-foreground',
                                )}
                              >
                                {step.description}
                              </p>
                              {'details' in step && typeof step.details === 'string' ? (
                                <p className="mt-1 text-xs text-muted-foreground">{step.details}</p>
                              ) : null}
                            </div>
                            {step.timestamp ? (
                              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                                {new Date(step.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-surface-elevated px-4 py-8 text-center text-sm text-muted-foreground">
                      Step-by-step activity will appear here once the task starts executing.
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === 'sources' ? (
                <div className="space-y-3">
                  {sources.length > 0 ? (
                    sources.map((source: any, index: number) => {
                      const relevance =
                        typeof source.relevanceScore === 'number'
                          ? source.relevanceScore > 1
                            ? Math.round(source.relevanceScore)
                            : Math.round(source.relevanceScore * 100)
                          : null;

                      return (
                        <button
                          key={source.id || source.url || index}
                          type="button"
                          onClick={() => handleSourceClick(source.url)}
                          className="group flex w-full items-start gap-3 rounded-2xl border border-border/50 bg-surface-elevated px-4 py-3 text-left transition-colors hover:border-primary/25 hover:bg-primary/5"
                        >
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                            {String(source.url || '').includes('.pdf') ? (
                              <FileText className="h-4 w-4" />
                            ) : (
                              <Globe className="h-4 w-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                  {source.title || source.url}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {formatSourceDomain(source.url, source.domain)}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {relevance !== null ? (
                                  <Badge variant="outline" className="text-[11px] tabular-nums">
                                    {relevance}% match
                                  </Badge>
                                ) : null}
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                              </div>
                            </div>

                            {source.snippet ? (
                              <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                                {source.snippet}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-surface-elevated px-4 py-8 text-center text-sm text-muted-foreground">
                      Sources will appear here once the agent starts gathering material.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}
