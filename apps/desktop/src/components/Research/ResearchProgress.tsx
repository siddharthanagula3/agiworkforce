/**
 * ResearchProgress Component
 *
 * Multi-phase progress visualization for an active deep research session.
 * Shows the breakdown > research > synthesis pipeline with live source counts
 * and estimated time remaining.
 */
import { memo } from 'react';
import {
  Loader2,
  CheckCircle2,
  Circle,
  Search,
  BookOpen,
  FileText,
  Brain,
  Clock,
  Globe,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { cn } from '@/lib/utils';
import {
  type ResearchProgress as ResearchProgressData,
  type ResearchPhase,
} from '@/stores/researchStore';

interface PhaseConfig {
  id: ResearchPhase;
  label: string;
  subLabel: string;
  icon: React.ElementType;
}

const PHASES: PhaseConfig[] = [
  {
    id: 'analyzing_query',
    label: 'Understanding query',
    subLabel: 'Breaking down your research topic',
    icon: Brain,
  },
  {
    id: 'searching',
    label: 'Searching sources',
    subLabel: 'Finding relevant documents and pages',
    icon: Search,
  },
  {
    id: 'collecting_results',
    label: 'Reading & analyzing',
    subLabel: 'Extracting key information',
    icon: BookOpen,
  },
  {
    id: 'synthesizing',
    label: 'Synthesizing report',
    subLabel: 'Combining findings into a coherent report',
    icon: FileText,
  },
];

type PhaseStatus = 'pending' | 'active' | 'complete';

function getPhaseStatus(phase: ResearchPhase, currentPhase: ResearchPhase): PhaseStatus {
  const phaseOrder: ResearchPhase[] = [
    'initializing',
    'analyzing_query',
    'searching',
    'collecting_results',
    'synthesizing',
    'generating_report',
    'complete',
  ];

  const currentIndex = phaseOrder.indexOf(currentPhase);
  const targetIndex = phaseOrder.indexOf(phase);

  if (targetIndex < currentIndex) return 'complete';
  if (targetIndex === currentIndex) return 'active';
  return 'pending';
}

interface PhaseRowProps {
  config: PhaseConfig;
  status: PhaseStatus;
  subStatusText?: string;
}

function PhaseRow({ config, status, subStatusText }: PhaseRowProps) {
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3">
      {/* Status icon */}
      <div className="shrink-0 mt-0.5">
        {status === 'complete' && <CheckCircle2 className="h-5 w-5 text-teal-400" />}
        {status === 'active' && <Loader2 className="h-5 w-5 text-teal-400 animate-spin" />}
        {status === 'pending' && <Circle className="h-5 w-5 text-zinc-600" />}
      </div>

      {/* Phase info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              'h-4 w-4 shrink-0',
              status === 'complete' && 'text-teal-400',
              status === 'active' && 'text-white',
              status === 'pending' && 'text-zinc-600',
            )}
          />
          <span
            className={cn(
              'text-sm font-medium',
              status === 'complete' && 'text-zinc-400',
              status === 'active' && 'text-white',
              status === 'pending' && 'text-zinc-600',
            )}
          >
            {config.label}
          </span>
        </div>
        {status === 'active' && (
          <p className="text-xs text-zinc-500 mt-0.5 ml-6">{subStatusText ?? config.subLabel}</p>
        )}
      </div>
    </div>
  );
}

function formatTimeRemaining(secs: number): string {
  if (secs < 60) return `~${secs}s remaining`;
  const mins = Math.ceil(secs / 60);
  return `~${mins}m remaining`;
}

export interface ResearchProgressProps {
  progress: ResearchProgressData;
  onCancel: () => void;
  className?: string;
}

export const ResearchProgress = memo(function ResearchProgress({
  progress,
  onCancel,
  className,
}: ResearchProgressProps) {
  const isFailed = progress.phase === 'failed';
  const isCancelled = progress.cancelled || progress.phase === 'cancelled';
  const isComplete = progress.phase === 'complete';

  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5', className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFailed || isCancelled ? (
            <span
              className={cn('text-sm font-semibold', isFailed ? 'text-red-400' : 'text-zinc-400')}
            >
              {isFailed ? 'Research failed' : 'Research cancelled'}
            </span>
          ) : isComplete ? (
            <span className="text-sm font-semibold text-teal-400">Research complete</span>
          ) : (
            <span className="text-sm font-semibold text-white">Researching...</span>
          )}
        </div>

        {/* Source count + cancel */}
        <div className="flex items-center gap-3">
          {progress.sources_found > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Globe className="h-3.5 w-3.5 text-teal-400" />
              <span>{progress.sources_found} sources found</span>
            </div>
          )}
          {!isComplete && !isFailed && !isCancelled && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-500 hover:text-white hover:bg-zinc-800"
              onClick={onCancel}
              title="Cancel research"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <Progress
        value={progress.progress_percent}
        max={100}
        className="h-1.5 bg-zinc-800"
        indicatorClassName={cn(
          'transition-all duration-500',
          isFailed ? 'bg-red-500' : 'bg-teal-500',
        )}
      />

      {/* Phase pipeline */}
      <div className="space-y-3">
        {PHASES.map((phaseConfig) => {
          const status = getPhaseStatus(phaseConfig.id, progress.phase);
          return (
            <PhaseRow
              key={phaseConfig.id}
              config={phaseConfig}
              status={status}
              subStatusText={
                status === 'active' ? progress.status_message || phaseConfig.subLabel : undefined
              }
            />
          );
        })}
      </div>

      {/* Footer: time + iterations */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-800 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {progress.elapsed_secs < 60
              ? `${progress.elapsed_secs}s elapsed`
              : `${Math.floor(progress.elapsed_secs / 60)}m ${progress.elapsed_secs % 60}s elapsed`}
          </span>
        </div>

        {progress.estimated_remaining_secs != null && !isComplete && !isFailed && !isCancelled && (
          <span>{formatTimeRemaining(progress.estimated_remaining_secs)}</span>
        )}

        {progress.total_iterations > 0 && (
          <span>
            {progress.iterations_completed}/{progress.total_iterations} iterations
          </span>
        )}
      </div>
    </div>
  );
});
