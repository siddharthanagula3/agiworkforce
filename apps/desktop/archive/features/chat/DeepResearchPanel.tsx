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
} from 'lucide-react';
import { useState } from 'react';

import { ResearchTask } from '@/types/chat';

interface DeepResearchPanelProps {
  task: ResearchTask;
  className?: string;
  onViewSource?: (url: string) => void;
}

export function DeepResearchPanel({ task, className, onViewSource }: DeepResearchPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'process' | 'findings' | 'sources'>('process');

  const currentStep =
    task.steps.find((s) => s.status === 'running') || task.steps[task.steps.length - 1];

  const handleSourceClick = (url: string) => {
    if (onViewSource) {
      onViewSource(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card
      className={cn(
        'w-full overflow-hidden border border-indigo-500/20 bg-linear-to-br from-background to-indigo-950/20',
        className,
      )}
    >
      {}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-indigo-400">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Deep Research Agent
            </span>
          </div>
          <Badge
            variant={task.status === 'completed' ? 'default' : 'secondary'}
            className={cn('capitalize', task.status === 'running' && 'animate-pulse')}
          >
            {task.status}
          </Badge>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-foreground line-clamp-1" title={task.query}>
              {task.query}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {task.timeElapsed && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {task.timeElapsed}
                </span>
              )}
              {task.status === 'running' && (
                <span>
                  • {task.steps.filter((s) => s.status === 'completed').length} /{' '}
                  {task.steps.length} steps
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-white/5 transition-colors"
          >
            <ChevronDown
              className={cn(
                'h-5 w-5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180',
              )}
            />
          </button>
        </div>

        {}
        {task.status === 'running' && currentStep && (
          <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            <span className="text-xs text-indigo-200 truncate">{currentStep.description}...</span>
          </div>
        )}

        <div className="mt-3">
          <Progress
            value={task.progress}
            className="h-1 bg-muted"
            indicatorClassName="bg-indigo-500 transition-all duration-500"
          />
        </div>
      </div>

      {}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-b border-white/5 flex text-sm">
              <button
                type="button"
                onClick={() => setActiveTab('process')}
                className={cn(
                  'flex-1 py-2 px-4 text-center border-b-2 transition-colors',
                  activeTab === 'process'
                    ? 'border-indigo-500 text-indigo-400 font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                Process
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('findings')}
                className={cn(
                  'flex-1 py-2 px-4 text-center border-b-2 transition-colors',
                  activeTab === 'findings'
                    ? 'border-indigo-500 text-indigo-400 font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                Findings ({task.findings.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sources')}
                className={cn(
                  'flex-1 py-2 px-4 text-center border-b-2 transition-colors',
                  activeTab === 'sources'
                    ? 'border-indigo-500 text-indigo-400 font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                Sources ({task.sources.length})
              </button>
            </div>

            <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar bg-black/10">
              {activeTab === 'process' && (
                <div className="space-y-3">
                  {task.steps.map((step, idx) => (
                    <div key={step.id || idx} className="flex gap-3 relative">
                      {}
                      {idx !== task.steps.length - 1 && (
                        <div className="absolute left-[9px] top-6 bottom-[-12px] w-[2px] bg-muted" />
                      )}

                      <div
                        className={cn(
                          'h-5 w-5 rounded-full flex items-center justify-center shrink-0 z-10',
                          step.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : step.status === 'running'
                              ? 'bg-indigo-500/20 text-indigo-400'
                              : step.status === 'failed'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {step.status === 'completed' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : step.status === 'running' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : step.status === 'failed' ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pb-1">
                        <p
                          className={cn(
                            'text-sm',
                            step.status === 'running'
                              ? 'text-indigo-200 font-medium'
                              : 'text-foreground',
                          )}
                        >
                          {step.description}
                        </p>
                        {step.details && (
                          <p className="text-xs text-muted-foreground mt-0.5">{step.details}</p>
                        )}
                      </div>

                      {step.timestamp && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(step.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'findings' && (
                <ul className="space-y-2">
                  {task.findings.length > 0 ? (
                    task.findings.map((finding, idx) => (
                      <li
                        key={idx}
                        className="flex gap-2 text-sm text-foreground bg-white/5 p-2 rounded"
                      >
                        <BookOpen className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                        <span>{finding}</span>
                      </li>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      No findings yet. Research is in progress...
                    </div>
                  )}
                </ul>
              )}

              {activeTab === 'sources' && (
                <div className="grid gap-2">
                  {task.sources.length > 0 ? (
                    task.sources.map((source, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleSourceClick(source.url)}
                        className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group"
                      >
                        <div className="h-8 w-8 rounded bg-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-400">
                          {source.url.includes('.pdf') ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <Globe className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate group-hover:text-indigo-300 transition-colors">
                            {source.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {/* AUDIT-005-011 fix: Wrap URL parsing in try/catch with fallback */}
                            {source.domain ||
                              (() => {
                                try {
                                  return new URL(source.url).hostname;
                                } catch {
                                  return source.url;
                                }
                              })()}
                          </div>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-muted-foreground" />
                      </button>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      No sources gathered yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
