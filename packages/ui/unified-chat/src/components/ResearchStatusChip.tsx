import { CircleAlert, CircleCheck, Telescope } from 'lucide-react';
import { useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import type { CloudMessageProjection } from '../lib/runtime';

export type MessageResearchStatus = NonNullable<CloudMessageProjection['research']>;

const PHASES: readonly MessageResearchStatus['phase'][] = [
  'planning',
  'searching',
  'synthesizing',
  'complete',
  'error',
];

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readMessageResearchStatus(
  metadata: Record<string, unknown> | null | undefined,
): MessageResearchStatus | null {
  const raw = metadata?.['research'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const phase = source['phase'];
  if (!PHASES.includes(phase as MessageResearchStatus['phase'])) return null;
  return {
    phase: phase as MessageResearchStatus['phase'],
    ...(typeof source['label'] === 'string' ? { label: source['label'] } : {}),
    ...(typeof source['error'] === 'string' ? { error: source['error'] } : {}),
    iteration: readNumber(source, 'iteration'),
    maxIterations: readNumber(source, 'maxIterations'),
    searches: readNumber(source, 'searches'),
    sources: readNumber(source, 'sources'),
    elapsedMs: readNumber(source, 'elapsedMs'),
  };
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function ResearchStatusChip({ status }: { status: MessageResearchStatus }) {
  const { t } = useUiTranslation('chat');

  const fallbackLabels: Record<MessageResearchStatus['phase'], string> = {
    planning: t('research.planning', 'Planning research'),
    searching: t('research.searching', 'Searching the web'),
    synthesizing: t('research.synthesizing', 'Writing report'),
    complete: t('research.complete', 'Research complete'),
    error: t('research.error', 'Research failed'),
  };

  const failed = status.phase === 'error';
  const complete = status.phase === 'complete';
  const active = !failed && !complete;
  const label = status.label || fallbackLabels[status.phase];

  const counts: string[] = [];
  if (active && (status.iteration ?? 0) > 0 && (status.maxIterations ?? 0) > 0) {
    counts.push(
      t('research.round', 'round {{iteration}} of {{maxIterations}}', {
        iteration: status.iteration,
        maxIterations: status.maxIterations,
      }),
    );
  }
  const searches = status.searches ?? 0;
  if (searches > 0) {
    counts.push(
      searches === 1
        ? t('research.searchOne', '{{n}} search', { n: searches })
        : t('research.searchMany', '{{n}} searches', { n: searches }),
    );
  }
  const sources = status.sources ?? 0;
  if (sources > 0) {
    counts.push(
      sources === 1
        ? t('research.sourceOne', '{{n}} source', { n: sources })
        : t('research.sourceMany', '{{n}} sources', { n: sources }),
    );
  }
  if ((status.elapsedMs ?? 0) > 0) {
    counts.push(formatElapsed(status.elapsedMs as number));
  }

  const Icon = failed ? CircleAlert : complete ? CircleCheck : Telescope;

  return (
    <div
      role="status"
      data-testid="research-status"
      data-phase={status.phase}
      aria-label={t('research.aria', 'Deep research: {{label}}', { label })}
      className={cn(
        'mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        failed ? 'border-[color:var(--chat-destructive)]/30' : 'border-[color:var(--chat-border)]',
      )}
      style={{
        background: 'var(--chat-surface-elevated)',
        color: failed ? 'var(--chat-destructive)' : 'var(--chat-text-secondary)',
      }}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', active && 'animate-pulse')} aria-hidden="true" />
      <span
        className="font-medium"
        style={{ color: failed ? undefined : 'var(--chat-text-primary)' }}
      >
        {label}
      </span>
      {counts.length > 0 && (
        <span className="ml-auto shrink-0 tabular-nums" data-testid="research-status-counts">
          {counts.join(' · ')}
        </span>
      )}
    </div>
  );
}
