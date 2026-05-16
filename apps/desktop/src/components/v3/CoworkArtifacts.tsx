import { Copy, ExternalLink, File, RefreshCw, Search, Table } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

export function CoworkArtifacts() {
  const { t } = useTranslation('v3');
  const { summaries, isLoading, listPersistedArtifacts } = useArtifactStore((s) => ({
    summaries: s.summaries,
    isLoading: s.isLoading,
    listPersistedArtifacts: s.listPersistedArtifacts,
  }));

  useEffect(() => {
    void listPersistedArtifacts(undefined, 50);
  }, [listPersistedArtifacts]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-medium text-white/90">
              {t('cowork.artifacts.title')}
            </h1>
            <p className="mt-1 text-xs text-white/40">{t('cowork.artifacts.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80"
            >
              <Search size={14} />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80"
              onClick={() => void listPersistedArtifacts(undefined, 50)}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Artifact grid */}
        {isLoading && summaries.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/30">
            {t('cowork.artifacts.loading')}
          </div>
        ) : summaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/30">
            {t('cowork.artifacts.empty')}
          </div>
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
                      ? 'border-teal-500/20 bg-teal-500/5 hover:border-teal-500/30'
                      : 'border-white/10 bg-white/5 hover:border-white/15',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/8 text-white/50">
                      <KindIcon artifactType={a.artifact_type} />
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                        fresh ? 'bg-teal-500/15 text-teal-400' : 'bg-white/8 text-white/35',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          fresh ? 'bg-teal-400' : 'bg-white/30',
                        )}
                      />
                      {fresh ? t('common.fresh') : t('common.stale')}
                    </span>
                  </div>

                  <div className="text-sm font-medium text-white/90 leading-snug">{a.title}</div>

                  <div className="flex items-center gap-1.5 text-xs text-white/35">
                    <RefreshCw size={10} />
                    <span className="truncate">{timeAgo(a.updated_at, t)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-white/25">{timeAgo(a.created_at, t)}</span>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:text-white/70"
                        title={t('common.copy')}
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:text-white/70"
                        title={t('search.open')}
                      >
                        <ExternalLink size={11} />
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
