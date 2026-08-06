import { Box, ExternalLink, File, RefreshCw, Table } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { EmptyState } from '@/ui/EmptyState';
import { cn } from '../../lib/utils';
import {
  useArtifactStore,
  type ArtifactType,
  type ArtifactSummary,
} from '../../stores/artifactStore';

function kindIcon(artifactType: ArtifactType): 'table' | 'kpi' | 'file' {
  if (artifactType === 'spreadsheet') return 'table';
  if (artifactType === 'chart') return 'kpi';
  return 'file';
}

function KindIcon({ artifactType }: { artifactType: ArtifactType }) {
  const k = kindIcon(artifactType);
  if (k === 'table') return <Table size={13} />;
  if (k === 'kpi') return <span className="text-xs font-bold">KPI</span>;
  return <File size={13} />;
}

function timeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return t('time.justNow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.mAgoShort', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hAgo', { count: h });
  const d = Math.floor(h / 24);
  if (d === 1) return t('sidebar.groups.yesterday').toLowerCase();
  if (d < 7) return t('time.daysAgo', { count: d });
  return t('time.weeksAgo', { count: Math.floor(d / 7) });
}

function isFresh(summary: ArtifactSummary): boolean {
  const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
  return Date.now() - new Date(summary.updated_at).getTime() < STALE_THRESHOLD_MS;
}

export function AgiWorkArtifacts({ onNewChat }: { onNewChat?: () => void } = {}) {
  const { t } = useTranslation('v3');
  const summaries = useArtifactStore((s) => s.summaries);
  const isLoading = useArtifactStore((s) => s.isLoading);
  const listPersistedArtifacts = useArtifactStore((s) => s.listPersistedArtifacts);
  const setActiveArtifact = useArtifactStore((s) => s.setActiveArtifact);
  const openPanel = useArtifactStore((s) => s.openPanel);

  useEffect(() => {
    void listPersistedArtifacts(undefined, 50);
  }, [listPersistedArtifacts]);

  return (
    <div
      data-testid="agi-work-artifacts"
      className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--chat-border-strong)]"
    >
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-medium text-[var(--chat-text-primary)]">
              {t('agiWork.artifacts.title')}
            </h1>
            <p className="mt-1 text-xs text-[var(--chat-text-secondary)]">
              {t('agiWork.artifacts.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t('common.refresh')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
              onClick={() => void listPersistedArtifacts(undefined, 50)}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Artifact grid */}
        {isLoading && summaries.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--chat-text-muted)]">
            {t('agiWork.artifacts.loading')}
          </div>
        ) : summaries.length === 0 ? (
          <EmptyState
            icon={Box}
            title={t('agiWork.artifacts.emptyTitle')}
            description={t('agiWork.artifacts.empty')}
            action={
              onNewChat
                ? { label: t('agiWork.artifacts.startChat'), onClick: onNewChat }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((a) => {
              const fresh = isFresh(a);
              return (
                <div
                  key={a.id}
                  className={cn(
                    'group flex flex-col gap-3 rounded-xl border p-4 transition',
                    fresh
                      ? 'border-[var(--chat-accent-secondary)]/20 bg-[var(--chat-accent-secondary)]/5 hover:border-[var(--chat-accent-secondary)]/30'
                      : 'border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] hover:border-[var(--chat-border-strong)]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)]">
                      <KindIcon artifactType={a.artifact_type} />
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                        fresh
                          ? 'bg-[var(--chat-accent-secondary-soft)] text-[var(--chat-accent-secondary)]'
                          : 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          fresh
                            ? 'bg-[var(--chat-accent-secondary)]'
                            : 'bg-[var(--chat-text-muted)]',
                        )}
                      />
                      {fresh ? t('common.fresh') : t('common.stale')}
                    </span>
                  </div>

                  {/* Generated artifact filenames are long and unbroken; without a
                      clamp the title escaped the card and overlapped its neighbour. */}
                  <div
                    className="line-clamp-2 text-sm font-medium leading-snug text-[var(--chat-text-primary)] [overflow-wrap:anywhere]"
                    title={a.title}
                  >
                    {a.title}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-[var(--chat-text-muted)]">
                    <RefreshCw size={10} />
                    <span className="truncate">{timeAgo(a.updated_at, t)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-[var(--chat-text-muted)]">
                      {timeAgo(a.created_at, t)}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
                        title={t('search.open')}
                        aria-label={t('search.open')}
                        onClick={() => {
                          setActiveArtifact(a.id);
                          openPanel();
                        }}
                      >
                        <ExternalLink size={11} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
